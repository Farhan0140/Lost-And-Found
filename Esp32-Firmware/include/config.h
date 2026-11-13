/**
 * Everything you might need to change for YOUR hardware is in this file:
 * pins, servo angles, timings, sensor polarity.
 *
 * Pin map (approved in REVIEW_ANSWERS.md):
 *
 *   I²C SDA / SCL (LCD + PCA9685) ... 21 / 22
 *   Keypad rows ..................... 32, 33, 25, 26
 *   Keypad columns .................. 27, 14, 13        (3×4 keypad, no A–D column)
 *   Door switches L1–L4 ............. 4, 16, 17, 18     (switch to GND, internal pull-up)
 *   IR sensors L1–L4 ................ 34, 35, 36, 39    (input-only pins; the module drives them)
 *   Buzzer (active) ................. 19
 *   Setup button .................... 23                (to GND, internal pull-up)
 *   Status LED ...................... 2                 (onboard)
 *   Servos L1–L4 .................... PCA9685 channels 0–3
 */

#pragma once

#include <Arduino.h>

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "dev"
#endif

// ─────────────────────────────────────────────────────────────
//  Lockers
// ─────────────────────────────────────────────────────────────

constexpr uint8_t LOCKER_COUNT = 4;

// Slot numbers (1-based) must match the lockers created for this device on the server.
constexpr uint8_t DOOR_PINS[LOCKER_COUNT] = {4, 16, 17, 18};
constexpr uint8_t IR_PINS[LOCKER_COUNT] = {34, 35, 36, 39};
constexpr uint8_t SERVO_CHANNELS[LOCKER_COUNT] = {0, 1, 2, 3};

// Door switch: pressed (connected to GND → LOW) when the door is CLOSED.
constexpr int DOOR_CLOSED_LEVEL = LOW;

// FC-51 / "IR obstacle avoidance" modules pull their output LOW when something is in front.
constexpr int IR_ITEM_PRESENT_LEVEL = LOW;

// ─────────────────────────────────────────────────────────────
//  Servos (SG90 on a PCA9685, 50 Hz)
// ─────────────────────────────────────────────────────────────

constexpr uint8_t PCA9685_ADDRESS = 0x40;
constexpr uint16_t SERVO_MIN_US = 500;   // pulse for 0°
constexpr uint16_t SERVO_MAX_US = 2400;  // pulse for 180°

// Angles of the sliding bolt. Test with the "servo test" in the setup portal and adjust.
constexpr uint8_t SERVO_LOCKED_ANGLE = 10;
constexpr uint8_t SERVO_UNLOCKED_ANGLE = 100;

// How long the servo needs to reach its position before its signal is switched off.
// Switching off stops SG90 buzzing / heating; the bolt stays where it is.
constexpr uint32_t SERVO_MOVE_MS = 600;
constexpr bool SERVO_RELEASE_AFTER_MOVE = true;

// ─────────────────────────────────────────────────────────────
//  Other pins
// ─────────────────────────────────────────────────────────────

constexpr uint8_t I2C_SDA_PIN = 21;
constexpr uint8_t I2C_SCL_PIN = 22;

constexpr uint8_t KEYPAD_ROW_PINS[4] = {32, 33, 25, 26};
constexpr uint8_t KEYPAD_COLUMN_PINS[3] = {27, 14, 13};

constexpr uint8_t BUZZER_PIN = 19;
constexpr uint8_t SETUP_BUTTON_PIN = 23;
constexpr uint8_t STATUS_LED_PIN = 2;

// LCD 20×4 with I²C backpack: the address is found automatically (0x27 or 0x3F).
constexpr uint8_t LCD_COLUMNS = 20;
constexpr uint8_t LCD_ROWS = 4;

// ─────────────────────────────────────────────────────────────
//  Timings
// ─────────────────────────────────────────────────────────────

// Unlocked but the door was never opened → lock again after this long.
constexpr uint32_t UNLOCK_WINDOW_MS = 20000;

// Door must stay closed this long before the bolt slides back (avoids locking on a bounce).
constexpr uint32_t CLOSE_BEFORE_LOCK_MS = 800;

// Contact / IR debounce.
constexpr uint32_t DOOR_DEBOUNCE_MS = 60;
constexpr uint32_t IR_DEBOUNCE_MS = 300;

// Defaults; the server's /device/hello answer replaces them.
constexpr uint32_t DEFAULT_POLL_INTERVAL_MS = 1000;
constexpr uint32_t DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
constexpr uint32_t DEFAULT_DOOR_WARNING_MS = 45000;
constexpr uint32_t DEFAULT_DOOR_UNRESOLVED_MS = 60000;
constexpr uint32_t DEFAULT_SETTLE_MS = 3000;

// Keypad: typed digits are cleared after this much inactivity.
constexpr uint32_t KEYPAD_IDLE_CLEAR_MS = 30000;

// How long a result ("Wrong code", "Locker L2 is open") stays on the LCD.
constexpr uint32_t MESSAGE_SHOW_MS = 5000;

// Hold the setup button this long (while running) to open the setup portal.
// Holding it while powering on opens the portal straight away.
constexpr uint32_t SETUP_HOLD_MS = 3000;

// Network
constexpr uint32_t HTTP_TIMEOUT_MS = 8000;
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint32_t OFFLINE_AFTER_FAILURES = 3;   // failed polls in a row → "Server offline"

// Events waiting to be sent (kept in RAM; a reboot sends a fresh "boot" snapshot instead).
constexpr uint8_t EVENT_QUEUE_SIZE = 48;
constexpr uint8_t EVENTS_PER_REQUEST = 12;

// Setup portal
constexpr const char *SETUP_AP_NAME = "SmartFind-Setup";

// Password of the setup Wi-Fi (WPA2 needs at least 8 characters).
constexpr const char *SETUP_AP_PASSWORD = "12345678";
