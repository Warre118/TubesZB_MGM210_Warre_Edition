"""efr32_radio update platform: radio (EFR32) firmware updates for the TubesZB.

Checks the signed manifest of the selected firmware and channel, published by
fwpipe in the `firmware` branch of this repository, and flashes the EFR32
through its Gecko bootloader (XMODEM over the UART), from Home Assistant or
the device's own web page. See docs/radio-updates.md.
"""
import esphome.codegen as cg
from esphome.components import http_request, select, switch, text_sensor, uart, update
import esphome.config_validation as cv
from esphome.const import CONF_UPDATE_INTERVAL

CODEOWNERS = ["@Warre118"]
DEPENDENCIES = ["http_request", "uart"]
AUTO_LOAD = ["json", "text_sensor"]

efr32_radio_ns = cg.esphome_ns.namespace("efr32_radio")
Efr32RadioUpdate = efr32_radio_ns.class_("Efr32RadioUpdate", update.UpdateEntity, cg.PollingComponent)

CONF_BASE_URL = "base_url"
CONF_PUBLIC_KEY = "public_key"
CONF_CHANNEL_SELECT = "channel_select"
CONF_FIRMWARE_SELECT = "firmware_select"
CONF_RESET_SWITCH = "reset_switch"
CONF_BOOTLOADER_SWITCH = "bootloader_switch"
# Not "uart_id": uart_tcp claims its UART exclusively and rejects any other
# component naming it with uart_id. This component only touches the UART
# while it blocks the main loop to flash (uart_tcp's loop does not run then).
CONF_SERIAL_ID = "serial_id"
CONF_INSTALLED_FIRMWARE = "installed_firmware"
CONF_INSTALLED_VERSION = "installed_version"
CONF_HTTP_REQUEST_ID = "http_request_id"
# text sensor with the Zigbee network state while the radio runs the router firmware
CONF_ROUTER_STATUS = "router_status"

FIRMWARE_TYPES = ["zigbee_ncp", "openthread_rcp", "zigbee_router"]


def _public_key(value):
    value = cv.string_strict(value).strip()
    if "-----BEGIN PUBLIC KEY-----" not in value or "-----END PUBLIC KEY-----" not in value:
        raise cv.Invalid("public_key must be a PEM public key (-----BEGIN PUBLIC KEY----- ...)")
    return value + "\n"


CONFIG_SCHEMA = (
    update.update_schema(Efr32RadioUpdate, icon="mdi:zigbee", entity_category="config")
    .extend(
        {
            cv.GenerateID(CONF_HTTP_REQUEST_ID): cv.use_id(http_request.HttpRequestComponent),
            cv.Required(CONF_SERIAL_ID): cv.use_id(uart.UARTComponent),
            cv.Required(CONF_BASE_URL): cv.url,
            cv.Required(CONF_PUBLIC_KEY): _public_key,
            cv.Required(CONF_RESET_SWITCH): cv.use_id(switch.Switch),
            cv.Required(CONF_BOOTLOADER_SWITCH): cv.use_id(switch.Switch),
            cv.Optional(CONF_CHANNEL_SELECT): cv.use_id(select.Select),
            cv.Optional(CONF_FIRMWARE_SELECT): cv.use_id(select.Select),
            cv.Optional(CONF_INSTALLED_FIRMWARE, default="zigbee_ncp"): cv.one_of(*FIRMWARE_TYPES),
            cv.Optional(CONF_INSTALLED_VERSION, default=""): cv.string,
            cv.Optional(CONF_ROUTER_STATUS): text_sensor.text_sensor_schema(
                icon="mdi:router-network", entity_category="diagnostic"
            ),
        }
    )
    .extend(cv.polling_component_schema("24h"))
)


async def to_code(config):
    var = await update.new_update(config)
    await cg.register_component(var, config)
    cg.add(var.set_http(await cg.get_variable(config[CONF_HTTP_REQUEST_ID])))
    cg.add(var.set_serial(await cg.get_variable(config[CONF_SERIAL_ID])))
    cg.add(var.set_base_url(config[CONF_BASE_URL].rstrip("/")))
    cg.add(var.set_public_key(config[CONF_PUBLIC_KEY]))
    cg.add(var.set_reset_switch(await cg.get_variable(config[CONF_RESET_SWITCH])))
    cg.add(var.set_bootloader_switch(await cg.get_variable(config[CONF_BOOTLOADER_SWITCH])))
    if CONF_CHANNEL_SELECT in config:
        cg.add(var.set_channel_select(await cg.get_variable(config[CONF_CHANNEL_SELECT])))
    if CONF_FIRMWARE_SELECT in config:
        cg.add(var.set_firmware_select(await cg.get_variable(config[CONF_FIRMWARE_SELECT])))
    if CONF_ROUTER_STATUS in config:
        sens = await text_sensor.new_text_sensor(config[CONF_ROUTER_STATUS])
        cg.add(var.set_router_status(sens))
    cg.add(var.set_installed_default(config[CONF_INSTALLED_FIRMWARE], config[CONF_INSTALLED_VERSION]))
