var Paho = require('./lib/mqttws31-min.js');

function MQTTClient(options) {
	this.uri = options.uri || 'mqtt://' + options.host + ':' + (options.port || 1883);
	if (this.uri.substring(this.uri.length - 1) !== '/') this.uri += '/';
	this.disconnectNormally = false;
	this.connected = false;
	this.reconnectTry = 0;
	this.clientId = options.clientId || options.clientID || options.client || "BeeToo";

	this.restoreConnection = true;
	if (typeof options.reconnect !== 'undefined') this.restoreConnection = options.reconnect ? true : false;
	this._setupConnection();
}

MQTTClient.prototype._setupConnection = function () {
	this.connection = new Paho.MQTT.Client(this.uri, this.clientId);
	this.connection.onConnectionLost = this._connectionLost.bind(this);
	this.connection.onMessageArrived = this._onMessageArrived.bind(this);
};

MQTTClient.prototype._connectionLost = function () {
	this.connected = false;
	this.reconnectTry = 0;
    //console.log('-------_connectionLost restoreConnection[' + this.restoreConnection + ']disconnectNormally[' + this.disconnectNormally + ']');
    if (this.restoreConnection && !this.disconnectNormally) this.reconnect();
};

MQTTClient.prototype._onMessageArrived = function () {
    //console.log('-------_onMessageArrived');
};

MQTTClient.prototype.connect = function () {
    //console.log('-----connect');
    this.disconnectNormally = false;
    const that = this;
    const promise = new Promise(function (resolve, reject) {
      //console.log('-----connect Promise');
      function connectionFailed() {
        //console.log('-----connect Promise fail');
        reject && reject();
        that.connected = false;
        if (that.restoreConnection && !that.disconnectNormally) {
        	if (that.reconnectDelay) clearTimeout(that.reconnectDelay);
        	that.reconnectDelay = setTimeout(that.reconnect.bind(that), 1000);
        }
    }

    function connectionSuccess() {
        //console.log('-----connect Promise success');
        resolve && resolve();
        that.reconnectTry = 0;
        that.connected = true;
    }

    var connectionParams = { onSuccess: connectionSuccess, onFailure: connectionFailed };
    if (that.keepAliveInterval) connectionParams.keepAliveInterval = that.keepAliveInterval;
    that.connection.connect(connectionParams);
});
    return promise;
};

MQTTClient.prototype.isConnected = function () {
	return this.connected;
};

MQTTClient.prototype.reconnect = function () {
    //console.log('-------reconnect connected[' + this.connected + ']');
    this.disconnectNormally = false;
    if (this.connected) this.disconnect().then(this.connect.bind(this));else {
    	this._setupConnection();
    	this.connect();
    }
};

MQTTClient.prototype.disconnect = function () {
    //console.log('-----disconnect');
    this.disconnectNormally = true;
    this.reconnectTry = 0;
    this.connected = false;
    this.connection.disconnect();
};

MQTTClient.prototype.publish = function (topic, payload, options) {
	if (!options) options = {};
	if (typeof options === undefined && typeof topic === 'undefined') {
		options = payload;
		topic = options.topic;
		payload = options.payload;
	}
	const message = new Paho.MQTT.Message(payload);
	message.destinationName = topic;
	if (typeof options.qos !== undefined) {
		const qos = parseInt(options.qos);
		if (!isNaN(qos)) message.qos = qos;
	}
	if (typeof options.retained !== undefined) message.retained = options.retained ? true : false;else if (typeof options.retain !== undefined) message.retain = options.retain ? true : false;
	this.connection.send(message);
};


NativePageTransitions.install = function () {
	if (!window.plugins) {
		window.plugins = {};
	}

	window.plugins.nativepagetransitions = new NativePageTransitions();
	return window.plugins.nativepagetransitions;
};

cordova.addConstructor(NativePageTransitions.install);