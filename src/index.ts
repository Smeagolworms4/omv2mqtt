import minimist from 'minimist';
import * as mqtt from 'mqtt';
import fetch from 'node-fetch';


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
    
    mqtt-uri, m       Set MQTT URI for connection (example: mqtt://login:password@127.0.0.1:1883 or mqtt://127.0.0.1:1883)
    mqtt-prefix       Set prefix for mqtt(default: omv)
    mqtt-retain       Set retain value for MQTT, values must be 0 or 1 (default: 1),
    mqtt-qos          Set QOS value for MQTT, values must be 0, 1 or 2 (default: 0),
    omv-url, o        Set Base URL for Open Media Vault (example: http://192.168.1.1)
    omv-login, o      Set login for Open Media Vault
    omv-password, o   Set password for Open Media Vault
    scan-interval     Set scan refresh interval in second (default: 30) 
    login-interval    Set login refresh interval in second (default: 300)
    ha-discovery      Enable Home Assistant discovery, values must be 0 or 1 (default: 1),
    ha-prefix         Home Assistant discovery prefix (default: homeassistant),
    log, l            Log level (ERROR, MESSAGE, DEBUG) (default MESSAGE)
    help, h           Display help
    
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
const mqttRetain = args['mqtt-retain'] === '1';
let mqttQos = parseInt(args['mqtt-qos'], 10);
switch (mqttQos) {
	case 1: break;
	case 2: break;
	default: mqttQos = 0; 
}
const omvUrl = args.o;
const omvLogin = args.u;
const omvPassword = args.p;
let scanIterval = parseInt(args['scan-interval'], 10); isNaN(scanIterval) || scanIterval < 1 ? 30 : scanIterval;
let loginIterval = parseInt(args['login-interval'], 10); isNaN(loginIterval) || loginIterval < 1 ? 300 : loginIterval;
const haDiscovery = args['ha-discovery'] === '1';
const haPrefix = args['ha-prefix'] || 'homeassistant';


console.log('Config:', `
    mqtt-uri:        ${mqttUri}
    mqtt-prefix:     ${mqttPrefix}
    mqtt-retain:     ${mqttRetain}
    mqtt-qos:        ${mqttQos}
    omv-url:         ${omvUrl}
    omv-login:       ${omvLogin}
    omv-password:    ${omvPassword.replace(/./g, '*')}
    scan-interval:   ${scanIterval}
    login-interval:  ${loginIterval}
    log:             ${args.l.toUpperCase()}
`);

const client = mqtt.connect(mqttUri);

client.on('connect', () => {
	console.log('Connected to MQTT: ', mqttUri);
});

client.on('error', function (error) {
	console.error('Error to MQTT:', error);
});

let cookies = '';
const requestOMV = async (body: any, connected: boolean = true): Promise<any> => {
	
	const url = `${omvUrl}/rpc.php`;
	const options = {
		method: 'post',
		credentials: 'include',
		body: JSON.stringify(body),
		headers: connected ? {
			'Cookie': cookies
		} : {}
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

let dateLogin = null;
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
		console.log('OMV login success:', result);	
	} catch(e) {
		console.error('ERROR LOGIN:', e);
		throw new Error('ERROR Login failed');
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
) => {
	if (haDiscovery) {
		publish(`${haPrefix}/${type}/${mqttPrefix}/${id.replace(/\W/gi, '_')}/config`, JSON.stringify({
			uniq_id: mqttPrefix + '.' + id,
			object_id: mqttPrefix + '.' + id,
			name: name,
			stat_t: `${mqttPrefix}/${path}/state`,
			attributes: `${mqttPrefix}/${path}/attributes`,
			...extraConf
		}), true);
	}
};


const updateServices = async () => {
	try {	
		console.debug('Update Service');
		const json = await requestOMV({ "service": "Services", "method": "getStatus", "params": { "limit": -1, "start": 0 }, "options": null });
		
		
		const device = {
			"identifiers": [mqttPrefix + '.services'],
			"name": `${mqttPrefix.toUpperCase()} - Services`,
			"model": "Open Media Vault"
		};
		
		for (const service of json.response.data) {
			publish('services', {
				[service.name]: {
					state: service.running ? 'on' : 'off',
					attributes: JSON.stringify({
						name: service.name,
						enabled: service.enabled,
						icon: 'mdi:cog',
						friendly_name: service.title
					})
				}
			});
			configHA(
				'sensor',
				`services.${service.name}`,
				service.title,
				`services/${service.name}`,
				{
					device,
					icon: 'mdi:cog',
				}
			);
		}
		
	} catch(e) {
		console.error('ERROR:', e)
	} 
};

let tick = 0;
const mainLoop = async () => {
	
	try {
		console.debug('loop start:', ++tick);
		
		await login();
		
		const [
			infos,
			cpuTemp,
			networks,
		] = await Promise.all([
			await requestOMV({ "service": "System", "method": "getInformation", "params": null, "options": null }),
			await requestOMV({ "service": "CpuTemp", "method": "get", "params": null,"options": null }),
			await requestOMV({ "service": "Network", "method": "enumerateDevicesList", "params": { "limit": -1, "start": 0 }, "options": null }),
		]);
		
		console.debug('All infos:', {
			infos,
			cpuTemp,
			networks
		});
		
		console.log('Update MQTT data');
		
		await Promise.all([
			updateServices(),
		]);
		
	} catch(e) {
		console.error('MAIN LOOP ERROR:', e);
	}
	
	await new Promise(r => setTimeout(r, scanIterval * 1000));
	mainLoop();
};
mainLoop();