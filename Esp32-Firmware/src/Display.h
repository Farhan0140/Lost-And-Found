/**
 * 20×4 character LCD with an I²C backpack.
 *
 *     display.begin();                         // finds the LCD at 0x27 or 0x3F
 *     display.show("Line 1", "Line 2", "", "Line 4");
 *
 * Only the lines that changed are re-written, so calling show() every loop
 * does not flicker. Text is cut / padded to 20 characters, and anything that
 * is not plain ASCII is replaced with '?' (the LCD has no other characters).
 */

#pragma once

#include <Arduino.h>

#include "config.h"

class LiquidCrystal_I2C;

class Display {
public:
	bool begin();
	bool available() const { return lcd != nullptr; }

	/** Puts four lines on the screen (nullptr or "" = empty line). */
	void show(const char *line0, const char *line1, const char *line2, const char *line3);

	/** Writes a centred copy of `text` into `out` (LCD_COLUMNS + 1 bytes). */
	static void center(char *out, const char *text);

private:
	LiquidCrystal_I2C *lcd = nullptr;
	uint8_t address = 0;

	char lines[LCD_ROWS][LCD_COLUMNS + 1] = {};
	bool firstDraw = true;

	void writeLine(uint8_t row, const char *text);
};

extern Display display;
