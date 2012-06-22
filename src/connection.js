/* This is the connection object, wrapped around a WS object */
var util = require('util')
// , io = require('socket.io-client') // We need to wait for browserify and socket.io to be fixed to do that :()
, EventEmitter = require('events').EventEmitter;


var ioOptions = {
  'max reconnection attempts' : 100000,
  'reconnection limit'        : 1000 * 60 * 10,
  'reconnect'                 : true,
};

Connection = function() { 
  EventEmitter.call(this);
  this._stack = [];
  this._ready = false;
  this.state = 'disconnected';
}

util.inherits(Connection, EventEmitter);

Connection.prototype.connect = function(endpoint, login, password) {
  this._socket = io.connect(endpoint, ioOptions);
  window.socket = this._socket;

  // Update the status.
  this.on('status', function(status) {
    this.state = status;
  }.bind(this));

  // Socket Open!
  this._socket.on('connect', function() {
    this.emit('status', 'connected');
    this._socket.emit('auth', { login: login, password: password });
  }.bind(this));

  // Socket Closed
  this._socket.on('disconnect', function(e) {
    this.emit('status', 'disconnected');
    this._ready = false;
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
    this.emit('ready');
    this._ready = true;
    // Let's start processing requests. We do it with 5 loops.
    this.nextRequest();
    this.nextRequest();
    this.nextRequest();
    this.nextRequest();
    this.nextRequest();
  }.bind(this));

  // Socket connecting
  this._socket.on('connecting', function(transport) {
    this.emit('status', 'connecting', transport);
  }.bind(this));

  // Socket connecting
  this._socket.on('connect_failed', function() {
    this.emit('status', 'connect_failed');
  }.bind(this));

  // Socket closed
  this._socket.on('close', function() {
    this.emit('status', 'close');
  }.bind(this));
  
  // Socket reconnect
  this._socket.on('reconnect', function(transport_type, reconnectionAttempts) {
    this.emit('status', 'reconnect', transport_type, reconnectionAttempts);
  }.bind(this));

  // Socket reconnect
  this._socket.on('reconnecting', function(reconnectionDelay, reconnectionAttempts) {
    this.emit('status', 'reconnecting', reconnectionDelay, reconnectionAttempts);
  }.bind(this));

  // Socket reconnect
  this._socket.on('reconnect_failed', function() {
    this.emit('status', 'reconnect_failed');
  }.bind(this));

}

Connection.prototype.nextRequest = function() {
  var m = this._stack.shift();
  if(m) {
    this._socket.emit(m[0], m[1], function(result) {
      this.nextRequest(); // Let's process the next request!
      m[2](result);
    }.bind(this));
  }
  else {
    setTimeout(function () {
      this.nextRequest(); // Let's come back in a couple seconds!
    }.bind(this), 3000);
  }
}

Connection.prototype.disconnect = function() {
  this._socket.disconnect();
}

Connection.prototype.subscribe = function(url, callback) {
  this._stack.push(['subscribe', url, callback]);
}

Connection.prototype.unsubscribe = function(url, callback) {
  this._stack.push(['unsubscribe', url, callback]);
}


exports.Connection = Connection;