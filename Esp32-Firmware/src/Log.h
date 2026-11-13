/**
 * Serial log with a time stamp and a tag, readable in `pio device monitor`:
 *
 *     [   12.345] NET     poll ok (0 commands)
 *     [   12.900] LOCKER  L2 door opened
 *
 *     LOG("NET", "poll failed: HTTP %d", status);
 */

#pragma once

#include <Arduino.h>

#define LOG(tag, format, ...)                                                         \
	Serial.printf("[%9.3f] %-7s " format "\n", millis() / 1000.0, tag, ##__VA_ARGS__)
