# TubesZB MGM210 – Warre Edition

Newer firmware and a friendlier web page for the
**TubesZB EFR32 MGM210 2022** Zigbee coordinator (eth_usb/WT32-ETH01 and PoE).

| Part | Original (tube0013) | Warre Edition |
|---|---|---|
| Zigbee radio (EFR32) | EmberZNet 7.4.3 (Gecko SDK 4.4) | **EmberZNet 9.1.1.1** (Simplicity SDK 2026.6.1) |
| ESP32 serial bridge | external `stream_server` (no longer maintained) | built-in ESPHome `uart_tcp` |
| Web page | one switch and a status | groups, diagnostics, technical info, settings buttons, log window |

> **Unofficial.** Not a product of tube0013, Nabu Casa or Silicon Labs. Tested on one device
> (2026-11-10, ZHA with ~55 devices, network kept without a restore). Use at your own risk and
> always make a backup first.

## Contents

```
efr32/
  firmware/9.1.1.1/   ready-to-flash firmware (.gbl) + SHA256SUMS
  manifest/           build manifest for NabuCasa/silabs-firmware-builder (pins, UART, tables)
  build.sh            rebuild it yourself (Docker)
esphome/
  tubeszb-efr32-mgm210-2022.yaml   config for the ESP32 (web page + serial bridge)
  tubeszb-webui.js                 web page layout (centred, two columns, log window) + login dialog
  warre_auth.h                     web login with first-run setup (stored on the device)
  secrets.example.yaml
docs/
  flashing.md         flash the radio over the network + back to the original
  hardware.md         EFR32 and ESP32 pinout, sources
```

## Getting started

### 1. ESP32 (web page and bridge) – first

Requires **ESPHome 2026.10 or newer** (`uart_tcp`).

1. Copy `esphome/tubeszb-efr32-mgm210-2022.yaml`, `esphome/tubeszb-webui.js` **and**
   `esphome/warre_auth.h` into your ESPHome config folder (side by side) and put `tubeszb_api_key` and `tubeszb_ota_password` in your
   `secrets.yaml` (see `secrets.example.yaml`). Reuse your existing keys and the link with Home
   Assistant keeps working.
2. Adjust `allowed_ips` (default `192.168.2.0/24`) to your own network.
3. ESPHome → *Install* → *Wirelessly*. The TCP port stays **6638**: ZHA or Zigbee2MQTT notice nothing.

Afterwards `http://<name>.local/` shows **TubesZB MGM210 Warre Edition**, centred, with the groups in
pairs of equal height (one column on a narrow screen). Everything is always shown; there is no
*Show All* button.

| Left | Right |
|---|---|
| **Gateway (ESP32)**: uptime, CPU usage, memory (used / total), ESPHome version, last reset reason | **Radio firmware**: installed firmware with its channel (e.g. `EmberZNet 9.1.1.1 (latest)`), firmware type, channel, *Firmware in repo* (the build for the chosen type/channel: **Installed** when the radio already runs it, else its version), *Install radio firmware* (**Flash** when that build is not on the radio yet, and **Choose version**); router rows only with the router firmware |
| **Network**: one row **HA ✓ / Zigbee ✓** (connected to Home Assistant, Zigbee client connected), main loop time, hostname (mDNS), IP and MAC address, client disconnects | **Technical info**: chip, Zigbee stack, firmware type, interface, baud rate, flow control |
| **Settings**: login settings, restart Zigbee radio, **Zigbee radio to bootloader (flash mode)**, restart gateway (also in safe mode) | **Debug Log**: as high as Settings, newest line on top. The logger runs at `INFO`: connects/disconnects, OTA, warnings and errors. |

CPU usage is the share of time both cores are not idle, measured over 10 s with FreeRTOS run-time
statistics.

The page uses `local: false`: the browser loads the ESPHome web app from `oi.esphome.io` (so it needs
internet access) and the layout script `/0.js` from the device. ESPHome only adds `js_include` to the
page in that mode.

### Web login

On first start the page shows a **Create a login** dialog: choose a username and password, or
*Continue without login*. Later, use **Settings → Login settings** to change the
login, turn it off or reset it.

- The login is the browser's own sign-in prompt, using HTTP **Digest** authentication: the password
  is not sent in readable form. The page itself is still plain HTTP (ESPHome has no HTTPS); put it
  behind a reverse proxy with TLS if you need an encrypted connection.
- Username and password are stored in the ESP32's flash (NVS), not in the YAML, and survive
  restarts and OTA updates. The `auth:` block in the YAML only holds placeholders that make ESPHome
  compile the login code in; they are never used.
- **Forgot the password?** Press **Reset web login** in Home Assistant (it goes over the encrypted
  native API). The page then shows the setup dialog again. On the page itself this button is in the
  Login settings dialog.
- Until a login is created, anyone on your network can create one. Do it right after installing.
- Home Assistant (native API, encrypted with the API key) and ZHA (TCP port 6638) are not affected by
  the web login.

The radio firmware and the technical info are fixed text (the `efr32_*` values under
`substitutions`): the ESP32 cannot read them itself. Update them when you reflash the radio.

> Coming from tube's config? The entity names are new, so Home Assistant creates new entities with
> new entity IDs. Update dashboards and automations that used the old ones.

### 2. Flash the Zigbee radio (EFR32)

Over the network with universal-silabs-flasher, without opening the case. Full procedure,
including backup and the way back: **[docs/flashing.md](docs/flashing.md)**.

```bash
universal-silabs-flasher --device socket://<tubeszb-ip>:6638 \
  --probe-methods ezsp:115200,bootloader:115200 \
  flash --firmware efr32/firmware/9.1.1.1/tubeszb_mgm210_zigbee_ncp_9.1.1.1.gbl
```

## Rebuilding the firmware

The firmware is built with [NabuCasa/silabs-firmware-builder](https://github.com/NabuCasa/silabs-firmware-builder).
The manifest `efr32/manifest/tubeszb_mgm210_zigbee_ncp.yaml` starts from Nabu Casa's Yellow manifest
(same MGM210 module) with the TubesZB-specific settings:

| Setting | Value | Why |
|---|---|---|
| Module | `MGM210PA32JIA` | MGM210PA32JIA2 on the board |
| UART | USART0, **TX = PA06, RX = PA05**, 115200 baud | schematic; the Yellow has TX/RX swapped |
| Flow control | none (`usartHwFlowControlNone`) | the ESP32 has no RTS/CTS to the EFR32; the host uses software flow control |
| UART component | `zigbee_ncp_uart_hardware` with flow control off | the Simplicity SDK no longer has an `ncp-uart-sw` variant |
| PTI | off | PC04/PC05 not needed |
| LED | none | the Yellow LED (PB01) is not on the TubesZB |
| Tables | as on the Yellow (same RAM) | |

Build (Linux/WSL with Docker):

```bash
./efr32/build.sh          # → efr32/out/*.gbl, *.hex, SHA256SUMS
```

This builds with builder commit `dae84f45` and Simplicity SDK 2026.6.1. To customise, edit the manifest
(e.g. `XNCP_MFG_BOARD_NAME`, table sizes) and rebuild. Pinout and sources:
[docs/hardware.md](docs/hardware.md).

Checks on the published 9.1.1.1 build: pin config patched as intended (build log), GBL CRC valid, app
starts at `0x4000` and NVM3 at `0xF6000`, same as tube's 7.4.3 (same bootloader layout, network
settings are kept).

## Known issues

- universal-silabs-flasher 1.3.0 prints a traceback in the config dump after a successful `probe`:
  a bug in the flasher, not in the radio.
- tube's Gecko bootloader accepts this (unsigned) firmware.
- Going back to tube's firmware is always possible; see [docs/flashing.md](docs/flashing.md).

## Credits

- [tube0013](https://github.com/tube0013/tube_gateways): hardware, schematics and original firmware
- [Nabu Casa](https://github.com/NabuCasa/silabs-firmware-builder): firmware builder, XNCP extensions
- [ESPHome](https://esphome.io): `uart_tcp`, web_server
- Silicon Labs: EmberZNet / Simplicity SDK. The firmware contains code under the Silicon Labs Master
  Software License Agreement.

---

*Developed with the help of [Claude](https://claude.ai) (Anthropic), an AI assistant. The firmware and
the ESPHome config were reviewed and tested on a real TubesZB MGM210 2022.*
