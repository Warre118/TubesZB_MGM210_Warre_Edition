# Hardware: TubesZB EFR32 MGM210 2022

Geldt voor de **eth_usb**-variant (WT32-ETH01) en de **PoE**-variant (Olimex) van 2022: beide gebruiken
dezelfde EFR32-firmware (tube's .gbl-bestanden zijn byte-voor-byte identiek in beide mappen).

## EFR32 (Silicon Labs MGM210PA32JIA2)

| Signaal | Pin | Opmerking |
|---|---|---|
| UART TX (EFR32 → ESP32) | PA06 | "zTX" in het schema |
| UART RX (ESP32 → EFR32) | PA05 | "zRX" in het schema |
| CTS / RTS | PC01 / PD02 | op de print, **niet** verbonden met de ESP32 → geen hardware flow control |
| Bootloader-knop | PA00 | laag bij reset = Gecko-bootloader |
| SWD | PA01 (SWCLK), PA02 (SWDIO), PA03 (SWO), RESETn | 10-pin header, laatste redmiddel |

Bronnen:
- schema `Schematic_MGM210P Olimex Shield 2022.pdf` in
  [tube0013/tube_gateways](https://github.com/tube0013/tube_gateways/tree/main/models/current/tubeszb-efr32-MGM210-poe/hw_source_files)
- tube's eigen manifest `tubeszb-mgm21-2023-sw_ncp-uart-hw.yaml` in
  [tube0013/silabs-firmware-builder](https://github.com/tube0013/silabs-firmware-builder/tree/main/manifests/tubeszb)

**Let op:** de Home Assistant Yellow gebruikt dezelfde module, maar met TX/RX omgekeerd (TX = PA05) en
hardware flow control. Yellow-firmware werkt dus **niet** op de TubesZB.

## ESP32 (WT32-ETH01)

| Functie | GPIO |
|---|---|
| UART RX (van EFR32) | GPIO17 |
| UART TX (naar EFR32) | GPIO5 |
| EFR32 reset (actief laag) | GPIO33 |
| EFR32 PA00 / bootloader (actief laag) | GPIO32 |
| Ethernet LAN8720 | MDC 23, MDIO 18, CLK in GPIO0, power GPIO16, PHY-adres 1 |
