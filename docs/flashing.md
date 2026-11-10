# Flashing the Zigbee radio (EFR32)

The ESP32 forwards the EFR32's serial port on TCP port **6638**. Any PC on the network can therefore
flash the radio with [universal-silabs-flasher](https://github.com/NabuCasa/universal-silabs-flasher),
without cables and without opening the case.

> Tested on 2026-11-10: 7.4.3 → 9.1.1.1, universal-silabs-flasher 1.3.0, ZHA, network kept without a
> restore. Still: **make a backup first**.

## 1. Prepare

1. **Backups** in Home Assistant:
   - ZHA → Configure → *Download backup* (network settings, contains the network key: store it safely).
   - A full Home Assistant backup.
2. Note the current firmware (ZHA → Configure → radio info).
3. Install the flasher on a PC:
   ```bash
   python -m venv usf && . usf/bin/activate      # Windows: usf\Scripts\activate
   pip install universal-silabs-flasher
   ```
4. Check the file:
   ```bash
   sha256sum -c efr32/firmware/9.1.1.1/SHA256SUMS
   universal-silabs-flasher dump-gbl-metadata --firmware efr32/firmware/9.1.1.1/tubeszb_mgm210_zigbee_ncp_9.1.1.1.gbl
   ```

## 2. Disconnect ZHA (or Zigbee2MQTT)

The TCP port accepts only one connection. **Disable the ZHA integration** (do not delete it):
Settings → Devices & services → Zigbee Home Automation → ⋮ → *Disable*.
On the TubesZB web page, "Zigbee client connected" should now be off.

## 3. Flash

```bash
universal-silabs-flasher --device socket://<tubeszb-ip>:6638 \
  --probe-methods ezsp:115200,bootloader:115200 \
  flash --firmware efr32/firmware/9.1.1.1/tubeszb_mgm210_zigbee_ncp_9.1.1.1.gbl
```

- The flasher detects the running firmware, puts the radio into the bootloader itself and uploads the
  firmware (about 2½ minutes at 115200 baud).
- If it cannot get into the bootloader: on the TubesZB web page press
  **Maintenance → "Zigbee radio to bootloader (flash mode)"** (visible via *Show all*) and flash with
  `--probe-methods bootloader:115200`.

Verify:
```bash
universal-silabs-flasher --device socket://<tubeszb-ip>:6638 \
  --probe-methods ezsp:115200 probe
# expected: Detected ApplicationType.EZSP, version '9.1.1.1 build 0 (...)'
```
(A traceback after that line, in the "EmberZNet Config" dump, is a bug in the flasher and harmless.)

## 4. Back in service

1. Enable ZHA again.
2. ZHA → Configure: firmware 9.1.1.1, devices online.
3. If ZHA reports no network: restore from the backup of step 1 (*Migrate/restore*); do **not** form a
   new network.

## Back to the original firmware

The Gecko bootloader is never overwritten, so going back is always possible:

1. Download tube's firmware, e.g. 7.4.3:
   [tubeszb-mgm21-2022_7.4.3.gbl](https://github.com/tube0013/tube_gateways/tree/main/models/current/tubeszb-efr32-MGM210-eth_usb/firmware/efr32_MGM210/ncp/7.4.3)
2. Disable ZHA → web page: "Zigbee radio to bootloader (flash mode)".
3. ```bash
   universal-silabs-flasher --device socket://<tubeszb-ip>:6638 \
     --probe-methods bootloader:115200 flash --firmware tubeszb-mgm21-2022_7.4.3.gbl
   ```
4. Enable ZHA; restore the network from the backup if needed.

Last resort if the bootloader does not respond either: SWD via the 10-pin header (see
[hardware.md](hardware.md)).
