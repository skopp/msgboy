/* This is the connection object, wrapped around a WS object */
var util = require('util'),
    EventEmitter = require('events').EventEmitter;

Connection = function() { 
    this.reconnectDelay = 0;
    this.reconnectionTimeout = null;
    this._requests = {};
    this._stack = [];
    this._ready = false;
}

util.inherits(Connection, EventEmitter);

Connection.prototype.connect = function(endpoint, login, password) {
    console.log("Connecting");
    this._socket = io.connect(endpoint);
    
    // Socket Open!
    this._socket.on('connect', function() {
        clearTimeout( this.reconnectionTimeout );
        this.reconnectionTimeout = null;
        console.log("Connected");
        this._socket.emit('auth', { login: login, password: password });
    }.bind(this));
    
    // Socket Closed
    this._socket.on('disconnect', function() {
        this._ready = false;
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
	
    // Message from the server!
    this._socket.on('notification', function(message) {
        console.log("Notification!");
        console.log(message)
	}.bind(this));
	
	// We're ready!
    // And we need to process the stack!
	this._socket.on('ready', function(data) {
        console.log("Ready");
        this._ready = true;
        while(m = this._stack.shift()) {
		    this._socket.emit(m[0], m[1]);
        }
    }.bind(this));
    
    // Successfuly subscribed
    this._socket.on('subscribed', function(subs) {
        if(this._requests[subs.id]) {
            this._requests[subs.id](true, subs.url);
            delete this._requests[subs.id];
        }
    }.bind(this));
    
    // Successfuly unsubscribed
    this._socket.on('unsubscribed', function(subs) {
        if(this._requests[subs.id]) {
            this._requests[subs.id](true, subs.url);
            delete this._requests[subs.id];
        }
    }.bind(this));
}


Connection.prototype.subscribe = function(url, callback) {
    var requestId = btoa(url).substring(10,20);
    this._requests[requestId] = callback;
    if(this._ready) {
        this._socket.emit('subscribe', {url: url, id: requestId});
    }
    else {
        this._stack.push(['subscribe', {url: url, id: requestId}]);
    }
}

Connection.prototype.unsubscribe = function(url, callback) {
    var requestId = btoa(url).substring(10,20); 
    this._requests[requestId] = callback;
    if(this._ready) {
        this._socket.emit('unsubscribe', {url: url, id: requestId});
    }
    else {
        this._stack.push(['unsubscribe', {url: url, id: requestId}]);
    }
}


exports.Connection = Connection;