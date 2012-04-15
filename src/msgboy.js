var _ = require('underscore');
var Backbone = require('backbone');

if (typeof Msgboy === "undefined") {
    var Msgboy = {};
}

// Extending Msgboy with the Backbone events
_.extend(Msgboy, Backbone.Events);

// Logs messages to the console
console._log = console.log;
console._debug = console.debug;
console._info = console.info;
console._warn = console.warn;
console._error = console.error;
Msgboy.log =  {
    levels: {
        DEBUG: 10,
        INFO: 20,
        WARN: 30,
        ERROR: 40,
    },
    _log: Function.prototype.bind.call(console._log, console),
    _debug: Function.prototype.bind.call(console._debug, console),
    _info: Function.prototype.bind.call(console._info, console),
    _warn: Function.prototype.bind.call(console._warn, console),
    _error: Function.prototype.bind.call(console._error, console),
    debug: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.DEBUG) {
            var args = Array.prototype.slice.call(arguments);  
            this._debug.apply(console, args);
        }
    },
    info: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.INFO) {
            var args = Array.prototype.slice.call(arguments);  
            this._info.apply(console, args);
        }
    },
    warn: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.WARN) {
            var args = Array.prototype.slice.call(arguments);  
            this._warn.apply(console, args);
        }
    },
    error: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.ERROR) {
            var args = Array.prototype.slice.call(arguments);  
            this._error.apply(console, args);
        }
    },
}

// Also, hijack all console.log messages
console.log = function() {
    var args = Array.prototype.slice.call(arguments);  
    Msgboy.log.debug.apply(this, args);
}

console.debug = function() {
    var args = Array.prototype.slice.call(arguments);  
    Msgboy.log.debug.apply(this, args);
}

console.info = function() {
    var args = Array.prototype.slice.call(arguments);  
    Msgboy.log.info.apply(this, args);
}

console.warn = function() {
    var args = Array.prototype.slice.call(arguments);  
    Msgboy.log.warn.apply(this, args);
}

console.error = function() {
    var args = Array.prototype.slice.call(arguments);  
    Msgboy.log.error.apply(this, args);
}

// Attributes
Msgboy.log.debugLevel = Msgboy.log.levels.ERROR; // We may want to adjust that in production!
Msgboy.infos = {};
Msgboy.inbox = null;

// Returns the environment in which this msgboy is running
Msgboy.environment = function () {
    if (chrome.i18n.getMessage("@@extension_id") === "ligglcbjgpiljeoenbhnnfdipkealakb") {
        return "production";
    }
    else {
        return "development";
    }
};

if(Msgboy.environment() === "development") {
    Msgboy.log.debugLevel = Msgboy.log.levels.DEBUG;
}

// Runs the msgboy (when the document was loaded and when we were able to extract the msgboy's information)
Msgboy.run =  function () {
    window.onload = function () {
        chrome.management.get(chrome.i18n.getMessage("@@extension_id"), function (extension_infos) {
            Msgboy.infos = extension_infos;
            Msgboy.trigger("loaded");
        });
    }
};

exports.Msgboy = Msgboy;

if(typeof window !== "undefined") {
    window.Msgboy = Msgboy;
}

