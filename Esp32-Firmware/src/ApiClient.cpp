#include "ApiClient.h"

#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "Log.h"
#include "config.h"
#include "root_ca.h"

const char *apiResultName(ApiResult result) {
	switch (result) {
		case ApiResult::Ok:
			return "ok";
		case ApiResult::NetworkError:
			return "network error";
		case ApiResult::NotAuthorized:
			return "not authorized";
		case ApiResult::ServerError:
			return "server error";
	}

	return "?";
}

ApiClient::ApiClient() {
	secureClient = new WiFiClientSecure();
	plainClient = new WiFiClient();
	http = new HTTPClient();

	// Keep the TLS connection open between requests: a new handshake every second
	// would cost ~1 s of CPU and a lot of heap.
	http->setReuse(true);
	http->setTimeout(HTTP_TIMEOUT_MS);
	http->setConnectTimeout(HTTP_TIMEOUT_MS);
}

ApiClient::~ApiClient() {
	disconnect();

	delete http;
	delete secureClient;
	delete plainClient;
}

void ApiClient::configure(const Settings &settings) {
	disconnect();

	baseUrl = Settings::normalizeUrl(settings.serverUrl);
	deviceId = settings.deviceId;
	deviceSecret = settings.deviceSecret;
	insecure = settings.allowInsecure;
	https = baseUrl.startsWith("https://");

	if (https) {
		if (insecure) {
			secureClient->setInsecure();
			LOG("HTTP", "HTTPS WITHOUT certificate check (allow insecure is on)");
		} else {
			secureClient->setCACert(ROOT_CA_BUNDLE);
		}

		secureClient->setHandshakeTimeout(HTTP_TIMEOUT_MS / 1000 + 2);
	} else {
		LOG("HTTP", "plain HTTP — local testing only");
	}
}

void ApiClient::disconnect() {
	if (http) {
		http->end();
	}

	if (secureClient) {
		secureClient->stop();
	}

	if (plainClient) {
		plainClient->stop();
	}
}

ApiResult ApiClient::get(const char *path, JsonDocument &answer) {
	return send("GET", path, nullptr, answer);
}

ApiResult ApiClient::post(const char *path, const JsonDocument &body, JsonDocument &answer) {
	return send("POST", path, &body, answer);
}

ApiResult ApiClient::send(const char *method, const char *path, const JsonDocument *body, JsonDocument &answer) {
	answer.clear();
	error = "";
	status = 0;

	if (baseUrl.isEmpty()) {
		error = "no server URL";

		return ApiResult::NetworkError;
	}

	if (WiFi.status() != WL_CONNECTED) {
		error = "Wi-Fi not connected";

		return ApiResult::NetworkError;
	}

	const String url = baseUrl + path;

	const bool started = https
		? http->begin(*secureClient, url)
		: http->begin(*plainClient, url);

	if (!started) {
		error = "bad URL";

		return ApiResult::NetworkError;
	}

	http->addHeader("X-Device-Id", deviceId);
	http->addHeader("X-Device-Secret", deviceSecret);
	http->addHeader("Accept", "application/json");

	if (body) {
		String payload;
		serializeJson(*body, payload);

		http->addHeader("Content-Type", "application/json");
		status = http->sendRequest(method, payload);
	} else {
		status = http->sendRequest(method);
	}

	if (status <= 0) {
		error = HTTPClient::errorToString(status);

		// Drop the (probably dead) kept-alive connection so the next try starts fresh.
		http->end();
		disconnect();

		return ApiResult::NetworkError;
	}

	const String text = http->getString();

	// Keep the connection for the next request (setReuse) — end() does not close it then.
	http->end();

	const DeserializationError parseError = deserializeJson(answer, text);

	if (status >= 200 && status < 300) {
		if (parseError) {
			error = String("bad JSON from server: ") + parseError.c_str();

			return ApiResult::ServerError;
		}

		return ApiResult::Ok;
	}

	// Error answers look like { "error": { "code": "...", "message": "..." } }
	if (!parseError) {
		const char *code = answer["error"]["code"] | "";
		const char *message = answer["error"]["message"] | "";

		error = String(code) + (code[0] && message[0] ? ": " : "") + message;
	}

	if (error.isEmpty()) {
		error = String("HTTP ") + status;
	}

	LOG("HTTP", "%s %s → %d %s", method, path, status, error.c_str());

	if (status == 401 || status == 403 || status == 404) {
		const char *code = answer["error"]["code"] | "";

		// A 404 that is NOT about the device means a wrong URL, not wrong credentials.
		if (status != 404 || strcmp(code, "DEVICE_NOT_REGISTERED") == 0) {
			return ApiResult::NotAuthorized;
		}
	}

	return ApiResult::ServerError;
}
