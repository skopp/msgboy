/* This is the connection object, wrapped around a WS object */
var util = require('util');
var EventEmitter = require('events').EventEmitter;

Connection = function() { 
    this.reconnectDelay = 0;
    this.reconnectionTimeout = null;
}

util.inherits(Connection, EventEmitter);

Connection.prototype.connect = function(endpoint, login, password) {
    console.log("Connecting");
    this._socket = new WebSocket(endpoint);
    this._socket.onopen = function() {
        // Socket Open!
        clearTimeout( this.reconnectionTimeout );
        this.reconnectionTimeout = null;
        console.log("connected");
        this.connected = true;
        // We should auth now!
        this._send({auth: {login: login, password: password}});
    }.bind(this);
	this._socket.onerror = function(err) {
	    // Eorro on socket
	    console.error(err);
	}.bind(this);
    this._socket.onclose = function() {
        // Socket closed
        this.connected = false;
        this.reconnectDelay = Math.min(this.reconnectDelay + 1, 10); // We max at one attempt every minute. 
        var delay = Math.pow(this.reconnectDelay, 2) * 1000;
        console.log("Disconnected. Retrying in", delay, "ms.");
        if (!this.reconnectionTimeout) {
            this.reconnectionTimeout = setTimeout(function () {
                this.reconnectionTimeout = null;
                this.connect(endpoint, login, password);
            }.bind(this), delay);
        }   
	}.bind(this);
    this._socket.onmessage = function(message) {
        // Message from the server!
        console.log(message)
	}.bind(this);
}

Connection.prototype._send = function(object) {
    if (this.connected) {
	    if (this._socket && this._socket.readyState == 1) {
            // Nice, we can actually send stuff!
            this._socket.send(JSON.stringify(object));
        }
        else {
            console.error("f***, we should never be here");
        }
    }
    else {
        console.error("Oups. not connected")
    }
}

Connection.prototype.subscribe = function() {
    console.log("SUBSCRIBE");
}

Connection.prototype.unsubscribe = function() {
    console.log("UNSUBSCRIBE");
}


exports.Connection = Connection;