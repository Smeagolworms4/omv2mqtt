# Étape de build
FROM node:lts-alpine AS builder

WORKDIR /app

# Copie des fichiers et dossiers nécessaires
COPY src /app/src
COPY tsconfig.json package-lock.json package.json /app/
RUN npm install && npm run build

# Étape de production
FROM node:lts-alpine AS runner

WORKDIR /app

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

ENV MQTT_URI=
ENV OMV_URL=
ENV OMV_LOGIN=
ENV OMV_PASSWORD=
ENV OMV_EXPOSED_NETWORKS=eth0,wlan0
ENV DEBUG=MESSAGE
ENV SCAN_INTERVAL=30
ENV LOGIN_INTERVAL=300
ENV DEBUG=MESSAGE
ENV MQTT_PREFIX=omv
ENV MQTT_RETAIN=1
ENV MQTT_QOS=0
ENV HA_DISCOVERY=1
ENV HA_PREFIX=homeassistant

CMD node dist/index.js \
	-m "$MQTT_URI" \
	-o "$OMV_URL" \
	-u "$OMV_LOGIN" \
	-p "$OMV_PASSWORD" \
	-l $DEBUG \
	--scan-interval $SCAN_INTERVAL \
	--login-interval $LOGIN_INTERVAL \
	--mqtt-prefix $MQTT_PREFIX \
	--mqtt-retain $MQTT_RETAIN \
	--mqtt-qos $MQTT_QOS \
	--ha-discovery $HA_DISCOVERY \
	--ha-prefix $HA_PREFIX \
	--omv-exposed-networks $OMV_EXPOSED_NETWORKS