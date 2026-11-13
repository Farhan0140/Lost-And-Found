#include "Display.h"

#include <LiquidCrystal_I2C.h>
#include <Wire.h>

#include "Log.h"

Display display;

// Common addresses of the PCF8574 / PCF8574A backpacks.
static const uint8_t CANDIDATE_ADDRESSES[] = {0x27, 0x3F};

static bool i2cDevicePresent(uint8_t address) {
	Wire.beginTransmission(address);

	return Wire.endTransmission() == 0;
}

bool Display::begin() {
	for (const uint8_t candidate : CANDIDATE_ADDRESSES) {
		if (i2cDevicePresent(candidate)) {
			address = candidate;
			break;
		}
	}

	if (address == 0) {
		LOG("LCD", "no LCD found at 0x27 or 0x3F — check SDA/SCL wiring and 5 V");

		return false;
	}

	lcd = new LiquidCrystal_I2C(address, LCD_COLUMNS, LCD_ROWS);

	lcd->init();
	lcd->backlight();
	lcd->clear();

	LOG("LCD", "found at 0x%02X", address);

	return true;
}

void Display::show(const char *line0, const char *line1, const char *line2, const char *line3) {
	const char *wanted[LCD_ROWS] = {line0, line1, line2, line3};

	for (uint8_t row = 0; row < LCD_ROWS; row++) {
		writeLine(row, wanted[row] ? wanted[row] : "");
	}

	firstDraw = false;
}

void Display::writeLine(uint8_t row, const char *text) {
	// Build exactly LCD_COLUMNS printable ASCII characters.
	char fitted[LCD_COLUMNS + 1];
	uint8_t length = 0;

	for (const char *cursor = text; *cursor && length < LCD_COLUMNS; cursor++) {
		const unsigned char character = static_cast<unsigned char>(*cursor);

		if (character >= 0x80) {
			// Skip the rest of a UTF-8 sequence, print one '?' for the whole character.
			if ((character & 0xC0) == 0x80) {
				continue;
			}

			fitted[length++] = '?';
		} else if (character < 0x20) {
			fitted[length++] = ' ';
		} else {
			fitted[length++] = static_cast<char>(character);
		}
	}

	while (length < LCD_COLUMNS) {
		fitted[length++] = ' ';
	}

	fitted[LCD_COLUMNS] = '\0';

	if (!firstDraw && strcmp(fitted, lines[row]) == 0) {
		return;
	}

	strlcpy(lines[row], fitted, sizeof(lines[row]));

	if (!lcd) {
		return;
	}

	lcd->setCursor(0, row);
	lcd->print(fitted);
}

void Display::center(char *out, const char *text) {
	const size_t length = strnlen(text, LCD_COLUMNS);
	const size_t padding = (LCD_COLUMNS - length) / 2;

	memset(out, ' ', padding);
	memcpy(out + padding, text, length);
	out[padding + length] = '\0';
}
