var Paho = require('./paho_mqttws31');
var EventEmitter = require('com.feedhenry.eventemitter.EventEmitter');

function MQTTClient(options) {
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

MQTTClient.prototype._showConnectionStatus = function(status) {
  if (status && this.reportConnectionStatus)
    window.plugins.toast.showLongBottom(status)
};

MQTTClient.prototype._setupConnection = function() {
  this.connection = new Paho.MQTT.Client(this.uri, this.clientId);
  this.connection.onConnectionLost = this._connectionLost.bind(this);
  this.connection.onMessageArrived = this._onMessageArrived.bind(this);
};

MQTTClient.prototype._connectionLost = function() {
  this.connected = false;
  this.reconnectTry = 0;
  //console.log('-------_connectionLost restoreConnection[' + this.restoreConnection + ']disconnectNormally[' + this.disconnectNormally + ']');
  window.plugins.mqtt_event_emitter.emit('disconnected');
  if (this.restoreConnection && !this.disconnectNormally) this.reconnect();
};

MQTTClient.prototype._onMessageArrived = function(msg) {
  window.plugins.mqtt_event_emitter.emit('data', msg);
};

MQTTClient.prototype._startReconnectCounter = function(callback) {
  this._stopReconnectCounter();
  this._incrementReconnectDelayIdx();
  this.reconnectCounterCounted = 0;
  this._showReconnectToast(this.reconnectDelay[this.reconnectDelayIdx]);
  this.reconnectCounter = setInterval(function() {
    this.reconnectCounterCounted += 1000;
    var time = (this.reconnectDelay[this.reconnectDelayIdx] - this.reconnectCounterCounted);
    if (time > 0)
      this._showReconnectToast(time);
    else {
      this._stopReconnectCounter();
      callback && callback();
    }
  }.bind(this), 1000);
}

MQTTClient.prototype._showReconnectToast = function(time /*in ms*/) {
  this._showConnectionStatus('Reconnecting in ' + Math.round(time / 1000) + 's');
}

MQTTClient.prototype._incrementReconnectDelayIdx = function() {
  if (this.reconnectDelayIdx === null)
    return this.reconnectDelayIdx = 0;
  this.reconnectDelayIdx++;
  if (this.reconnectDelayIdx >= this.reconnectDelay.length)
    return this.reconnectDelayIdx = 0;
  return this.reconnectDelayIdx;
}

MQTTClient.prototype._stopReconnectCounter = function() {
  if (this.reconnectCounter)
    clearInterval(this.reconnectCounter);
}

MQTTClient.prototype.connect = function() {
  this._showConnectionStatus('Connecting...');
  window.plugins.mqtt_event_emitter.emit('connecting');
  this.disconnectNormally = false;
  const that = this;
  const promise = new Promise(function(resolve, reject) {
    //console.log('-----connect Promise');
    function connectionFailed(error) {
      that.connected = false;
      if (that.restoreConnection && !that.disconnectNormally) {
        that._startReconnectCounter(that.reconnect.bind(that));
        window.plugins.mqtt_event_emitter.emit('schedule_reconnect', that.reconnectDelay);
      } else {
        that._showConnectionStatus('Disconnected');
        window.plugins.mqtt_event_emitter.emit('disconnected', error);
      }
      reject && reject();
    }

    function connectionSuccess() {
      that._showConnectionStatus('Connected');
      window.plugins.mqtt_event_emitter.emit('connected');
      that.reconnectTry = 0;
      that.connected = true;
      resolve && resolve();
    }

    var connectionParams = {onSuccess: connectionSuccess, onFailure: connectionFailed};
    if (that.keepAliveInterval) connectionParams.keepAliveInterval = that.keepAliveInterval;
    if (that.timeout) connectionParams.timeout = that.timeout;
    console.log('connectionParams.timeout == ' + connectionParams.timeout);
    that.connection.connect(connectionParams);
  });
  return promise;
};

MQTTClient.prototype.isConnected = function() {
  return this.connected;
};

MQTTClient.prototype.reconnect = function() {
  this.disconnectNormally = false;
  if (this.connected) this.disconnect().then(this.connect.bind(this)); else {
    this._setupConnection();
    this.connect();
  }
};

MQTTClient.prototype.disconnect = function() {
  window.plugins.mqtt_event_emitter.emit('disconnect');
  this.disconnectNormally = true;
  this.reconnectTry = 0;
  this.connected = false;
  this.connection.disconnect();
};

MQTTClient.prototype.publish = function(topic, payload, options) {
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
  message.onFailure = function() {
    this._showConnectionStatus('Sent error');
  }.bind(this);
  this.connection.send(message);
};

cordova.addConstructor(function() {
  if (!window.plugins) {
    window.plugins = {};
  }

  window.plugins.mqtt_event_emitter = new EventEmitter();
});

module.exports = MQTTClient;