## Pure JavaScript MQTT client library. Wrapper for paho.js by [BeeToo](http://beetoo.me) ##

### Installation

Using the Cordova CLI?

```
cordova plugin add cordova-plugin-mqtt-pahojs
```

### Usage example

```
var connection = new window.plugins.mqtt({
    uri: 'ws://192.168.2.107:8080',
    keepAliveInterval: 120,
    clientId: 'BeeToo',
    reportConnectionStatus: true
});
connection.connect();
window.plugins.mqtt_active_connection.publish('/russia/moscow/beetoo', 'hi, gyus!');
```

[The MIT License (MIT)](http://www.opensource.org/licenses/mit-license.html)