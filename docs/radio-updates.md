# Radio firmware updates

The EFR32 radio of the TubesZB gets new firmware from the ESP32 itself: from Home Assistant or
from the device's own web page. No PC, no `universal-silabs-flasher`.

## Where the firmware comes from

A build server ([fwpipe](https://github.com/Warre118/px30-wallpanel/tree/main/updater), the
`updater/` folder of px30-wallpanel) follows
[Nabu Casa's firmware builder](https://github.com/NabuCasa/silabs-firmware-builder), builds the
TubesZB variant of its Home Assistant Yellow firmware (same MGM210 module, with the TubesZB pins:
TX PA06, RX PA05, no flow control) and publishes it in the **`firmware` branch** of this
repository:

```
zigbee_ncp/<channel>/        EmberZNet NCP (Zigbee coordinator for ZHA / Zigbee2MQTT)
openthread_rcp/<channel>/    OpenThread RCP (Thread radio for a border router / Matter)
zigbee_router/<channel>/     stand-alone Zigbee router (repeater), experimental
    <file>.gbl               the firmware
    manifest.json(.sig)      version, URL, sha256, size, release summary (signed)
    RELEASE_NOTES.md         what changed, with the upstream release notes
archive/                     earlier builds
```

| Channel | Follows |
|---|---|
| `stable` | the newest full release of Nabu Casa's builder (what Home Assistant ships) |
| `beta` | the newest pre-release of the builder, while there is one newer than the release |
| `latest` | the head of the builder's `main` branch with the newest SDK |

The device defaults to **stable**.

## On the device

Group **Radio firmware** on the web page (and the same entities in Home Assistant):

| Entity | What it does |
|---|---|
| Radio firmware channel | `stable` / `latest` / `beta`; changing it checks right away |
| Radio firmware type | Zigbee (EmberZNet NCP), Thread (OpenThread RCP) or Zigbee router |
| Radio firmware | update entity: installed version, the version the channel offers, the release summary and a link to the release notes, and the **Install** button |
| Radio firmware installed | (Zigbee radio group) what is on the EFR32 now |
| Zigbee router network | with the router firmware: not on a network / joining / joined (channel, PAN, node) |
| Zigbee router: join network | with the router firmware: search for an open Zigbee network and join it |
| Zigbee router: leave network | with the router firmware: leave the network (after *Show All*) |

The check runs at start-up and every 6 hours (and on a channel or type change).

### Choosing a version on the web page

The group also has a row **Install radio firmware → Choose version**. It opens a dialog:

1. **List.** Every firmware type × channel that the firmware list (`index.json` on the
   `firmware` branch) has, with version and SDK. The installed build is tagged *installed*,
   experimental builds *experimental*. The current choice is preselected.
2. **Update...** The device sets both selects to that choice and checks the **signed** manifest
   for it (the page waits up to a minute). Without a verified offer nothing more happens; the
   error is shown.
3. **Warning.** Backup, the bridge/page/API being down for about half a minute, not unplugging
   the device, experimental build, re-install of the same version, and (in red, with its own
   checkbox) that switching the type loses the network. **Install** stays disabled until the
   checkboxes are ticked.
4. **Install.** The page sends the exact type, channel and version; the device only accepts it
   when that is the offer it just verified, and checks it once more right before it starts. The
   page shows download / flash progress and the result.

The page uses these endpoints (behind the web server login, if it is on):

| Endpoint | |
|---|---|
| `GET /warre/radio` | status JSON: installed, selection, last check (`check_seq`, error), verified offer, install phase/progress, last result (`install_seq`, `result_ok`, `result_message`) |
| `POST /warre/radio/select` | `firmware=&channel=`: set the selects and check again |
| `POST /warre/radio/install` | `firmware=&channel=&version=`: install the verified offer if it is exactly that (409 otherwise) |

**Install** does:

1. Download the image into the ESP32's spare OTA partition (that partition is never made
   bootable) and compute its sha256 on the way.
2. Compare it with the sha256 and size in the **signed** manifest. If anything differs, stop:
   nothing is sent to the radio.
3. Put the EFR32 in its Gecko bootloader (PA00 low during reset, the same as the "to bootloader"
   button) and send the image over XMODEM.
4. Run the new firmware, reset the radio and remember the installed version.

During step 3-4 (about half a minute) the ESP32 does nothing else: the TCP bridge on port 6638,
the web page and the API do not respond. ZHA / Zigbee2MQTT lose the radio for that time and
reconnect afterwards. Make a backup in ZHA / Zigbee2MQTT before updating.

If the upload to the radio fails halfway, the radio stays in its bootloader (it may have no
application any more): press Install again. The bootloader itself is never touched.

Switching the type (Zigbee <-> Thread <-> router) flashes the other stack: the network on the radio is lost
and ZHA / the border router must be set up again. The mDNS record (`radio_type: ezsp`) and the
port stay as they are; adjust them in the config if you switch to Thread permanently.

## Coordinator or router

| | Coordinator (`zigbee_ncp`, default) | Router (`zigbee_router`) |
|---|---|---|
| What it is | the radio of ZHA / Zigbee2MQTT, which run the network | a repeater in an existing network, like a mains-powered plug |
| Host | ZHA / Z2M over TCP port 6638 | none: the radio runs the network stack itself |
| Port 6638 | used | not used (nothing to talk to) |

The router is Nabu Casa's router application (from their builder, made for the Home Assistant
Connect ZBT-2) without the ZBT-2's LED ring, accelerometer and button: it shows up as a plain
router (Basic + Identify), not as a light. It is **experimental**: it builds, it has not run on a
TubesZB yet.

**Switching a coordinator to router mode removes your Zigbee network from this radio.** Do that
only when ZHA / Zigbee2MQTT already run on another coordinator (migrate first, with a backup).

1. *Radio firmware type* -> **Zigbee router**, pick a channel, **Install**.
2. In ZHA / Zigbee2MQTT (on the other coordinator): *Add device* / *Permit join*.
3. Press **Zigbee router: join network**. *Zigbee router network* shows `Joining...` and, within a
   minute or two, `Joined: channel .., PAN .., node ..`.

After a restart the router rejoins its network by itself. To move it to another network: *leave
network*, then *join network* again. Back to a coordinator: type **Zigbee (EmberZNet NCP)** and
**Install** (the radio's bootloader is reached with the GPIO pins, whatever firmware runs).

The ESP32 talks to the router's CLI on the UART (`info`, `plugin network-steering start 0`,
`network leave`). It never sends anything there while a coordinator or Thread firmware is
installed.

## Security

- The manifests are signed with an ECDSA P-256 key that only the build server has. The public
  half is in `tubeszb-efr32-mgm210-2022.yaml` (`public_key`). A manifest without a valid
  signature, or a signed manifest of another channel or firmware type, is refused.
- The image must match the sha256 in the signed manifest before it is flashed. HTTPS
  certificate checking is off on this ESP32 (no CA bundle in the Arduino build); it is not needed
  for integrity because of the two checks above.
- What the signature does not stop: replaying an *older* signed manifest of the same channel
  (an attacker who controls the download could offer an older build). Nothing is installed
  without someone pressing Install.
- The radio's bootloader does not check signatures itself (no secure boot on this module).

## Files

- `esphome/components/efr32_radio/`: the ESPHome component (update platform).
- `esphome/tubeszb-efr32-mgm210-2022.yaml`: `http_request`, the two selects and the
  `update:` entry; `efr32_installed_firmware` / `efr32_installed_version` are only used until the
  first install through the device.
