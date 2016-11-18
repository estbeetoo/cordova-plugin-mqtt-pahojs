var Paho = require('./paho_mqttws31');
var EventEmitter = require('com.feedhenry.eventemitter.EventEmitter');
var SYSTEM_EVENTS = {
    'status': true,
    'disconnected': true,
    'data': true,
    'connecting': true,
    'schedule_reconnect': true,
    'connected': true,
    'disconnect': true
};

function MQTTClient(options) {
    EventEmitter(this);
    this.uri = options.uri || 'mqtt://' + options.host + ':' + (options.port || 8080);
    if (this.uri.substring(this.uri.length - 1) !== '/') this.uri += '/';
    this.disconnectNormally = false;
    this.connected = false;
    this.reconnectTry = 0;
    this.clientId = options.clientId || options.clientID || options.client || "BeeToo";
    this.reportConnectionStatus = options.reportConnectionStatus || false;
    this.restoreConnection = true;
    this.reconnectDelay = options.reconnectDelay || [1000, 1000, 1000, 10000, 10000, 60000];
    if (!Array.isArray(this.reconnectDelay))
        this.reconnectDelay = [this.reconnectDelay];
    this.reconnectDelayIdx = null;
    this.timeout = Math.round(options.timeout / 1000 || 3);
    if (typeof options.reconnect !== 'undefined') this.restoreConnection = options.reconnect ? true : false;
    this._setupConnection();
}

MQTTClient.prototype = new EventEmitter();

MQTTClient.prototype._showConnectionStatus = function (status) {
    if (status && this.reportConnectionStatus)
        window.plugins.toast.showLongBottom(status);
    this.emit('status', status);
};

MQTTClient.prototype._setupConnection = function () {
    this.connection = new Paho.MQTT.Client(this.uri, this.clientId);
    this.connection.onConnectionLost = this._connectionLost.bind(this);
    this.connection.onMessageArrived = this._onMessageArrived.bind(this);
};

MQTTClient.prototype._connectionLost = function () {
    this.connected = false;
    this.reconnectTry = 0;
    this.emit('disconnected');
    if (this.restoreConnection && !this.disconnectNormally) this.reconnect();
};

MQTTClient.prototype._onMessageArrived = function (msg) {
    this.emit('data', msg);
    if (!SYSTEM_EVENTS[msg.destinationName])
        this.emit(msg.destinationName, msg.payloadString);
};

MQTTClient.prototype._shouldReconnect = function () {
    if (this.reconnectDelayIdx !== null && this.reconnectDelay[this.reconnectDelayIdx] === -1)
        return false;
    return true;
}

MQTTClient.prototype._startReconnectCounter = function (callback) {
    this.reconnectCounterCounted = 0;
    this._showReconnectToast(this.reconnectDelay[this.reconnectDelayIdx]);
    this.reconnectCounter = setInterval(function () {
        this.reconnectCounterCounted += 1000;
        var time = (this.reconnectDelay[this.reconnectDelayIdx] - this.reconnectCounterCounted);
        if (time > 0)
            this._showReconnectToast(time);
        else {
            this.reconnectCounterCounted = 0;
            this._stopReconnectCounter();
            callback && callback();
        }
    }.bind(this), 1000);
}

MQTTClient.prototype._showReconnectToast = function (time /*in ms*/) {
    this._showConnectionStatus('Reconnecting in ' + Math.round(time / 1000) + 's');
}

MQTTClient.prototype._incrementReconnectDelayIdx = function () {
    if (this.reconnectDelayIdx === null)
        return this.reconnectDelayIdx = 0;
    this.reconnectDelayIdx++;
    if (this.reconnectDelayIdx >= this.reconnectDelay.length)
        return this.reconnectDelayIdx = 0;
    return this.reconnectDelayIdx;
}

MQTTClient.prototype._stopReconnectCounter = function () {
    if (this.reconnectCounter)
        clearInterval(this.reconnectCounter);
}

MQTTClient.prototype.connect = function (reconnect) {
    if (!reconnect)
        this._markDisconnected();
    this._stopReconnectCounter();
    this._showConnectionStatus('Connecting...');
    this.emit('connecting');
    this.disconnectNormally = false;
    return new Promise(function (resolve, reject) {
        function connectionFailed(error) {
            this.connected = false;
            this._incrementReconnectDelayIdx();
            if (this.restoreConnection && !this.disconnectNormally && this._shouldReconnect()) {
                this._startReconnectCounter(this.reconnect.bind(this));
                this.emit('schedule_reconnect', this.reconnectDelay);
            } else {
                this.disconnect();
            }
            reject && reject();
        };

        function connectionSuccess() {
            this._showConnectionStatus('Connected');
            this.emit('connected');
            this.reconnectTry = 0;
            this.reconnectDelayIdx = null;
            this.connected = true;
            resolve && resolve();
        };

        var connectionParams = {onSuccess: connectionSuccess.bind(this), onFailure: connectionFailed.bind(this)};
        if (this.keepAliveInterval) connectionParams.keepAliveInterval = this.keepAliveInterval;
        if (this.timeout) connectionParams.timeout = this.timeout;
        try {
            this.connection.connect(connectionParams);
        } catch (e) {
            reject && reject(e);
        }
    }.bind(this));
};

MQTTClient.prototype.isConnected = function () {
    return this.connected;
};

MQTTClient.prototype.reconnect = function() {
    function _connect() {
        this.connect(true).catch(function(e) {
            console.error('Error connecting, cause: ' + (e ? e.message : 'unknown reason'));
        });
    }

    this.disconnectNormally = false;
    if (this.connected) {
        this.disconnect().then(_connect.bind(this)).catch(function(e) {
            console.error('Error disconnecting, cause: ' + (e ? e.message : 'unknown reason'));
            setTimeout(_connect.bind(this), 0);
        }.bind(this));
    } else {
        this._setupConnection();
        _connect.apply(this);
    }
};


MQTTClient.prototype._markDisconnected = function () {
    this.reconnectDelayIdx = null;
    this.disconnectNormally = true;
    this.reconnectTry = 0;
    this.connected = false;
}

MQTTClient.prototype.disconnect = function () {
    this._stopReconnectCounter();
    this.emit('disconnect');
    this._markDisconnected();
    if (this.connection.isConnected())
        this.connection.disconnect();
    this._showConnectionStatus('Disconnected');
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
    if (typeof options.retained !== undefined) message.retained = options.retained ? true : false; else if (typeof options.retain !== undefined) message.retain = options.retain ? true : false;
    message.onFailure = function () {
        this._showConnectionStatus('Sent error');
    }.bind(this);
    this.connection.send(message);
};

MQTTClient.prototype.subscribe = function (filter, options) {
    this.connection.subscribe(filter, options);
}
MQTTClient.prototype.unsubscribe = function (filter, options) {
    this.connection.unsubscribe(filter, options);
}

module.exports = MQTTClient;