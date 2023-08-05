export DOCKER_NAME=omv2mqtt

RULE_DEP_UP=history

include .env.local

.env.local:
	@echo "Init your environment:"
	@echo ""
	@read -p "	- Enter your OMV_URL (ex: http://192.168.1.100): " OMV_URL; echo "OMV_URL=$$OMV_URL" > .env.local
	@read -p "	- Enter your OMV_LOGIN: " OMV_LOGIN; echo "OMV_LOGIN=$$OMV_LOGIN" >> .env.local
	@read -p "	- Enter your OMV_PASSWORD: " OMV_PASSWORD; echo "OMV_PASSWORD=$$OMV_PASSWORD" >> .env.local
	@echo ""

# external resource #
export MAKEFILE_URL=https://raw.githubusercontent.com/Smeagolworms4/auto-makefile/master

# import #
$(shell [ ! -f docker/.makefiles/index.mk ] && mkdir -p docker/.makefiles && curl -L --silent -f $(MAKEFILE_URL)/docker-compose.mk -o docker/.makefiles/index.mk)
include docker/.makefiles/index.mk

# Add variable on documentation #
export MQTT_EXPLORER_PORT    ## HTTP port (default: 8080)
export DEBUG_PORT            ## HTTP port (default: 9229)


###################
# Logs containers #
###################

## Display logs `omv2mqtt`
omv2mqtt-logs:
	$(COMPOSE) logs -f omv2mqtt

######################
# Connect containers #
######################

## Connect to `omv2mqtt`
omv2mqtt-bash:
	$(COMPOSE) exec -u node omv2mqtt env $(FIX_SHELL) sh -l

## Connect to `omv2mqtt` in root
omv2mqtt-bash-root:
	$(COMPOSE) exec omv2mqtt env $(FIX_SHELL) sh -l

###############
# Development #
###############

## Init all project
init: omv2mqtt-install

## Install package for `omv2mqtt`
omv2mqtt-install:
	$(COMPOSE) exec -u node omv2mqtt env $(FIX_SHELL) npm install

## Build to `omv2mqtt`
omv2mqtt-build:
	$(COMPOSE) exec -u node omv2mqtt env $(FIX_SHELL) npm run build

## Start to `omv2mqtt` (mode production)
omv2mqtt-start:
	$(COMPOSE) exec -u node omv2mqtt env $(FIX_SHELL) npm run start

## Watch to `omv2mqtt` (mode development)
omv2mqtt-watch:
	$(COMPOSE) exec -u node omv2mqtt env $(FIX_SHELL) npm run watch

#########
# Utils #
#########

history: history_omv2mqtt

history_omv2mqtt:
	@if [ ! -f $(DOCKER_PATH)/.history_omv2mqtt ]; then touch $(DOCKER_PATH)/.history_omv2mqtt; fi
