# Zigbee router 2025.6.2

**TubesZB MGM210 2022**, channel **stable**.

- Firmware version: 2025.6.2
- SDK: Simplicity SDK 2025.6.2
- Serial: 115200 baud, no flow control
- Built from: [NabuCasa/silabs-firmware-builder@v2026.02.23 (b45d978a7c)](https://github.com/NabuCasa/silabs-firmware-builder/releases/tag/v2026.02.23)
- Built: 2026-11-14T00:35:36Z
- **Experimental**: not tested on hardware yet.

Zigbee router (repeater, no host needed); back to the bootloader with the ESP32 button

## NabuCasa/silabs-firmware-builder v2026.02.23 release notes

# Changes
I'm excited to announce our first release of 2026. There has been _a lot_ of internal reorganization to standardize drivers and functionality across our various firmwares and devices: Zigbee, Thread, and Z-Wave now live under the same roof and can be built with the same tooling.

# Beta firmwares
We regularly publish beta firmwares for Zigbee and Thread for the ZBT-1, ZBT-2, and Yellow. If you'd like to participate and test out new features early, you can opt into beta updates by navigating to your device's respective integration and enabling the beta toggle:

<img width="236" height="165" alt="image" src="https://github.com/user-attachments/assets/4965a5eb-7bb3-467f-9d52-ef061c4d2611" />
<img width="243" height="167" alt="image" src="https://github.com/user-attachments/assets/5268a2af-5a80-47d4-8140-aeb755cfd623" />

---

# Changes
## General
- Our firmware builder has been entirely Dockerized and is now natively compatible with both ARM and x86-64 hosts. You can clone this repo test your own firmware tweaks in 30 seconds with [a single command](https://github.com/NabuCasa/silabs-firmware-builder?tab=readme-ov-file#building-with-docker)!

## Zigbee
- Bump from Gecko SDK 4.4.5 to 4.5.0. This will be our last release built with the Gecko SDK, all future releases will be built with Simplicity SDK.
- The network activity LED for the Yellow has been re-enabled.
- A new feature is now enabled to allow ZHA to more quickly restore network routes on startup.

## Thread
- Bump from Gecko SDK 4.5.0 to Simplicity SDK 2025.6.2.
- The ZBT-2 LED now pulses during setup, before a Thread network has been joined.

## Z-Wave
- The radio firmware for the ZWA-2 has been restructured and merged into this repository.

## New Contributors
* @Szewcson made their first contribution in https://github.com/NabuCasa/silabs-firmware-builder/pull/130

**Full Changelog**: https://github.com/NabuCasa/silabs-firmware-builder/compare/v2025.11.24...v2026.02.23

Flash at your own risk; back up your Zigbee/Thread network first.
