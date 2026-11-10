# De Zigbee-radio (EFR32) flashen

De ESP32 stuurt de seriële poort van de EFR32 door op TCP-poort **6638**. Elke pc in het netwerk kan de
radio daarom flashen met [universal-silabs-flasher](https://github.com/NabuCasa/universal-silabs-flasher),
zonder kabels of het kastje te openen.

> Getest op 10/11/2026: 7.4.3 → 9.1.1.1, universal-silabs-flasher 1.3.0, ZHA, netwerk behouden zonder
> restore. Toch: **eerst een backup**.

## 1. Voorbereiden

1. **Backups** in Home Assistant:
   - ZHA → Configureren → *Backup downloaden* (netwerkinstellingen, bevat de netwerksleutel: veilig bewaren).
   - Een volledige HA-backup.
2. Noteer de huidige firmware (ZHA → Configureren → radio-info).
3. Installeer de flasher op een pc:
   ```bash
   python -m venv usf && . usf/bin/activate      # Windows: usf\Scripts\activate
   pip install universal-silabs-flasher
   ```
4. Controleer het bestand:
   ```bash
   sha256sum -c efr32/firmware/9.1.1.1/SHA256SUMS
   universal-silabs-flasher dump-gbl-metadata --firmware efr32/firmware/9.1.1.1/tubeszb_mgm210_zigbee_ncp_9.1.1.1.gbl
   ```

## 2. ZHA (of Zigbee2MQTT) loskoppelen

De TCP-poort laat maar één verbinding toe. Schakel de **ZHA-integratie uit** (niet verwijderen):
Instellingen → Apparaten & diensten → Zigbee Home Automation → ⋮ → *Uitschakelen*.
Op de TubesZB-webpagina moet "Verbonden met ZHA" nu uit staan.

## 3. Flashen

```bash
universal-silabs-flasher --device socket://<ip-van-tubeszb>:6638 \
  --probe-methods ezsp:115200,bootloader:115200 \
  flash --firmware efr32/firmware/9.1.1.1/tubeszb_mgm210_zigbee_ncp_9.1.1.1.gbl
```

- De flasher vindt de draaiende firmware, zet de radio zelf in de bootloader en stuurt de firmware door
  (± 2½ minuut bij 115200 baud).
- Lukt het niet om in de bootloader te komen: druk op de webpagina van de TubesZB op
  **Onderhoud → "Zigbee-radio in flashmodus (bootloader)"** (zichtbaar via *Show all*) en flash met
  `--probe-methods bootloader:115200`.

Controleren:
```bash
universal-silabs-flasher --device socket://<ip-van-tubeszb>:6638 \
  --probe-methods ezsp:115200 probe
# verwacht: Detected ApplicationType.EZSP, version '9.1.1.1 build 0 (...)'
```
(Een traceback ná die regel, in de "EmberZNet Config"-dump, is een fout in de flasher en onschuldig.)

## 4. Terug in gebruik

1. ZHA weer inschakelen.
2. ZHA → Configureren: firmware 9.1.1.1, apparaten online.
3. Meldt ZHA geen netwerk: herstel uit de backup van stap 1 (*Migreren/herstellen*); vorm **geen** nieuw
   netwerk.

## Terug naar de originele firmware

De Gecko-bootloader wordt nooit overschreven, dus terug kan altijd:

1. Download tube's firmware, bv. 7.4.3:
   [tubeszb-mgm21-2022_7.4.3.gbl](https://github.com/tube0013/tube_gateways/tree/main/models/current/tubeszb-efr32-MGM210-eth_usb/firmware/efr32_MGM210/ncp/7.4.3)
2. ZHA uit → webpagina: "Zigbee-radio in flashmodus (bootloader)".
3. ```bash
   universal-silabs-flasher --device socket://<ip-van-tubeszb>:6638 \
     --probe-methods bootloader:115200 flash --firmware tubeszb-mgm21-2022_7.4.3.gbl
   ```
4. ZHA aan; zo nodig netwerk herstellen uit de backup.

Laatste redmiddel als ook de bootloader niet antwoordt: SWD via de 10-pin header (zie
[hardware.md](hardware.md)).
