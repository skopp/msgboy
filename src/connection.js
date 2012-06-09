/* This is the connection object, wrapped around a WS object */
var util = require('util'),
    EventEmitter = require('events').EventEmitter;

Connection = function() { 
    EventEmitter.call(this);
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
    this._socket.on('notification', function(string) {
        var message  = JSON.parse(string);
        for( var i = 0; i < message.items.length; i++ ) {
            var item = message.items[i];
            var m = {
                id: item.id,
                createdAt: new Date().getTime(),
                title: item.title,
                summary: item.summary,
                content: item.content,
                source: {
                    title: message.title,
                    url: message.status.feed,
                    links: message.standardLinks
                },
                feed: message.status.feed,
                mainLink: item.permalinkUrl
            };
            this.emit('notification', m);
        }
	}.bind(this));
	
	// We're ready!
    // And we need to process the stack!
	this._socket.on('ready', function(data) {
        console.log("Ready");
        this._ready = true;
        // Let's start processing requests. We do it with 5 loops.
        this.nextRequest();
        this.nextRequest();
        this.nextRequest();
        this.nextRequest();
        this.nextRequest();
    }.bind(this));
    
    // Successfuly subscribed
    this._socket.on('subscribed', function(subs) {
        if(this._requests[subs.id]) {
            this._requests[subs.id](true, subs.url);
            delete this._requests[subs.id];
            this.nextRequest();
        }
    }.bind(this));
    
    // Successfuly unsubscribed
    this._socket.on('unsubscribed', function(subs) {
        if(this._requests[subs.id]) {
            this._requests[subs.id](true, subs.url);
            delete this._requests[subs.id];
            this.nextRequest();
        }
    }.bind(this));
}

Connection.prototype.nextRequest = function() {
    if(m = this._stack.shift()) {
	    this._socket.emit(m[0], m[1]);
    }
    else {
        setTimeout(function () {
            this.nextRequest();
        }.bind(this), 3000);
    }
}


Connection.prototype.subscribe = function(url, callback) {
    var requestId = btoa(url).substring(10,20);
    this._requests[requestId] = callback;
    this._stack.push(['subscribe', {url: url, id: requestId}]);
}

Connection.prototype.unsubscribe = function(url, callback) {
    var requestId = btoa(url).substring(10,20); 
    this._requests[requestId] = callback;
    this._stack.push(['unsubscribe', {url: url, id: requestId}]);
}


exports.Connection = Connection;