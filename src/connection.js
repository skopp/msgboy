/* This is the connection object, wrapped around a WS object */
var util = require('util'),
    EventEmitter = require('events').EventEmitter;

Connection = function() { 
    this.reconnectDelay = 0;
    this.reconnectionTimeout = null;
    this._requests = {};
}

util.inherits(Connection, EventEmitter);

Connection.prototype.connect = function(endpoint, login, password) {
    console.log("Connecting");
    this._socket = io.connect(endpoint);
    
    this._socket.on('connect', function() {
        // Socket Open!
        clearTimeout( this.reconnectionTimeout );
        this.reconnectionTimeout = null;
        console.log("connected");
        this.connected = true;
        this._socket.emit('auth', { login: login, password: password });
    }.bind(this));
    
    this._socket.on('disconnect', function() {
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
	}.bind(this));
	
    this._socket.on('notification', function(message) {
        // Message from the server!
        console.log(message)
	}.bind(this));
	
	this._socket.on('ready', function(data) {
	    // Ok, well, we're ready now.
    });
    
    this._socket.on('subscribed', function(subs) {
        if(this._requests[subs.id]) {
            this._requests[subs.id](true, subs.url);
            delete this._requests[subs.id];
        }
    }.bind(this));
}


Connection.prototype.subscribe = function(url, callback) {
    var requestId = btoa(url).substring(10,20);
    this._requests[requestId] = callback;
    this._socket.emit('subscribe', {url: url, id: requestId});
}

Connection.prototype.unsubscribe = function(url, callback) {
    console.log("UNSUBSCRIBE");
}


exports.Connection = Connection;