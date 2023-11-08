# Open Media Vault 2 MQTT

[![pipeline status](https://github.com/Smeagolworms4/omv2mqtt/actions/workflows/build_images.yml/badge.svg)](https://github.com/Smeagolworms4/omv2mqtt/actions/workflows/build_images.yml)

[!["Buy Me A Coffee"](https://raw.githubusercontent.com/Smeagolworms4/donate-assets/master/coffee.png)](https://www.buymeacoffee.com/smeagolworms4)
[!["Buy Me A Coffee"](https://raw.githubusercontent.com/Smeagolworms4/donate-assets/master/paypal.png)](https://www.paypal.com/donate/?business=SURRPGEXF4YVU&no_recurring=0&item_name=Hello%2C+I%27m+SmeagolWorms4.+For+my+open+source+projects.%0AThanks+you+very+mutch+%21%21%21&currency_code=EUR)

OMV2MQTT is a wrapper for send data on Open Media Vault to MQTT broker.

## Usage

Pull repository

```bash
docker pull smeagolworms4/omv2mqtt
```
Run container:

```bash
docker run -ti \
    -e MQTT_URI=mqtt://login:password@192.168.1.100 \
    -e OMV_URL=http://192.168.1.101 \
    -e OMV_LOGIN=admin \
    -e OMV_PASSWORD=password \
    smeagolworms4/omv2mqtt
```

## Environment variables

```
ENV MQTT_URI=                       #Required
ENV OMV_URL=                        #Required
ENV OMV_LOGIN=                      #Required
ENV OMV_PASSWORD=                   #Required
ENV OMV_EXPOSED_NETWORKS=eth0,wlan0
ENV OMV_DISABLE_CHECK_HTTPS=0
ENV SCAN_INTERVAL=30
ENV LOGIN_INTERVAL=300
ENV DEBUG=MESSAGE
ENV MQTT_PREFIX=omv
ENV MQTT_RETAIN=1
ENV MQTT_QOS=0
ENV HA_DISCOVERY=1
ENV HA_PREFIX=homeassistant
```

## For Dev

Start container

```bash
make up
```

Initialize env

```bash
make init
```

Run watch

```bash
make omv2mqtt-watch
```


## Docker hub

https://hub.docker.com/r/smeagolworms4/omv2mqtt

## Github

https://github.com/Smeagolworms4/omv2mqtt


## Home Assistant Addon

https://github.com/GollumDom/addon-repository
