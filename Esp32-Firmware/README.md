# SmartFind kiosk firmware (ESP32)

Firmware for the SmartFind locker kiosk: a 3×4 keypad, a 20×4 LCD and four lockers.
Each locker has a door switch, an IR "item inside" sensor and an SG90 servo that slides a bolt.
The kiosk talks to the backend's `/api/v1/device/*` routes (see `lost_and_found/src/modules/devices`).

```
pio run                  build
pio run -t upload        build + flash over USB
pio device monitor       serial log (115200 baud, with timestamps + crash decoder)
```

PlatformIO, Arduino core 2.0.17 (`espressif32@6.12.0`). All library versions are pinned in `platformio.ini`.

---

## Hardware

| Part | Notes |
| --- | --- |
| ESP32 DevKit V1 (30-pin) | |
| LCD 20×4 + I²C backpack | address found automatically (0x27 or 0x3F) |
| PCA9685 16-channel servo driver | address 0x40, channels 0–3 = lockers 1–4 |
| 4 × SG90 servo | slide the bolt |
| 4 × door switch (reed or micro switch) | closed door → pin connected to GND |
| 4 × IR obstacle sensor (FC-51 type) | output LOW when an item is in front |
| 3×4 membrane keypad | |
| active buzzer | |
| push button | setup button |
| **separate 5 V supply (≥ 2 A)** for the servos | never power servos from the ESP32's 5 V pin |

### Pin map

All of it lives in [`include/config.h`](include/config.h). Change it there if you wire differently.

| Signal | GPIO |
| --- | --- |
| I²C SDA / SCL (LCD + PCA9685) | 21 / 22 |
| Keypad rows 1–4 | 32, 33, 25, 26 |
| Keypad columns 1–3 | 27, 14, 13 |
| Door switches L1–L4 | 4, 16, 17, 18 (to GND, internal pull-up) |
| IR sensors L1–L4 | 34, 35, 36, 39 (input-only pins) |
| Buzzer | 19 |
| Setup button | 23 (to GND, internal pull-up) |
| Status LED | 2 (onboard) |
| Servos L1–L4 | PCA9685 channels 0–3 |

**Ground:** connect the servo supply's GND, the PCA9685 GND and the ESP32 GND together.
The PCA9685's `V+` terminal gets the separate 5 V; its `VCC` pin gets 3.3 V from the ESP32.

**IR sensors** on GPIO 34–39: these pins have no pull-ups. That is fine for FC-51 modules, which drive their output.
If you use bare IR LEDs or open-collector sensors, add a 10 kΩ pull-up to 3.3 V.

**IR modules at 5 V:** their output then swings to 5 V. Power them from 3.3 V (most work fine), or add a voltage divider.

---

## First start: the setup portal

The kiosk opens its setup portal by itself when nothing is configured yet. It also opens when:

- the setup button is **held while powering on**, or
- the setup button is **held for 3 seconds** while the kiosk is running (it restarts into setup).

Then:

1. In the admin panel go to **Lockers → Devices**, create the device (e.g. `KIOSK-01`) with 4 lockers, and copy the **secret** (`sfd_…`). It is shown only once; "Rotate secret" makes a new one.
2. The LCD shows:
   ```
   ** SETUP MODE **
   WiFi:SmartFind-Setup
   Pass: 12345678
   Open 192.168.4.1
   ```
   The password is always `12345678`. Change it with `SETUP_AP_PASSWORD` in `include/config.h` (at least 8 characters).
3. Join that Wi-Fi with a phone or laptop. The page usually opens by itself; otherwise open http://192.168.4.1.
4. Fill in the form:
   - **Wi-Fi network** (the "Scan" button lists what the kiosk can see; only 2.4 GHz works)
   - **Wi-Fi password**
   - **Server URL**, ending with `/api/v1`, e.g. `https://smartfind-api.onrender.com/api/v1`
   - **Device ID** and **device secret**
   
   Password and secret fields are never shown again. Leave them empty to keep the saved ones.
5. **Save & check connection.** The kiosk joins the Wi-Fi, sets its clock, and calls `POST /device/hello`. The page then shows the device name and its lockers, or what went wrong.
   - While it joins your router, the setup Wi-Fi may drop for a moment (the ESP32 has one radio and moves to the router's channel). Reconnect to `SmartFind-Setup` and reload the page: the last result is still shown. The LCD's first line also says `Check OK: restart` or `Check FAILED`.
6. **Servo test:** the Lockers table has Open / Lock buttons for each bolt and shows the door and IR sensors live. Use them to check the angles (see *Calibration*).
7. **Restart kiosk.** It starts normally.

### "Allow insecure connection"

For testing with the backend on a laptop (`http://192.168.1.20:4000/api/v1`) tick **Allow insecure connection**. Plain `http://` is refused without it.
It also turns off the HTTPS certificate check. **Never use it on the real kiosk:** anyone on the network could then pretend to be the server and open lockers.

---

## Using the kiosk

```
  SmartFind Lockers
Enter your 6-digit
code, then press #
Online
```

- **0–9** type the code, **\*** deletes the last digit, **#** sends it.
- Typed digits are cleared after 30 s without a key.
- Deposit code: `Locker A2 is open / Put the item inside / and close the door.`
- Collection code: `Locker A2 is open / Take your item and / close the door.`
- A wrong code shows the tries left. Too many wrong codes lock the keypad, with a countdown (the server decides how long).
- The bottom line shows `Online`, open doors (`Open: A2`), or a problem (`! No Wi-Fi`, `! Server offline`, `! Kiosk not allowed`).
- A door left open beeps every 5 s after 45 s. After 60 s the server marks it `open_unresolved` for staff.

Status LED: **on** = online · **slow blink** = connecting / no Wi-Fi · **double blink** = server offline or kiosk not allowed · **fast blink** = setup mode.

---

## How it works

```
 core 1 (Arduino loop)                         core 0 (network task)
 ─────────────────────                         ─────────────────────
 Kiosk   keypad, LCD screens ── code ────────▶ POST /device/otp/verify
                             ◀── answer ─────
 Lockers sensors, servos,    ── events ──────▶ POST /device/events     (batched, re-sent until acked)
         state machines      ◀── force_open ── GET  /device/poll       (every 1 s)
                             ── ack ─────────▶ POST /device/commands/:id/ack
                                               POST /device/heartbeat  (every 30 s)
```

The two halves only talk through FreeRTOS queues ([`src/Shared.h`](src/Shared.h)). A slow or dead server never freezes the keypad, and never leaves a door unlocked.

### One locker

```
 LOCKED ──unlock──▶ UNLOCKED ──door opens──▶ OPEN ──door closes──▶ CLOSING ──0.8 s──▶ bolt locks
   ▲                   │ 20 s, door never opened                                        │
   │                   └───────────────────────────────▶ bolt locks ───────────────────┤
   └──── door_closed_settled { itemPresent } ◀── SETTLING (IR stable for 3 s) ◀────────┘
```

The firmware does **not** decide whether a deposit worked. It reports what the IR sensor sees once the door has been closed and the reading has been stable for 3 s.
The server decides: item present after a deposit → stored. Empty after a collection → collected. Anything else → the session fails and staff are told.

**Power cut:** after a restart, every closed door is locked straight away. An open door keeps its bolt out of the way and locks as soon as the door is closed.
A `boot` event with all sensor readings lets the server close any session that was open.

Events are numbered per boot (`bootId` + `seq`). The server ignores repeats, so re-sending after a timeout is safe.
Up to 48 events wait in RAM while the server is unreachable. If more pile up, the oldest are dropped.

### Files

| File | What |
| --- | --- |
| `include/config.h` | pins, servo angles, timings, sensor polarity |
| `include/root_ca.h` | trusted root certificates (generated) |
| `src/main.cpp` | start-up, setup button, status LED |
| `src/Lockers.*` | sensors, debouncing, servos, the per-locker state machine |
| `src/Kiosk.*` | keypad, LCD screens, buzzer, staff commands |
| `src/NetworkTask.*` | Wi-Fi, NTP, all server requests |
| `src/ApiClient.*` | HTTPS + JSON + device headers |
| `src/SetupPortal.*` | access point, web page, servo test |
| `src/Settings.*` | saved settings (flash / NVS) |
| `src/Shared.*` | queues and shared status between the two cores |
| `src/Display.*`, `src/Buzzer.*` | LCD (only changed lines are redrawn), non-blocking beeps |

---

## Calibration

All in `include/config.h`, then `pio run -t upload`:

- **Bolt angles:** `SERVO_LOCKED_ANGLE` (10°) and `SERVO_UNLOCKED_ANGLE` (100°). Use the portal's servo test. The bolt must clear the door fully when open and be fully engaged when locked, without the servo straining (buzzing) at either end.
- **Servo range:** `SERVO_MIN_US` / `SERVO_MAX_US` (500–2400 µs). Some SG90 clones want 1000–2000.
- **Servo buzzing / warm:** `SERVO_RELEASE_AFTER_MOVE = true` switches the signal off 600 ms after each move. The bolt stays put by friction. Set it to `false` if your bolt slides back by itself.
- **Door switch wired the other way** (open door = GND): `DOOR_CLOSED_LEVEL = HIGH`.
- **IR sensor reads backwards:** `IR_ITEM_PRESENT_LEVEL = HIGH`. Turn the module's potentiometer so it sees a small item at the back of the locker, but not the empty wall.
- **More or fewer lockers:** `LOCKER_COUNT` plus the pin arrays. The slots must match the lockers created for the device on the server.

The open-door warning (45 s), the unresolved limit (60 s), the settle time (3 s) and the poll / heartbeat intervals come from the server's `/device/hello` answer. The values in `config.h` are only used before that.

---

## HTTPS certificates

The kiosk checks the server's certificate against the root CAs in `include/root_ca.h`:
ISRG Root X1/X2 (Let's Encrypt), GTS Root R1–R4 (Google Trust Services) and DigiCert Global Root G2.
Those are the roots behind most hosting services (Render, for example, uses Let's Encrypt or Google Trust Services certificates).

Hosting somewhere that uses a different root? Add its name to `ROOTS` in `tools/make_root_ca.mjs` and run:

```
node tools/make_root_ca.mjs
```

That regenerates the header from Node's built-in Mozilla root store. Then rebuild.
You can see a site's root in the browser: padlock → certificate → the top of the chain.

The clock is set by NTP before the first HTTPS request, because certificate dates cannot be checked without it.
The network must allow NTP (UDP 123) to `pool.ntp.org`, `time.google.com` or `time.cloudflare.com`.

---

## Troubleshooting (serial monitor)

| Log | Meaning |
| --- | --- |
| `LCD  no LCD found at 0x27 or 0x3F` | SDA/SCL swapped, no 5 V on the backpack, or another address (run an I²C scanner) |
| `LOCKER  PCA9685 NOT found` | servo driver wiring; also reported to the server as an `error` event |
| `NET  hello failed: not authorized (INVALID_DEVICE_CREDENTIALS…)` | wrong secret: rotate it in the admin panel, re-enter it in the portal |
| `NET  hello failed: not authorized (DEVICE_NOT_REGISTERED…)` | device ID not created on this server |
| `NET  hello failed: network error (connection refused)` | wrong URL / port, or the server is asleep (Render free tier: the first request can take ~50 s) |
| `NET  NTP did not answer` | the network blocks NTP: HTTPS cannot work until it does |
| `EVENT  #12 door_open_too_long (slot 2)` | a door was left open for over 60 s |

The firmware never prints typed codes, the Wi-Fi password or the device secret.
