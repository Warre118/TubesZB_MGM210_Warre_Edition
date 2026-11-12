# Thread / Matter radio (OpenThread RCP) 3.1.1.0

**TubesZB MGM210 2022**, channel **beta**.

- Firmware version: 3.1.1.0
- SDK: Simplicity SDK 2026.6.1
- Serial: 115200 baud, no flow control
- Built from: [NabuCasa/silabs-firmware-builder@v2026.09.17-beta2 (adafdc2030)](https://github.com/NabuCasa/silabs-firmware-builder/releases/tag/v2026.09.17-beta2)
- Built: 2026-11-12T20:21:49Z

OpenThread RCP (Thread / Matter border router radio), 115200 baud, no flow control

## NabuCasa/silabs-firmware-builder v2026.09.17-beta2 release notes

# Changes
This is a small update of our earlier 2026.08.18 beta that fixes an incompatibility bug between the Zigbee 4.0 coordinator firmware and Zigbee 4.0 routers that attempt to join the network directly via the coordinator.

All other firmwares are unchanged.

## What's Changed
* Add KEEPALIVE_CLUSTER to zigbee_router to fix tc-keepalive plugin by @tofurky in https://github.com/NabuCasa/silabs-firmware-builder/pull/223
* Fix manifest generation for encrypted GBLs by @puddly in https://github.com/NabuCasa/silabs-firmware-builder/pull/222
* fix: Implement DLK negotiation callback for direct router joins by @puddly in https://github.com/NabuCasa/silabs-firmware-builder/pull/227

## New Contributors
* @tofurky made their first contribution in https://github.com/NabuCasa/silabs-firmware-builder/pull/223

**Full Changelog**: https://github.com/NabuCasa/silabs-firmware-builder/compare/v2026.08.18-beta1...v2026.09.17-beta2

Flash at your own risk; back up your Zigbee/Thread network first.
