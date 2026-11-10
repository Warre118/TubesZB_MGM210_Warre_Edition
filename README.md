# TubesZB MGM210 – Warre Edition

Nieuwere firmware en een gebruiksvriendelijke webpagina voor de
**TubesZB EFR32 MGM210 2022** Zigbee-coordinator (eth_usb/WT32-ETH01 en PoE).

| Onderdeel | Origineel (tube0013) | Warre Edition |
|---|---|---|
| Zigbee-radio (EFR32) | EmberZNet 7.4.3 (Gecko SDK 4.4) | **EmberZNet 9.1.1.1** (Simplicity SDK 2026.6.1) |
| Seriële brug ESP32 | externe `stream_server` (niet meer onderhouden) | ingebouwde ESPHome `uart_tcp` |
| Webpagina | één schakelaar en een status | groepen, diagnose, onderhoudsknoppen, Nederlandstalig |

> **Onofficieel.** Geen product van tube0013, Nabu Casa of Silicon Labs. Getest op één toestel
> (10/11/2026, ZHA met ±55 apparaten, netwerk behouden zonder restore). Gebruik op eigen risico en
> maak altijd eerst een backup.

## Inhoud

```
efr32/
  firmware/9.1.1.1/   kant-en-klare firmware (.gbl) + SHA256SUMS
  manifest/           build-manifest voor NabuCasa/silabs-firmware-builder (pinnen, UART, tabellen)
  build.sh            zelf opnieuw bouwen (Docker)
esphome/
  tubeszb-efr32-mgm210-2022.yaml   config voor de ESP32 (webpagina + seriële brug)
  secrets.example.yaml
docs/
  flashing.md         radio flashen via het netwerk + terug naar het origineel
  hardware.md         pinout EFR32 en ESP32, bronnen
```

## Snel aan de slag

### 1. ESP32 (webpagina en brug) – eerst

Vereist **ESPHome 2026.10 of nieuwer** (`uart_tcp`).

1. Kopieer `esphome/tubeszb-efr32-mgm210-2022.yaml` naar je ESPHome-configmap en zet
   `tubeszb_api_key` en `tubeszb_ota_password` in je `secrets.yaml` (zie `secrets.example.yaml`).
   Gebruik je bestaande sleutels, dan blijft de koppeling met Home Assistant gewoon werken.
2. Pas zo nodig `allowed_ips` (standaard `192.168.2.0/24`) aan je eigen netwerk aan.
3. ESPHome → *Install* → *Wirelessly*. De TCP-poort blijft **6638**: ZHA of Zigbee2MQTT merkt niets.

Daarna toont `http://<naam>.local/` de pagina **TubesZB MGM210 Warre Edition**:

- **Zigbee-radio**: radio-firmware, verbonden met ZHA, aantal verbroken verbindingen
- **Netwerk**: IP- en MAC-adres
- **Gateway (ESP32)**: verbonden met HA, actief sinds opstart, vrij geheugen, ESPHome-versie,
  reden laatste herstart
- **Technische info**: chip, Zigbee-stack, firmwaretype, interface, baudrate, flow control
- **Onderhoud** (via *Show all*): Zigbee-radio herstarten, **Zigbee-radio in flashmodus (bootloader)**,
  gateway herstarten (ook in safe mode)

De radio-firmware en de technische info op de pagina zijn vaste tekst (de `efr32_*`-waarden onder
`substitutions`): de ESP32 kan die niet zelf uitlezen. Pas ze aan als je de radio opnieuw flasht.

### 2. Zigbee-radio (EFR32) flashen

Via het netwerk met universal-silabs-flasher, zonder het kastje te openen. Volledig stappenplan,
inclusief backup en terugweg: **[docs/flashing.md](docs/flashing.md)**.

```bash
universal-silabs-flasher --device socket://<ip-van-tubeszb>:6638 \
  --probe-methods ezsp:115200,bootloader:115200 \
  flash --firmware efr32/firmware/9.1.1.1/tubeszb_mgm210_zigbee_ncp_9.1.1.1.gbl
```

## De firmware zelf opnieuw bouwen

De firmware wordt gebouwd met [NabuCasa/silabs-firmware-builder](https://github.com/NabuCasa/silabs-firmware-builder).
Het manifest `efr32/manifest/tubeszb_mgm210_zigbee_ncp.yaml` vertrekt van Nabu Casa's Yellow-manifest
(zelfde MGM210-module) met de TubesZB-specifieke instellingen:

| Instelling | Waarde | Waarom |
|---|---|---|
| Module | `MGM210PA32JIA` | MGM210PA32JIA2 op de print |
| UART | USART0, **TX = PA06, RX = PA05**, 115200 baud | schema; de Yellow heeft TX/RX omgekeerd |
| Flow control | geen (`usartHwFlowControlNone`) | de ESP32 heeft geen RTS/CTS naar de EFR32; de host gebruikt software flow control |
| UART-component | `zigbee_ncp_uart_hardware` met flow control uit | de Simplicity SDK heeft geen `ncp-uart-sw`-variant meer |
| PTI | uit | PC04/PC05 zijn niet nodig |
| LED | geen | de Yellow-LED (PB01) zit niet op de TubesZB |
| Tabellen | zoals de Yellow (zelfde RAM) | |

Bouwen (Linux/WSL met Docker):

```bash
./efr32/build.sh          # → efr32/out/*.gbl, *.hex, SHA256SUMS
```

Dit bouwt met builder-commit `dae84f45` en Simplicity SDK 2026.6.1. Zelf aanpassen: pas het manifest
aan (bv. `XNCP_MFG_BOARD_NAME`, tabelgroottes) en bouw opnieuw. Pinout en bronnen:
[docs/hardware.md](docs/hardware.md).

Controles op de gepubliceerde 9.1.1.1-build: pinconfig gepatcht zoals bedoeld (buildlog), GBL-CRC
klopt, app start op `0x4000` en NVM3 op `0xF6000`, net als tube's 7.4.3 (zelfde bootloader-indeling,
netwerkinstellingen blijven staan).

## Bekend

- universal-silabs-flasher 1.3.0 geeft na een geslaagde `probe` een traceback in de config-dump:
  een fout in de flasher, niet in de radio.
- De Gecko-bootloader van tube aanvaardt deze (niet-gesigneerde) firmware.
- Terug naar tube's firmware kan altijd; zie [docs/flashing.md](docs/flashing.md).

## Met dank aan

- [tube0013](https://github.com/tube0013/tube_gateways): hardware, schema's en originele firmware
- [Nabu Casa](https://github.com/NabuCasa/silabs-firmware-builder): firmware-builder, XNCP-uitbreidingen
- [ESPHome](https://esphome.io): `uart_tcp`, web_server
- Silicon Labs: EmberZNet / Simplicity SDK. De firmware bevat code onder de Silicon Labs Master
  Software License Agreement.
