// TubesZB MGM210 Warre Edition - web login with first-run setup.
//
// ESPHome only supports a fixed web_server username/password baked in at compile time. On ESP32
// the web server keeps *pointers* to the credentials and treats an empty username as "no login",
// so this file points them at buffers in RAM that are loaded from flash (NVS) at boot:
//
//   state UNSET     -> no login; the page shows the "Create login" dialog (first run)
//   state ENABLED   -> HTTP Digest login with the stored username/password
//   state DISABLED  -> no login; the user chose "Continue without login"
//
// Endpoints (registered behind the normal web_server auth, so they need a login when enabled):
//   GET  /warre/auth            -> {"state":"unset"|"enabled"|"disabled","user":"..."}
//   POST /warre/auth/set        -> form fields user, pass: store and enable the login
//   POST /warre/auth/disable    -> keep no login
// Recovery: the Home Assistant button "Reset web login" (via the encrypted native API) calls
// warre_auth::reset(), after which the page shows the setup dialog again.
//
// Requires: web_server with an 'auth:' block (placeholder values, type: digest) so that the
// auth middleware is compiled in, and warre_auth::begin() from on_boot (priority 600).
#pragma once

#include <cstring>
#include "esphome/core/helpers.h"
#include "esphome/core/log.h"
#include "esphome/core/preferences.h"
#include "esphome/components/web_server_base/web_server_base.h"

namespace warre_auth {

static const char *const TAG = "warre_auth";

// ST_ prefix: DISABLED/ENABLED are Arduino macros.
enum State : uint8_t { ST_UNSET = 0, ST_ENABLED = 1, ST_DISABLED = 2 };

static const size_t USER_MAX = 32;
static const size_t PASS_MAX = 64;
static const size_t PASS_MIN = 8;

struct Stored {
  uint8_t state;
  char user[USER_MAX + 1];
  char pass[PASS_MAX + 1];
};

// Live credentials: the web server points at these buffers.
static char g_user[USER_MAX + 1] = "";
static char g_pass[PASS_MAX + 1] = "";
static Stored g_data{};
static esphome::ESPPreferenceObject g_pref;

inline const char *state_name() {
  switch (g_data.state) {
    case ST_ENABLED:
      return "enabled";
    case ST_DISABLED:
      return "disabled";
    default:
      return "unset";
  }
}

// Copy stored data into the live buffers. Empty g_user = no login.
inline void apply() {
  if (g_data.state == ST_ENABLED && g_data.user[0] != 0) {
    strncpy(g_user, g_data.user, USER_MAX);
    strncpy(g_pass, g_data.pass, PASS_MAX);
  } else {
    g_user[0] = 0;
    g_pass[0] = 0;
  }
  g_user[USER_MAX] = 0;
  g_pass[PASS_MAX] = 0;
  auto *base = esphome::web_server_base::global_web_server_base;
  if (base != nullptr) {
    base->set_auth_username(g_user);
    base->set_auth_password(g_pass);
  }
}

inline void save() {
  g_pref.save(&g_data);
  esphome::global_preferences->sync();
  apply();
  ESP_LOGI(TAG, "Web login: %s", state_name());
}

inline void reset() {
  memset(&g_data, 0, sizeof(g_data));
  g_data.state = ST_UNSET;
  save();
}

// Printable ASCII only, no characters that would break the Digest header or our JSON.
inline bool valid_chars(const std::string &s) {
  for (char c : s) {
    if (c < 0x21 || c > 0x7E || c == '"' || c == '\\' || c == ':')
      return false;
  }
  return true;
}

class Handler : public AsyncWebHandler {
 public:
  bool canHandle(AsyncWebServerRequest *request) const override {
    char buf[AsyncWebServerRequest::URL_BUF_SIZE];
    esphome::StringRef url = request->url_to(buf);
    return url == "/warre/auth" || url == "/warre/auth/set" || url == "/warre/auth/disable";
  }

  void handleRequest(AsyncWebServerRequest *request) override {
    char buf[AsyncWebServerRequest::URL_BUF_SIZE];
    esphome::StringRef url = request->url_to(buf);

    if (url == "/warre/auth" && request->method() == HTTP_GET) {
      // user is validated printable ASCII without quotes or backslashes, safe in JSON
      std::string json = std::string("{\"state\":\"") + state_name() + "\",\"user\":\"" +
                         (g_data.state == ST_ENABLED ? g_data.user : "") + "\"}";
      request->send(200, "application/json", json.c_str());
      return;
    }
    if (request->method() != HTTP_POST) {
      request->send(405, "text/plain", "Method not allowed");
      return;
    }

    if (url == "/warre/auth/disable") {
      memset(&g_data, 0, sizeof(g_data));
      g_data.state = ST_DISABLED;
      save();
      request->send(200, "application/json", "{\"ok\":true}");
      return;
    }

    // /warre/auth/set
    std::string user = request->arg("user");
    std::string pass = request->arg("pass");
    const char *err = nullptr;
    if (user.empty() || user.size() > USER_MAX)
      err = "Username must be 1-32 characters.";
    else if (pass.size() < PASS_MIN || pass.size() > PASS_MAX)
      err = "Password must be 8-64 characters.";
    else if (!valid_chars(user) || !valid_chars(pass))
      err = "Use letters, digits and symbols only (no spaces, quotes, backslash or colon).";
    if (err != nullptr) {
      std::string json = std::string("{\"ok\":false,\"error\":\"") + err + "\"}";
      request->send(400, "application/json", json.c_str());
      return;
    }
    memset(&g_data, 0, sizeof(g_data));
    g_data.state = ST_ENABLED;
    strncpy(g_data.user, user.c_str(), USER_MAX);
    strncpy(g_data.pass, pass.c_str(), PASS_MAX);
    save();
    request->send(200, "application/json", "{\"ok\":true}");
  }
};

// Call from esphome: on_boot (priority 600): before the web server starts (it registers its
// handlers later, at network priority), after preferences are available.
inline void begin() {
  g_pref = esphome::global_preferences->make_preference<Stored>(esphome::fnv1_hash("warre_auth_v1"), true);
  if (!g_pref.load(&g_data) || g_data.state > ST_DISABLED) {
    memset(&g_data, 0, sizeof(g_data));
    g_data.state = ST_UNSET;
  }
  g_data.user[USER_MAX] = 0;
  g_data.pass[PASS_MAX] = 0;
  apply();
  auto *base = esphome::web_server_base::global_web_server_base;
  if (base != nullptr)
    base->add_handler(new Handler());  // behind the auth middleware
  ESP_LOGI(TAG, "Web login: %s", state_name());
}

}  // namespace warre_auth
