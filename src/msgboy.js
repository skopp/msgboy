var _ = require('underscore');
var Backbone = require('backbone');
var browser = require('./browsers.js').browser;

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
    if (browser.msgboyId() === browser.productionId) {
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
Msgboy.run =  function (page) {
    
    // Google Analytics
    var _gaq = _gaq || [];
    _gaq.push(['_setAccount', 'UA-22746593-1']);
    _gaq.push(['_setAllowLinker', true]);
    _gaq.push(['_trackPageview']);
    (function() {
      var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
      ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
      var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
    })();
    
    // Load the extension data!
    browser.loadProperties(function(extension_infos) {
        Msgboy.infos = extension_infos;
        Msgboy.trigger("loaded:" + page);
    });
};

exports.Msgboy = Msgboy;

if(typeof window !== "undefined") {
    window.Msgboy = Msgboy;
}
