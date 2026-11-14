#include "efr32_radio.h"

#include <cstring>

#include <esp_ota_ops.h>
#include <esp_partition.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <mbedtls/base64.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>

#include "esphome/core/application.h"
#include "esphome/core/hal.h"
#include "esphome/core/helpers.h"
#include "esphome/core/log.h"
#include "esphome/components/json/json_util.h"
#include "esphome/components/network/util.h"

namespace esphome::efr32_radio {

static const char *const TAG = "efr32_radio";

static constexpr size_t MANIFEST_MAX = 8192;
static constexpr size_t SIG_MAX = 512;
static constexpr uint32_t HTTP_IDLE_TIMEOUT_MS = 15000;
static constexpr uint32_t XMODEM_BLOCK = 128;
static constexpr uint32_t XMODEM_TIMEOUT_MS = 2000;      // per block, like universal-silabs-flasher
static constexpr uint8_t XMODEM_MAX_RETRIES = 3;
static constexpr uint8_t SOH = 0x01, EOT = 0x04, ACK = 0x06, NAK = 0x15, CAN = 0x18;

// CLI of the zigbee_router firmware (Simplicity SDK zigbee_core_cli / network steering)
static const char *const ROUTER_PROMPT = "zigbee_router>";
static const char *const CMD_INFO = "info";
static const char *const CMD_JOIN = "plugin network-steering start 0";
static const char *const CMD_LEAVE = "network leave";
static constexpr uint32_t ROUTER_POLL_MS = 60000;

// "Zigbee (EmberZNet NCP)" / "Thread (OpenThread RCP)" / "Zigbee router" or the raw ids
static std::string firmware_id(const std::string &option) {
  if (option.find("hread") != std::string::npos || option == "openthread_rcp")
    return "openthread_rcp";
  if (option.find("outer") != std::string::npos)
    return "zigbee_router";
  return "zigbee_ncp";
}

static const char *firmware_label(const std::string &fw) {
  if (fw == "openthread_rcp")
    return "Thread radio (OpenThread RCP)";
  if (fw == "zigbee_router")
    return "Zigbee router";
  return "Zigbee coordinator (EmberZNet NCP)";
}

static uint16_t crc16_xmodem(const uint8_t *data, size_t len) {
  uint16_t crc = 0;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint16_t) data[i] << 8;
    for (int b = 0; b < 8; b++)
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return crc;
}

// ------------------------------------------------------------------ setup / state
void Efr32RadioUpdate::setup() {
  this->pref_ = global_preferences->make_preference<Installed>(fnv1_hash("efr32_radio_installed"), true);
  Installed saved{};
  if (this->pref_.load(&saved) && saved.firmware[0] != '\0') {
    saved.firmware[sizeof(saved.firmware) - 1] = '\0';
    saved.version[sizeof(saved.version) - 1] = '\0';
    this->installed_firmware_ = saved.firmware;
    this->installed_version_ = saved.version;
  } else {
    this->installed_firmware_ = this->default_firmware_;
    this->installed_version_ = this->default_version_;
  }
  this->update_info_.current_version = this->installed_version_;
  this->update_info_.title = firmware_label(this->installed_firmware_);
  this->publish_state();
  // Router firmware: read its network state now and then (a no-op otherwise).
  this->set_timeout("router_first", 5000, [this]() { this->router_refresh(); });
  this->set_interval("router_poll", ROUTER_POLL_MS, [this]() {
    if (this->is_router())
      this->router_refresh();
  });
  // first check shortly after the network is up, not only after update_interval
  this->set_interval("first_check", 15000, [this]() {
    if (network::is_connected()) {
      this->cancel_interval("first_check");
      this->update();
    }
  });
}

void Efr32RadioUpdate::dump_config() {
  ESP_LOGCONFIG(TAG,
                "EFR32 radio update:\n"
                "  Manifests: %s/<firmware>/<channel>/manifest.json (signed)\n"
                "  Installed: %s %s",
                this->base_url_, this->installed_firmware_.c_str(),
                this->installed_version_.empty() ? "(unknown)" : this->installed_version_.c_str());
}

std::string Efr32RadioUpdate::selected_channel() const {
  if (this->channel_select_ != nullptr && this->channel_select_->has_state()) {
    auto opt = this->channel_select_->current_option();
    if (!opt.empty())
      return std::string(opt.c_str(), opt.size());
  }
  return "stable";
}

std::string Efr32RadioUpdate::selected_firmware() const {
  if (this->firmware_select_ != nullptr && this->firmware_select_->has_state()) {
    auto opt = this->firmware_select_->current_option();
    if (!opt.empty())
      return firmware_id(std::string(opt.c_str(), opt.size()));
  }
  return this->installed_firmware_;
}

// ------------------------------------------------------------------ check (task)
void Efr32RadioUpdate::update() {
  if (this->state_ == update::UPDATE_STATE_INSTALLING || !network::is_connected())
    return;
  bool expected = false;
  if (!this->checking_.compare_exchange_strong(expected, true)) {
    ESP_LOGD(TAG, "Check already running");
    return;
  }
  auto *offer = new Offer();
  offer->firmware = this->selected_firmware();
  offer->channel = this->selected_channel();
  this->pending_ = offer;
  this->check_done_ = false;
  if (xTaskCreate(Efr32RadioUpdate::check_task_, "efr32_check", 10240, this, 1, nullptr) != pdPASS) {
    ESP_LOGE(TAG, "Cannot start the check task");
    delete offer;
    this->pending_ = nullptr;
    this->checking_ = false;
  }
}

void Efr32RadioUpdate::check_task_(void *arg) {
  auto *self = static_cast<Efr32RadioUpdate *>(arg);
  Offer *o = self->pending_;
  std::string url = std::string(self->base_url_) + "/" + o->firmware + "/" + o->channel + "/manifest.json";
  std::string manifest, sig;
  if (!self->fetch_(url, manifest, MANIFEST_MAX)) {
    o->error = "manifest not available (no build for this channel?)";
  } else if (!self->fetch_(url + ".sig", sig, SIG_MAX)) {
    o->error = "manifest signature not available";
  } else if (!self->verify_(manifest, sig)) {
    o->error = "manifest signature is NOT valid; ignoring it";
  } else {
    bool ok = json::parse_json(reinterpret_cast<const uint8_t *>(manifest.data()), manifest.size(),
                               [o](JsonObject root) -> bool {
                                 if (root["firmware"].as<std::string>() != o->firmware ||
                                     root["channel"].as<std::string>() != o->channel)
                                   return false;  // a signed manifest of another channel: refuse
                                 o->version = root["version"].as<std::string>();
                                 o->url = root["url"].as<std::string>();
                                 o->sha256 = root["sha256"].as<std::string>();
                                 o->size = root["size"] | 0u;
                                 o->baudrate = root["baudrate"] | 0u;
                                 o->summary = root["release_summary"] | "";
                                 o->release_url = root["release_url"] | "";
                                 return !o->version.empty() && o->url.rfind("https://", 0) == 0 &&
                                        o->sha256.size() == 64 && o->size > 0;
                               });
    if (!ok)
      o->error = "manifest content is not usable";
  }
  self->check_done_ = true;
  vTaskDelete(nullptr);
}

bool Efr32RadioUpdate::fetch_(const std::string &url, std::string &out, size_t limit) {
  auto c = this->http_->get(url);
  if (c == nullptr)
    return false;
  if (c->status_code != 200) {
    ESP_LOGW(TAG, "GET %s: HTTP %d", url.c_str(), c->status_code);
    c->end();
    return false;
  }
  out.clear();
  uint8_t buf[512];
  uint32_t last = millis();
  while (true) {
    int n = c->read(buf, sizeof(buf));
    auto r = http_request::http_read_loop_result(n, last, HTTP_IDLE_TIMEOUT_MS, c->is_read_complete());
    if (r == http_request::HttpReadLoopResult::DATA) {
      if (out.size() + n > limit) {
        c->end();
        return false;
      }
      out.append(reinterpret_cast<const char *>(buf), n);
    } else if (r == http_request::HttpReadLoopResult::COMPLETE) {
      break;
    } else if (r != http_request::HttpReadLoopResult::RETRY) {
      c->end();
      return false;
    }
  }
  c->end();
  return !out.empty();
}

bool Efr32RadioUpdate::verify_(const std::string &data, const std::string &sig_b64) {
  std::string b64;
  for (char ch : sig_b64)
    if (ch != '\n' && ch != '\r' && ch != ' ')
      b64 += ch;
  uint8_t sig[160];
  size_t sig_len = 0;
  if (mbedtls_base64_decode(sig, sizeof(sig), &sig_len, reinterpret_cast<const uint8_t *>(b64.data()),
                            b64.size()) != 0)
    return false;
  uint8_t hash[32];
  if (mbedtls_sha256(reinterpret_cast<const uint8_t *>(data.data()), data.size(), hash, 0) != 0)
    return false;
  mbedtls_pk_context pk;
  mbedtls_pk_init(&pk);
  bool ok = mbedtls_pk_parse_public_key(&pk, reinterpret_cast<const uint8_t *>(this->public_key_),
                                        strlen(this->public_key_) + 1) == 0 &&
            mbedtls_pk_can_do(&pk, MBEDTLS_PK_ECKEY) &&
            mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256, hash, sizeof(hash), sig, sig_len) == 0;
  mbedtls_pk_free(&pk);
  return ok;
}

void Efr32RadioUpdate::loop() {
  if (!this->check_done_)
    return;
  this->check_done_ = false;
  Offer *o = this->pending_;
  this->pending_ = nullptr;
  this->checking_ = false;
  if (o != nullptr) {
    this->apply_offer_(*o);
    delete o;
  }
}

void Efr32RadioUpdate::apply_offer_(const Offer &o) {
  if (!o.error.empty()) {
    ESP_LOGW(TAG, "%s %s: %s", o.firmware.c_str(), o.channel.c_str(), o.error.c_str());
    this->offer_ = Offer();
    this->update_info_.latest_version = "";
    this->update_info_.title = std::string(firmware_label(o.firmware)) + " (" + o.channel + ")";
    this->update_info_.summary = "No verified firmware for this channel: " + o.error;
    this->update_info_.release_url = "";
    this->update_info_.firmware_url = "";
    this->state_ = update::UPDATE_STATE_NO_UPDATE;
    this->publish_state();
    return;
  }
  this->offer_ = o;
  this->update_info_.current_version = this->installed_version_;
  this->update_info_.latest_version = o.version;
  this->update_info_.title = std::string(firmware_label(o.firmware)) + " (" + o.channel + ")";
  std::string summary = o.summary;
  if (o.firmware != this->installed_firmware_)
    summary = std::string("Switches the radio from ") + firmware_label(this->installed_firmware_) + ". " + summary;
  this->update_info_.summary = summary.substr(0, 250);
  this->update_info_.release_url = o.release_url;
  this->update_info_.firmware_url = o.url;
  this->update_info_.md5 = "";
  this->update_info_.has_progress = false;
  this->update_info_.progress = 0;
  bool same = o.firmware == this->installed_firmware_ && o.version == this->installed_version_;
  this->state_ = same ? update::UPDATE_STATE_NO_UPDATE : update::UPDATE_STATE_AVAILABLE;
  ESP_LOGI(TAG, "%s %s: %s (installed: %s %s)%s", o.firmware.c_str(), o.channel.c_str(), o.version.c_str(),
           this->installed_firmware_.c_str(), this->installed_version_.c_str(), same ? "" : " - update available");
  this->publish_state();
}

// ------------------------------------------------------------------ install
void Efr32RadioUpdate::perform(bool force) {
  if (this->state_ == update::UPDATE_STATE_INSTALLING)
    return;
  if (this->offer_.version.empty()) {
    ESP_LOGW(TAG, "Nothing verified to install; run a check first");
    return;
  }
  if (!force && this->state_ != update::UPDATE_STATE_AVAILABLE)
    return;
  Offer o = this->offer_;
  ESP_LOGI(TAG, "Installing %s %s from %s", o.firmware.c_str(), o.version.c_str(), o.url.c_str());
  this->state_ = update::UPDATE_STATE_INSTALLING;
  this->update_info_.has_progress = true;
  this->update_info_.progress = 0;
  this->publish_state();

  if (!this->download_(o))
    return;  // nothing was sent to the radio; it keeps running its firmware
  if (o.baudrate != 0 && o.baudrate != this->serial_->get_baud_rate())
    ESP_LOGW(TAG, "The new firmware talks at %u baud, this UART is set to %u", (unsigned) o.baudrate,
             (unsigned) this->serial_->get_baud_rate());
  if (!this->flash_(o.size))
    return;

  Installed saved{};
  strncpy(saved.firmware, o.firmware.c_str(), sizeof(saved.firmware) - 1);
  strncpy(saved.version, o.version.c_str(), sizeof(saved.version) - 1);
  this->pref_.save(&saved);
  global_preferences->sync();
  this->installed_firmware_ = o.firmware;
  this->installed_version_ = o.version;
  this->update_info_.current_version = o.version;
  this->update_info_.has_progress = false;
  this->update_info_.progress = 100;
  this->state_ = update::UPDATE_STATE_NO_UPDATE;
  this->status_clear_error();
  ESP_LOGI(TAG, "Radio now runs %s %s", o.firmware.c_str(), o.version.c_str());
  this->publish_state();
  // a router starts without a network: show that, and its state once it is up
  this->set_timeout("router_first", 3000, [this]() { this->router_refresh(); });
}

void Efr32RadioUpdate::fail_(const char *msg) {
  ESP_LOGE(TAG, "Install failed: %s", msg);
  this->status_momentary_error("install", 10000);
  this->update_info_.has_progress = false;
  this->state_ = update::UPDATE_STATE_AVAILABLE;
  this->publish_state();
}

// Download into the spare OTA partition (never marked bootable) and check the
// signed sha256 and size before a single byte goes to the radio.
bool Efr32RadioUpdate::download_(const Offer &o) {
  const esp_partition_t *part = esp_ota_get_next_update_partition(nullptr);
  if (part == nullptr || o.size > part->size) {
    this->fail_("no spare OTA partition large enough for the image");
    return false;
  }
  if (esp_partition_erase_range(part, 0, (o.size + 0xFFF) & ~0xFFFu) != ESP_OK) {
    this->fail_("cannot erase the staging partition");
    return false;
  }
  auto c = this->http_->get(o.url);
  if (c == nullptr || c->status_code != 200) {
    if (c != nullptr)
      c->end();
    this->fail_("download failed");
    return false;
  }
  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  mbedtls_sha256_starts(&sha, 0);
  uint8_t buf[1024];
  uint32_t got = 0, last = millis();
  bool ok = true;
  while (ok) {
    int n = c->read(buf, sizeof(buf));
    auto r = http_request::http_read_loop_result(n, last, HTTP_IDLE_TIMEOUT_MS, c->is_read_complete());
    if (r == http_request::HttpReadLoopResult::DATA) {
      if (got + n > o.size || esp_partition_write(part, got, buf, n) != ESP_OK) {
        ok = false;
        break;
      }
      mbedtls_sha256_update(&sha, buf, n);
      got += n;
      App.feed_wdt();
    } else if (r == http_request::HttpReadLoopResult::COMPLETE) {
      break;
    } else if (r != http_request::HttpReadLoopResult::RETRY) {
      ok = false;
    }
  }
  c->end();
  uint8_t digest[32];
  mbedtls_sha256_finish(&sha, digest);
  mbedtls_sha256_free(&sha);
  char hex[65];
  for (int i = 0; i < 32; i++)
    snprintf(hex + 2 * i, 3, "%02x", digest[i]);
  if (!ok || got != o.size) {
    this->fail_("download incomplete");
    return false;
  }
  if (strcasecmp(hex, o.sha256.c_str()) != 0) {
    this->fail_("downloaded image does not match the signed checksum; not flashed");
    return false;
  }
  ESP_LOGI(TAG, "Image downloaded and verified (%u bytes)", (unsigned) got);
  return true;
}

void Efr32RadioUpdate::reset_radio_() {
  this->boot_->turn_off();
  this->reset_->turn_on();
  delay(15);
  this->reset_->turn_off();
}

bool Efr32RadioUpdate::expect_(const char *text, uint32_t timeout_ms) {
  std::string window;
  size_t tl = strlen(text);
  uint32_t start = millis();
  while (millis() - start < timeout_ms) {
    uint8_t ch;
    if (this->serial_->available() && this->serial_->read_byte(&ch)) {
      window += (char) ch;
      if (window.size() > 256)
        window.erase(0, window.size() - 128);
      if (window.size() >= tl && window.compare(window.size() - tl, tl, text) == 0)
        return true;
    } else {
      delay(1);
      App.feed_wdt();
    }
  }
  return false;
}

bool Efr32RadioUpdate::enter_bootloader_() {
  // PA00 low while the EFR32 comes out of reset = stay in the Gecko bootloader
  this->boot_->turn_on();
  delay(10);
  this->reset_->turn_on();
  delay(15);
  this->reset_->turn_off();
  delay(500);
  this->boot_->turn_off();
  for (int attempt = 0; attempt < 3; attempt++) {
    uint8_t ch;
    while (this->serial_->available() && this->serial_->read_byte(&ch)) {
    }
    this->serial_->write_str("\n3");  // a newline wakes the menu; "3" = ebl info prints it again
    if (this->expect_("BL > ", 2000))
      return true;
  }
  return false;
}

bool Efr32RadioUpdate::xmodem_send_(uint32_t size) {
  const esp_partition_t *part = esp_ota_get_next_update_partition(nullptr);
  uint8_t ch;
  while (this->serial_->available() && this->serial_->read_byte(&ch)) {
  }
  this->serial_->write_byte('1');  // 1. upload gbl
  if (!this->expect_("C", 5000))
    return false;
  uint8_t pkt[3 + XMODEM_BLOCK + 2];
  uint32_t blocks = (size + XMODEM_BLOCK - 1) / XMODEM_BLOCK;
  int last_pct = -1;
  for (uint32_t i = 0; i < blocks; i++) {
    uint32_t off = i * XMODEM_BLOCK;
    uint32_t n = std::min<uint32_t>(XMODEM_BLOCK, size - off);
    memset(pkt + 3, 0xFF, XMODEM_BLOCK);  // padding, like universal-silabs-flasher
    if (esp_partition_read(part, off, pkt + 3, n) != ESP_OK)
      return false;
    uint8_t num = (i + 1) & 0xFF;
    pkt[0] = SOH;
    pkt[1] = num;
    pkt[2] = 0xFF - num;
    uint16_t crc = crc16_xmodem(pkt + 3, XMODEM_BLOCK);
    pkt[3 + XMODEM_BLOCK] = crc >> 8;
    pkt[4 + XMODEM_BLOCK] = crc & 0xFF;
    bool acked = false;
    for (uint8_t retry = 0; retry <= XMODEM_MAX_RETRIES && !acked; retry++) {
      this->serial_->write_array(pkt, sizeof(pkt));
      uint32_t start = millis();
      while (millis() - start < XMODEM_TIMEOUT_MS) {
        if (this->serial_->available() && this->serial_->read_byte(&ch)) {
          if (ch == ACK) {
            acked = true;
            break;
          }
          if (ch == CAN)
            return false;
          if (ch == NAK)
            break;  // resend
        } else {
          delay(1);
        }
      }
      App.feed_wdt();
    }
    if (!acked) {
      ESP_LOGE(TAG, "XMODEM: block %u not acknowledged", (unsigned) (i + 1));
      return false;
    }
    int pct = (int) ((i + 1) * 100 / blocks);
    if (pct / 10 != last_pct / 10) {
      ESP_LOGI(TAG, "Flashing: %d%%", pct);
      last_pct = pct;
    }
    this->update_info_.progress = pct;
  }
  for (int retry = 0; retry < 3; retry++) {
    this->serial_->write_byte(EOT);
    if (this->expect_("\x06", XMODEM_TIMEOUT_MS))
      return this->expect_("Serial upload complete", 5000);
  }
  return false;
}

bool Efr32RadioUpdate::flash_(uint32_t size) {
  ESP_LOGW(TAG, "Radio goes into its bootloader now; the Zigbee/Thread bridge is down until it is done");
  this->serial_->flush();
  if (!this->enter_bootloader_()) {
    this->reset_radio_();
    this->fail_("the radio did not show its bootloader menu; it keeps its current firmware");
    return false;
  }
  if (!this->xmodem_send_(size)) {
    // The bootloader may have erased the old application: leave the radio in the
    // bootloader so a retry (Install again) can upload once more.
    this->fail_("upload to the radio failed; press Install again (the radio waits in its bootloader)");
    return false;
  }
  this->expect_("BL > ", 2000);
  this->serial_->write_byte('2');  // 2. run
  delay(200);
  this->reset_radio_();            // a clean start of the new firmware
  uint8_t ch;
  delay(1000);
  while (this->serial_->available() && this->serial_->read_byte(&ch)) {
  }
  return true;
}

// ------------------------------------------------------------------ Zigbee router
// Send one CLI command and collect what the radio answers until its prompt comes
// back (or wait_ms passes). Blocks the main loop: uart_tcp cannot read meanwhile.
std::string Efr32RadioUpdate::cli_(const char *cmd, uint32_t wait_ms) {
  uint8_t ch;
  while (this->serial_->available() && this->serial_->read_byte(&ch)) {
  }
  this->serial_->write_str(cmd);
  this->serial_->write_str("\r\n");
  std::string out;
  uint32_t start = millis();
  while (millis() - start < wait_ms) {
    if (this->serial_->available() && this->serial_->read_byte(&ch)) {
      if (ch != '\r')
        out += (char) ch;
      if (out.size() > 2048)
        out.erase(0, out.size() - 1024);
      // the echo comes first, the prompt after the output
      size_t echo = out.find(cmd);
      size_t from = echo == std::string::npos ? 0 : echo + strlen(cmd);
      if (out.find(ROUTER_PROMPT, from) != std::string::npos)
        break;
    } else {
      delay(1);
      App.feed_wdt();
    }
  }
  return out;
}

static void log_lines(const char *what, const std::string &out) {
  size_t pos = 0;
  while (pos < out.size()) {
    size_t nl = out.find('\n', pos);
    std::string line = out.substr(pos, nl == std::string::npos ? std::string::npos : nl - pos);
    if (!line.empty() && line.find(ROUTER_PROMPT) == std::string::npos) {
      ESP_LOGD(TAG, "router %s: %s", what, line.c_str());
    }
    if (nl == std::string::npos)
      break;
    pos = nl + 1;
  }
}

// value between the brackets after key, e.g. "chan [15]" -> "15"
static std::string bracket_value(const std::string &out, const char *key) {
  size_t k = out.find(key);
  if (k == std::string::npos)
    return "";
  size_t open = out.find('[', k);
  size_t close = open == std::string::npos ? std::string::npos : out.find(']', open);
  if (close == std::string::npos || close - open > 24)
    return "";
  return out.substr(open + 1, close - open - 1);
}

void Efr32RadioUpdate::publish_router_status_(const std::string &text) {
  if (this->router_status_ != nullptr && this->router_status_->state != text)
    this->router_status_->publish_state(text);
}

void Efr32RadioUpdate::router_refresh() {
  if (this->state_ == update::UPDATE_STATE_INSTALLING)
    return;
  if (!this->is_router()) {
    this->publish_router_status_("Not a router (radio runs " + this->installed_firmware_ + ")");
    return;
  }
  std::string out = this->cli_(CMD_INFO, 1500);
  log_lines("info", out);
  std::string state = bracket_value(out, "network state");
  if (state.empty()) {
    this->publish_router_status_("No answer from the radio's CLI");
    return;
  }
  int st = (int) strtol(state.c_str(), nullptr, 16);
  std::string chan = bracket_value(out, "chan");
  std::string pan = bracket_value(out, "panID");
  std::string node = bracket_value(out, "nodeID");
  std::string text;
  switch (st) {
    case 0:
      text = "Not on a network (press Join, with joining open in ZHA / Zigbee2MQTT)";
      break;
    case 1:
      text = "Joining...";
      break;
    case 2:
      text = "Joined: channel " + chan + ", PAN " + pan + ", node " + node;
      break;
    case 3:
      text = "Joined, but no parent (searching): channel " + chan + ", PAN " + pan;
      break;
    case 4:
      text = "Leaving the network...";
      break;
    default:
      text = "Network state " + state;
  }
  this->publish_router_status_(text);
}

void Efr32RadioUpdate::router_join() {
  if (!this->is_router()) {
    ESP_LOGW(TAG, "Join: the radio does not run the Zigbee router firmware");
    return;
  }
  ESP_LOGI(TAG, "Router: searching for an open Zigbee network (allow joining in ZHA / Zigbee2MQTT)");
  log_lines("join", this->cli_(CMD_JOIN, 1500));
  this->publish_router_status_("Joining...");
  // steering scans all channels; look again a few times
  this->set_timeout("router_r1", 15000, [this]() { this->router_refresh(); });
  this->set_timeout("router_r2", 45000, [this]() { this->router_refresh(); });
  this->set_timeout("router_r3", 90000, [this]() { this->router_refresh(); });
}

void Efr32RadioUpdate::router_leave() {
  if (!this->is_router()) {
    ESP_LOGW(TAG, "Leave: the radio does not run the Zigbee router firmware");
    return;
  }
  ESP_LOGI(TAG, "Router: leaving the Zigbee network");
  log_lines("leave", this->cli_(CMD_LEAVE, 1500));
  this->set_timeout("router_r1", 3000, [this]() { this->router_refresh(); });
}

}  // namespace esphome::efr32_radio
