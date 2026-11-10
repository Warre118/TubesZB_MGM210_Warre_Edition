# Hardware: TubesZB EFR32 MGM210 2022

Applies to the **eth_usb** variant (WT32-ETH01) and the **PoE** variant (Olimex) from 2022: both use
the same EFR32 firmware (tube's .gbl files are byte-for-byte identical in both folders).

## EFR32 (Silicon Labs MGM210PA32JIA2)

| Signal | Pin | Note |
|---|---|---|
| UART TX (EFR32 → ESP32) | PA06 | "zTX" in the schematic |
| UART RX (ESP32 → EFR32) | PA05 | "zRX" in the schematic |
| CTS / RTS | PC01 / PD02 | on the board, **not** connected to the ESP32 → no hardware flow control |
| Bootloader button | PA00 | low at reset = Gecko bootloader |
| SWD | PA01 (SWCLK), PA02 (SWDIO), PA03 (SWO), RESETn | 10-pin header, last resort |

Sources:
- schematic `Schematic_MGM210P Olimex Shield 2022.pdf` in
  [tube0013/tube_gateways](https://github.com/tube0013/tube_gateways/tree/main/models/current/tubeszb-efr32-MGM210-poe/hw_source_files)
- tube's own manifest `tubeszb-mgm21-2023-sw_ncp-uart-hw.yaml` in
  [tube0013/silabs-firmware-builder](https://github.com/tube0013/silabs-firmware-builder/tree/main/manifests/tubeszb)

**Note:** the Home Assistant Yellow uses the same module, but with TX/RX swapped (TX = PA05) and
hardware flow control. Yellow firmware therefore does **not** work on the TubesZB.

## ESP32 (WT32-ETH01)

| Function | GPIO |
|---|---|
| UART RX (from EFR32) | GPIO17 |
| UART TX (to EFR32) | GPIO5 |
| EFR32 reset (active low) | GPIO33 |
| EFR32 PA00 / bootloader (active low) | GPIO32 |
| Ethernet LAN8720 | MDC 23, MDIO 18, CLK in GPIO0, power GPIO16, PHY address 1 |
