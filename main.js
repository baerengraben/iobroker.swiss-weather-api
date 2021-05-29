"use strict";

/*
 * Created with @iobroker/create-adapter v1.18.0
 */
const utils = require("@iobroker/adapter-core");
var dns = require('dns');
const cron = require('node-cron');
const { http, https } = require('follow-redirects');
const adapterName = "swiss-weather-api";
var timeout;
var geolocationId;
var access_token;
var today;
// @ts-ignore
var today1;
// @ts-ignore
var today2;
// @ts-ignore
var today3;
// @ts-ignore
var today4;
// @ts-ignore
var today5;
// @ts-ignore
var today6;
// @ts-ignore
var today7;

// @ts-ignore
Date.prototype.addDays = function(days) {
	var date = new Date(this.valueOf());
	date.setDate(date.getDate() + days);
	return date;
}

const datesAreOnSameDay = (first, second) =>
	first.getFullYear() === second.getFullYear() &&
	first.getMonth() === second.getMonth() &&
	first.getDate() === second.getDate();

function getActualDateFormattet(actualDate) {
	var	year = (actualDate.getFullYear());
	var month = (actualDate.getMonth()<10?'0':'') + actualDate.getMonth();
	var day = (actualDate.getDate()<10?'0':'') + actualDate.getDate();
	return year + "-" + month + "-" + day;
}

/**
 * Get longitude/latitude from system if not set or not valid
 * do not change if we have already a valid value
 * so we could use different settings compared to system if necessary
 * @param self Adapter
 */
function getSystemData(self) {
	if (typeof self.config.Longitude == undefined || self.config.Longitude == null || self.config.Longitude.length == 0 || isNaN(self.config.Longitude)
		|| typeof self.config.Latitude == undefined || self.config.Latitude == null || self.config.Latitude.length == 0 || isNaN(self.config.Latitude)) {
		self.log.info("longitude/longitude not set, get data from system ");
		self.getForeignObject("system.config", (err, state) => {
			if (err || state === undefined || state === null) {
				self.log.error("longitude/latitude not set in adapter-config and reading in system-config failed");
				self.setState('info.connection', false, true);
			} else {
				self.config.Longitude = state.common.longitude;
				self.config.Latitude = state.common.latitude;
				self.log.info("system  longitude: " + self.config.Longitude + " latitude: " + self.config.Latitude);
			}
		});
	} else {
		self.log.info("longitude/longitude will be set by self-Config - longitude: " + self.config.Longitude + " latitude: " + self.config.Latitude);
	}
}

function getTimeFormattet(actualDate) {
	var	hour = (actualDate.getHours()<10?'0':'') + actualDate.getHours();
	var min = (actualDate.getMinutes()<10?'0':'') + actualDate.getMinutes();
	var sec = (actualDate.getSeconds()<10?'0':'') + actualDate.getSeconds();
	return hour + ":" + min + ":" + sec;
}

function getToken(self,myCallback){
	self.log.debug('getting Token...');

	//Convert ConsumerKey and ConsumerSecret to base64
	let data = self.config.ConsumerKey + ":" + self.config.ConsumerSecret;
	let buff = Buffer.from(data);
	let base64data = buff.toString('base64');
	self.log.debug('"' + data + '" converted to Base64 is "' + base64data + '"');

	//Options for getting Access-Token
	var options_Access_Token = {
		"json": true,
		"method": "POST",
		"hostname": "api.srgssr.ch",
		"port": null,
		"path": "/oauth/v1/accesstoken?grant_type=client_credentials",
		"headers": {
			"Authorization": "Basic " + base64data,
			"Cache-Control": "no-cache",
			"Content-Length": 0,
			"Postman-Token": "24264e32-2de0-f1e3-f3f8-eab014bb6d76"
		}
	};

	self.log.debug("Options to get Access Token: " + JSON.stringify(options_Access_Token));

	var req = https.request(options_Access_Token, function (res) {
		var chunks = [];
		res.on("data", function (chunk) {
			chunks.push(chunk);
		});
		res.on("end", function () {
			self.log.debug("Answer of Request Access Token: " + Buffer.concat(chunks).toString());
			var body = JSON.parse(Buffer.concat(chunks).toString());
			if (body.access_token === undefined) {
				self.log.warn("Got no Token - Is Adapter correctly configured (ConsumerKey/ConsumerSecret)? It may also be that the maximum number of queries for today is exhausted");
				self.setState('info.connection', false, true);
				return;
			} else if (body.access_token == ""){
				self.log.warn("Got an empty Token - It may be that the maximum number of queries for today is exhausted");
				self.setState('info.connection', false, true);
				return;
			}
			access_token = body.access_token.toString();
			self.log.debug("Access_Token : " + access_token);
			myCallback(self,getForecast);
		});
		res.on("error", function (error) {
			self.setState('info.connection', false, true);
			self.log.error(error)
		});
	});
	req.end();
}

function setCurrentHour(self){
	let path = self.namespace + ".forecast.60minutes.day0"
	let updatePath = "forecast.current_hour";
	self.log.info('update current hour...');
	//get systemtime hour
	var date = new Date();
	var hour = (date.getHours()<10?'0':'') + date.getHours();
	var local_background_color      ;
	var local_temperature           ;
	var local_text_color            ;
	var local_DD_DEG                ;
	var local_FF_KMH                ;
	var local_FX_KMH                ;
	var local_ICON_URL_COLOR        ;
	var local_ICON_URL_DARK         ;
	var local_ICON_URL_LIGHT        ;
	var local_PROBPCP_PERCENT       ;
	var local_RRR_MM                ;
	var local_SYMBOL_CODE           ;
	var local_TTH_C                 ;
	var local_TTL_C                 ;
	var local_TTT_C                 ;
	var local_local_date_time       ;
	var local_type                  ;

	// update current_hour objects
	self.getState(path + '.00:00:00.DD_DEG', (err, state) => {
		if (!state || state.val === null) {
			self.log.debug('tried to update current_hour, but no forecast data is available for ' + path + '.00:00:00.DD_DEG' + '. Try my luck on next hour...');
			return; // do nothing
		} else {
			self.log.debug('forecast data is available. State.val is: ' + state.val +': So updating current_hour...read correspondenting hour forecast from ' +
				'swiss-weather-api.0.forecast.60minutes.day0.actual_hour and write it to swiss-weather-api.0.forecast.current_hour');
			
			self.getState(path + '.' + hour +':00:00.cur_color.background_color', function(err, state) {
				local_background_color = state.val;
			});
			self.getState(path + '.' + hour +':00:00.cur_color.temperature', function(err, state) {
				local_temperature = state.val;
			});
			self.getState(path + '.' + hour +':00:00.cur_color.text_color', function(err, state) {
				local_text_color = state.val;
			});
			self.getState(path + '.' + hour +':00:00.DD_DEG', function(err, state) {
				local_DD_DEG = state.val;
			});
			self.getState(path + '.' + hour +':00:00.FF_KMH', function(err, state) {
				local_FF_KMH = state.val;
			});
			self.getState(path + '.' + hour +':00:00.FX_KMH', function(err, state) {
				local_FX_KMH = state.val;
			});
			self.getState(path + '.' + hour +':00:00.ICON_URL_COLOR', function(err, state) {
				local_ICON_URL_COLOR = state.val;
			});
			self.getState(path + '.' + hour +':00:00.ICON_URL_DARK', function(err, state) {
				local_ICON_URL_DARK = state.val;
			});
			self.getState(path + '.' + hour +':00:00.ICON_URL_LIGHT', function(err, state) {
				local_ICON_URL_LIGHT = state.val;
			});
			self.getState(path + '.' + hour +':00:00.PROBPCP_PERCENT', function(err, state) {
				local_PROBPCP_PERCENT = state.val;
			});
			self.getState(path + '.' + hour +':00:00.RRR_MM', function(err, state) {
				local_RRR_MM = state.val;
			});
			self.getState(path + '.' + hour +':00:00.SYMBOL_CODE', function(err, state) {
				local_SYMBOL_CODE = state.val;
			});
			self.getState(path + '.' + hour +':00:00.TTH_C', function(err, state) {
				local_TTH_C = state.val;
			});
			self.getState(path + '.' + hour +':00:00.TTL_C', function(err, state) {
				local_TTL_C = state.val;
			});
			self.getState(path + '.' + hour +':00:00.TTT_C', function(err, state) {
				local_TTT_C = state.val;
			});
			self.getState(path + '.' + hour +':00:00.local_date_time', function(err, state) {
				local_local_date_time = state.val;
			});
			self.getState(path + '.' + hour +':00:00.type', function(err, state) {
				local_type = state.val;
			});

			//*** Create current_hour object  ***
			self.setObjectNotExists(updatePath, {
				type: "channel",
				common: {
					name: "Holds the current hour data. This is updated on every http-call AND on every full hour by coping the data from forecast.60minutes.day0 - actual hour",
					role: "info"
				},
				native: {},
			});

			self.setObjectNotExists(updatePath + "." + "local_date_time", {
				type: "state",
				common: {
					name: "Date for validity of record",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "local_date_time", {
					val: local_local_date_time,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "TTT_C", {
				type: "state",
				common: {
					name: "Current temperature in °C",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "TTT_C", {
					val: local_TTT_C,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "TTL_C", {
				type: "state",
				common: {
					name: "Error range lower limit",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "TTL_C", {
					val: local_TTL_C,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "TTH_C", {
				type: "state",
				common: {
					name: "Error range upper limit",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "TTH_C", {
					val: local_TTH_C,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "PROBPCP_PERCENT", {
				type: "state",
				common: {
					name: "Probability of precipitation in %",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "PROBPCP_PERCENT", {
					val: local_PROBPCP_PERCENT,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "RRR_MM", {
				type: "state",
				common: {
					name: "Precipitation total",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "RRR_MM", {
					val: local_RRR_MM,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "FF_KMH", {
				type: "state",
				common: {
					name: "Wind speed in km/h",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "FF_KMH", {
					val: local_FF_KMH,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "FX_KMH", {
				type: "state",
				common: {
					name: "Peak wind speed in km/h",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "FX_KMH", {
					val: local_FX_KMH,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "DD_DEG", {
				type: "state",
				common: {
					name: "Wind direction in angular degrees: 0 = North wind",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "DD_DEG", {
					val: local_DD_DEG,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "SYMBOL_CODE", {
				type: "state",
				common: {
					name: "Mapping to weather icon",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "SYMBOL_CODE", {
					val: local_SYMBOL_CODE,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "ICON_URL_COLOR", {
				type: "state",
				common: {
					name: "URL to color Icon",
					type: "string",
					role: "weather.icon"
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "ICON_URL_COLOR", {
					val: local_ICON_URL_COLOR,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "ICON_URL_DARK", {
				type: "state",
				common: {
					name: "URL to dark Icon",
					type: "string",
					role: "weather.icon"
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "ICON_URL_DARK", {
					val: local_ICON_URL_DARK,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "ICON_URL_LIGHT", {
				type: "state",
				common: {
					name: "URL to light Icon",
					type: "string",
					role: "weather.icon"
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "ICON_URL_LIGHT", {
					val: local_ICON_URL_LIGHT,
					ack: true
				});
			});

			self.setObjectNotExists(updatePath + "." + "type", {
				type: "state",
				common: {
					name: "result set; possible values: 60minutes, hour, day",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "type", {
					val: local_type,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "cur_color", {
				type: "channel",
				common: {
					name: "Mapping temperature / color value",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists(updatePath + "." + "cur_color." + "temperature", {
				type: "state",
				common: {
					name: "Temperature value",
					type: "number",
					role: "value",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "cur_color." + "temperature", {
					val: local_temperature,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "cur_color." + "background_color", {
				type: "state",
				common: {
					name: "background hex color value",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "cur_color." + "background_color", {
					val: local_background_color,
					ack: true
				});
			});
			self.setObjectNotExists(updatePath + "." + "cur_color." + "text_color", {
				type: "state",
				common: {
					name: "text hex color value",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState(updatePath + "." + "cur_color." + "text_color", {
					val: local_text_color,
					ack: true
				});
			});
		}
	});
}

function getForecast(self){
	self.log.debug("Getting Forecast for geolocation id: " + geolocationId);

	today = new Date();
	// @ts-ignore
	today1 = new Date().addDays(1);
	// @ts-ignore
	today2 = new Date().addDays(2);
	// @ts-ignore
	today3 = new Date().addDays(3);
	// @ts-ignore
	today4 = new Date().addDays(4);
	// @ts-ignore
	today5 = new Date().addDays(5);
	// @ts-ignore
	today6 = new Date().addDays(6);
	// @ts-ignore
	today7 = new Date().addDays(7);

	//Get forecast
	//Options for getting forecast
	var options_forecast = {
		"method": "GET",
		"hostname": "api.srgssr.ch",
		"port": null,
		"path": "/srf-meteo/forecast/"+geolocationId,
		"headers": {
			"authorization": "Bearer " + access_token
		}
	};

	self.log.debug("Options to get forecast: " + JSON.stringify(options_forecast));
	self.log.info("Getting forecast for GeolocationId: " + geolocationId);

	//set request
	var req = https.request(options_forecast, function (res) {
		var chunks = [];
		res.on("data", function (chunk) {
			chunks.push(chunk);
		});
		res.on("end", function () {
			self.log.debug("Answer of forecast Request: " + Buffer.concat(chunks).toString());
			var body = JSON.parse(Buffer.concat(chunks).toString());

			//check if there is a Error-Code
			if (body.hasOwnProperty("code")) {
				self.log.debug("Return Code: " + body.code.toString());
				if (body.code.toString().startsWith("404")) {
					self.setState('info.connection', false, true);
					self.log.error("Forecast - Resource not found");
					return;
				} else if (body.code.toString().startsWith("400")){
					self.setState('info.connection', false, true);
					self.log.error("Forecast -  Invalid request");
					self.log.error("Forecast  - An error has occured. " + JSON.stringify(body));
					return;
				} else if (body.code.toString().startsWith("401")){
					self.setState('info.connection', false, true);
					self.log.error("Forecast -  Invalid or expired access token ");
					self.log.error("Forecast  - An error has occured. " + JSON.stringify(body));
					return;
				} else if (body.code.toString().startsWith("429")) {
					self.setState('info.connection', false, true);
					self.log.error("Forecast -  Invalid or expired access token ");
					self.log.error("Forecast  - An error has occured. " + JSON.stringify(body));
					return;
				} else {
					self.setState('info.connection', false, true);
					self.log.error("Forecast - An error has occured. " + JSON.stringify(body));
					return;
				}
			}

			//**************************************
			//*** Start extract forcast informations
			//**************************************

			//*** geolocation informations ***
			self.setObjectNotExists("geolocation." + "id", {
				type: "state",
				common: {
					name: "id",
					type: "string",
					role: "text"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "id", {
					val: body.geolocation.id.toString(),
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "lat", {
				type: "state",
				common: {
					name: "latitude",
					type: "number",
					role: "value.gps.latitude",
					write: false
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "lat", {
					val: body.geolocation.lat,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "lon", {
				type: "state",
				common: {
					name: "longitude",
					type: "number",
					role: "value.gps.longitude",
					write: false
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "lon", {
					val: body.geolocation.lon,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "station_id", {
				type: "state",
				common: {
					name: "station id",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "station_id", {
					val: body.geolocation.station_id,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "timezone", {
				type: "state",
				common: {
					name: "timezone",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "timezone", {
					val: body.geolocation.timezone,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "default_name", {
				type: "state",
				common: {
					name: "default name",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "default_name", {
					val: body.geolocation.default_name,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "alarm_region_id", {
				type: "state",
				common: {
					name: "alarm region id",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "alarm_region_id", {
					val: body.geolocation.alarm_region_id,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "alarm_region_name", {
				type: "state",
				common: {
					name: "alarm region name",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "alarm_region_name", {
					val: body.geolocation.alarm_region_name,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "district", {
				type: "state",
				common: {
					name: "district",
					type: "string",
					role: "text",
					write: false
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "district", {
					val: body.geolocation.district,
					ack: true
				});
			});

			//Geolocation_Names
			self.setObjectNotExists("geolocation." + "geolocation_names." + "district", {
				type: "state",
				common: {
					name: "district",
					type: "string",
					role: "location"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "district", {
					val: body.geolocation.geolocation_names[0].district,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "id", {
				type: "state",
				common: {
					name: "id",
					type: "string",
					role: "text"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "id", {
					val: body.geolocation.geolocation_names[0].id,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "type", {
				type: "state",
				common: {
					name: "City or POI (Point of Interest)",
					type: "string",
					role: "text"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "type", {
					val: body.geolocation.geolocation_names[0].type,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "language", {
				type: "state",
				common: {
					name: "language",
					type: "number",
					role: "value"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "language", {
					val: body.geolocation.geolocation_names[0].language,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "translation_type", {
				type: "state",
				common: {
					name: "translation type",
					type: "string",
					role: "text"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "translation_type", {
					val: body.geolocation.geolocation_names[0].translation_type,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "name", {
				type: "state",
				common: {
					name: "name",
					type: "string",
					role: "text"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "name", {
					val: body.geolocation.geolocation_names[0].name,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "country", {
				type: "state",
				common: {
					name: "country",
					type: "string",
					role: "text"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "country", {
					val: body.geolocation.geolocation_names[0].country,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "province", {
				type: "state",
				common: {
					name: "province",
					type: "string",
					role: "text"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "province", {
					val: body.geolocation.geolocation_names[0].province,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "inhabitants", {
				type: "state",
				common: {
					name: "inhabitants",
					type: "number",
					role: "value"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "inhabitants", {
					val: body.geolocation.geolocation_names[0].inhabitants,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "height", {
				type: "state",
				common: {
					name: "height",
					type: "number",
					role: "value"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "height", {
					val: body.geolocation.geolocation_names[0].height,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "plz", {
				type: "state",
				common: {
					name: "plz",
					type: "number",
					role: "value"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "plz", {
					val: body.geolocation.geolocation_names[0].plz,
					ack: true
				});
			});
			self.setObjectNotExists("geolocation." + "geolocation_names." + "ch", {
				type: "state",
				common: {
					name: "ch",
					type: "number",
					role: "value"
				},
				native: {},
			}, function () {
				self.setState("geolocation." + "geolocation_names." + "ch", {
					val: body.geolocation.geolocation_names[0].ch,
					ack: true
				});
			});

			//*** Create 60minutes forecast ***
			self.setObjectNotExists("forecast." + "60minutes", {
				type: "channel",
				common: {
					name: "Forecast data for time windows of 60 minutes (for 98 hours from today 0:00)",
					role: "info"
				},
				native: {},
			});
			// Day 0
			self.setObjectNotExists("forecast." + "60minutes.day0", {
				type: "channel",
				common: {
					name: "Forecast data for today",
					role: "info"
				},
				native: {},
			});
			// Day 1
			self.setObjectNotExists("forecast." + "60minutes.day1", {
				type: "channel",
				common: {
					name: "Forecast data for tomorrow",
					role: "info"
				},
				native: {},
			});
			// Day 2
			self.setObjectNotExists("forecast." + "60minutes.day2", {
				type: "channel",
				common: {
					name: "Forecast data for today + 2 days",
					role: "info"
				},
				native: {},
			});
			// Day 3
			self.setObjectNotExists("forecast." + "60minutes.day3", {
				type: "channel",
				common: {
					name: "Forecast data for today + 3 days",
					role: "info"
				},
				native: {},
			});
			// Day 4
			self.setObjectNotExists("forecast." + "60minutes.day4", {
				type: "channel",
				common: {
					name: "Forecast data for today + 4 days",
					role: "info"
				},
				native: {},
			});


			//iterate over all 60minutes objects
			body.forecast["60minutes"].forEach(function(obj,index) {
				var startTimeISOString = obj.local_date_time;
				var objDate = new Date(startTimeISOString);
				var myPath;
				var myTime =  getTimeFormattet(objDate);

				if (datesAreOnSameDay(today, objDate)) {
					myPath = "day0";
				} else if (datesAreOnSameDay(today1, objDate)) {
					myPath = "day1";
				} else if (datesAreOnSameDay(today2, objDate)) {
					myPath = "day2";
				} else if (datesAreOnSameDay(today3, objDate)) {
					myPath = "day3";
				} else if (datesAreOnSameDay(today4, objDate)) {
					myPath = "day4";
				} else if (datesAreOnSameDay(today5, objDate)) {
					myPath = "day5";
				} else {
					self.setState('info.connection', false, true);
					self.log.error("invalid date found. Could not assign date. The date received is not one of the coming week. " + startTimeISOString);
					return;
				}

				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "local_date_time", {
					type: "state",
					common: {
						name: "Date for validity of record",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "local_date_time", {
						val: obj.local_date_time,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "TTT_C", {
					type: "state",
					common: {
						name: "Current temperature in °C",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "TTT_C", {
						val: obj.TTT_C,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "TTL_C", {
					type: "state",
					common: {
						name: "Error range lower limit",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "TTL_C", {
						val: obj.TTL_C,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "TTH_C", {
					type: "state",
					common: {
						name: "Error range upper limit",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "TTH_C", {
						val: obj.TTH_C,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "PROBPCP_PERCENT", {
					type: "state",
					common: {
						name: "Probability of precipitation in %",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "PROBPCP_PERCENT", {
						val: obj.PROBPCP_PERCENT,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "RRR_MM", {
					type: "state",
					common: {
						name: "Precipitation total",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "RRR_MM", {
						val: obj.RRR_MM,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "FF_KMH", {
					type: "state",
					common: {
						name: "Wind speed in km/h",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "FF_KMH", {
						val: obj.FF_KMH,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "FX_KMH", {
					type: "state",
					common: {
						name: "Peak wind speed in km/h",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "FX_KMH", {
						val: obj.FX_KMH,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "DD_DEG", {
					type: "state",
					common: {
						name: "Wind direction in angular degrees: 0 = North wind",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "DD_DEG", {
						val: obj.DD_DEG,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "SYMBOL_CODE", {
					type: "state",
					common: {
						name: "Mapping to weather icon",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "SYMBOL_CODE", {
						val: obj.SYMBOL_CODE,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "ICON_URL_COLOR", {
					type: "state",
					common: {
						name: "URL to color Icon",
						type: "string",
						role: "weather.icon"
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "ICON_URL_COLOR", {
						val: "https://raw.githubusercontent.com/baerengraben/ioBroker.swiss-weather-api/master/img/Meteo_API_Icons/Color/" + obj.SYMBOL_CODE + ".png",
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "ICON_URL_DARK", {
					type: "state",
					common: {
						name: "URL to dark Icon",
						type: "string",
						role: "weather.icon"
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "ICON_URL_DARK", {
						val: "https://raw.githubusercontent.com/baerengraben/ioBroker.swiss-weather-api/master/img/Meteo_API_Icons/Dark/" + obj.SYMBOL_CODE + ".png",
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "ICON_URL_LIGHT", {
					type: "state",
					common: {
						name: "URL to light Icon",
						type: "string",
						role: "weather.icon"
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "ICON_URL_LIGHT", {
						val: "https://raw.githubusercontent.com/baerengraben/ioBroker.swiss-weather-api/master/img/Meteo_API_Icons/Light/" + obj.SYMBOL_CODE + ".png",
						ack: true
					});
				});

				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "type", {
					type: "state",
					common: {
						name: "result set; possible values: 60minutes, hour, day",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "type", {
						val: obj.type,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "cur_color", {
					type: "channel",
					common: {
						name: "Mapping temperature / color value",
						role: "info"
					},
					native: {},
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "cur_color." + "temperature", {
					type: "state",
					common: {
						name: "Temperature value",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "cur_color." + "temperature", {
						val: obj.cur_color.temperature,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "cur_color." + "background_color", {
					type: "state",
					common: {
						name: "background hex color value",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "cur_color." + "background_color", {
						val: obj.cur_color.background_color,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "60minutes." + myPath +"." + myTime +"." + "cur_color." + "text_color", {
					type: "state",
					common: {
						name: "text hex color value",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "60minutes." + myPath +"." + myTime +"." + "cur_color." + "text_color", {
						val: obj.cur_color.text_color,
						ack: true
					});
				});
			});

			//*** Create day forecast ***
			self.setObjectNotExists("forecast." + "day", {
				type: "channel",
				common: {
					name: "Forecast data for a whole day (for 8 days from today 0:00 )",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "day.day0", {
				type: "channel",
				common: {
					name: "Forecast data for today",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "day.day1", {
				type: "channel",
				common: {
					name: "Forecast data for tomorrow",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "day.day2", {
				type: "channel",
				common: {
					name: "Forecast data for today + 2 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "day.day3", {
				type: "channel",
				common: {
					name: "Forecast data for today + 3 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "day.day4", {
				type: "channel",
				common: {
					name: "Forecast data for today + 4 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "day.day5", {
				type: "channel",
				common: {
					name: "Forecast data for today + 5 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "day.day6", {
				type: "channel",
				common: {
					name: "Forecast data for today + 6 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "day.day7", {
				type: "channel",
				common: {
					name: "Forecast data for today + 7 days",
					role: "info"
				},
				native: {},
			});

			// iterate over all day objects
			body.forecast["day"].forEach(function(obj,index) {
				var startTimeISOString = obj.local_date_time;
				var objDate = new Date(startTimeISOString);
				var myPath;
				var myTime =  getTimeFormattet(objDate);

				if (datesAreOnSameDay(today, objDate)) {
					myPath = "day0";
				} else if (datesAreOnSameDay(today1, objDate)) {
					myPath = "day1";
				} else if (datesAreOnSameDay(today2, objDate)) {
					myPath = "day2";
				} else if (datesAreOnSameDay(today3, objDate)) {
					myPath = "day3";
				} else if (datesAreOnSameDay(today4, objDate)) {
					myPath = "day4";
				} else if (datesAreOnSameDay(today5, objDate)) {
					myPath = "day5";
				} else if (datesAreOnSameDay(today6, objDate)) {
					myPath = "day6";
				} else if (datesAreOnSameDay(today7, objDate)) {
					myPath = "day7";
				} else {
					self.log.error("invalid date found. Could not assign date. The date received is not one of the coming week. " + startTimeISOString);
					self.setState('info.connection', false, true);
					return;
				}

				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "local_date_time", {
					type: "state",
					common: {
						name: "Date for validity of record",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "local_date_time", {
						val: obj.local_date_time,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "TX_C", {
					type: "state",
					common: {
						name: "Maximum temperature in °C",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "TX_C", {
						val: obj.TX_C,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "TN_C", {
					type: "state",
					common: {
						name: "Lowest temperature in °C",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "TN_C", {
						val: obj.TN_C,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "PROBPCP_PERCENT", {
					type: "state",
					common: {
						name: "Probability of precipitation in %",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "PROBPCP_PERCENT", {
						val: obj.PROBPCP_PERCENT,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "RRR_MM", {
					type: "state",
					common: {
						name: "Precipitation total",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "RRR_MM", {
						val: obj.RRR_MM,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "FF_KMH", {
					type: "state",
					common: {
						name: "Wind speed in km/h",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "FF_KMH", {
						val: obj.FF_KMH,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "FX_KMH", {
					type: "state",
					common: {
						name: "Peak wind speed in km/h",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "FX_KMH", {
						val: obj.FX_KMH,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "DD_DEG", {
					type: "state",
					common: {
						name: "Wind direction in angular degrees: 0 = North wind",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "DD_DEG", {
						val: obj.DD_DEG,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "SUNSET", {
					type: "state",
					common: {
						name: "Time sunset",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "SUNSET", {
						val: obj.SUNSET,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "SUNRISE", {
					type: "state",
					common: {
						name: "Time sunrise",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "SUNRISE", {
						val: obj.SUNRISE,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "SUN_H", {
					type: "state",
					common: {
						name: "Sun hours",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "SUN_H", {
						val: obj.SUN_H,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "SYMBOL_CODE", {
					type: "state",
					common: {
						name: "Mapping to weather icon",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "SYMBOL_CODE", {
						val: obj.SYMBOL_CODE,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "ICON_URL_COLOR", {
					type: "state",
					common: {
						name: "URL to color Icon",
						type: "string",
						role: "weather.icon"
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "ICON_URL_COLOR", {
						val: "https://raw.githubusercontent.com/baerengraben/ioBroker.swiss-weather-api/master/img/Meteo_API_Icons/Color/" + obj.SYMBOL_CODE + ".png",
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "ICON_URL_DARK", {
					type: "state",
					common: {
						name: "URL to dark Icon",
						type: "string",
						role: "weather.icon"
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "ICON_URL_DARK", {
						val: "https://raw.githubusercontent.com/baerengraben/ioBroker.swiss-weather-api/master/img/Meteo_API_Icons/Dark/" + obj.SYMBOL_CODE + ".png",
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "ICON_URL_LIGHT", {
					type: "state",
					common: {
						name: "URL to light Icon",
						type: "string",
						role: "weather.icon"
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "ICON_URL_LIGHT", {
						val: "https://raw.githubusercontent.com/baerengraben/ioBroker.swiss-weather-api/master/img/Meteo_API_Icons/Light/" + obj.SYMBOL_CODE + ".png",
						ack: true
					});
				});

				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "type", {
					type: "state",
					common: {
						name: "result set; possible values: 60minutes, hour, day",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "type", {
						val: obj.type,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "min_color", {
					type: "channel",
					common: {
						name: "Mapping temperature / color value",
						role: "info"
					},
					native: {},
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "min_color." + "temperature", {
					type: "state",
					common: {
						name: "temperature",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "min_color." + "temperature", {
						val: obj.min_color.temperature,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "min_color." + "background_color", {
					type: "state",
					common: {
						name: "background color",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "min_color." + "background_color", {
						val: obj.min_color.background_color,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "min_color." + "text_color", {
					type: "state",
					common: {
						name: "text color",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "min_color." + "text_color", {
						val: obj.min_color.text_color,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "max_color", {
					type: "channel",
					common: {
						name: "Mapping temperature / color value",
						role: "info"
					},
					native: {},
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "max_color." + "temperature", {
					type: "state",
					common: {
						name: "temperature",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "max_color." + "temperature", {
						val: obj.max_color.temperature,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "max_color." + "background_color", {
					type: "state",
					common: {
						name: "background color",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "max_color." + "background_color", {
						val: obj.max_color.background_color,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "day." + myPath +"." + myTime +"." + "max_color." + "text_color", {
					type: "state",
					common: {
						name: "text color",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "day." + myPath +"." + myTime +"." + "max_color." + "text_color", {
						val: obj.max_color.text_color,
						ack: true
					});
				});
			});

			// *** Create hour forecast ***
			self.setObjectNotExists("forecast." + "hour", {
				type: "channel",
				common: {
					name: "forecast data for a time window of 3 hours (for 8 days from today 2:00 )",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "hour.day0", {
				type: "channel",
				common: {
					name: "Forecast data for today",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "hour.day1", {
				type: "channel",
				common: {
					name: "Forecast data for tomorrow",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "hour.day2", {
				type: "channel",
				common: {
					name: "Forecast data for today + 2 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "hour.day3", {
				type: "channel",
				common: {
					name: "Forecast data for today + 3 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "hour.day4", {
				type: "channel",
				common: {
					name: "Forecast data for today + 4 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "hour.day5", {
				type: "channel",
				common: {
					name: "Forecast data for today + 5 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "hour.day6", {
				type: "channel",
				common: {
					name: "Forecast data for today + 6 days",
					role: "info"
				},
				native: {},
			});
			self.setObjectNotExists("forecast." + "hour.day7", {
				type: "channel",
				common: {
					name: "Forecast data for today + 7 days",
					role: "info"
				},
				native: {},
			});
			//iterate over all hour objects
			body.forecast["hour"].forEach(function(obj,index) {
				var startTimeISOString = obj.local_date_time;
				var objDate = new Date(startTimeISOString);
				var myPath;
				var myTime =  getTimeFormattet(objDate);

				if (datesAreOnSameDay(today, objDate)) {
					myPath = "day0";
				} else if (datesAreOnSameDay(today1, objDate)) {
					myPath = "day1";
				} else if (datesAreOnSameDay(today2, objDate)) {
					myPath = "day2";
				} else if (datesAreOnSameDay(today3, objDate)) {
					myPath = "day3";
				} else if (datesAreOnSameDay(today4, objDate)) {
					myPath = "day4";
				} else if (datesAreOnSameDay(today5, objDate)) {
					myPath = "day5";
				} else if (datesAreOnSameDay(today6, objDate)) {
					myPath = "day6";
				} else if (datesAreOnSameDay(today7, objDate)) {
					myPath = "day7";
				} else {
					self.setState('info.connection', false, true);
					self.log.error("invalid date found. Could not assign date. The date received is not one of the coming week. " + startTimeISOString);
					return;
				}

				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "local_date_time", {
					type: "state",
					common: {
						name: "Date for validity of record",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "local_date_time", {
						val: obj.local_date_time,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "TTT_C", {
					type: "state",
					common: {
						name: "Current temperature in °C",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "TTT_C", {
						val: obj.TTT_C,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "TTL_C", {
					type: "state",
					common: {
						name: "Error range lower limit",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "TTL_C", {
						val: obj.TTL_C,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "TTH_C", {
					type: "state",
					common: {
						name: "Error range upper limit",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "TTH_C", {
						val: obj.TTH_C,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "PROBPCP_PERCENT", {
					type: "state",
					common: {
						name: "Probability of precipitation in %",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "PROBPCP_PERCENT", {
						val: obj.PROBPCP_PERCENT,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "RRR_MM", {
					type: "state",
					common: {
						name: "Precipitation total",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "RRR_MM", {
						val: obj.RRR_MM,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "FF_KMH", {
					type: "state",
					common: {
						name: "Wind speed in km/h",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "FF_KMH", {
						val: obj.FF_KMH,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "FX_KMH", {
					type: "state",
					common: {
						name: "Peak wind speed in km/h",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "FX_KMH", {
						val: obj.FX_KMH,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "DD_DEG", {
					type: "state",
					common: {
						name: "Wind direction in angular degrees: 0 = North wind",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "DD_DEG", {
						val: obj.DD_DEG,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "SYMBOL_CODE", {
					type: "state",
					common: {
						name: "Mapping to weather icon",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "SYMBOL_CODE", {
						val: obj.SYMBOL_CODE,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "ICON_URL_COLOR", {
					type: "state",
					common: {
						name: "URL to color Icon",
						type: "string",
						role: "weather.icon"
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "ICON_URL_COLOR", {
						val: "https://raw.githubusercontent.com/baerengraben/ioBroker.swiss-weather-api/master/img/Meteo_API_Icons/Color/" + obj.SYMBOL_CODE + ".png",
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "ICON_URL_DARK", {
					type: "state",
					common: {
						name: "URL to dark Icon",
						type: "string",
						role: "weather.icon"
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "ICON_URL_DARK", {
						val: "https://raw.githubusercontent.com/baerengraben/ioBroker.swiss-weather-api/master/img/Meteo_API_Icons/Dark/" + obj.SYMBOL_CODE + ".png",
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "ICON_URL_LIGHT", {
					type: "state",
					common: {
						name: "URL to light Icon",
						type: "string",
						role: "weather.icon"
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "ICON_URL_LIGHT", {
						val: "https://raw.githubusercontent.com/baerengraben/ioBroker.swiss-weather-api/master/img/Meteo_API_Icons/Light/" + obj.SYMBOL_CODE + ".png",
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "type", {
					type: "state",
					common: {
						name: "result set; possible values: 60minutes, hour, day",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "type", {
						val: obj.type,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "cur_color", {
					type: "channel",
					common: {
						name: "Mapping temperature / color value",
						role: "info"
					},
					native: {},
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "cur_color." + "temperature", {
					type: "state",
					common: {
						name: "Temperature value",
						type: "number",
						role: "value",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "cur_color." + "temperature", {
						val: obj.cur_color.temperature,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "cur_color." + "background_color", {
					type: "state",
					common: {
						name: "background hex color value",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "cur_color." + "background_color", {
						val: obj.cur_color.background_color,
						ack: true
					});
				});
				self.setObjectNotExists("forecast." + "hour." + myPath +"." + myTime +"." + "cur_color." + "text_color", {
					type: "state",
					common: {
						name: "text hex color value",
						type: "string",
						role: "text",
						write: false
					},
					native: {},
				}, function () {
					self.setState("forecast." + "hour." + myPath +"." + myTime +"." + "cur_color." + "text_color", {
						val: obj.cur_color.text_color,
						ack: true
					});
				});
			});
		});
		res.on("error", function (error) {
			self.setState('info.connection', false, true);
			self.log.error(error)
		});
	});
	req.end();
}

function getGeolocationId(self,myCallback) {
	self.log.debug("Getting GeolocationId....");
	//Options for getting current Geolocation id
	var options_geolocationId = {
		"method": "GET",
		"hostname": "api.srgssr.ch",
		"port": null,
		"path": "/srf-meteo/geolocations?latitude=" + self.config.Latitude + "&longitude=" + self.config.Longitude,
		"headers": {
			"authorization": "Bearer " + access_token
		}
	};

	self.log.debug("Options to get GeolocationId: " + JSON.stringify(options_geolocationId));

	//set request
	var req = https.request(options_geolocationId, function (res) {
		var chunks = [];
		res.on("data", function (chunk) {
			chunks.push(chunk);
		});
		res.on("end", function () {
			self.log.debug("Answer of getGeolocation Request: " + Buffer.concat(chunks).toString());
			var body = JSON.parse(Buffer.concat(chunks).toString());
			self.log.debug("Body: " + JSON.stringify(body));

			//check if there is a Error-Code
			if (body.hasOwnProperty("code")) {
				self.log.debug("Return Code: " + body.code.toString());
				if (body.code.toString().startsWith("404")) {
					self.setState('info.connection', false, true);
					self.log.error("Get Gelocation id - Resource not found");
					return;
				} else if (body.code.toString().startsWith("400")) {
					self.setState('info.connection', false, true);
					self.log.error("Get Gelocation id -  Invalid request");
					self.log.error("Get Gelocation id  - An error has occured. " + JSON.stringify(body));
					return;
				} else if (body.code.toString().startsWith("401")) {
					self.setState('info.connection', false, true);
					self.log.error("Get Gelocation id -  Invalid or expired access token ");
					self.log.error("Get Gelocation id  - An error has occured. " + JSON.stringify(body));
					return;
				} else if (body.code.toString().startsWith("429")) {
					self.setState('info.connection', false, true);
					self.log.error("Get Gelocation id -  Invalid or expired access token ");
					self.log.error("Get Gelocation id  - An error has occured. " + JSON.stringify(body));
					return;
				} else {
					self.setState('info.connection', false, true);
					self.log.error("Get Gelocation id - An error has occured. " + JSON.stringify(body));
					return;
				}
			}
			//Extract GeolocationID
			if (body[0].id === undefined) {
				self.setState('info.connection', false, true);
				self.log.error("Could not get a geolocation id. Is the adapter configured cleanly? Please note that from version 0.9.x a new App must be created under the SRG-SSR Developer portal ('freemium' subscription is needed). Please check readme for more details https://github.com/baerengraben/ioBroker.swiss-weather-api/blob/master/README.md" + JSON.stringify(body));
				return;
			} else {
				geolocationId = body[0].id.toString();
				//getForecast
				myCallback(self);
			}
		});
		res.on("error", function (error) {
			self.setState('info.connection', false, true);
			self.log.error(error)
		});
	});
	req.end();
}

function doIt(self) {
	self.setState('info.connection', true, true);
	var pollInterval = self.config.PollInterval * 60000; //Convert minute to miliseconds
	//First of all check if there is a working DNS-Resolver
	//Resolves https://github.com/baerengraben/ioBroker.swiss-weather-api/issues/32
	dns.resolve4('api.srgssr.ch', function (err, addresses) {
		if (err) {
			self.log.error('DNS Resolve Failed for api.srgssr.ch: ' + err.message + ' Is there an internet connection?');
			self.log.error('Retrying in 10min...');
			self.setState('info.connection', false, true);
			setTimeout(doIt, 10 * 60000, self);
		} else {
			self.log.debug('Successfull DNS resolve for api.srgssr.ch: ' + JSON.stringify(addresses));
			self.setState('info.connection', true, true);

			// Check if there is already a geolocationId, if not => Get one
			if (geolocationId) {
				self.log.debug("geolocationId is available, move forwared to get forcasts...");
				getToken(self,getForecast);
			} else {
				self.log.debug("There is no geolocationId, so getting one before calling forecasts...");
				getToken(self,getGeolocationId);
			}
			setTimeout(doIt, pollInterval, self);
		}
	});
}

class SwissWeatherApi extends utils.Adapter {
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		// @ts-ignore
		super({
			...options,
			name: adapterName,
		});
		this.crons = [];
		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		//set state to 'ok'
		this.setState('info.connection', true, true);
		//ensure that current_hour is uptodate on every minute '0'
		this.crons.push(cron.schedule('0 * * * *', async() => {
			setCurrentHour(this);
		}));
		// read system Longitude, Latitude
		getSystemData(this);
		//to and get some forecast
		setTimeout(doIt, 10000, this); // First start after 10s
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			for (const croni in this.crons) {
				const onecron = this.crons[croni]
				onecron.destroy()
			}
			this.log.debug("cleaned everything up...");
			clearTimeout(timeout);
			callback();
		} catch (e) {
			callback();
		}
	}
}


// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new SwissWeatherApi(options);
} else {
	// otherwise start the instance directly
	new SwissWeatherApi();
}