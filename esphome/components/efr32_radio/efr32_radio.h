#pragma once
// TubesZB radio (EFR32) firmware updates as an ESPHome update entity.
//
// check():   in a background task, fetch <base_url>/<firmware>/<channel>/manifest.json
//            and its .sig, verify the ECDSA P-256 signature with the configured
//            public key, and offer the version it names.
// perform(): download the image into the spare OTA partition of the ESP32 while
//            hashing it, compare with the signed sha256 and size, and only then put
//            the EFR32 into its Gecko bootloader and send the image over XMODEM.
//            Runs in the main loop (like ESPHome's own OTA), so uart_tcp does not
//            read the UART meanwhile; the TCP bridge is down for about half a minute.
// router_*:  only with the zigbee_router firmware on the radio: talk to its CLI on the
//            UART (join / leave a network, read the network state). Each command blocks
//            the main loop for well under a second, so uart_tcp cannot take the reply.
// web:       GET /warre/radio (status), POST /warre/radio/select (firmware + channel, then a
//            fresh signed check) and POST /warre/radio/install (installs the verified offer,
//            only when it is exactly the firmware/channel/version the page asked for). Used by
//            the version picker on the device's own web page; behind the web login.

#include <atomic>
#include <mutex>
#include <string>

#include "esphome/core/component.h"
#include "esphome/core/preferences.h"
#include "esphome/components/http_request/http_request.h"
#include "esphome/components/select/select.h"
#include "esphome/components/switch/switch.h"
#include "esphome/components/text_sensor/text_sensor.h"
#include "esphome/components/uart/uart_component.h"
#include "esphome/components/update/update_entity.h"

namespace esphome::efr32_radio {

struct Offer {
  std::string firmware, channel, version, url, sha256, summary, release_url, error;
  uint32_t size{0};
  uint32_t baudrate{0};
};

// Copy of the state for the web handler, which runs in the web server task.
struct WebStatus {
  std::string installed_firmware, installed_version, selected_firmware, selected_channel;
  std::string offer_firmware, offer_channel, offer_version, offer_summary, offer_release_url;
  std::string check_firmware, check_channel, check_error;  // last finished check
  std::string phase, result_message;
  uint32_t check_seq{0}, install_seq{0};
  int progress{0};
  bool checking{false}, installing{false}, queued{false}, result_ok{false};
};

struct Installed {
  char firmware[24];
  char version[48];
};

class Efr32RadioUpdate : public update::UpdateEntity, public PollingComponent {
 public:
  void setup() override;
  void loop() override;
  void update() override;
  void dump_config() override;
  float get_setup_priority() const override { return setup_priority::AFTER_CONNECTION; }

  void check() override { this->update(); }
  void perform(bool force) override;

  void set_http(http_request::HttpRequestComponent *http) { this->http_ = http; }
  void set_serial(uart::UARTComponent *serial) { this->serial_ = serial; }
  void set_base_url(const char *url) { this->base_url_ = url; }
  void set_public_key(const char *pem) { this->public_key_ = pem; }
  void set_reset_switch(switch_::Switch *s) { this->reset_ = s; }
  void set_bootloader_switch(switch_::Switch *s) { this->boot_ = s; }
  void set_channel_select(select::Select *s) { this->channel_select_ = s; }
  void set_firmware_select(select::Select *s) { this->firmware_select_ = s; }
  void set_installed_default(const char *firmware, const char *version) {
    this->default_firmware_ = firmware;
    this->default_version_ = version;
  }

  void set_router_status(text_sensor::TextSensor *s) { this->router_status_ = s; }

  // Zigbee router controls (no-ops with another firmware on the radio)
  bool is_router() const { return this->installed_firmware_ == "zigbee_router"; }
  void router_join();
  void router_leave();
  void router_refresh();

  // Web page API (safe to call from the web server task; the work runs in the main loop).
  WebStatus web_status();
  const char *web_select(const std::string &firmware, const std::string &channel);
  const char *web_install(const std::string &firmware, const std::string &channel, const std::string &version);
  const char *base_url() const { return this->base_url_; }

  const std::string &installed_firmware() const { return this->installed_firmware_; }
  const std::string &installed_version() const { return this->installed_version_; }
  std::string selected_channel() const;
  std::string selected_firmware() const;

 protected:
  static void check_task_(void *arg);
  bool fetch_(const std::string &url, std::string &out, size_t limit);
  bool verify_(const std::string &data, const std::string &sig_b64);
  void apply_offer_(const Offer &offer);
  bool download_(const Offer &offer);
  bool flash_(uint32_t size);
  bool enter_bootloader_();
  bool expect_(const char *text, uint32_t timeout_ms);
  bool xmodem_send_(uint32_t size);
  void reset_radio_();
  void fail_(const char *msg);
  std::string cli_(const char *cmd, uint32_t wait_ms);
  void publish_router_status_(const std::string &text);
  void snapshot_();
  void select_option_(select::Select *sel, const std::string &want, bool firmware);

  http_request::HttpRequestComponent *http_{nullptr};
  uart::UARTComponent *serial_{nullptr};
  switch_::Switch *reset_{nullptr};
  switch_::Switch *boot_{nullptr};
  select::Select *channel_select_{nullptr};
  select::Select *firmware_select_{nullptr};
  text_sensor::TextSensor *router_status_{nullptr};
  const char *base_url_{""};
  const char *public_key_{""};
  const char *default_firmware_{"zigbee_ncp"};
  const char *default_version_{""};

  std::string installed_firmware_;
  std::string installed_version_;
  ESPPreferenceObject pref_;

  Offer offer_;                       // the verified offer the entity shows
  Offer *pending_{nullptr};           // handed from the check task to loop()
  std::atomic<bool> checking_{false};
  std::atomic<bool> check_done_{false};
  bool recheck_{false};               // check() came in while one was running
  bool hold_check_{false};            // the web page is changing both selects

  std::mutex web_lock_;
  WebStatus web_;                     // guarded by web_lock_
  std::string phase_;
  uint32_t check_seq_{0};
  std::string check_firmware_, check_channel_, check_error_;
  uint32_t install_seq_{0};
  bool result_ok_{false};
  std::string result_message_;
  std::atomic<bool> install_queued_{false};
};

}  // namespace esphome::efr32_radio
