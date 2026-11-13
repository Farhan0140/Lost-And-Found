/**
 * Talks to the backend's /api/v1/device/... routes.
 *
 *     ApiClient api;
 *     api.configure(settings);
 *
 *     JsonDocument answer;
 *     ApiResult result = api.post("/device/hello", request, answer);
 *
 * Every request carries X-Device-Id and X-Device-Secret.
 * HTTPS is checked against the root certificates in include/root_ca.h, unless
 * "allow insecure" was ticked in the setup portal (local testing only).
 */

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#include "Settings.h"

class HTTPClient;
class WiFiClient;
class WiFiClientSecure;

enum class ApiResult : uint8_t {
	Ok,              // 2xx and the body is valid JSON
	NetworkError,    // no connection, TLS failure, timeout
	NotAuthorized,   // 401 / 403 / 404 DEVICE_NOT_REGISTERED — wrong ID / secret / disabled
	ServerError,     // any other non-2xx answer
};

const char *apiResultName(ApiResult result);

class ApiClient {
public:
	ApiClient();
	~ApiClient();

	void configure(const Settings &settings);

	ApiResult get(const char *path, JsonDocument &answer);
	ApiResult post(const char *path, const JsonDocument &body, JsonDocument &answer);

	/** HTTP status of the last request (negative = HTTPClient error). */
	int lastStatus() const { return status; }

	/** Error code / message of the last failed request, for logs and the setup portal. */
	const String &lastError() const { return error; }

	/** Closes the kept-alive connection (e.g. after Wi-Fi dropped). */
	void disconnect();

private:
	String baseUrl;
	String deviceId;
	String deviceSecret;
	bool insecure = false;
	bool https = true;

	WiFiClientSecure *secureClient = nullptr;
	WiFiClient *plainClient = nullptr;
	HTTPClient *http = nullptr;

	int status = 0;
	String error;

	ApiResult send(const char *method, const char *path, const JsonDocument *body, JsonDocument &answer);
};
