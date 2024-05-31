import minimist from 'minimist';
import * as mqtt from 'mqtt';
import fetch from 'node-fetch';
import * as https from 'https';


console.log('');
console.log('====================');
console.log('= Start OMV 2 MQTT =');
console.log('====================');
console.log('');


const rawArgv = process.argv.slice(2);
const args = minimist(rawArgv, {
	string: [
		'mqtt-uri',
		'mqtt-prefix',
		'mqtt-retain',
		'mqtt-qos',
		'omv-url',
		'omv-login',
		'omv-password',
		'omv-disable-check-https',
		'omv-exposed-networks',
		'scan-interval',
		'ha-discovery',
		'ha-prefix',
		'log'
	],
	boolean: [
		'help',
	],
	alias: {
		'mqtt-uri': 'm',
		'omv-url': 'o',
		'omv-login': 'u',
		'omv-password': 'p',
		'log': 'l',
		'help': 'h',
	},
	default: {
		log: 'MESSAGE',
		'mqtt-prefix': 'omv',
		'mqtt-retain': '1',
		'mqtt-qos': '0',
		'ha-discovery': '1',
		'ha-prefix': 'homeassistant',
		'scan-interval': '30',
		'login-interval': '300',
		'omv-exposed-networks': 'eth0,wlan0',
		'omv-disable-check-https' : '0'
	}
});

let argError = null;
if (!args.p)  argError = 'omv-password as required';
if (!args.l)  argError = 'omv-login as required';
if (!args.o)  argError = 'omv-uri as required';
if (!args.m)  argError = 'mqtt-uri as required';
if (!args['mqtt-prefix'])  argError = 'mqtt-prefix as required';

if (args.h || argError) {
	
	if (argError) {
		console.error('ERROR:', argError);	
	}
	
	console.log(`
Run command:
    
    ${process.argv[0]} ${process.argv[1]} [PARAMS]
   
Parameters:
    
    mqtt-uri, m              Set MQTT URI for connection (example: mqtt://login:password@127.0.0.1:1883 or mqtt://127.0.0.1:1883)
    mqtt-prefix              Set prefix for mqtt(default: omv)
    mqtt-retain              Set retain value for MQTT, values must be 0 or 1 (default: 1),
    mqtt-qos                 Set QOS value for MQTT, values must be 0, 1 or 2 (default: 0),
    omv-url, o               Set Base URL for Open Media Vault (example: http://192.168.1.1)
    omv-login, o             Set login for Open Media Vault
    omv-password, o          Set password for Open Media Vault
    omv-exposed-networks     Exposed networks interface seprate by comma (default: eth0, wlan0)
    omv-disable-check-https  Disable check HTTPS
    scan-interval            Set scan refresh interval in second (default: 30) 
    login-interval           Set login refresh interval in second (default: 300)
    ha-discovery             Enable Home Assistant discovery, values must be 0 or 1 (default: 1),
    ha-prefix                Home Assistant discovery prefix (default: homeassistant),
    log, l                   Log level (ERROR, MESSAGE, DEBUG) (default MESSAGE)
    help, h                  Display help
    
    `);
	process.exit(0);
}

switch(args.l.toLowerCase()) {
	case 'error': console.log = () => {}; 
	default: console.debug = () => {}; 
	case 'debug': break;
}

const mqttUri = args.m;
const mqttPrefix = args['mqtt-prefix'];
const mqttRetain = args['mqtt-retain'] === '1' || args['mqtt-retain']?.toLowerCase() === 'true';
let mqttQos = parseInt(args['mqtt-qos'], 10);
switch (mqttQos) {
	case 1: break;
	case 2: break;
	default: mqttQos = 0; 
}
const omvUrl = args.o;
const omvLogin = args.u;
const omvPassword = args.p;
const omvExposedNetworks = (args['omv-exposed-networks'] || 'eth0,wlan0').split(/,/g);
let omvDisableCheckHttps = parseInt(args['omv-disable-check-https'], 10); isNaN(omvExposedNetworks) ? 0 : !!omvExposedNetworks;
let scanIterval = parseInt(args['scan-interval'], 10); isNaN(scanIterval) || scanIterval < 1 ? 30 : scanIterval;
let loginIterval = parseInt(args['login-interval'], 10); isNaN(loginIterval) || loginIterval < 1 ? 300 : loginIterval;
const haDiscovery = args['ha-discovery'] === '1' || args['ha-discovery']?.toLowerCase() === 'true';
const haPrefix = (args['ha-prefix'] || 'homeassistant');

console.log('Config:', `
    mqtt-uri:                ${mqttUri}
    mqtt-prefix:             ${mqttPrefix}
    mqtt-retain:             ${mqttRetain ? 'enabled' : 'disabled'}
    mqtt-qos:                ${mqttQos}
    omv-url:                 ${omvUrl}
    omv-login:               ${omvLogin}
    omv-password:            ${omvPassword.replace(/./g, '*')}
    omv-exposed-networks:    ${omvExposedNetworks.join(', ')}
    omv-disable-check-https: ${omvDisableCheckHttps ? 'enabled' : 'disabled'}
    scan-interval:           ${scanIterval}
    login-interval:          ${loginIterval}
    ha-discovery:            ${haDiscovery ? 'enabled' : 'disabled'}
    ha-prefix:               ${haPrefix}
    log:                     ${args.l.toUpperCase()}
`);

const httpsAgent = new https.Agent({
    rejectUnauthorized: false, // Attention: cela désactive la vérification SSL
});

let upTime = new Date();
let dateLogin = null;
const main = async () => {
	try {
		let cookies = '';
		const requestOMV = async (body: any, connected: boolean = true): Promise<any> => {
			
			const url = `${omvUrl}/rpc.php`;
			const options = {
				method: 'post',
				credentials: 'include',
				body: JSON.stringify(body),
				headers: connected ? {
					'Cookie': cookies
				} : {},
				...(omvDisableCheckHttps ? { agent: httpsAgent } : {})
			};
			
			console.debug(`Call POST ${url}`, options);
			const response = await fetch(url, options);
			
			if (!connected) {
				cookies = response.headers.get('set-cookie');
			}
			const json = await response.json();
			console.debug('Response:', {
				cookies,
				json
			});
			
			return json;
		};

		const login = async () => {
			try {
				if (dateLogin && ((new Date).getTime() - dateLogin.getTime() > loginIterval)) {
					console.debug('Already loggued');
					return;
				}
				
				console.debug('OMV login request');
				
				const result = await requestOMV({
					"service":"Session",
					"method":"login",
					"params":{
						"username": omvLogin,
						"password": omvPassword
					},
					"options":null
				}, false)
				
				dateLogin = new Date();
				console.log('OMV login success');	
				console.debug('Login result:', result);	
			} catch(e) {
				console.error('ERROR LOGIN:', e);
				throw new Error('ERROR Login failed');
			}
		};
		
		const callSystem = async() => {
			return requestOMV({ "service": "System", "method": "getInformation", "params": null, "options": null });
		};
		const subscribed: any = {};
		let jsonSystem:any = null;
		
		const initialize = async () => {
			try {
				await login();
				jsonSystem = await callSystem();
				console.log('Initialize success');
			} catch(e) {
				console.error('ERROR INITIALIZE:', e);
				console.log('Wait 5 seconds and retry initialize');
				await new Promise(r => setTimeout(r, 5000));
				initialize();
			}
		};
		
		await initialize();

		
		const subscribe = (topic: string, callback: Function) => {
			client.subscribe(topic, error => { if (error) console.error(error) });
			subscribed[topic] = callback;
		};
		
		
		const deviceService = {
			"identifiers": [mqttPrefix + '.services'],
			"name": `${mqttPrefix.toUpperCase()} - Services`,
			"model": "Open Media Vault",
			'configuration_url': omvUrl,
			get sw_version() {
				return jsonSystem.response.version;
			},
		};
		const deviceSystem = {
			"identifiers": [mqttPrefix + '.system'],
			"name": `${mqttPrefix.toUpperCase()} - System`,
			"model": "Open Media Vault",
			'configuration_url': omvUrl,
			get sw_version() {
				return jsonSystem.response.version;
			},
		};


		const client = mqtt.connect(mqttUri);

		client.on('connect', () => {
			console.log('Connected to MQTT: ', mqttUri);
			subscribe(`${mqttPrefix}/system/reboot`, reboot);
			subscribe(`${mqttPrefix}/system/shutdown`, shutdown);
		});

		client.on('error', function (error) {
			console.error('Error to MQTT:', error);
		});
		
		
		client.on('message', (topic: string, value: Buffer) => {
			const cb = subscribed[topic];
			if (cb) {
				cb(value.toString());
			}
		});
		
		const reboot = async (value: string) => {
			try {
				console.log('MESSAGE: On reboot:', value);
				if (value === 'PRESS') {
					await requestOMV({ "service": "System", "method": "reboot", "params": { "delay": 0 }, "options": null });
					publish('system/reboot', 'OK');
				}
			} catch(e) {
				console.error(publish('system/reboot', 'FAILED'));
			}
		};
		const shutdown = async (value: string) => {
			try {
				console.log('MESSAGE: On shutdown:', value);
				if (value === 'PRESS') {
					await requestOMV({ "service": "System", "method": "shutdown", "params": { "delay": 0 }, "options": null });
					publish('system/shutdown', 'OK');
				}
			} catch(e) {
				console.error(publish('system/shutdown', 'FAILED'));
			}
		};

		const publish = (path: string, data: any, sub: boolean = false) => {
			if (!sub) {
				path = mqttPrefix + '/' + path;
			}
			if (client.connected) {
				if (typeof data === 'string') {
					console.debug('Publish:', path, data);
					client.publish(path, data, { retain: mqttRetain, qos: mqttQos as any });
				} else {
					for (const [key, value] of Object.entries(data)) {
						publish( path + '/'+ key, value, true);
					}
				}
			} else {
				console.error('Error: Client MQTT not connected');
			}
		};

		const configHA = (
			type: string, 
			id: string,
			name: string,
			path: string,
			extraConf: any = {},
			expireAfter = true,
		) => {
			if (haDiscovery) {
				publish(`${haPrefix}/${type}/${mqttPrefix}/${id.replace(/\W/gi, '_')}/config`, JSON.stringify({
					uniq_id: mqttPrefix + '.' + id,
					object_id: mqttPrefix + '.' + id,
					name: name,
					stat_t: `${mqttPrefix}/${path}/state`,
					json_attr_t: `${mqttPrefix}/${path}/attributes`,
					...(expireAfter ? { expire_after: (scanIterval * 5).toString() } : {}),
					...extraConf
				}), true);
			}
		};
		
		
		const buttonHA = (
			type: string, 
			id: string,
			name: string,
			path: string,
			extraConf: any = {}
		) => {
			if (haDiscovery) {
				publish(`${haPrefix}/${type}/${mqttPrefix}/${id.replace(/\W/gi, '_')}/config`, JSON.stringify({
					uniq_id: mqttPrefix + '.' + id,
					object_id: mqttPrefix + '.' + id,
					name: name,
					command_topic: `${mqttPrefix}/${path}`,
					...extraConf
				}), true);
			}
		};
		
		const updateServices = async () => {
			try {	
				console.debug('Update Service');
				const json = await requestOMV({ "service": "Services", "method": "getStatus", "params": { "limit": -1, "start": 0 }, "options": null });
				
				
				for (const service of json.response.data) {
					publish('services', {
						[service.name.toLowerCase()]: {
							state: service.running ? 'ON' : 'OFF',
							attributes: JSON.stringify({
								enabled: service.enabled,
							})
						}
					});
					configHA(
						'binary_sensor',
						`services.${service.name.toLowerCase()}`,
						service.title,
						`services/${service.name.toLowerCase()}`,
						{
							device: deviceService,
							icon: 'mdi:cog'
						}
					);
				}
				
			} catch(e) {
				console.error('ERROR:', e);
				dateLogin = null;
			} 
		};

		const updateSystem = async () => {
			try {	
				console.debug('Update System');
				
				const [
					infos,
					cpuTemp,
				] = await Promise.all([
					callSystem(),
					requestOMV({ "service": "CpuTemp", "method": "get", "params": null,"options": null }),
				]);
				
				jsonSystem = infos;
				
				const newUpTime =  new Date();
				newUpTime.setTime(newUpTime.getTime() - infos.response.uptime * 1000);
				if (Math.abs(upTime.getTime() - newUpTime.getTime()) > 5000) {
					upTime = newUpTime;
				}
				
				publish('system', {
					hostname: {
						state: infos.response.hostname,
						attributes: JSON.stringify({})
					},
					version: {
						state: infos.response.version,
						attributes: JSON.stringify({})
					},
					cpu_model_name: {
						state: infos.response.cpuModelName,
						attributes: JSON.stringify({})
					},
					kernel: {
						state: infos.response.kernel,
						attributes: JSON.stringify({})
					},
					cpu_usage: {
						state: infos.response.loadAverage['1min'].toString(),
						attributes: JSON.stringify({
							loadaverage_1: infos.response.loadAverage['1min'],
							loadaverage_5: infos.response.loadAverage['5min'],
							loadaverage_15: infos.response.loadAverage['15min'],
						})
					},
					memory: {
						state: (Math.round(infos.response.memUsed / infos.response.memTotal * 10000) / 100).toString(),
						attributes: JSON.stringify({
							total: infos.response.memTotal,
							used: infos.response.memUsed,
							free: infos.response.memFree,
						})
					},
					uptime: {
						state: upTime.toISOString().split('.')[0] + '+00:00',
						attributes: JSON.stringify({})
					},
					update_available: {
						state: infos.response.availablePkgUpdates ? 'ON' : 'OFF',
						attributes: JSON.stringify({})
					},
					config_dirty: {
						state: infos.response.configDirty ? 'ON' : 'OFF',
						attributes: JSON.stringify({})
					},
					reboot_required: {
						state: infos.response.rebootRequired ? 'ON' : 'OFF',
						attributes: JSON.stringify({})
					},
					cpu_temperature: {
						state: cpuTemp.response.cputemp.toString(),
						attributes: JSON.stringify({})
					},
					last_refresh: {
						state: (new Date()).toISOString().split('.')[0] + '+00:00',
						attributes: JSON.stringify({})
					},
				});
				
				configHA(
					'sensor',
					`system.hostname`,
					'Hostname',
					`system/hostname`,
					{
						device: deviceSystem,
						icon: 'mdi:web',
					}
				);
				configHA(
					'sensor',
					`system.kernel`,
					'Kernel:',
					`system/kernel`,
					{
						device: deviceSystem,
					}
				);
				configHA(
					'sensor',
					`system.version`,
					'Version',
					`system/version`,
					{
						device: deviceSystem,
					}
				);
				configHA(
					'sensor',
					`system.cpu_model_name`,
					'CPU Model name',
					`system/cpu_model_name`,
					{
						device: deviceSystem,
					}
				);
				configHA(
					'sensor',
					`system.cpu_usage`,
					'CPU Usage',
					`system/cpu_usage`,
					{
						device: deviceSystem,
						unit_of_measurement: '%',
						icon: 'mdi:speedometer',
						state_class: 'measurement'
					}
				);
				configHA(
					'sensor',
					`system.memory`,
					'Memory',
					`system/memory`,
					{
						device: deviceSystem,
						unit_of_measurement: '%',
						icon: 'mdi:memory',
						state_class: 'measurement'
					}
				);
				configHA(
					'sensor',
					`system.uptime`,
					'Uptime',
					`system/uptime`,
					{
						device: deviceSystem,
						icon: 'mdi:clock-outline',
						device_class: 'timestamp',
					}
				);
				configHA(
					'binary_sensor',
					`system.update_available`,
					'Update available',
					`system/update_available`,
					{
						device: deviceSystem,
						icon: 'mdi:package',
						device_class: 'update'
					}
				);
				configHA(
					'binary_sensor',
					`system.config_dirty`,
					'Config dirty',
					`system/config_dirty`,
					{
						device: deviceSystem,
						icon: 'mdi:liquid-spot',
						device_class: 'problem',
					}
				);
				
				configHA(
					'binary_sensor',
					`system.reboot_required`,
					'Reboot required',
					`system/reboot_required`,
					{
						device: deviceSystem,
						icon: 'mdi:restart-alert',
					}
				);
				configHA(
					'sensor',
					`system.cpu_temperature`,
					'CPU Temperature',
					`system/cpu_temperature`,
					{
						device: deviceSystem,
						icon: 'hass:thermometer',
						unit_of_measurement: '°C',
						state_class: 'measurement'
					}
				);
				
				configHA(
					'sensor',
					`system.last_refresh`,
					'Last refresh',
					`system/last_refresh`,
					{
						device: deviceSystem,
						icon: 'mdi:clock-outline',
						device_class: 'timestamp',
					},
					false
				);
				
				buttonHA(
					'button',
					`system.reboot`,
					'Reboot',
					`system/reboot`,
					{
						device: deviceSystem,
						icon: 'mdi:restart',
						payload_available: 'OK',
						payload_not_available: 'FAILED',
					}
				);
				
				buttonHA(
					'button',
					`system.shutdown`,
					'Shutdown',
					`system/shutdown`,
					{
						device: deviceSystem,
						icon: 'mdi:power',
						payload_available: 'OK',
						payload_not_available: 'FAILED',
					}
				);
				
			} catch(e) {
				console.error('ERROR:', e);
				dateLogin = null;
			} 
		};

		let prevValues = {};
		const updateNetworks = async () => {
			
			try {
				
				console.debug('Update Networks');
				const json = await requestOMV({ "service": "Network", "method": "enumerateDevicesList", "params": { "limit": -1, "start": 0 }, "options": null });
				
				
				
				for (const network of json.response.data) {
					
					if (omvExposedNetworks.indexOf(network.devicename) !== -1) {
						console.debug('Interface detected:', network.devicename);
						
						const device = {
							"identifiers": [mqttPrefix + '.networks.' + network.devicename],
							"name": `${mqttPrefix.toUpperCase()} - Network - ${network.devicename}`,
							"model": "Open Media Vault",
							'configuration_url': omvUrl,
							get sw_version() {
								return jsonSystem?.response?.version || null;
							},
						};
						
						const isWifi = network.type === 'wifi';
						const attributes = {
							link: network.link,
							uuid: network.uuid,
							ether: network.ether,
							vlan: network.vlan,
							vlanid: network.vlanid,
							prefix: network.prefix,
							prefix6: network.prefix6,
							interface_state: network.state,
							mtu: network.mtu,
							speed: network.speed,
							description: network.description,
						};
						
						if (!prevValues[network.devicename]) {
							prevValues[network.devicename] = {
								rx: 0,
								tx: 0,
								dt: new Date(),
							};
						}
						const rxPrev = prevValues[network.devicename].rx;
						const txPrev = prevValues[network.devicename].tx;
						const prevRTX = prevValues[network.devicename].dt;
						
						const rxCur = network.stats.rx_packets || 0;
						const txCur = network.stats.tx_packets || 0; 
						const now = new Date();
						const rxDelta = Math.max(0, rxCur - rxPrev) * 8;
						const txDelta = Math.max(0, txCur - txPrev) * 8;
						
						const rx = (rxDelta / (now.getTime() - prevRTX.getTime())) / 1000;
						const tx = (txDelta / (now.getTime() - prevRTX.getTime())) / 1000;
						
						prevValues[network.devicename] = {
							rx: rxCur,
							tx: txCur,
							dt: now,
						}
						
						publish(`networks/${network.devicename}`, {
							connection: {
								state: network.link ? 'ON' : 'OFF',
								attributes: JSON.stringify(attributes)
							},
							rx: {
								state: rx.toFixed(2),
								attributes: JSON.stringify(attributes)
							},
							tx: {
								state: tx.toFixed(2),
								attributes: JSON.stringify(attributes)
							},
							method: {
								state: network.method?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							address: {
								state: network.address?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							netmask: {
								state: network.netmask?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							gateway: {
								state: network.gateway?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							dnsnameservers: {
								state: network.dnsnameservers?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							method6: {
								state: network.method6?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							address6: {
								state: network.address6?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							netmask6: {
								state: network.netmask6?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							gateway6: {
								state: network.gateway6?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							dnsnameservers6: {
								state: network.dnsnameservers6?.toString() || '',
								attributes: JSON.stringify(attributes)
							},
							wol: {
								state: network.wol ? 'ON' : 'OFF',
								attributes: JSON.stringify(attributes)
							},
							...(isWifi ? {
								ssid: {
									state: network.wpassid?.toString() || '',
									attributes: JSON.stringify(attributes)
								},
							} : {}),
						});
						
						configHA(
							'binary_sensor',
							`network.${network.devicename}.connection`,
							`Connection`,
							`networks/${network.devicename}/connection`,
							{
								device,
								icon: 'mdi:lan-connect'
							}
						);
						
						configHA(
							'sensor',
							`network.${network.devicename}.rx`,
							`RX`,
							`networks/${network.devicename}/rx`,
							{
								device,
								icon: 'mdi:download-network-outline',
								device_class: 'data_rate',
								state_class: 'measurement',
								unit_of_measurement: 'B/s',
								suggested_display_precision: 2,
								suggested_unit_of_measurement: 'kB/s',
							}
						);
						configHA(
							'sensor',
							`network.${network.devicename}.tx`,
							`TX`,
							`networks/${network.devicename}/tx`,
							{
								device,
								icon: 'mdi:upload-network-outline',
								device_class: 'data_rate',
								state_class: 'measurement',
								unit_of_measurement: 'B/s',
								suggested_display_precision: 2,
								suggested_unit_of_measurement: 'kB/s',
							}
						);
						
						configHA( 'sensor', `network.${network.devicename}.method`, `Method`, `networks/${network.devicename}/method`, { device, icon: 'mdi:ip' });
						configHA( 'sensor', `network.${network.devicename}.address`, `Address`, `networks/${network.devicename}/address`, { device, icon: 'mdi:ip' });
						configHA( 'sensor', `network.${network.devicename}.netmask`, `Netmask`, `networks/${network.devicename}/netmask`, { device, icon: 'mdi:ip' });
						configHA( 'sensor', `network.${network.devicename}.gateway`, `Gateway`, `networks/${network.devicename}/gateway`, { device, icon: 'mdi:network' });
						configHA( 'sensor', `network.${network.devicename}.dnsnameservers`, `Server DNS`, `networks/${network.devicename}/dnsnameservers`, { device, icon: 'mdi:network' });
						configHA( 'sensor', `network.${network.devicename}.method6`, `Method IPV6`, `networks/${network.devicename}/method6`, { device, icon: 'mdi:ip' });
						configHA( 'sensor', `network.${network.devicename}.address6`, `Address IPV6`, `networks/${network.devicename}/address6`, { device, icon: 'mdi:ip' });
						configHA( 'sensor', `network.${network.devicename}.netmask6`, `Netmask IPV6`, `networks/${network.devicename}/netmask6`, { device, icon: 'mdi:ip' });
						configHA( 'sensor', `network.${network.devicename}.gateway6`, `Gateway IPV6`, `networks/${network.devicename}/gateway6`, { device, icon: 'mdi:network' });
						configHA( 'sensor', `network.${network.devicename}.dnsnameservers6`, `Server DNS IPV6`, `networks/${network.devicename}/dnsnameservers6`, { device, icon: 'mdi:network' });
						configHA( 'binary_sensor', `network.${network.devicename}.wol`, `Wake on lan`, `networks/${network.devicename}/wol`, { device });
						
						if (isWifi) {
							configHA( 'sensor', `network.${network.devicename}.ssid`, `${network.devicename} SSID`, `networks/${network.devicename}/ssid`, { device, icon: 'mdi:wifi' });
						}
					}
				}
			} catch(e) {
				console.error(e);
				dateLogin = null;
			}
		};
		
		const updateDisks = async () => {
			
			try {
				
				console.debug('Update Disks');
				
				const [
					infos,
					smarts,
					fss,
				] = await Promise.all([
					requestOMV({ "service": "DiskMgmt", "method": "enumerateDevices", "params": { "limit": -1, "start": 0 }, "options": null }).catch(e => {
						console.error('Error on call disks infos', e);
						return null;
					}),
					requestOMV({ "service": "Smart", "method": "getList", "params": { "limit": -1, "start": 0 }, "options": null }).catch(e => {
						console.error('Error on call disks smarts', e);
						return null;
					}),
					requestOMV({ "service": "FileSystemMgmt", "method": "enumerateFilesystems", "params": { "limit": -1, "start": 0 }, "options": null }).catch(e => {
						console.error('Error on call disks fs', e);
						return null;
					}),
				]);
				
				
				const disks = {};
				for (const info of infos?.response || []) {
					disks[info.devicename] = {
						info
					};
				}
				for (const smart of smarts?.response?.data || []) {
					disks[smart.devicename] = disks[smart.devicename] || {
					};
					disks[smart.devicename].smart = smart;
				}
				
				for (const [ name, disk ] of Object.entries(disks) as [ string, any ]) {
					const device = {
						"identifiers": [mqttPrefix + '.disk.' + name],
						"name": `${mqttPrefix.toUpperCase()} - Disk - ${name}`,
						"model": "Open Media Vault",
						'configuration_url': omvUrl,
						get sw_version() {
							return jsonSystem?.response?.version || null;
						},
					};
					
					const attributes = {
						size: disk?.info?.size || 'unknown',
						devicefile: disk?.info?.devicefile || 'unknown',
						canonicaldevicefile: disk?.info?.canonicaldevicefile || 'unknown',
						devicename: disk?.info?.devicename || 'unknown',
						description: disk?.info?.description || 'unknown',
						serialnumber: disk?.info?.serialnumber || 'unknown',
						vendor: disk?.info?.vendor || 'unknown',
						model: disk?.info?.model || 'unknown',
						israid: !!disk?.info?.israid,
						isroot: !!disk?.info?.isroot,
						isreadonly: !!disk?.info?.isreadonly,
						uuid: !!disk?.smart?.uuid || 'unknown',
					};
					
					publish(`disks/${name}`, {
						smart: {
							state: disk?.smart?.overallstatus || 'unknown',
							attributes: JSON.stringify(attributes)
						},
						temperature: {
							state: (disk?.smart?.temperature || 0).toString(),
							attributes: JSON.stringify(attributes)
						},
					});
					
					
					configHA(
						'sensor',
						`disk.${name}.smart`,
						'SMART',
						`disks/${name}/smart`,
						{
							device,
							icon: 'mdi:harddisk',
						}
					);
					
					configHA(
						'sensor',
						`disk.${name}.temperature`,
						'Temperature',
						`disks/${name}/temperature`,
						{
							device,
							icon: 'hass:thermometer',
							unit_of_measurement: '°C',
							state_class: 'measurement'
						}
					);
					
					
					if (fss?.response?.length) {
						for (const fs of fss.response) {
							if (fs.parentdevicefile === disk?.info?.canonicaldevicefile) {
								const fsname = fs.devicename;
								const label = fs.label || fs.devicename;
								
								const attributes = {
									devicename: fsname,
									devicefile: fs.devicefile || 'unknown',
									devicefiles: JSON.stringify(fs.devicefiles || []),
									predictabledevicefile: fs.predictabledevicefile || 'unknown',
									canonicaldevicefile: fs.predictabledevicefile.canonicaldevicefile || 'unknown',
									parentdevicefile: fs.parentdevicefile || 'unknown',
									devlinks: JSON.stringify(fs.devlinks || []),
									uuid: fs.uuid || 'unknown',
									label,
									type: fs.type,
									blocks: fs.blocks,
									description: fs.description || '',
									comment: fs.comment || '',
									quota: !fs.propquota,
									resize: !fs.propresize,
									fstab: !fs.propfstab,
									compress: !fs.propcompress,
									auto_defrag: !fs.propautodefrag,
									readonly: !fs.propreadonly,
									has_multiple_devices: !fs.hasmultipledevices,
								};
								
								publish(`disks/${name}/filesystem/${fsname}`, {
									mounted: {
										state: fs.mounted ? 'ON' : 'OFF',
										attributes: JSON.stringify(attributes)
									},
									occupation: {
										state: (fs.percentage || 0).toString(),
										attributes: JSON.stringify(attributes)
									},
									size: {
										state: (fs.size || 0).toString(),
										attributes: JSON.stringify(attributes)
									},
									free: {
										state: (fs.available || 0).toString(),
										attributes: JSON.stringify(attributes)
									},
									used: {
										state: Math.max(0, ((fs.size || 0) - (fs.available || 0))).toString(),
										attributes: JSON.stringify(attributes)
									},
								});
								
								configHA(
									'binary_sensor',
									`disks/${name}/filesystem.${fsname}.mounted`,
									`FS - ${label} - Mounted`,
									`disks/${name}/filesystem/${fsname}/mounted`,
									{
										device,
										icon: 'mdi:harddisk',
										device_class: 'plug'
									}
								);
								
								configHA(
									'sensor',
									`disks/${name}/filesystem.${fsname}.occupation`,
									`FS - ${label} - Occupation`,
									`disks/${name}/filesystem/${fsname}/occupation`,
									{
										device,
										icon: 'mdi:harddisk',
										unit_of_measurement: '%',
									}
								);
								
								configHA(
									'sensor',
									`disks/${name}/filesystem.${fsname}.size`,
									`FS - ${label} - Size`,
									`disks/${name}/filesystem/${fsname}/size`,
									{
										device,
										icon: 'mdi:harddisk',
										device_class: 'data_size',
										state_class: 'measurement',
										unit_of_measurement: 'B',
										suggested_display_precision: 2,
										suggested_unit_of_measurement: 'GB',
									}
								);
								
								configHA(
									'sensor',
									`disks/${name}/filesystem.${fsname}.used`,
									`FS - ${label} - Used`,
									`disks/${name}/filesystem/${fsname}/used`,
									{
										device,
										icon: 'mdi:harddisk',
										device_class: 'data_size',
										state_class: 'measurement',
										unit_of_measurement: 'B',
										suggested_display_precision: 2,
										suggested_unit_of_measurement: 'GB',
									}
								);
								
								configHA(
									'sensor',
									`disks/${name}/filesystem.${fsname}.free`,
									`FS - ${label} - Free`,
									`disks/${name}/filesystem/${fsname}/free`,
									{
										device,
										icon: 'mdi:harddisk',
										device_class: 'data_size',
										state_class: 'measurement',
										unit_of_measurement: 'B',
										suggested_display_precision: 2,
										suggested_unit_of_measurement: 'GB',
									}
								);
							}
						}
					}
				}
				
			} catch(e) {
				console.error(e);
				dateLogin = null;
			}
		};
		
		
		let tick = 0;
		const mainLoop = async () => {
			
			try {
				console.debug('loop start:', ++tick);
				
				await login();
				
				
				console.log('Update MQTT data');
				
				await Promise.all([
					updateServices(),
					updateSystem(),
					updateNetworks(),
					updateDisks(),
				]);
				
			} catch(e) {
				console.error('MAIN LOOP ERROR:', e);
				dateLogin = null;
			}
			
			await new Promise(r => setTimeout(r, scanIterval * 1000));
			mainLoop();
		};
		mainLoop();
		
		
	} catch(e) {
		console.error('MAIN ERROR:', e);
	}
};
main();