/* This is the connection object, wrapped around a WS object */
var util = require('util')
// , io = require('socket.io-client') // We need to wait for browserify and socket.io to be fixed to do that :()
, EventEmitter = require('events').EventEmitter;


var ioOptions ={
  'force new connection': true,
  'reconnect': true,
  'reconnection limit': 1000 * 60 * 10,
  'max reconnection attempts': 100
};

Connection = function() { 
  EventEmitter.call(this);
  this._stack = [];
  this._ready = false;
}

util.inherits(Connection, EventEmitter);

Connection.prototype.connect = function(endpoint, login, password) {
  this._socket = io.connect(endpoint, ioOptions);

  // Socket Open!
  this._socket.on('connect', function() {
    this.emit('connected');
    this._socket.emit('auth', { login: login, password: password });
  }.bind(this));

  // Socket Closed
  this._socket.on('disconnect', function() {
    this.emit('disconnected');
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