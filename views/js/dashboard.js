var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        var y = cwd || '.';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

require.define("path", function (require, module, exports, __dirname, __filename) {
function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("/msgboy.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneAdapter = require('../backbone-adapter.js');
var Subscriptions = require('./models/subscription.js').Subscriptions;

if (typeof Msgboy === "undefined") {
    var Msgboy = {};
}

// Extending Msgboy with the Backbone events
_.extend(Msgboy, Backbone.Events);

// Logs messages to the console
Msgboy.log =  {
    levels: {
        RAW: 0,
        DEBUG: 10,
        INFO: 20,
        ERROR: 30,
    },
    _log: Function.prototype.bind.call(console.log, console),
    raw: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.RAW) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('raw');
            this._log.apply(console, args);
        }
    },
    debug: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.DEBUG) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('debug');
            this._log.apply(console, args);
        }
    },
    info: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.INFO) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('info');
            this._log.apply(console, args);
        }
    },
    error: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.ERROR) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('error');
            this._log.apply(console, args);
        }
    },
}

// Attributes
Msgboy.log.debugLevel = Msgboy.log.levels.RAW; // We may want to adjust that in production!
Msgboy.autoReconnect = true;
Msgboy.currentNotification = null;
Msgboy.messageStack = [];
Msgboy.connectionTimeout = null;
Msgboy.reconnectDelay = 1;
Msgboy.connection = null;
Msgboy.infos = {};
Msgboy.inbox = null;
Msgboy.reconnectionTimeout = null;

// Returns the environment in which this msgboy is running
Msgboy.environment = function () {
    if (chrome.i18n.getMessage("@@extension_id") === "ligglcbjgpiljeoenbhnnfdipkealakb") {
        return "production";
    }
    else {
        return "development";
    }
};

// Runs the msgboy (when the document was loaded and when we were able to extract the msgboy's information)
Msgboy.run =  function () {
    window.onload = function () {
        chrome.management.get(chrome.i18n.getMessage("@@extension_id"), function (extension_infos) {
            Msgboy.infos = extension_infos;
            Msgboy.trigger("loaded");
        });
    }
};

// Handles XMPP Connections
Msgboy.onConnect = function (status) {
    var msg = '';
    if (status === Strophe.Status.CONNECTING) {
        msg = 'Msgboy is connecting.';
    } else if (status === Strophe.Status.CONNFAIL) {
        msg = 'Msgboy failed to connect.';
        Msgboy.reconnectDelay = 1;
        if (Msgboy.autoReconnect) {
            Msgboy.autoReconnect();
        }
    } else if (status === Strophe.Status.AUTHFAIL) {
        msg = 'Msgboy couldn\'t authenticate. Please check your credentials';
        Msgboy.autoReconnect = false; // We need to open the settings tab
        chrome.tabs.create({
            url: chrome.extension.getURL('/views/html/options.html'),
            selected: true
        });
    } else if (status === Strophe.Status.DISCONNECTING) {
        msg = 'Msgboy is disconnecting.'; // We may want to time this out.
    } else if (status === Strophe.Status.DISCONNECTED) {
        if (Msgboy.autoReconnect) {
            Msgboy.autoReconnect();
        }
        msg = 'Msgboy is disconnected. Reconnect in ' + Math.pow(Msgboy.reconnectDelay, 2) + ' seconds.';
    } else if (status === Strophe.Status.CONNECTED) {
        Msgboy.autoReconnect = true; // Set autoReconnect to true only when we've been connected :)
        msg = 'Msgboy is connected.';
        // Msgboy.connection.send($pres); // Send presence!
        // Makes sure there is no missing subscription.
        Msgboy.resumeSubscriptions();
    }
    Msgboy.log.debug(msg);
};

// Reconnects the Msgboy
Msgboy.autoReconnect = function () {
    Msgboy.reconnectDelay = Math.min(Msgboy.reconnectDelay + 1, 10); // We max at one attempt every minute.
    if (!Msgboy.reconnectionTimeout) {
        Msgboy.reconnectionTimeout = setTimeout(function () {
            Msgboy.reconnectionTimeout = null;
            Msgboy.connect();
        }, Math.pow(Msgboy.reconnectDelay, 2) * 1000);
    }
};

// Connects the XMPP Client
// It also includes a timeout that tries to reconnect when we could not connect in less than 1 minute.
Msgboy.connect = function () {
    var password = Msgboy.inbox.attributes.password;
    var jid = Msgboy.inbox.attributes.jid + "@msgboy.com/" + Msgboy.infos.version;
    Msgboy.connection.connect(jid, password, this.onConnect);
};

// Uploads the content of the database. this will be used for analysis of the dataset o determine a better algorithm.
// It is perfectly anonymous and currentl not used.
Msgboy.uploadData = function () {
    var archive = new Archive();
    archive.fetch({ created_at: [new Date().getTime(), 0]});
    archive.bind('reset', function () {
        $("#log").text(JSON.stringify(archive.toJSON()));
        Msgboy.helper.uploader.upload(Msgboy.inbox.attributes.jid, archive.toJSON());
    });
};

// Shows a popup notification
Msgboy.notify = function (message) {
    // Open a notification window if needed!
    if (!Msgboy.currentNotification) {
        url = chrome.extension.getURL('/views/html/notification.html');
        Msgboy.currentNotification = window.webkitNotifications.createHTMLNotification(url);
        Msgboy.currentNotification.onclose = function () {
            Msgboy.currentNotification = null;
        };
        Msgboy.currentNotification.ready = false;
        Msgboy.currentNotification.show();
        Msgboy.messageStack.push(message);
    }
    else {
        chrome.extension.sendRequest({
            signature: "notify",
            params: message
        }, function (response) {
            // Nothing to do.
        });
    }
    return Msgboy.currentNotification;
};

// Subscribes to a feed.
Msgboy.subscribe = function (url, force, callback) {
    // First, let's check if we have a subscription for this.
    var subscription = new Subscription({id: url});
    
    subscription.fetchOrCreate(function () {
        // Looks like there is a subscription.
        if ((subscription.needsRefresh() && subscription.attributes.state === "unsubscribed") || force) {
            subscription.setState("subscribing");
            subscription.bind("subscribing", function () {
                Msgboy.log.debug("subscribing to", url);
                Msgboy.connection.superfeedr.subscribe(url, function (result, feed) {
                    Msgboy.log.debug("subscribed to", url);
                    subscription.setState("subscribed");
                });
            });
            subscription.bind("subscribed", function () {
                callback(true);
            });
        }
        else {
            Msgboy.log.debug("Nothing to do for", url, "(", subscription.attributes.state , ")");
            callback(false);
        }
    });
};

// Unsubscribes from a feed.
Msgboy.unsubscribe = function (url, callback) {
    var subscription = new Subscription({id: url});
    subscription.fetchOrCreate(function () {
        subscription.setState("unsubscribing");
        subscription.bind("unsubscribing", function () {
            Msgboy.log.debug("unsubscribing from", url);
            Msgboy.connection.superfeedr.unsubscribe(url, function (result) {
                Msgboy.log.debug("unsubscribed", url);
                subscription.setState("unsubscribed");
            });
        });
        subscription.bind("unsubscribed", function () {
            callback(true);
        });
    });
};

// Makes sure there is no 'pending' susbcriptions.
Msgboy.resumeSubscriptions = function () {
    var subscriptions  = new Subscriptions();
    subscriptions.bind("add", function (subs) {
        Msgboy.log.debug("subscribing to", subs.id);
        Msgboy.connection.superfeedr.subscribe(subs.id, function (result, feed) {
            Msgboy.log.debug("subscribed to", subs.id);
            subs.setState("subscribed");
        });
    });
    subscriptions.pending();
    setTimeout(function () {
        Msgboy.resumeSubscriptions(); // Let's retry in 10 minutes.
    }, 1000 * 60 * 10);
};

exports.Msgboy = Msgboy;

});

require.define("/node_modules/underscore/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"underscore.js"}
});

require.define("/node_modules/underscore/underscore.js", function (require, module, exports, __dirname, __filename) {
//     Underscore.js 1.3.1
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore is freely distributable under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var slice            = ArrayProto.slice,
      unshift          = ArrayProto.unshift,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) { return new wrapper(obj); };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root['_'] = _;
  }

  // Current version.
  _.VERSION = '1.3.1';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    if (obj.length === +obj.length) results.length = obj.length;
    return results;
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError('Reduce of empty array with no initial value');
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var reversed = _.toArray(obj).reverse();
    if (context && !initial) iterator = _.bind(iterator, context);
    return initial ? _.reduce(reversed, iterator, memo, context) : _.reduce(reversed, iterator);
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    each(obj, function(value, index, list) {
      if (!iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if a given value is included in the array or object using `===`.
  // Aliased as `contains`.
  _.include = _.contains = function(obj, target) {
    var found = false;
    if (obj == null) return found;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    found = any(obj, function(value) {
      return value === target;
    });
    return found;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method || value : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Return the maximum element or (element-based computation).
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj)) return Math.max.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj)) return Math.min.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var shuffled = [], rand;
    each(obj, function(value, index, list) {
      if (index == 0) {
        shuffled[0] = value;
      } else {
        rand = Math.floor(Math.random() * (index + 1));
        shuffled[index] = shuffled[rand];
        shuffled[rand] = value;
      }
    });
    return shuffled;
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria, b = right.criteria;
      return a < b ? -1 : a > b ? 1 : 0;
    }), 'value');
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, val) {
    var result = {};
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    each(obj, function(value, index) {
      var key = iterator(value, index);
      (result[key] || (result[key] = [])).push(value);
    });
    return result;
  };

  // Use a comparator function to figure out at what index an object should
  // be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator) {
    iterator || (iterator = _.identity);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      iterator(array[mid]) < iterator(obj) ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(iterable) {
    if (!iterable)                return [];
    if (iterable.toArray)         return iterable.toArray();
    if (_.isArray(iterable))      return slice.call(iterable);
    if (_.isArguments(iterable))  return slice.call(iterable);
    return _.values(iterable);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return _.toArray(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head`. The **guard** check allows it to work
  // with `_.map`.
  _.first = _.head = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especcialy useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail`.
  // Especially useful on the arguments object. Passing an **index** will return
  // the rest of the values in the array from that index onward. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = function(array, index, guard) {
    return slice.call(array, (index == null) || guard ? 1 : index);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, function(value){ return !!value; });
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return _.reduce(array, function(memo, value) {
      if (_.isArray(value)) return memo.concat(shallow ? value : _.flatten(value));
      memo[memo.length] = value;
      return memo;
    }, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator) {
    var initial = iterator ? _.map(array, iterator) : array;
    var result = [];
    _.reduce(initial, function(memo, el, i) {
      if (0 == i || (isSorted === true ? _.last(memo) != el : !_.include(memo, el))) {
        memo[memo.length] = el;
        result[result.length] = array[i];
      }
      return memo;
    }, []);
    return result;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays. (Aliased as "intersect" for back-compat.)
  _.intersection = _.intersect = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = _.flatten(slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.include(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) results[i] = _.pluck(args, "" + i);
    return results;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i, l;
    if (isSorted) {
      i = _.sortedIndex(array, item);
      return array[i] === item ? i : -1;
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item);
    for (i = 0, l = array.length; i < l; i++) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item) {
    if (array == null) return -1;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) return array.lastIndexOf(item);
    var i = array.length;
    while (i--) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function bind(func, context) {
    var bound, args;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(func, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, throttling, more;
    var whenDone = _.debounce(function(){ more = throttling = false; }, wait);
    return function() {
      context = this; args = arguments;
      var later = function() {
        timeout = null;
        if (more) func.apply(context, args);
        whenDone();
      };
      if (!timeout) timeout = setTimeout(later, wait);
      if (throttling) {
        more = true;
      } else {
        func.apply(context, args);
      }
      whenDone();
      throttling = true;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds.
  _.debounce = function(func, wait) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      return memo = func.apply(this, arguments);
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func].concat(slice.call(arguments, 0));
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) { return func.apply(this, arguments); }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    return _.map(obj, _.identity);
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (obj[prop] == null) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function.
  function eq(a, b, stack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a._chain) a = a._wrapped;
    if (b._chain) b = b._wrapped;
    // Invoke a custom `isEqual` method if one is provided.
    if (a.isEqual && _.isFunction(a.isEqual)) return a.isEqual(b);
    if (b.isEqual && _.isFunction(b.isEqual)) return b.isEqual(a);
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = stack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (stack[length] == a) return true;
    }
    // Add the first object to the stack of traversed objects.
    stack.push(a);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          // Ensure commutative equality for sparse arrays.
          if (!(result = size in a == size in b && eq(a[size], b[size], stack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent.
      if ('constructor' in a != 'constructor' in b || a.constructor != b.constructor) return false;
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], stack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    stack.pop();
    return result;
  }

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType == 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Is a given variable an arguments object?
  _.isArguments = function(obj) {
    return toString.call(obj) == '[object Arguments]';
  };
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Is a given value a function?
  _.isFunction = function(obj) {
    return toString.call(obj) == '[object Function]';
  };

  // Is a given value a string?
  _.isString = function(obj) {
    return toString.call(obj) == '[object String]';
  };

  // Is a given value a number?
  _.isNumber = function(obj) {
    return toString.call(obj) == '[object Number]';
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    // `NaN` is the only value for which `===` is not reflexive.
    return obj !== obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value a date?
  _.isDate = function(obj) {
    return toString.call(obj) == '[object Date]';
  };

  // Is the given value a regular expression?
  _.isRegExp = function(obj) {
    return toString.call(obj) == '[object RegExp]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Has own property?
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function (n, iterator, context) {
    for (var i = 0; i < n; i++) iterator.call(context, i);
  };

  // Escape a string for HTML interpolation.
  _.escape = function(string) {
    return (''+string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
  };

  // Add your own custom functions to the Underscore object, ensuring that
  // they're correctly added to the OOP wrapper as well.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      addToWrapper(name, _[name] = obj[name]);
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /.^/;

  // Within an interpolation, evaluation, or escaping, remove HTML escaping
  // that had been previously added.
  var unescape = function(code) {
    return code.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(str, data) {
    var c  = _.templateSettings;
    var tmpl = 'var __p=[],print=function(){__p.push.apply(__p,arguments);};' +
      'with(obj||{}){__p.push(\'' +
      str.replace(/\\/g, '\\\\')
         .replace(/'/g, "\\'")
         .replace(c.escape || noMatch, function(match, code) {
           return "',_.escape(" + unescape(code) + "),'";
         })
         .replace(c.interpolate || noMatch, function(match, code) {
           return "'," + unescape(code) + ",'";
         })
         .replace(c.evaluate || noMatch, function(match, code) {
           return "');" + unescape(code).replace(/[\r\n\t]/g, ' ') + ";__p.push('";
         })
         .replace(/\r/g, '\\r')
         .replace(/\n/g, '\\n')
         .replace(/\t/g, '\\t')
         + "');}return __p.join('');";
    var func = new Function('obj', '_', tmpl);
    if (data) return func(data, _);
    return function(data) {
      return func.call(this, data, _);
    };
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // The OOP Wrapper
  // ---------------

  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.
  var wrapper = function(obj) { this._wrapped = obj; };

  // Expose `wrapper.prototype` as `_.prototype`
  _.prototype = wrapper.prototype;

  // Helper function to continue chaining intermediate results.
  var result = function(obj, chain) {
    return chain ? _(obj).chain() : obj;
  };

  // A method to easily add functions to the OOP wrapper.
  var addToWrapper = function(name, func) {
    wrapper.prototype[name] = function() {
      var args = slice.call(arguments);
      unshift.call(args, this._wrapped);
      return result(func.apply(_, args), this._chain);
    };
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      var wrapped = this._wrapped;
      method.apply(wrapped, arguments);
      var length = wrapped.length;
      if ((name == 'shift' || name == 'splice') && length === 0) delete wrapped[0];
      return result(wrapped, this._chain);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      return result(method.apply(this._wrapped, arguments), this._chain);
    };
  });

  // Start chaining a wrapped Underscore object.
  wrapper.prototype.chain = function() {
    this._chain = true;
    return this;
  };

  // Extracts the result from a wrapped and chained object.
  wrapper.prototype.value = function() {
    return this._wrapped;
  };

}).call(this);

});

require.define("/models/subscription.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneAdapter = require('../backbone-adapter.js');
var msgboyDatabase = require('./database.js').msgboyDatabase;

var Subscription = Backbone.Model.extend({
    storeName: "subscriptions",
    database: msgboyDatabase,
    defaults: {
        subscribed_at: 0,
        unsubscribed_at: 0,
        state: "unsubscribed"
    },
    initialize: function (attributes) {
    },
    fetchOrCreate: function (callback) {
        this.fetch({
            success: function () {
                // The subscription exists!
                callback();
            }.bind(this),
            error: function () {
                // There is no such subscription.
                // Let's save it, then!
                this.save(this.attributes, {
                    success: function () {
                        callback();
                    },
                    error: function () {
                        // We're screwed.
                    }
                });
            }.bind(this)
        });
    },
    needsRefresh: function () {
        if (this.attributes.subscribed_at < new Date().getTime() - 1000 * 60 * 60 * 24 * 7 && this.attributes.unsubscribed_at < new Date().getTime() - 1000 * 60 * 60 * 24 * 31) {
            for (var i in Blacklist) {
                if (!this.attributes.id || this.attributes.id.match(Blacklist[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    },
    setState: function (_state) {
        switch (_state) {
        case "subscribed":
            this.save({state: _state, subscribed_at: new Date().getTime()}, {
                success: function () {
                    this.trigger("subscribed");
                }.bind(this)
            });
            break;
        case "unsubscribed":
            this.save({state: _state, unsubscribed_at: new Date().getTime()}, {
                success: function () {
                    this.trigger("unsubscribed");
                }.bind(this)
            });
            break;
        default:
            this.save({state: _state}, {
                success: function () {
                    this.trigger(_state);
                }.bind(this),
                error: function (o, e) {
                    // Dang
                }
            });
        }
    }
});

var Subscriptions = Backbone.Collection.extend({
    storeName: "subscriptions",
    database: msgboyDatabase,
    model: Subscription,
    pending: function () {
        this.fetch({
            conditions: {state: "subscribing"},
            addIndividually: true,
            limit: 100
        });
    },
    clear: function () {
        this.fetch({
            clear: true
        });
    }
});

var Blacklist = [
    /.*wikipedia\.org\/.*/
];

exports.Subscription = Subscription;
exports.Subscriptions = Subscriptions;

});

require.define("/models/database.js", function (require, module, exports, __dirname, __filename) {
var msgboyDatabase = {
    functions: {
        eachBlock: function (a, i, d) {
            var e = a.pop();
            if (e) {
                i(e, function () {
                    msgboyDatabase.functions.eachBlock(a, i, d);
                });
            } else {
                d();
            }
        }
    },
    id: "msgboy-database",
    description: "The database for the msgboy",
    migrations: [{
        version: "0.0.1",
        migrate: function (db, versionRequest, next) {
            db.createObjectStore("messages");
            db.createObjectStore("inbox");
            next();
        }
    }, {
        version: "0.0.2",
        migrate: function (db, versionRequest, next) {
            var store = versionRequest.transaction.objectStore("messages");
            store.createIndex("createdAtIndex", "created_at", {
                unique: false
            });
            next();
        }
    }, {
        version: "0.0.3",
        migrate: function (db, versionRequest, next) {
            var store = versionRequest.transaction.objectStore("messages");
            store.createIndex("readAtIndex", "read_at", {
                unique: false
            });
            store.createIndex("unreadAtIndex", "unread_at", {
                unique: false
            });
            store.createIndex("starredAtIndex", "starred_at", {
                unique: false
            });
            next();
        }
    }, {
        version: "0.0.4",
        migrate: function (db, versionRequest, next) {
            var store = db.createObjectStore("feeds");
            store.createIndex("urlIndex", "url", {
                unique: false
            });
            next();
        }
    }, {
        version: "0.0.5",
        migrate: function (db, versionRequest, next) {
            var store = versionRequest.transaction.objectStore("messages");
            store.createIndex("alternateIndex", "alternate", {
                unique: false
            });
            store.createIndex("hostIndex", "host", {
                unique: false
            });
            next();
        },
        before: function (db, next) {
            var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
            var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction; // No prefix in moz
            var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange; // No prefix in moz
            // We need to add the missing fields, on the host, and the feed's alternate url.
            var transaction = db.transaction(["messages"], IDBTransaction.READ_ONLY);
            var store = transaction.objectStore("messages");
            var cursor = store.openCursor();
            var messagesToSave = [];
            cursor.onsuccess = function (e) {
                cursor = e.target.result;
                if (cursor) {
                    if (typeof (cursor.value.host) === "undefined" || typeof (cursor.value.alternate) === "undefined" || !cursor.value.host || !cursor.value.alternate) {
                        messagesToSave.push(cursor.value);
                    }
                    cursor._continue();
                }
            };
            transaction.oncomplete = function () {
                msgboyDatabase.functions.eachBlock(messagesToSave, function (message, next) {
                    var writeTransaction = db.transaction(["messages"], IDBTransaction.READ_WRITE);
                    var store = writeTransaction.objectStore("messages");
                    message.host = "";
                    message.alternate = "";
                    var writeRequest = store.put(message, message.id);
                    writeRequest.onerror = function (e) {
                        Msgboy.log.error("There was an error. Migration will fail. Plese reload browser.");
                        next();
                    };
                    writeRequest.onsuccess = function (e) {
                        next();
                    };
                }, function () {
                    next();
                });
            };
        }
    }, {
        version: "0.0.6",
        migrate: function (db, versionRequest, next) {
            var store = versionRequest.transaction.objectStore("messages");
            store.createIndex("alternateNewIndex", "alternate_new", {
                unique: false
            });
            next();
        },
        before: function (db, next) {
            var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
            var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction; // No prefix in moz
            var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange; // No prefix in moz
            // We need to add the missing fields, on the host, and the feed's alternate url.
            var transaction = db.transaction(["messages"], IDBTransaction.READ_ONLY);
            var store = transaction.objectStore("messages");
            var cursor = store.openCursor();
            var messagesToSave = [];
            cursor.onsuccess = function (e) {
                cursor = e.target.result;
                if (cursor) {
                    if (typeof (cursor.value.alternate_new) === "undefined" || !cursor.value.alternate_new) {
                        messagesToSave.push(cursor.value);
                    }
                    cursor._continue();
                }
            };
            transaction.oncomplete = function () {
                msgboyDatabase.functions.eachBlock(messagesToSave, function (message, next) {
                    var writeTransaction = db.transaction(["messages"], IDBTransaction.READ_WRITE);
                    var store = writeTransaction.objectStore("messages");
                    message.alternate_new = "";
                    var writeRequest = store.put(message, message.id);
                    writeRequest.onerror = function (e) {
                        Msgboy.log.error("There was an error. Migration will fail. Plese reload browser.");
                        next();
                    };
                    writeRequest.onsuccess = function (e) {
                        next();
                    };
                }, function () {
                    next();
                });
            };
        }
    }, {
        version: "0.0.7",
        migrate: function (db, versionRequest, next) {
            var store = versionRequest.transaction.objectStore("messages");
            store.createIndex("stateIndex", "state", {
                unique: false
            });
            next();
        },
        before: function (db, next) {
            var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
            var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction; // No prefix in moz
            var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange; // No prefix in moz
            var transaction = db.transaction(["messages"], IDBTransaction.READ_ONLY);
            var store = transaction.objectStore("messages");
            var cursor = store.openCursor();
            var messagesToSave = [];
            cursor.onsuccess = function (e) {
                cursor = e.target.result;
                if (cursor) {
                    if (typeof (cursor.value.state) === "undefined" || !cursor.value.state) {
                        messagesToSave.push(cursor.value);
                    }
                    cursor._continue();
                }
            };
            transaction.oncomplete = function () {
                msgboyDatabase.functions.eachBlock(messagesToSave, function (message, next) {
                    var writeTransaction = db.transaction(["messages"], IDBTransaction.READ_WRITE);
                    var store = writeTransaction.objectStore("messages");
                    message.state = "new";
                    var writeRequest = store.put(message, message.id);
                    writeRequest.onerror = function (e) {
                        Msgboy.log.debug("There was an error. Migration will fail. Plese reload browser.");
                        next();
                    };
                    writeRequest.onsuccess = function (e) {
                        next();
                    };
                }, function () {
                    next();
                });
            };
        }
    }, {
        version: "0.0.8",
        migrate: function (db, versionRequest, next) {
            var store = versionRequest.transaction.objectStore("messages");
            store.createIndex("feedIndex", "feed", {
                unique: false
            });
            next();
        },
        before: function (db, next) {
            var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
            var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction; // No prefix in moz
            var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange; // No prefix in moz
            var transaction = db.transaction(["messages"], IDBTransaction.READ_ONLY);
            var store = transaction.objectStore("messages");
            var cursor = store.openCursor();
            var messagesToSave = [];
            cursor.onsuccess = function (e) {
                cursor = e.target.result;
                if (cursor) {
                    if (typeof (cursor.value.feed) === "undefined" || !cursor.value.feed) {
                        messagesToSave.push(cursor.value);
                    }
                    cursor._continue();
                }
            };
            transaction.oncomplete = function () {
                msgboyDatabase.functions.eachBlock(messagesToSave, function (message, next) {
                    var writeTransaction = db.transaction(["messages"], IDBTransaction.READ_WRITE);
                    var store = writeTransaction.objectStore("messages");
                    message.feed = message.source.url;
                    var writeRequest = store.put(message, message.id);
                    writeRequest.onerror = function (e) {
                        Msgboy.log.debug("There was an error. Migration will fail. Plese reload browser.");
                        next();
                    };
                    writeRequest.onsuccess = function (e) {
                        next();
                    };
                }, function () {
                    next();
                });
            };
        }
    }, {
        version: "0.0.9",
        migrate: function (db, versionRequest, next) {
            var subscriptions = db.createObjectStore("subscriptions");
            subscriptions.createIndex("stateIndex", "state", {unique: false});
            subscriptions.createIndex("subscribedAtIndex", "subscribed_at", {unique: false});
            subscriptions.createIndex("unsubscribedAtIndex", "unsubscribed_at", {unique: false});
            next();
        }
    }]
};

exports.msgboyDatabase = msgboyDatabase
});

require.define("/models/archive.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneAdapter = require('../backbone-adapter.js');
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Message = require('./message.js').Message;

var Archive = Backbone.Collection.extend({
    storeName: "messages",
    database: msgboyDatabase,
    model: Message,

    initialize: function () {
    },
    comparator: function (message) {
        return - (message.attributes.created_at);
    },
    each: function (condition) {
        this.fetch({
            conditions: condition,
            addIndividually: true
        });
    },
    next: function (number, condition) {
        options = {
            conditions: condition,
            limit: number,
            addIndividually: true
        };
        this.fetch(options);
    },
    forFeed: function (_feed) {
        this.fetch({feed: _feed});
    }
});

exports.Archive = Archive;
});

require.define("/models/message.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery');
var parseUri = require('../utils.js').parseUri;
var Backbone = require('backbone');
var BackboneAdapter = require('../backbone-adapter.js');
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Archive = require('./archive.js').Archive;

var Message = Backbone.Model.extend({
    storeName: "messages",
    database: msgboyDatabase,
    defaults: {
        "title":        null,
        "atom_id":      null,
        "summary":      null,
        "content":      null,
        "links":        {},
        "read_at":      0,
        "unread_at":    0,
        "starred_at":   0,
        "created_at":   0,
        "source":       {},
        "host":         "",
        "alternate":    "",
        "alternate_new": "",
        "state":        "new",
        "feed":         "",
        "relevance":    0.3
    },
    /* Initializes the messages */
    initialize: function (attributes) {
        if (attributes.source && attributes.source.links && attributes.source.links.alternate && attributes.source.links.alternate["text/html"] && attributes.source.links.alternate["text/html"][0]) {
            attributes.alternate = attributes.source.links.alternate["text/html"][0].href;
            attributes.host = parseUri(attributes.source.links.alternate["text/html"][0].href).host;
            attributes.alternate_new = parseUri(attributes.alternate).toString();
        }
        this.attributes = attributes;
        if (this.attributes.unread_at === 0) {
            this.attributes.unread_at = new Date().getTime();
        }
        if (this.attributes.created_at === 0) {
            this.attributes.created_at = new Date().getTime();
        }
        // create container for similar messages
        this.messages = new Backbone.Collection();
        this.messages.comparator = function(message) {
            return -message.attributes.created_at;
        }
        this.messages.add(this); // add ourselves
        return this;
    },
    /* Returns the state of the message
    Valid states include :
    - new
    - up-ed
    - down-ed
    - skipped */
    state: function () {
        return this.attributes.state;
    },
    /* Votes the message up */
    voteUp: function () {
        this.setState("up-ed");
    },
    /* Votes the message down */
    voteDown: function () {
        this.setState("down-ed", function (result) {
            // We need to unsubscribe the feed if possible, but only if there is enough negative votes.
            var brothers = new Archive();
            brothers.forFeed(this.attributes.feed);
            
            brothers.bind('reset', function () {
                var states = relevanceMath.percentages(brothers.pluck("state"), ["new", "up-ed", "down-ed", "skipped"], function (member, index) {
                    return 1;
                });
                var counts = relevanceMath.counts(brothers.pluck("state"));
                if (brothers.length > 3 && (!states["up-ed"] || states["up-ed"] < 0.05) && (states["down-ed"] > 0.5 || counts["down-ed"] > 5)) {
                    this.trigger('unsubscribe');
                }
            }.bind(this));
        }.bind(this));
    },
    /* Skip the message */
    skip: function (callback) {
        this.setState("skipped", callback);
    },
    /* Sets the state for the message */
    setState: function (_state, callback) {
        this.save({
            state: _state
        }, {
            success: function () {
                if (typeof(callback) !== "undefined" && callback) {
                    callback(true);
                }
                this.trigger(_state, this);
            }.bind(this),
            error: function () {
                Msgboy.log.debug("We couldn't save", this.id);
                if (typeof(callback) !== "undefined" && callback) {
                    callback(false);
                }
            }.bind(this)
        });
    },
    /* This calculates the relevance for this message and sets it. */
    /* It just calculates the relevance and does not save it. */
    calculateRelevance: function (callback) {
        // See Section 6.3 in Product Requirement Document.
        // We need to get all the messages from this source.
        // Count how many have been voted up, how many have been voted down.
        // First, let's pull all the messages from the same source.
        var brothers = new Archive();
        brothers.comparator = function (brother) {
            return brother.attributes.created_at;
        };
        brothers.forFeed(this.attributes.feed);
        brothers.bind('reset', function () {
            var relevance = 0.7; // This is the default relevance
            if (brothers.length > 0) {
                // So, now, we need to check the ratio of up-ed and down-ed. [TODO : limit the subset?].
                relevance =  this.relevanceBasedOnBrothers(brothers.pluck("state"));
            }
            // Keywords [TODO]
            // Check when the feed was susbcribed. Add bonus if it's recent! [TODO].
            if (typeof(callback) !== "undefined" && callback) {
                callback(relevance);
            }
        }.bind(this));
    },
    relevanceBasedOnBrothers: function (states) {
        if (states.length === 0) {
            return 1;
        }
        else {
            var percentages = relevanceMath.percentages(states, ["new", "up-ed", "down-ed", "skipped"]);

            return relevanceMath.average(percentages, {
                "new" : 0.6,
                "up-ed": 1.0,
                "down-ed": 0.0,
                "skipped": 0.4
            });
        }
    },
    /* Returns the number of links*/
    numberOfLinks: function () {
        return 5;
    },
    /*return the links to the media included in this doc*/
    mediaIncluded: function () {
        return [];
    },
    mainLink: function () {
        if (this.attributes.links.alternate) {
            if (this.attributes.links.alternate["text/html"]) {
                return this.attributes.links.alternate["text/html"][0].href;
            }
            else {
                // Hum, let's see what other types we have!
                return "";
            }
        }
        else {
            return "";
        }
    },
    sourceLink: function () {
        if (this.attributes.source && this.attributes.source.links && this.attributes.source.links.alternate && this.attributes.source.links.alternate["text/html"] && this.attributes.source.links.alternate["text/html"][0]) {
            return this.attributes.source.links.alternate["text/html"][0].href;
        }
        else {
            return "";
        }
    },
    // This returns the longest text!
    text: function () {
        if (this.get('content')) {
            if (this.get('summary') && this.get('summary').length > this.get('content').length) {
                return this.get('summary');
            }
            else {
                return this.get('content');
            }
        }
        else if (this.get('summary')) {
            return this.get('summary');
        }
        else {
            return "...";
        }
    },
    faviconUrl: function () {
        return "http://g.etfv.co/" + this.sourceLink() + "?defaulticon=lightpng";
    }
});

exports.Message = Message;

var relevanceMath = {
    counts: function (array, defaults, weight) {
        var counts = {}, sum = 0;
        _.each(array, function (element, index, list) {
            if (!counts[element]) {
                counts[element] = 0;
            }
            if (typeof(weight) !== "undefined") {
                counts[element] += weight(element, index);
            }
            else {
                counts[element] += 1;
            }
        });
        sum = _.reduce(counts, function (memo, num) {
            return memo + num;
        }, 0);
        return counts;
    },
    // Returns the percentages of each element in an array.
    percentages: function (array) {
        var counts = {}, percentages = {}, sum = 0;
        _.each(array, function (element, index, list) {
            if (!counts[element]) {
                counts[element] = 0;
            }
            counts[element] += 1;
        });
        sum = _.reduce(counts, function (memo, num) {
            return memo + num;
        }, 0);
        _.each(_.keys(counts), function (key) {
            percentages[key] = counts[key] / sum;
        });
        return percentages;
    },
    // Returns the average based on the weights and the percentages.
    average: function (percentages, weights) {
        var sum = 0, norm = 0;
        _.each(_.keys(percentages), function (key) {
            sum += percentages[key] * weights[key];
            norm += percentages[key];
        });
        if (norm === 0) {
            return sum;
        } else {
            return sum / norm;
        }
        return sum;
    }
};

exports.relevanceMath = relevanceMath;

// Welcome messages
var welcomeMessages = [{
    "title": "Welcome to msgboy!",
    "ungroup": true,
    "atom_id": "welcome-" + new Date().getTime(),
    "summary": "<img src='/views/images/msgboy-help-screen-1.png' />",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "read_at": 0,
    "unread_at": new Date().getTime(),
    "starred_at": 0,
    "created_at": new Date().getTime(),
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "host": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "alternate_new": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 1.0,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Bookmark sites you love.",
    "ungroup": true,
    "atom_id": "vote-plus" + new Date().getTime(),
    "summary": "<img src='/views/images/msgboy-help-screen-2.png' />",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "read_at": 0,
    "unread_at": new Date().getTime(),
    "starred_at": 0,
    "created_at": new Date().getTime() - 1000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "host": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "alternate_new": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Newly posted stories appear in realtime.",
    "ungroup": true,
    "atom_id": "vote-minus-" + new Date().getTime(),
    "summary": "<img src='/views/images/msgboy-help-screen-3.png' />",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "read_at": 0,
    "unread_at": new Date().getTime(),
    "starred_at": 0,
    "created_at": new Date().getTime() - 2000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "host": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "alternate_new": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Train msgboy to give you what you want.",
    "ungroup": true,
    "atom_id": "bookmark-" + new Date().getTime(),
    "summary": "<img src='/views/images/msgboy-help-screen-5.png' />",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "read_at": 0,
    "unread_at": new Date().getTime(),
    "starred_at": 0,
    "created_at": new Date().getTime() - 3000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "host": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "alternate_new": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Click '+' for more like this.",
    "ungroup": true,
    "atom_id": "bookmark-" + new Date().getTime(),
    "summary": "<img src='/views/images/msgboy-help-screen-6.png' />",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "read_at": 0,
    "unread_at": new Date().getTime(),
    "starred_at": 0,
    "created_at": new Date().getTime() - 4000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "host": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "alternate_new": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.8,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Hit '-' if you're not interested.",
    "ungroup": true,
    "atom_id": "bookmark-" + new Date().getTime(),
    "summary": "<img src='/views/images/msgboy-help-screen-7.png' />",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "read_at": 0,
    "unread_at": new Date().getTime(),
    "starred_at": 0,
    "created_at": new Date().getTime() - 5000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "host": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "alternate_new": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Follow and rate stories with notifications.",
    "ungroup": true,
    "atom_id": "bookmark-" + new Date().getTime(),
    "summary": "<img src='/views/images/msgboy-help-screen-8.png' />",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "read_at": 0,
    "unread_at": new Date().getTime(),
    "starred_at": 0,
    "created_at": new Date().getTime() - 6000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "host": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "alternate_new": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "You can throttle notifications in settings.",
    "ungroup": true,
    "atom_id": "bookmark-" + new Date().getTime(),
    "summary": "<img src='/views/images/msgboy-help-screen-9.png' />",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "read_at": 0,
    "unread_at": new Date().getTime(),
    "starred_at": 0,
    "created_at": new Date().getTime() - 7000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "host": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "alternate_new": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}
];

exports.welcomeMessages = welcomeMessages;

});

require.define("/utils.js", function (require, module, exports, __dirname, __filename) {
Uri = function () {
    // and URI object
};

Uri.prototype = {
    toString: function () {
        str = '';
        if (this.protocol) {
            str += this.protocol + "://";
        }
        if (this.authority) {
            str += this.authority;
        }
        if (this.relative) {
            str += this.relative;
        }
        if (this.relative === "") {
            str += "/";
        }
        return str;
    }
};

function parseUri(str) {
    var o = parseUri.options,
    m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
    uri = new Uri(),
    i   = 14;
    while (i--) {
        uri[o.key[i]] = m[i] || "";
    }
    uri[o.q.name] = {};
    uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
        if ($1) {
            uri[o.q.name][$1] = $2;
        }
    });
    return uri;
}

parseUri.options = {
    strictMode: false,
    key: ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"],
    q:   {
        name:   "queryKey",
        parser: /(?:^|&)([^&=]*)=?([^&]*)/g
    },
    parser: {
        strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
        loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
    }
};

exports.parseUri = parseUri;

// Hopefully this should be part of the regular Msgboy
if (typeof Msgboy === "undefined") {
    var Msgboy = {};
}

// Let's define the helper module.
if (typeof Msgboy.helper === "undefined") {
    Msgboy.helper = {};
}

// Feediscovery module. The only API that needs to be used is the Msgboy.helper.feediscovery.get
Msgboy.helper.feediscovery = {};
Msgboy.helper.feediscovery.stack = [];
Msgboy.helper.feediscovery.get = function (_url, _callback) {
    Msgboy.helper.feediscovery.stack.push([_url, _callback]);
};
Msgboy.helper.feediscovery.run = function () {
    var next = Msgboy.helper.feediscovery.stack.shift();
    if (next) {
        $.ajax({url: "http://feediscovery.appspot.com/",
            data: {url: next[0]},
            success: function (data) {
                next[1](JSON.parse(data));
                Msgboy.helper.feediscovery.run();
            },
            error: function () {
                // Let's restack, in the back.
                Msgboy.helper.feediscovery.get(next[0], next[1]);
            }
        });
    } else {
        setTimeout(function () {
            Msgboy.helper.feediscovery.run();
        }, 1000);
    }
};
Msgboy.helper.feediscovery.run();


// The DOM cleaner
Msgboy.helper.cleaner = {};
// This function, which requires JQUERY cleans up the HTML that it includes
Msgboy.helper.cleaner.html = function (string) {
    // We must remove the <script> tags from the string first.
    string = string.replace(/(<script([^>]+)>.*<\/script>)/ig, ' ');
    var div = $("<div/>").html(string);
    var cleaned = $(Msgboy.helper.cleaner.dom(div.get()));
    return cleaned.html();
};

Msgboy.helper.cleaner.dom = function (element) {
    $.each($(element).children(), function (index, child) {
        if (child.nodeName === "IMG") {
            if (Msgboy.helper.element.original_size.width < 2 || Msgboy.helper.element.original_size.height < 2) {
                Msgboy.helper.cleaner.remove(child);
            }
            else {
                var src = $(child).attr("src");
                if (!src) {
                    Msgboy.helper.cleaner.remove(child);
                }
                else if (src.match("http://rss.feedsportal.com/.*/*.gif")) {
                    Msgboy.helper.cleaner.remove(child);
                }
                else if (src.match("http://da.feedsportal.com/.*/*.img")) {
                    Msgboy.helper.cleaner.remove(child);
                }
                else if (src.match("http://ads.pheedo.com/img.phdo?.*")) {
                    Msgboy.helper.cleaner.remove(child);
                }
                else if (src.match("http://feedads.g.doubleclick.net/~at/.*")) {
                    Msgboy.helper.cleaner.remove(child);
                }
            }
        }
        else if (child.nodeName === "P") {
            if (child.childNodes.length === 0) {
                Msgboy.helper.cleaner.remove(child);
            }
        }
        else if (child.nodeName === "NOSCRIPT") {
            Msgboy.helper.cleaner.remove(child);
        }
        else if (child.nodeName === "IFRAME") {
            Msgboy.helper.cleaner.remove(child);
        }
        else if (child.nodeName === "DIV") {
            if (child.childNodes.length === 0) {
                Msgboy.helper.cleaner.remove(child);
            }
            else {
                if (child.innerHTML.replace(/(<([^>]+)>)/ig, "").replace(/[^a-zA-Z 0-9 ]+/g, "").replace(/^\s+|\s+$/g, "") === "") {
                    Msgboy.helper.cleaner.remove(child);
                }
            }
        }
        else if (child.nodeName === "CENTER") {
            // We need to replace this with a p. We don't want specific formats...
            var p = document.createElement("P");
            p.innerHTML = child.innerHTML;
            child.parentNode.replaceChild(p, child);
            child = p;
        }
        else if (child.nodeName === "FONT") {
            // Let's replace with a span. We don't want specific formats!
            var span = document.createElement("SPAN");
            span.innerHTML = child.innerHTML;
            child.parentNode.replaceChild(span, child);
            child = span;
        }
        else if (child.nodeName === "BR") {
            Msgboy.helper.cleaner.remove(child);
        }
        else if (child.nodeName === "OBJECT") {
            Msgboy.helper.cleaner.remove(child);
        }
        else if (child.nodeName === "SCRIPT") {
            Msgboy.helper.cleaner.remove(child);
        }
        else if ($(child).hasClass("mf-viral") || $(child).hasClass("feedflare")) {
            Msgboy.helper.cleaner.remove(child);
        }
        // Remove style attributes
        $(child).removeAttr("style");
        $(child).removeAttr("align");
        $(child).removeAttr("width");
        $(child).removeAttr("height");
        $(child).removeAttr("class");
        $(child).removeAttr("border");
        $(child).removeAttr("cellpadding");
        $(child).removeAttr("cellspacing");
        $(child).removeAttr("valign");
        $(child).removeAttr("border");
        $(child).removeAttr("hspace");
        $(child).removeAttr("vspace");
        Msgboy.helper.cleaner.dom(child);
    });
    return element;
};
Msgboy.helper.cleaner.remove = function (element) {
    var parent = element.parentNode;
    if (parent) {
        parent.removeChild(element);
        if (parent.childNodes.length === 0) {
            Msgboy.helper.cleaner.remove(parent);
        }
    }
};

// Helper for the DOM elements
Msgboy.helper.element = {};
// Returns the original size of the element.
Msgboy.helper.element.original_size = function (el) {
    var clone = $(el).clone();
    clone.css("display", "none");
    clone.removeAttr('height');
    clone.removeAttr('width');
    clone.appendTo($("body"));
    var sizes = {width: clone.width(), height: clone.height()};
    clone.remove();
    return sizes;
};

// Helpers for maths
Msgboy.helper.maths = {};
// Helpers for arrays of elements
Msgboy.helper.maths.array = {};
Msgboy.helper.maths.array.normalized_deviation = function (array) {
    return Msgboy.helper.maths.array.deviation(array) / Msgboy.helper.maths.array.average(array);
};
Msgboy.helper.maths.array.deviation = function (array) {
    var avg = Msgboy.helper.maths.array.average(array);
    var count = array.length;
    var i = count - 1;
    var v = 0;
    while (i >= 0) {
        v += Math.pow((array[i] - avg), 2);
        i = i - 1;
    }
    return Math.sqrt(v / count);
};
Msgboy.helper.maths.array.average = function (array) {
    var count = array.length;
    var i = count - 1;
    var sum = 0;
    while (i >= 0) {
        sum += array[i];
        i = i - 1;
    }
    return sum / count;
};
// Helpers for numbers
Msgboy.helper.maths.number = {};
Msgboy.helper.maths.number.fibonacci = function (n) {
    var o;
    if (n < 0) {
        return 0;
    }
    else if (n < 2) {
        return n;
    }
    else {
        return Msgboy.helper.maths.number.fibonacci(n - 1) + Msgboy.helper.maths.number.fibonacci(n - 2);
    }
    // return n < 2 ? n : n % 2 ? (o = Msgboy.helper.maths.number.fibonacci(n = -(-n >> 1))) * o + (o = Msgboy.helper.maths.number.fibonacci(n - 1)) * o : (Msgboy.helper.maths.number.fibonacci(n >>= 1) + 2 * Msgboy.helper.maths.number.fibonacci(n - 1)) * Msgboy.helper.maths.number.fibonacci(n);
};




});

require.define("/views/archive-view.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneAdapter = require('../backbone-adapter.js');
var Isotope = require('../jquery.isotope.min.js');
var Archive = require('../models/archive.js');
var MessageView = require('./message-view.js').MessageView;

var ArchiveView = Backbone.View.extend({
    upperDound: new Date().getTime(),
    lowerBound: 0,
    loaded: 0,
    toLoad: 50,
    events: {
    },
    initialize: function () {
        _.bindAll(this, 'showNew', 'completePage', 'loadNext');
        $(document).scroll(this.completePage);

        $('#container').isotope({
            itemSelector: '.message',
            filter: '.brick-2 .brick-3 .brick-4',
            masonry: {
                columnWidth: 10,
            }
        });
        
        this.loadingTimes =[];
        this.loaded = this.toLoad;
        this.collection.bind('add', this.showNew);
        this.loadNext();
    },
    completePage: function () {
        if ($("#container").height() < $(window).height()) {
            // We should also pre-emptively load more pages if the document is shorter than the page.
            this.loadNext();
        } else if ($(window).scrollTop() > $(document).height() - $(window).height() - 300) {
            // We're close to the bottom. Let's load an additional page!
            this.loadNext();
        }
    },
    loadNext: function () {
        if (this.loaded === this.toLoad) {
            this.loaded = 0; // Reset the loaded counter!
            this.collection.next(this.toLoad, {
                created_at: [this.upperDound, this.lowerBound]
            });
        }
    },
    showNew: function (message) {
        this.upperDound = message.attributes.created_at;
        this.loaded++;
        if(message.attributes.state !== "down-ed" && Math.ceil(message.attributes.relevance * 4) > 1) {
            message.bind('up-ed', function() {
                $('#container').isotope('reLayout');
            });

            message.bind('down-ed', function() {
                $('#container').isotope('reLayout');
            });

            message.bind('destroy', function() {
                $('#container').isotope('reLayout');
            });
            
            message.bind('expanded', function() {
                $('#container').isotope('reLayout');
            })

            message.bind('unsubscribed', function() {
                var brothers = new Archive(); 
                brothers.forFeed(message.get('feed'));
                brothers.bind('reset', function() {
                    _.each(brothers.models, function(brother) {
                        brother = this.collection.get(brother.id) || brother; // Rebinding to the right model.
                        brother.destroy(); // Deletes the brothers 
                    }.bind(this));
                }.bind(this));
            }.bind(this));

            var view = new MessageView({
                model: message
            });
            
            view.bind('rendered', function() {
                this.completePage();
                $('#container').append(view.el); // Adds the view in the document.
                $('#container').isotope('appended', $(view.el));
            }.bind(this));

            // Check if we can group the messages
            if (this.lastParentView && this.lastParentView.model.get('alternate') === message.get('alternate') && !message.get('ungroup')) {
                this.lastParentView.model.messages.add(message);
                $(view.el).addClass('brother'); // Let's show this has a brother!
                view.render(); // We can render it as well as nobody cares about it for now.
            }
            else {
                if(this.lastParentView) {
                    this.lastParentView.render();
                }
                this.lastParentView = view;
            }
        }
    }
});

exports.ArchiveView = ArchiveView;

});

require.define("/jquery.isotope.min.js", function (require, module, exports, __dirname, __filename) {
/**
 * Isotope v1.5.08
 * An exquisite jQuery plugin for magical layouts
 * http://isotope.metafizzy.co
 *
 * Commercial use requires one-time license fee
 * http://metafizzy.co/#licenses
 *
 * Copyright 2011 David DeSandro / Metafizzy
 */

/*jshint curly: true, eqeqeq: true, forin: false, immed: false, newcap: true, noempty: true, undef: true */
/*global Modernizr: true, jQuery: true */

(function( window, $, undefined ){

  'use strict';

  // helper function
  var capitalize = function( str ) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // ========================= getStyleProperty by kangax ===============================
  // http://perfectionkills.com/feature-testing-css-properties/

  var prefixes = 'Moz Webkit O Ms'.split(' ');

  var getStyleProperty = function( propName ) {
    var style = document.documentElement.style,
        prefixed;

    // test standard property first
    if ( typeof style[propName] === 'string' ) {
      return propName;
    }

    // capitalize
    propName = capitalize( propName );

    // test vendor specific properties
    for ( var i=0, len = prefixes.length; i < len; i++ ) {
      prefixed = prefixes[i] + propName;
      if ( typeof style[ prefixed ] === 'string' ) {
        return prefixed;
      }
    }
  };

  var transformProp = getStyleProperty('transform'),
      transitionProp = getStyleProperty('transitionProperty');
      

  // ========================= miniModernizr ===============================
  // <3<3<3 and thanks to Faruk and Paul for doing the heavy lifting

  /*!
   * Modernizr v1.6ish: miniModernizr for Isotope
   * http://www.modernizr.com
   *
   * Developed by: 
   * - Faruk Ates  http://farukat.es/
   * - Paul Irish  http://paulirish.com/
   *
   * Copyright (c) 2009-2010
   * Dual-licensed under the BSD or MIT licenses.
   * http://www.modernizr.com/license/
   */

  /*
   * This version whittles down the script just to check support for
   * CSS transitions, transforms, and 3D transforms.
  */
  
  var tests = {
    csstransforms: function() {
      return !!transformProp;
    },

    csstransforms3d: function() {
      var test = !!getStyleProperty('perspective');
      // double check for Chrome's false positive
      if ( test ) {
        var vendorCSSPrefixes = ' -o- -moz- -ms- -webkit- -khtml- '.split(' '),
            mediaQuery = '@media (' + vendorCSSPrefixes.join('transform-3d),(') + 'modernizr)',
            $style = $('<style>' + mediaQuery + '{#modernizr{height:3px}}' + '</style>')
                        .appendTo('head'),
            $div = $('<div id="modernizr" />').appendTo('html');

        test = $div.height() === 3;

        $div.remove();
        $style.remove();
      }
      return test;
    },

    csstransitions: function() {
      return !!transitionProp;
    }
  };

  if ( window.Modernizr ) {
    // if there's a previous Modernzir, check if there are necessary tests
    for ( var testName in tests) {
      if ( !Modernizr.hasOwnProperty( testName ) ) {
        // if test hasn't been run, use addTest to run it
        Modernizr.addTest( testName, tests[ testName ] );
      }
    }
  } else {
    // or create new mini Modernizr that just has the 3 tests
    window.Modernizr = (function(){

      var miniModernizr = {
            _version : '1.6ish: miniModernizr for Isotope'
          },
          classes = ' ',
          result, testName;

      // Run through tests
      for ( testName in tests) {
        result = tests[ testName ]();
        miniModernizr[ testName ] = result;
        classes += ' ' + ( result ?  '' : 'no-' ) + testName;
      }

      // Add the new classes to the <html> element.
      $('html').addClass( classes );

      return miniModernizr;
    })();
  }



  // ========================= isoTransform ===============================

  /**
   *  provides hooks for .css({ scale: value, translate: [x, y] })
   *  Progressively enhanced CSS transforms
   *  Uses hardware accelerated 3D transforms for Safari
   *  or falls back to 2D transforms.
   */
  
  if ( Modernizr.csstransforms ) {
    
        // i.e. transformFnNotations.scale(0.5) >> 'scale3d( 0.5, 0.5, 1)'
    var transformFnNotations = Modernizr.csstransforms3d ? 
      { // 3D transform functions
        translate : function ( position ) {
          return 'translate3d(' + position[0] + 'px, ' + position[1] + 'px, 0) ';
        },
        scale : function ( scale ) {
          return 'scale3d(' + scale + ', ' + scale + ', 1) ';
        }
      } :
      { // 2D transform functions
        translate : function ( position ) {
          return 'translate(' + position[0] + 'px, ' + position[1] + 'px) ';
        },
        scale : function ( scale ) {
          return 'scale(' + scale + ') ';
        }
      }
    ;

    var setIsoTransform = function ( elem, name, value ) {
          // unpack current transform data
      var data =  $.data( elem, 'isoTransform' ) || {},
          newData = {},
          fnName,
          transformObj = {},
          transformValue;

      // i.e. newData.scale = 0.5
      newData[ name ] = value;
      // extend new value over current data
      $.extend( data, newData );

      for ( fnName in data ) {
        transformValue = data[ fnName ];
        transformObj[ fnName ] = transformFnNotations[ fnName ]( transformValue );
      }

      // get proper order
      // ideally, we could loop through this give an array, but since we only have
      // a couple transforms we're keeping track of, we'll do it like so
      var translateFn = transformObj.translate || '',
          scaleFn = transformObj.scale || '',
          // sorting so translate always comes first
          valueFns = translateFn + scaleFn;

      // set data back in elem
      $.data( elem, 'isoTransform', data );

      // set name to vendor specific property
      elem.style[ transformProp ] = valueFns;
    };
   
    // ==================== scale ===================
  
    $.cssNumber.scale = true;
  
    $.cssHooks.scale = {
      set: function( elem, value ) {
        // uncomment this bit if you want to properly parse strings
        // if ( typeof value === 'string' ) {
        //   value = parseFloat( value );
        // }
        setIsoTransform( elem, 'scale', value );
      },
      get: function( elem, computed ) {
        var transform = $.data( elem, 'isoTransform' );
        return transform && transform.scale ? transform.scale : 1;
      }
    };

    $.fx.step.scale = function( fx ) {
      $.cssHooks.scale.set( fx.elem, fx.now+fx.unit );
    };
  
  
    // ==================== translate ===================
    
    $.cssNumber.translate = true;
  
    $.cssHooks.translate = {
      set: function( elem, value ) {

        // uncomment this bit if you want to properly parse strings
        // if ( typeof value === 'string' ) {
        //   value = value.split(' ');
        // }
        // 
        // var i, val;
        // for ( i = 0; i < 2; i++ ) {
        //   val = value[i];
        //   if ( typeof val === 'string' ) {
        //     val = parseInt( val );
        //   }
        // }

        setIsoTransform( elem, 'translate', value );
      },
    
      get: function( elem, computed ) {
        var transform = $.data( elem, 'isoTransform' );
        return transform && transform.translate ? transform.translate : [ 0, 0 ];
      }
    };

  }
  
  // ========================= get transition-end event ===============================
  var transitionEndEvent, transitionDurProp;
  
  if ( Modernizr.csstransitions ) {
    transitionEndEvent = {
      WebkitTransitionProperty: 'webkitTransitionEnd',  // webkit
      MozTransitionProperty: 'transitionend',
      OTransitionProperty: 'oTransitionEnd',
      transitionProperty: 'transitionEnd'
    }[ transitionProp ];

    transitionDurProp = getStyleProperty('transitionDuration');
  }

  // ========================= smartresize ===============================

  /*
   * smartresize: debounced resize event for jQuery
   *
   * latest version and complete README available on Github:
   * https://github.com/louisremi/jquery.smartresize.js
   *
   * Copyright 2011 @louis_remi
   * Licensed under the MIT license.
   */

  var $event = $.event,
      resizeTimeout;

  $event.special.smartresize = {
    setup: function() {
      $(this).bind( "resize", $event.special.smartresize.handler );
    },
    teardown: function() {
      $(this).unbind( "resize", $event.special.smartresize.handler );
    },
    handler: function( event, execAsap ) {
      // Save the context
      var context = this,
          args = arguments;

      // set correct event type
      event.type = "smartresize";

      if ( resizeTimeout ) { clearTimeout( resizeTimeout ); }
      resizeTimeout = setTimeout(function() {
        jQuery.event.handle.apply( context, args );
      }, execAsap === "execAsap"? 0 : 100 );
    }
  };

  $.fn.smartresize = function( fn ) {
    return fn ? this.bind( "smartresize", fn ) : this.trigger( "smartresize", ["execAsap"] );
  };



// ========================= Isotope ===============================


  // our "Widget" object constructor
  $.Isotope = function( options, element, callback ){
    this.element = $( element );

    this._create( options );
    this._init( callback );
  };
  
  // styles of container element we want to keep track of
  var isoContainerStyles = [ 'overflow', 'position', 'width', 'height' ];

  var $window = $(window);

  $.Isotope.settings = {
    resizable: true,
    layoutMode : 'masonry',
    containerClass : 'isotope',
    itemClass : 'isotope-item',
    hiddenClass : 'isotope-hidden',
    hiddenStyle: { opacity: 0, scale: 0.001 },
    visibleStyle: { opacity: 1, scale: 1 },
    animationEngine: 'best-available',
    animationOptions: {
      queue: false,
      duration: 800
    },
    sortBy : 'original-order',
    sortAscending : true,
    resizesContainer : true,
    transformsEnabled: !$.browser.opera, // disable transforms in Opera
    itemPositionDataEnabled: false
  };

  $.Isotope.prototype = {

    // sets up widget
    _create : function( options ) {
      
      this.options = $.extend( {}, $.Isotope.settings, options );
      
      this.styleQueue = [];
      this.elemCount = 0;

      // get original styles in case we re-apply them in .destroy()
      var elemStyle = this.element[0].style;
      this.originalStyle = {};
      for ( var i=0, len = isoContainerStyles.length; i < len; i++ ) {
        var prop = isoContainerStyles[i];
        this.originalStyle[ prop ] = elemStyle[ prop ] || '';
      }
      
      this.element.css({
        overflow : 'hidden',
        position : 'relative'
      });
      
      this._updateAnimationEngine();
      this._updateUsingTransforms();
      
      // sorting
      var originalOrderSorter = {
        'original-order' : function( $elem, instance ) {
          instance.elemCount ++;
          return instance.elemCount;
        },
        random : function() {
          return Math.random();
        }
      };

      this.options.getSortData = $.extend( this.options.getSortData, originalOrderSorter );

      // need to get atoms
      this.reloadItems();
      
      // get top left position of where the bricks should be
      var $cursor = $( document.createElement('div') ).prependTo( this.element );
      this.offset = $cursor.position();
      $cursor.remove();

      // add isotope class first time around
      var instance = this;
      setTimeout( function() {
        instance.element.addClass( instance.options.containerClass );
      }, 0 );
      
      // bind resize method
      if ( this.options.resizable ) {
        $window.bind( 'smartresize.isotope', function() {
          instance.resize();
        });
      }
      
      // dismiss all click events from hidden events
      this.element.delegate( '.' + this.options.hiddenClass, 'click', function(){
        return false;
      });
      
    },
    
    _getAtoms : function( $elems ) {
      var selector = this.options.itemSelector,
          // filter & find 
          $atoms = selector ? $elems.filter( selector ).add( $elems.find( selector ) ) : $elems,
          // base style for atoms
          atomStyle = { position: 'absolute' };
          
      if ( this.usingTransforms ) {
        atomStyle.left = 0;
        atomStyle.top = 0;
      }

      $atoms.css( atomStyle ).addClass( this.options.itemClass );

      this.updateSortData( $atoms, true );
      
      return $atoms;
    },
  
    // _init fires when your instance is first created
    // (from the constructor above), and when you
    // attempt to initialize the widget again (by the bridge)
    // after it has already been initialized.
    _init : function( callback ) {
      
      this.$filteredAtoms = this._filter( this.$allAtoms );
      this._sort();
      this.reLayout( callback );

    },

    option : function( opts ){
      // change options AFTER initialization:
      // signature: $('#foo').bar({ cool:false });
      if ( $.isPlainObject( opts ) ){
        this.options = $.extend( true, this.options, opts );

        // trigger _updateOptionName if it exists
        var updateOptionFn;
        for ( var optionName in opts ) {
          updateOptionFn = '_update' + capitalize( optionName );
          if ( this[ updateOptionFn ] ) {
            this[ updateOptionFn ]();
          }
        }
      }
    },
    
    // ====================== updaters ====================== //
    // kind of like setters
    
    _updateAnimationEngine : function() {
      var animationEngine = this.options.animationEngine.toLowerCase().replace( /[ _\-]/g, '');
      var isUsingJQueryAnimation;
      // set applyStyleFnName
      switch ( animationEngine ) {
        case 'css' :
        case 'none' :
          isUsingJQueryAnimation = false;
          break;
        case 'jquery' :
          isUsingJQueryAnimation = true;
          break;
        default : // best available
          isUsingJQueryAnimation = !Modernizr.csstransitions;
      }
      this.isUsingJQueryAnimation = isUsingJQueryAnimation;
      this._updateUsingTransforms();
    },
    
    _updateTransformsEnabled : function() {
      this._updateUsingTransforms();
    },
    
    _updateUsingTransforms : function() {
      var usingTransforms = this.usingTransforms = this.options.transformsEnabled && 
        Modernizr.csstransforms && Modernizr.csstransitions && !this.isUsingJQueryAnimation;

      // prevent scales when transforms are disabled
      if ( !usingTransforms ) {
        delete this.options.hiddenStyle.scale;
        delete this.options.visibleStyle.scale;
      }

      this.getPositionStyles = usingTransforms ? this._translate : this._positionAbs;
    },

    
    // ====================== Filtering ======================

    _filter : function( $atoms ) {
      var filter = this.options.filter === '' ? '*' : this.options.filter;

      if ( !filter ) {
        return $atoms;
      }

      var hiddenClass    = this.options.hiddenClass,
          hiddenSelector = '.' + hiddenClass,
          $hiddenAtoms   = $atoms.filter( hiddenSelector ),
          $atomsToShow   = $hiddenAtoms;

      if ( filter !== '*' ) {
        $atomsToShow = $hiddenAtoms.filter( filter );
        var $atomsToHide = $atoms.not( hiddenSelector ).not( filter ).addClass( hiddenClass );
        this.styleQueue.push({ $el: $atomsToHide, style: this.options.hiddenStyle });
      }

      this.styleQueue.push({ $el: $atomsToShow, style: this.options.visibleStyle });
      $atomsToShow.removeClass( hiddenClass );

      return $atoms.filter( filter );
    },
    
    // ====================== Sorting ======================
    
    updateSortData : function( $atoms, isIncrementingElemCount ) {
      var instance = this,
          getSortData = this.options.getSortData,
          $this, sortData;
      $atoms.each(function(){
        $this = $(this);
        sortData = {};
        // get value for sort data based on fn( $elem ) passed in
        for ( var key in getSortData ) {
          if ( !isIncrementingElemCount && key === 'original-order' ) {
            // keep original order original
            sortData[ key ] = $.data( this, 'isotope-sort-data' )[ key ];
          } else {
            sortData[ key ] = getSortData[ key ]( $this, instance );
          }
        }
        // apply sort data to element
        $.data( this, 'isotope-sort-data', sortData );
      });
    },
    
    // used on all the filtered atoms
    _sort : function() {
      
      var sortBy = this.options.sortBy,
          getSorter = this._getSorter,
          sortDir = this.options.sortAscending ? 1 : -1,
          sortFn = function( alpha, beta ) {
            var a = getSorter( alpha, sortBy ),
                b = getSorter( beta, sortBy );
            // fall back to original order if data matches
            if ( a === b && sortBy !== 'original-order') {
              a = getSorter( alpha, 'original-order' );
              b = getSorter( beta, 'original-order' );
            }
            return ( ( a > b ) ? 1 : ( a < b ) ? -1 : 0 ) * sortDir;
          };
      
      this.$filteredAtoms.sort( sortFn );
    },

    _getSorter : function( elem, sortBy ) {
      return $.data( elem, 'isotope-sort-data' )[ sortBy ];
    },

    // ====================== Layout Helpers ======================

    _translate : function( x, y ) {
      return { translate : [ x, y ] };
    },
    
    _positionAbs : function( x, y ) {
      return { left: x, top: y };
    },

    _pushPosition : function( $elem, x, y ) {
      x += this.offset.left;
      y += this.offset.top;
      var position = this.getPositionStyles( x, y );
      this.styleQueue.push({ $el: $elem, style: position });
      if ( this.options.itemPositionDataEnabled ) {
        $elem.data('isotope-item-position', {x: x, y: y} );
      }
    },


    // ====================== General Layout ======================

    // used on collection of atoms (should be filtered, and sorted before )
    // accepts atoms-to-be-laid-out to start with
    layout : function( $elems, callback ) {

      var layoutMode = this.options.layoutMode;

      // layout logic
      this[ '_' +  layoutMode + 'Layout' ]( $elems );
      
      // set the size of the container
      if ( this.options.resizesContainer ) {
        var containerStyle = this[ '_' +  layoutMode + 'GetContainerSize' ]();
        this.styleQueue.push({ $el: this.element, style: containerStyle });
      }

      this._processStyleQueue( $elems, callback );
      
      this.isLaidOut = true;
    },
    
    _processStyleQueue : function( $elems, callback ) {
      // are we animating the layout arrangement?
      // use plugin-ish syntax for css or animate
      var styleFn = !this.isLaidOut ? 'css' : (
            this.isUsingJQueryAnimation ? 'animate' : 'css'
          ),
          animOpts = this.options.animationOptions,
          objStyleFn, processor,
          triggerCallbackNow, callbackFn;

      // default styleQueue processor, may be overwritten down below
      processor = function( i, obj ) {
        obj.$el[ styleFn ]( obj.style, animOpts );
      };

      if ( this._isInserting && this.isUsingJQueryAnimation ) {
        // if using styleQueue to insert items
        processor = function( i, obj ) {
          // only animate if it not being inserted
          objStyleFn = obj.$el.hasClass('no-transition') ? 'css' : styleFn;
          obj.$el[ objStyleFn ]( obj.style, animOpts );
        };
        
      } else if ( callback ) {
        // has callback
        var isCallbackTriggered = false,
            instance = this;
        triggerCallbackNow = true;
        // trigger callback only once
        callbackFn = function() {
          if ( isCallbackTriggered ) {
            return;
          }
          callback.call( instance.element, $elems );
          isCallbackTriggered = true;
        };
        
        if ( this.isUsingJQueryAnimation && styleFn === 'animate' ) {
          // add callback to animation options
          animOpts.complete = callbackFn;
          triggerCallbackNow = false;

        } else if ( Modernizr.csstransitions ) {
          // detect if first item has transition
          var i = 0,
              testElem = this.styleQueue[0].$el,
              styleObj;
          // get first non-empty jQ object
          while ( !testElem.length ) {
            styleObj = this.styleQueue[ i++ ];
            // HACK: sometimes styleQueue[i] is undefined
            if ( !styleObj ) {
              return;
            }
            testElem = styleObj.$el;
          }
          // get transition duration of the first element in that object
          // yeah, this is inexact
          var duration = parseFloat( getComputedStyle( testElem[0] )[ transitionDurProp ] );
          if ( duration > 0 ) {
            processor = function( i, obj ) {
              obj.$el[ styleFn ]( obj.style, animOpts )
                // trigger callback at transition end
                .one( transitionEndEvent, callbackFn );
            };
            triggerCallbackNow = false;
          }
        }
      }

      // process styleQueue
      $.each( this.styleQueue, processor );
      
      if ( triggerCallbackNow ) {
        callbackFn();
      }

      // clear out queue for next time
      this.styleQueue = [];
    },
    
    
    resize : function() {
      if ( this[ '_' + this.options.layoutMode + 'ResizeChanged' ]() ) {
        this.reLayout();
      }
    },
    
    
    reLayout : function( callback ) {
      
      this[ '_' +  this.options.layoutMode + 'Reset' ]();
      this.layout( this.$filteredAtoms, callback );
      
    },
    
    // ====================== Convenience methods ======================
    
    // ====================== Adding items ======================
    
    // adds a jQuery object of items to a isotope container
    addItems : function( $content, callback ) {
      var $newAtoms = this._getAtoms( $content );
      // add new atoms to atoms pools
      this.$allAtoms = this.$allAtoms.add( $newAtoms );

      if ( callback ) {
        callback( $newAtoms );
      }
    },
    
    // convienence method for adding elements properly to any layout
    // positions items, hides them, then animates them back in <--- very sezzy
    insert : function( $content, callback ) {
      // position items
      this.element.append( $content );
      
      var instance = this;
      this.addItems( $content, function( $newAtoms ) {
        var $newFilteredAtoms = instance._filter( $newAtoms );
        instance._addHideAppended( $newFilteredAtoms );
        instance._sort();
        instance.reLayout();
        instance._revealAppended( $newFilteredAtoms, callback );
      });
      
    },
    
    // convienence method for working with Infinite Scroll
    appended : function( $content, callback ) {
      var instance = this;
      this.addItems( $content, function( $newAtoms ) {
        instance._addHideAppended( $newAtoms );
        instance.layout( $newAtoms );
        instance._revealAppended( $newAtoms, callback );
      });
    },
    
    // adds new atoms, then hides them before positioning
    _addHideAppended : function( $newAtoms ) {
      this.$filteredAtoms = this.$filteredAtoms.add( $newAtoms );
      $newAtoms.addClass('no-transition');
      
      this._isInserting = true;
      
      // apply hidden styles
      this.styleQueue.push({ $el: $newAtoms, style: this.options.hiddenStyle });
    },
    
    // sets visible style on new atoms
    _revealAppended : function( $newAtoms, callback ) {
      var instance = this;
      // apply visible style after a sec
      setTimeout( function() {
        // enable animation
        $newAtoms.removeClass('no-transition');
        // reveal newly inserted filtered elements
        instance.styleQueue.push({ $el: $newAtoms, style: instance.options.visibleStyle });
        instance._isInserting = false;
        instance._processStyleQueue( $newAtoms, callback );
      }, 10 );
    },
    
    // gathers all atoms
    reloadItems : function() {
      this.$allAtoms = this._getAtoms( this.element.children() );
    },
    
    // removes elements from Isotope widget
    remove: function( $content ) {
      // remove elements from Isotope instance in callback
      var instance = this;
      var removeContent = function() {
        instance.$allAtoms = instance.$allAtoms.not( $content );
        $content.remove();
      };

      if ( $content.filter( ':not(.' + this.options.hiddenClass + ')' ).length ) {
        // if any non-hidden content needs to be removed
        this.styleQueue.push({ $el: $content, style: this.options.hiddenStyle });
        this.$filteredAtoms = this.$filteredAtoms.not( $content );
        this._sort();
        this.reLayout( removeContent );
      } else {
        // remove it now
        removeContent();
      }

    },
    
    shuffle : function( callback ) {
      this.updateSortData( this.$allAtoms );
      this.options.sortBy = 'random';
      this._sort();
      this.reLayout( callback );
    },
    
    // destroys widget, returns elements and container back (close) to original style
    destroy : function() {

      var usingTransforms = this.usingTransforms;
      var options = this.options;

      this.$allAtoms
        .removeClass( options.hiddenClass + ' ' + options.itemClass )
        .each(function(){
          var style = this.style;
          style.position = '';
          style.top = '';
          style.left = '';
          style.opacity = '';
          if ( usingTransforms ) {
            style[ transformProp ] = '';
          }
        });
      
      // re-apply saved container styles
      var elemStyle = this.element[0].style;
      for ( var i=0, len = isoContainerStyles.length; i < len; i++ ) {
        var prop = isoContainerStyles[i];
        elemStyle[ prop ] = this.originalStyle[ prop ];
      }
      
      this.element
        .unbind('.isotope')
        .undelegate( '.' + options.hiddenClass, 'click' )
        .removeClass( options.containerClass )
        .removeData('isotope');
      
      $window.unbind('.isotope');

    },
    
    
    // ====================== LAYOUTS ======================
    
    // calculates number of rows or columns
    // requires columnWidth or rowHeight to be set on namespaced object
    // i.e. this.masonry.columnWidth = 200
    _getSegments : function( isRows ) {
      var namespace = this.options.layoutMode,
          measure  = isRows ? 'rowHeight' : 'columnWidth',
          size     = isRows ? 'height' : 'width',
          segmentsName = isRows ? 'rows' : 'cols',
          containerSize = this.element[ size ](),
          segments,
                    // i.e. options.masonry && options.masonry.columnWidth
          segmentSize = this.options[ namespace ] && this.options[ namespace ][ measure ] ||
                    // or use the size of the first item, i.e. outerWidth
                    this.$filteredAtoms[ 'outer' + capitalize(size) ](true) ||
                    // if there's no items, use size of container
                    containerSize;
      
      segments = Math.floor( containerSize / segmentSize );
      segments = Math.max( segments, 1 );

      // i.e. this.masonry.cols = ....
      this[ namespace ][ segmentsName ] = segments;
      // i.e. this.masonry.columnWidth = ...
      this[ namespace ][ measure ] = segmentSize;
      
    },
    
    _checkIfSegmentsChanged : function( isRows ) {
      var namespace = this.options.layoutMode,
          segmentsName = isRows ? 'rows' : 'cols',
          prevSegments = this[ namespace ][ segmentsName ];
      // update cols/rows
      this._getSegments( isRows );
      // return if updated cols/rows is not equal to previous
      return ( this[ namespace ][ segmentsName ] !== prevSegments );
    },

    // ====================== Masonry ======================
  
    _masonryReset : function() {
      // layout-specific props
      this.masonry = {};
      // FIXME shouldn't have to call this again
      this._getSegments();
      var i = this.masonry.cols;
      this.masonry.colYs = [];
      while (i--) {
        this.masonry.colYs.push( 0 );
      }
    },
  
    _masonryLayout : function( $elems ) {
      var instance = this,
          props = instance.masonry;
      $elems.each(function(){
        var $this  = $(this),
            //how many columns does this brick span
            colSpan = Math.ceil( $this.outerWidth(true) / props.columnWidth );
        colSpan = Math.min( colSpan, props.cols );

        if ( colSpan === 1 ) {
          // if brick spans only one column, just like singleMode
          instance._masonryPlaceBrick( $this, props.colYs );
        } else {
          // brick spans more than one column
          // how many different places could this brick fit horizontally
          var groupCount = props.cols + 1 - colSpan,
              groupY = [],
              groupColY,
              i;

          // for each group potential horizontal position
          for ( i=0; i < groupCount; i++ ) {
            // make an array of colY values for that one group
            groupColY = props.colYs.slice( i, i+colSpan );
            // and get the max value of the array
            groupY[i] = Math.max.apply( Math, groupColY );
          }
        
          instance._masonryPlaceBrick( $this, groupY );
        }
      });
    },
    
    // worker method that places brick in the columnSet
    //   with the the minY
    _masonryPlaceBrick : function( $brick, setY ) {
      // get the minimum Y value from the columns
      var minimumY = Math.min.apply( Math, setY ),
          shortCol = 0;

      // Find index of short column, the first from the left
      for (var i=0, len = setY.length; i < len; i++) {
        if ( setY[i] === minimumY ) {
          shortCol = i;
          break;
        }
      }
    
      // position the brick
      var x = this.masonry.columnWidth * shortCol,
          y = minimumY;
      this._pushPosition( $brick, x, y );

      // apply setHeight to necessary columns
      var setHeight = minimumY + $brick.outerHeight(true),
          setSpan = this.masonry.cols + 1 - len;
      for ( i=0; i < setSpan; i++ ) {
        this.masonry.colYs[ shortCol + i ] = setHeight;
      }

    },
    
    _masonryGetContainerSize : function() {
      var containerHeight = Math.max.apply( Math, this.masonry.colYs );
      return { height: containerHeight };
    },
  
    _masonryResizeChanged : function() {
      return this._checkIfSegmentsChanged();
    },
  
    // ====================== fitRows ======================
    
    _fitRowsReset : function() {
      this.fitRows = {
        x : 0,
        y : 0,
        height : 0
      };
    },
  
    _fitRowsLayout : function( $elems ) {
      var instance = this,
          containerWidth = this.element.width(),
          props = this.fitRows;
      
      $elems.each( function() {
        var $this = $(this),
            atomW = $this.outerWidth(true),
            atomH = $this.outerHeight(true);
      
        if ( props.x !== 0 && atomW + props.x > containerWidth ) {
          // if this element cannot fit in the current row
          props.x = 0;
          props.y = props.height;
        } 
      
        // position the atom
        instance._pushPosition( $this, props.x, props.y );
  
        props.height = Math.max( props.y + atomH, props.height );
        props.x += atomW;
  
      });
    },
  
    _fitRowsGetContainerSize : function () {
      return { height : this.fitRows.height };
    },
  
    _fitRowsResizeChanged : function() {
      return true;
    },
  

    // ====================== cellsByRow ======================
  
    _cellsByRowReset : function() {
      this.cellsByRow = {
        index : 0
      };
      // get this.cellsByRow.columnWidth
      this._getSegments();
      // get this.cellsByRow.rowHeight
      this._getSegments(true);
    },

    _cellsByRowLayout : function( $elems ) {
      var instance = this,
          props = this.cellsByRow;
      $elems.each( function(){
        var $this = $(this),
            col = props.index % props.cols,
            row = Math.floor( props.index / props.cols ),
            x = Math.round( ( col + 0.5 ) * props.columnWidth - $this.outerWidth(true) / 2 ),
            y = Math.round( ( row + 0.5 ) * props.rowHeight - $this.outerHeight(true) / 2 );
        instance._pushPosition( $this, x, y );
        props.index ++;
      });
    },

    _cellsByRowGetContainerSize : function() {
      return { height : Math.ceil( this.$filteredAtoms.length / this.cellsByRow.cols ) * this.cellsByRow.rowHeight + this.offset.top };
    },

    _cellsByRowResizeChanged : function() {
      return this._checkIfSegmentsChanged();
    },
  
  
    // ====================== straightDown ======================
  
    _straightDownReset : function() {
      this.straightDown = {
        y : 0
      };
    },

    _straightDownLayout : function( $elems ) {
      var instance = this;
      $elems.each( function( i ){
        var $this = $(this);
        instance._pushPosition( $this, 0, instance.straightDown.y );
        instance.straightDown.y += $this.outerHeight(true);
      });
    },

    _straightDownGetContainerSize : function() {
      return { height : this.straightDown.y };
    },

    _straightDownResizeChanged : function() {
      return true;
    },


    // ====================== masonryHorizontal ======================
    
    _masonryHorizontalReset : function() {
      // layout-specific props
      this.masonryHorizontal = {};
      // FIXME shouldn't have to call this again
      this._getSegments( true );
      var i = this.masonryHorizontal.rows;
      this.masonryHorizontal.rowXs = [];
      while (i--) {
        this.masonryHorizontal.rowXs.push( 0 );
      }
    },
  
    _masonryHorizontalLayout : function( $elems ) {
      var instance = this,
          props = instance.masonryHorizontal;
      $elems.each(function(){
        var $this  = $(this),
            //how many rows does this brick span
            rowSpan = Math.ceil( $this.outerHeight(true) / props.rowHeight );
        rowSpan = Math.min( rowSpan, props.rows );

        if ( rowSpan === 1 ) {
          // if brick spans only one column, just like singleMode
          instance._masonryHorizontalPlaceBrick( $this, props.rowXs );
        } else {
          // brick spans more than one row
          // how many different places could this brick fit horizontally
          var groupCount = props.rows + 1 - rowSpan,
              groupX = [],
              groupRowX, i;

          // for each group potential horizontal position
          for ( i=0; i < groupCount; i++ ) {
            // make an array of colY values for that one group
            groupRowX = props.rowXs.slice( i, i+rowSpan );
            // and get the max value of the array
            groupX[i] = Math.max.apply( Math, groupRowX );
          }

          instance._masonryHorizontalPlaceBrick( $this, groupX );
        }
      });
    },
    
    _masonryHorizontalPlaceBrick : function( $brick, setX ) {
      // get the minimum Y value from the columns
      var minimumX  = Math.min.apply( Math, setX ),
          smallRow  = 0;
      // Find index of smallest row, the first from the top
      for (var i=0, len = setX.length; i < len; i++) {
        if ( setX[i] === minimumX ) {
          smallRow = i;
          break;
        }
      }

      // position the brick
      var x = minimumX,
          y = this.masonryHorizontal.rowHeight * smallRow;
      this._pushPosition( $brick, x, y );

      // apply setHeight to necessary columns
      var setWidth = minimumX + $brick.outerWidth(true),
          setSpan = this.masonryHorizontal.rows + 1 - len;
      for ( i=0; i < setSpan; i++ ) {
        this.masonryHorizontal.rowXs[ smallRow + i ] = setWidth;
      }
    },

    _masonryHorizontalGetContainerSize : function() {
      var containerWidth = Math.max.apply( Math, this.masonryHorizontal.rowXs );
      return { width: containerWidth };
    },
    
    _masonryHorizontalResizeChanged : function() {
      return this._checkIfSegmentsChanged(true);
    },


    // ====================== fitColumns ======================
  
    _fitColumnsReset : function() {
      this.fitColumns = {
        x : 0,
        y : 0,
        width : 0
      };
    },
    
    _fitColumnsLayout : function( $elems ) {
      var instance = this,
          containerHeight = this.element.height(),
          props = this.fitColumns;
      $elems.each( function() {
        var $this = $(this),
            atomW = $this.outerWidth(true),
            atomH = $this.outerHeight(true);

        if ( props.y !== 0 && atomH + props.y > containerHeight ) {
          // if this element cannot fit in the current column
          props.x = props.width;
          props.y = 0;
        } 

        // position the atom
        instance._pushPosition( $this, props.x, props.y );

        props.width = Math.max( props.x + atomW, props.width );
        props.y += atomH;

      });
    },
    
    _fitColumnsGetContainerSize : function () {
      return { width : this.fitColumns.width };
    },
    
    _fitColumnsResizeChanged : function() {
      return true;
    },
    

  
    // ====================== cellsByColumn ======================
  
    _cellsByColumnReset : function() {
      this.cellsByColumn = {
        index : 0
      };
      // get this.cellsByColumn.columnWidth
      this._getSegments();
      // get this.cellsByColumn.rowHeight
      this._getSegments(true);
    },

    _cellsByColumnLayout : function( $elems ) {
      var instance = this,
          props = this.cellsByColumn;
      $elems.each( function(){
        var $this = $(this),
            col = Math.floor( props.index / props.rows ),
            row = props.index % props.rows,
            x = Math.round( ( col + 0.5 ) * props.columnWidth - $this.outerWidth(true) / 2 ),
            y = Math.round( ( row + 0.5 ) * props.rowHeight - $this.outerHeight(true) / 2 );
        instance._pushPosition( $this, x, y );
        props.index ++;
      });
    },

    _cellsByColumnGetContainerSize : function() {
      return { width : Math.ceil( this.$filteredAtoms.length / this.cellsByColumn.rows ) * this.cellsByColumn.columnWidth };
    },

    _cellsByColumnResizeChanged : function() {
      return this._checkIfSegmentsChanged(true);
    },
    
    // ====================== straightAcross ======================

    _straightAcrossReset : function() {
      this.straightAcross = {
        x : 0
      };
    },

    _straightAcrossLayout : function( $elems ) {
      var instance = this;
      $elems.each( function( i ){
        var $this = $(this);
        instance._pushPosition( $this, instance.straightAcross.x, 0 );
        instance.straightAcross.x += $this.outerWidth(true);
      });
    },

    _straightAcrossGetContainerSize : function() {
      return { width : this.straightAcross.x };
    },

    _straightAcrossResizeChanged : function() {
      return true;
    }

  };
  
  
  // ======================= imagesLoaded Plugin ===============================
  /*!
   * jQuery imagesLoaded plugin v1.1.0
   * http://github.com/desandro/imagesloaded
   *
   * MIT License. by Paul Irish et al.
   */


  // $('#my-container').imagesLoaded(myFunction)
  // or
  // $('img').imagesLoaded(myFunction)

  // execute a callback when all images have loaded.
  // needed because .load() doesn't work on cached images

  // callback function gets image collection as argument
  //  `this` is the container

  $.fn.imagesLoaded = function( callback ) {
    var $this = this,
        $images = $this.find('img').add( $this.filter('img') ),
        len = $images.length,
        blank = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        loaded = [];

    function triggerCallback() {
      callback.call( $this, $images );
    }

    function imgLoaded( event ) {
      if ( event.target.src !== blank && $.inArray( this, loaded ) === -1 ){
        loaded.push(this);
        if ( --len <= 0 ){
          setTimeout( triggerCallback );
          $images.unbind( '.imagesLoaded', imgLoaded );
        }
      }
    }

    // if no images, trigger immediately
    if ( !len ) {
      triggerCallback();
    }

    $images.bind( 'load.imagesLoaded error.imagesLoaded',  imgLoaded ).each( function() {
      // cached images don't fire load sometimes, so we reset src.
      var src = this.src;
      // webkit hack from http://groups.google.com/group/jquery-dev/browse_thread/thread/eee6ab7b2da50e1f
      // data uri bypasses webkit log warning (thx doug jones)
      this.src = blank;
      this.src = src;
    });

    return $this;
  };


  // helper function for logging errors
  // $.error breaks jQuery chaining
  var logError = function( message ) {
    if ( window.console ) {
      window.console.error( message );
    }
  };

  // =======================  Plugin bridge  ===============================
  // leverages data method to either create or return $.Isotope constructor
  // A bit from jQuery UI
  //   https://github.com/jquery/jquery-ui/blob/master/ui/jquery.ui.widget.js
  // A bit from jcarousel 
  //   https://github.com/jsor/jcarousel/blob/master/lib/jquery.jcarousel.js

  $.fn.isotope = function( options, callback ) {
    if ( typeof options === 'string' ) {
      // call method
      var args = Array.prototype.slice.call( arguments, 1 );

      this.each(function(){
        var instance = $.data( this, 'isotope' );
        if ( !instance ) {
          logError( "cannot call methods on isotope prior to initialization; " +
              "attempted to call method '" + options + "'" );
          return;
        }
        if ( !$.isFunction( instance[options] ) || options.charAt(0) === "_" ) {
          logError( "no such method '" + options + "' for isotope instance" );
          return;
        }
        // apply method
        instance[ options ].apply( instance, args );
      });
    } else {
      this.each(function() {
        var instance = $.data( this, 'isotope' );
        if ( instance ) {
          // apply options & init
          instance.option( options );
          instance._init( callback );
        } else {
          // initialize new instance
          $.data( this, 'isotope', new $.Isotope( options, this, callback ) );
        }
      });
    }
    // return jQuery object
    // so plugin methods do not have to
    return this;
  };

})( window, jQuery );
});

require.define("/views/message-view.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneAdapter = require('../backbone-adapter.js');
var Message = require('../models/message.js');
var Sanitizer = require('sanitizer');

var MessageView = Backbone.View.extend({
    tagName: "div",
    className: "message",
    events: {
        "click .up": "handleUpClick",
        "click .down": "handleDownClick",
        "click .share": "handleShare",
        "click": "handleClick"
    },
    // TODO: i'd prefer is we didn't set style attributes. Also, the favicon can be an img tag, just for cleanliness when writing to the template.
    template: _.template([
        '<span class="controls">',
            '<button class="vote down"></button>',
            '<button class="share"></button>',
            '<button class="vote up"></button>',
        '</span>',
        '<p class="darkened"><%= model.escape("title") %></p>',
        '<div class="full-content" style="display:none;"></div>',
        '<h1 style="background-image: url(<%= model.faviconUrl() %>)"><%= model.escape("source").title %></h1>'
    ].join('')),
    initialize: function () {
        this.model.bind('change', this.layout.bind(this)); 
        this.model.bind('remove', this.remove.bind(this))
        this.model.bind('destroy', this.remove.bind(this)); 
        this.model.bind('expand', function() {
            $(this.el).removeClass('brother'); // Let's show this bro!
        }.bind(this)); 
        this.model.bind('unsubscribe', function () {
            var request = {
                signature: "unsubscribe",
                params: {
                    title: "", // TODO : Add support for title 
                    url: this.model.attributes.feed,
                    force: true
                },
                force: true
            };
            chrome.extension.sendRequest(request, function (response) {
                // Unsubscribed... We need to delete all the brothas and sistas!
                this.model.trigger('unsubscribed');
            }.bind(this));
        }.bind(this));
    },
    render: function () {
        this.layout();
        this.trigger('rendered');
    },
    layout: function() {
        var el = $(this.el), 
        isGroup = this.model.messages && this.model.messages.length > 1;
            
        // set some attributes on the container div
        $(this.el).attr({
            'data-msgboy-relevance': this.model.get('relevance'),
            'id': this.model.id,
            'data-msgboy-state': this.model.get('state')
        });
        
        // remove all the brick classes, add new one
        el.removeClass("brick-1 brick-2 brick-3 brick-4 text");
        el.addClass(this.getBrickClass());

        el.html(this.template({model: this.model}));
        el.addClass("text");
        this.$(".full-content").html($(this.model.text(Sanitizer.sanitize(this.model.text()))));
        
        // render our compiled template
        if (isGroup) {
            el.prepend($('<div class="ribbon">' + (this.model.messages.length) + ' stories</div>'));
        }
        
        $(this.el).find('.full-content img').load(this.handleImageLoad.bind(this));
    },
    // Browser event handlers
    handleClick: function (evt) {
        var el = $(this.el),
                isGroup = this.model.messages.length > 1;
        if (isGroup) {
            this.handleExpand();
        }
        else {
            this.model.trigger('clicked');
            if (!$(evt.target).hasClass("vote") && !$(evt.target).hasClass("share")) {
                if (evt.shiftKey) {
                    chrome.extension.sendRequest({
                        signature: "notify",
                        params: this.model.toJSON()
                    });
                } else {
                    chrome.extension.sendRequest({
                        signature: "tab",
                        params: {url: this.model.mainLink(), selected: false}
                    });
                    this.trigger("clicked");
                }
            }
        }
    },
    handleUpClick: function () {
        this.model.voteUp();
    },
    handleDownClick: function () {
        this.model.voteDown();
    },
    handleShare: function(e) {
        this.model.trigger('share', this.model);
    },
    handleExpand: function (e) {
        this.model.messages.each(function(message, i) {
            message.trigger('expand');
        });
        this.model.trigger('expanded', this);
        this.model.messages.reset(); // And now remove the messages inside :)
        this.layout();
        return false;
    },
    handleImageLoad: function (e) {
        // We should check the size of the image and only display it if it's bigger than the previous one.
        // We should also resize it to fit the square.
        var img = e.target;
        $(this.el).append('<img class="main" src="' + $(img).attr("src") + '"/>');
        
        // var img = e.target,
        //     img_size = Msgboy.helper.element.original_size($(img));
        // 
        // // eliminate the tracking pixels and ensure min of at least 50x50
        // if (img.width > 50 && img.height > 50) {
        //     this.$("p").addClass("darkened");
            // $(this.el).append('<img class="main" src="' + $(img).attr("src") + '"/>');
        //     // Resize the image.
        //     if (img_size.width / img_size.height > $(self.el).width() / $(self.el).height()) {
        //         this.$(".message > img.main").css("min-height", "150%");
        //     } else {
        //         this.$(".message > img.main").css("min-width", "100%");
        //     }
        // }
    },
    getBrickClass: function () {
        var res,
            state = this.model.get('state');
            
        if (state === 'down-ed') {
            res = 1;
        } else if (state === 'up-ed') {
            res = 4;
        } else {
            res = Math.ceil(this.model.attributes.relevance * 4); 
        }
        return 'brick-' + res;
    }
});

exports.MessageView = MessageView;

});

require.define("/node_modules/sanitizer/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"sanitizer.js"}
});

require.define("/node_modules/sanitizer/sanitizer.js", function (require, module, exports, __dirname, __filename) {
// Copyright (C) 2006 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview
 * An HTML sanitizer that can satisfy a variety of security policies.
 *
 * <p>
 * The HTML sanitizer is built around a SAX parser and HTML element and
 * attributes schemas.
 *
 * @author mikesamuel@gmail.com
 * @requires html4
 * @provides html, html_sanitize
 */

/**
 * @namespace
 */
var html = (function () {
  var lcase;
  // The below may not be true on browsers in the Turkish locale.
  if ('script' === 'SCRIPT'.toLowerCase()) {
    lcase = function (s) { return s.toLowerCase(); };
  } else {
    /**
     * {@updoc
     * $ lcase('SCRIPT')
     * # 'script'
     * $ lcase('script')
     * # 'script'
     * }
     */
    lcase = function (s) {
      return s.replace(
          /[A-Z]/g,
          function (ch) {
            return String.fromCharCode(ch.charCodeAt(0) | 32);
          });
    };
  }

  var ENTITIES = {
    lt   : '<',
    gt   : '>',
    amp  : '&',
    nbsp : '\240',
    quot : '"',
    apos : '\''
  };

  var decimalEscapeRe = /^#(\d+)$/;
  var hexEscapeRe = /^#x([0-9A-Fa-f]+)$/;
  /**
   * Decodes an HTML entity.
   *
   * {@updoc
   * $ lookupEntity('lt')
   * # '<'
   * $ lookupEntity('GT')
   * # '>'
   * $ lookupEntity('amp')
   * # '&'
   * $ lookupEntity('nbsp')
   * # '\xA0'
   * $ lookupEntity('apos')
   * # "'"
   * $ lookupEntity('quot')
   * # '"'
   * $ lookupEntity('#xa')
   * # '\n'
   * $ lookupEntity('#10')
   * # '\n'
   * $ lookupEntity('#x0a')
   * # '\n'
   * $ lookupEntity('#010')
   * # '\n'
   * $ lookupEntity('#x00A')
   * # '\n'
   * $ lookupEntity('Pi')      // Known failure
   * # '\u03A0'
   * $ lookupEntity('pi')      // Known failure
   * # '\u03C0'
   * }
   *
   * @param name the content between the '&' and the ';'.
   * @return a single unicode code-point as a string.
   */
  function lookupEntity(name) {
    name = lcase(name);  // TODO: &pi; is different from &Pi;
    if (ENTITIES.hasOwnProperty(name)) { return ENTITIES[name]; }
    var m = name.match(decimalEscapeRe);
    if (m) {
      return String.fromCharCode(parseInt(m[1], 10));
    } else if (!!(m = name.match(hexEscapeRe))) {
      return String.fromCharCode(parseInt(m[1], 16));
    }
    return '';
  }

  function decodeOneEntity(_, name) {
    return lookupEntity(name);
  }

  var nulRe = /\0/g;
  function stripNULs(s) {
    return s.replace(nulRe, '');
  }

  var entityRe = /&(#\d+|#x[0-9A-Fa-f]+|\w+);/g;
  /**
   * The plain text of a chunk of HTML CDATA which possibly containing.
   *
   * {@updoc
   * $ unescapeEntities('')
   * # ''
   * $ unescapeEntities('hello World!')
   * # 'hello World!'
   * $ unescapeEntities('1 &lt; 2 &amp;&AMP; 4 &gt; 3&#10;')
   * # '1 < 2 && 4 > 3\n'
   * $ unescapeEntities('&lt;&lt <- unfinished entity&gt;')
   * # '<&lt <- unfinished entity>'
   * $ unescapeEntities('/foo?bar=baz&copy=true')  // & often unescaped in URLS
   * # '/foo?bar=baz&copy=true'
   * $ unescapeEntities('pi=&pi;&#x3c0;, Pi=&Pi;\u03A0') // FIXME: known failure
   * # 'pi=\u03C0\u03c0, Pi=\u03A0\u03A0'
   * }
   *
   * @param s a chunk of HTML CDATA.  It must not start or end inside an HTML
   *   entity.
   */
  function unescapeEntities(s) {
    return s.replace(entityRe, decodeOneEntity);
  }

  var ampRe = /&/g;
  var looseAmpRe = /&([^a-z#]|#(?:[^0-9x]|x(?:[^0-9a-f]|$)|$)|$)/gi;
  var ltRe = /</g;
  var gtRe = />/g;
  var quotRe = /\"/g;
  var eqRe = /\=/g;  // Backslash required on JScript.net

  /**
   * Escapes HTML special characters in attribute values as HTML entities.
   *
   * {@updoc
   * $ escapeAttrib('')
   * # ''
   * $ escapeAttrib('"<<&==&>>"')  // Do not just escape the first occurrence.
   * # '&#34;&lt;&lt;&amp;&#61;&#61;&amp;&gt;&gt;&#34;'
   * $ escapeAttrib('Hello <World>!')
   * # 'Hello &lt;World&gt;!'
   * }
   */
  function escapeAttrib(s) {
    // Escaping '=' defangs many UTF-7 and SGML short-tag attacks.
    return s.replace(ampRe, '&amp;').replace(ltRe, '&lt;').replace(gtRe, '&gt;')
        .replace(quotRe, '&#34;').replace(eqRe, '&#61;');
  }

  /**
   * Escape entities in RCDATA that can be escaped without changing the meaning.
   * {@updoc
   * $ normalizeRCData('1 < 2 &&amp; 3 > 4 &amp;& 5 &lt; 7&8')
   * # '1 &lt; 2 &amp;&amp; 3 &gt; 4 &amp;&amp; 5 &lt; 7&amp;8'
   * }
   */
  function normalizeRCData(rcdata) {
    return rcdata
        .replace(looseAmpRe, '&amp;$1')
        .replace(ltRe, '&lt;')
        .replace(gtRe, '&gt;');
  }


  // TODO(mikesamuel): validate sanitizer regexs against the HTML5 grammar at
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/syntax.html
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/parsing.html
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/tokenization.html
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/tree-construction.html

  /** token definitions. */
  var INSIDE_TAG_TOKEN = new RegExp(
      // Don't capture space.
      '^\\s*(?:'
      // Capture an attribute name in group 1, and value in group 3.
      // We capture the fact that there was an attribute in group 2, since
      // interpreters are inconsistent in whether a group that matches nothing
      // is null, undefined, or the empty string.
      + ('(?:'
         + '([a-z][a-z-]*)'                    // attribute name
         + ('('                                // optionally followed
            + '\\s*=\\s*'
            + ('('
               // A double quoted string.
               + '\"[^\"]*\"'
               // A single quoted string.
               + '|\'[^\']*\''
               // The positive lookahead is used to make sure that in
               // <foo bar= baz=boo>, the value for bar is blank, not "baz=boo".
               + '|(?=[a-z][a-z-]*\\s*=)'
               // An unquoted value that is not an attribute name.
               // We know it is not an attribute name because the previous
               // zero-width match would've eliminated that possibility.
               + '|[^>\"\'\\s]*'
               + ')'
               )
            + ')'
            ) + '?'
         + ')'
         )
      // End of tag captured in group 3.
      + '|(/?>)'
      // Don't capture cruft
      + '|.[^a-z\\s>]*)',
      'i');

  var OUTSIDE_TAG_TOKEN = new RegExp(
      '^(?:'
      // Entity captured in group 1.
      + '&(\\#[0-9]+|\\#[x][0-9a-f]+|\\w+);'
      // Comment, doctypes, and processing instructions not captured.
      + '|<\!--[\\s\\S]*?--\>|<!\\w[^>]*>|<\\?[^>*]*>'
      // '/' captured in group 2 for close tags, and name captured in group 3.
      + '|<(/)?([a-z][a-z0-9]*)'
      // Text captured in group 4.
      + '|([^<&>]+)'
      // Cruft captured in group 5.
      + '|([<&>]))',
      'i');

  /**
   * Given a SAX-like event handler, produce a function that feeds those
   * events and a parameter to the event handler.
   *
   * The event handler has the form:{@code
   * {
   *   // Name is an upper-case HTML tag name.  Attribs is an array of
   *   // alternating upper-case attribute names, and attribute values.  The
   *   // attribs array is reused by the parser.  Param is the value passed to
   *   // the saxParser.
   *   startTag: function (name, attribs, param) { ... },
   *   endTag:   function (name, param) { ... },
   *   pcdata:   function (text, param) { ... },
   *   rcdata:   function (text, param) { ... },
   *   cdata:    function (text, param) { ... },
   *   startDoc: function (param) { ... },
   *   endDoc:   function (param) { ... }
   * }}
   *
   * @param {Object} handler a record containing event handlers.
   * @return {Function} that takes a chunk of html and a parameter.
   *   The parameter is passed on to the handler methods.
   */
  function makeSaxParser(handler) {
    return function parse(htmlText, param) {
      htmlText = String(htmlText);
      var htmlLower = null;

      var inTag = false;  // True iff we're currently processing a tag.
      var attribs = [];  // Accumulates attribute names and values.
      var tagName = void 0;  // The name of the tag currently being processed.
      var eflags = void 0;  // The element flags for the current tag.
      var openTag = void 0;  // True if the current tag is an open tag.

      if (handler.startDoc) { handler.startDoc(param); }

      while (htmlText) {
        var m = htmlText.match(inTag ? INSIDE_TAG_TOKEN : OUTSIDE_TAG_TOKEN);
        htmlText = htmlText.substring(m[0].length);

        if (inTag) {
          if (m[1]) { // attribute
            // setAttribute with uppercase names doesn't work on IE6.
            var attribName = lcase(m[1]);
            var decodedValue;
            if (m[2]) {
              var encodedValue = m[3];
              switch (encodedValue.charCodeAt(0)) {  // Strip quotes
                case 34: case 39:
                  encodedValue = encodedValue.substring(
                      1, encodedValue.length - 1);
                  break;
              }
              decodedValue = unescapeEntities(stripNULs(encodedValue));
            } else {
              // Use name as value for valueless attribs, so
              //   <input type=checkbox checked>
              // gets attributes ['type', 'checkbox', 'checked', 'checked']
              decodedValue = attribName;
            }
            attribs.push(attribName, decodedValue);
          } else if (m[4]) {
            if (eflags !== void 0) {  // False if not in whitelist.
              if (openTag) {
                if (handler.startTag) {
                  handler.startTag(tagName, attribs, param);
                }
              } else {
                if (handler.endTag) {
                  handler.endTag(tagName, param);
                }
              }
            }

            if (openTag
                && (eflags & (html4.eflags.CDATA | html4.eflags.RCDATA))) {
              if (htmlLower === null) {
                htmlLower = lcase(htmlText);
              } else {
                htmlLower = htmlLower.substring(
                    htmlLower.length - htmlText.length);
              }
              var dataEnd = htmlLower.indexOf('</' + tagName);
              if (dataEnd < 0) { dataEnd = htmlText.length; }
              if (eflags & html4.eflags.CDATA) {
                if (handler.cdata) {
                  handler.cdata(htmlText.substring(0, dataEnd), param);
                }
              } else if (handler.rcdata) {
                handler.rcdata(
                    normalizeRCData(htmlText.substring(0, dataEnd)), param);
              }
              htmlText = htmlText.substring(dataEnd);
            }

            tagName = eflags = openTag = void 0;
            attribs.length = 0;
            inTag = false;
          }
        } else {
          if (m[1]) {  // Entity
            if (handler.pcdata) { handler.pcdata(m[0], param); }
          } else if (m[3]) {  // Tag
            openTag = !m[2];
            inTag = true;
            tagName = lcase(m[3]);
            eflags = html4.ELEMENTS.hasOwnProperty(tagName)
                ? html4.ELEMENTS[tagName] : void 0;
          } else if (m[4]) {  // Text
            if (handler.pcdata) { handler.pcdata(m[4], param); }
          } else if (m[5]) {  // Cruft
            if (handler.pcdata) {
              switch (m[5]) {
                case '<': handler.pcdata('&lt;', param); break;
                case '>': handler.pcdata('&gt;', param); break;
                default: handler.pcdata('&amp;', param); break;
              }
            }
          }
        }
      }

      if (handler.endDoc) { handler.endDoc(param); }
    };
  }

  return {
    normalizeRCData: normalizeRCData,
    escapeAttrib: escapeAttrib,
    unescapeEntities: unescapeEntities,
    makeSaxParser: makeSaxParser
  };
})();

/**
 * Returns a function that strips unsafe tags and attributes from html.
 * @param {Function} sanitizeAttributes
 *     maps from (tagName, attribs[]) to null or a sanitized attribute array.
 *     The attribs array can be arbitrarily modified, but the same array
 *     instance is reused, so should not be held.
 * @return {Function} from html to sanitized html
 */
html.makeHtmlSanitizer = function (sanitizeAttributes) {
  var stack;
  var ignoring;
  return html.makeSaxParser({
        startDoc: function (_) {
          stack = [];
          ignoring = false;
        },
        startTag: function (tagName, attribs, out) {
          if (ignoring) { return; }
          if (!html4.ELEMENTS.hasOwnProperty(tagName)) { return; }
          var eflags = html4.ELEMENTS[tagName];
          if (eflags & html4.eflags.FOLDABLE) {
            return;
          } else if (eflags & html4.eflags.UNSAFE) {
            ignoring = !(eflags & html4.eflags.EMPTY);
            return;
          }
          attribs = sanitizeAttributes(tagName, attribs);
          // TODO(mikesamuel): relying on sanitizeAttributes not to
          // insert unsafe attribute names.
          if (attribs) {
            if (!(eflags & html4.eflags.EMPTY)) {
              stack.push(tagName);
            }

            out.push('<', tagName);
            for (var i = 0, n = attribs.length; i < n; i += 2) {
              var attribName = attribs[i],
                  value = attribs[i + 1];
              if (value !== null && value !== void 0) {
                out.push(' ', attribName, '="', html.escapeAttrib(value), '"');
              }
            }
            out.push('>');
          }
        },
        endTag: function (tagName, out) {
          if (ignoring) {
            ignoring = false;
            return;
          }
          if (!html4.ELEMENTS.hasOwnProperty(tagName)) { return; }
          var eflags = html4.ELEMENTS[tagName];
          if (!(eflags & (html4.eflags.UNSAFE | html4.eflags.EMPTY
                          | html4.eflags.FOLDABLE))) {
            var index;
            if (eflags & html4.eflags.OPTIONAL_ENDTAG) {
              for (index = stack.length; --index >= 0;) {
                var stackEl = stack[index];
                if (stackEl === tagName) { break; }
                if (!(html4.ELEMENTS[stackEl] & html4.eflags.OPTIONAL_ENDTAG)) {
                  // Don't pop non optional end tags looking for a match.
                  return;
                }
              }
            } else {
              for (index = stack.length; --index >= 0;) {
                if (stack[index] === tagName) { break; }
              }
            }
            if (index < 0) { return; }  // Not opened.
            for (var i = stack.length; --i > index;) {
              var stackEl = stack[i];
              if (!(html4.ELEMENTS[stackEl] & html4.eflags.OPTIONAL_ENDTAG)) {
                out.push('</', stackEl, '>');
              }
            }
            stack.length = index;
            out.push('</', tagName, '>');
          }
        },
        pcdata: function (text, out) {
          if (!ignoring) { out.push(text); }
        },
        rcdata: function (text, out) {
          if (!ignoring) { out.push(text); }
        },
        cdata: function (text, out) {
          if (!ignoring) { out.push(text); }
        },
        endDoc: function (out) {
          for (var i = stack.length; --i >= 0;) {
            out.push('</', stack[i], '>');
          }
          stack.length = 0;
        }
      });
};


/**
 * Strips unsafe tags and attributes from html.
 * @param {string} htmlText to sanitize
 * @param {Function} opt_uriPolicy -- a transform to apply to uri/url attribute
 *     values.
 * @param {Function} opt_nmTokenPolicy : string -> string? -- a transform to
 *     apply to names, ids, and classes.
 * @return {string} html
 */
function html_sanitize(htmlText, opt_uriPolicy, opt_nmTokenPolicy) {
  var out = [];
  html.makeHtmlSanitizer(
      function sanitizeAttribs(tagName, attribs) {
        for (var i = 0; i < attribs.length; i += 2) {
          var attribName = attribs[i];
          var value = attribs[i + 1];
          var atype = null, attribKey;
          if ((attribKey = tagName + '::' + attribName,
               html4.ATTRIBS.hasOwnProperty(attribKey))
              || (attribKey = '*::' + attribName,
                  html4.ATTRIBS.hasOwnProperty(attribKey))) {
            atype = html4.ATTRIBS[attribKey];
          }
          if (atype !== null) {
            switch (atype) {
              case html4.atype.NONE: break;
              case html4.atype.SCRIPT:
              case html4.atype.STYLE:
                value = null;
                break;
              case html4.atype.ID:
              case html4.atype.IDREF:
              case html4.atype.IDREFS:
              case html4.atype.GLOBAL_NAME:
              case html4.atype.LOCAL_NAME:
              case html4.atype.CLASSES:
                value = opt_nmTokenPolicy ? opt_nmTokenPolicy(value) : value;
                break;
              case html4.atype.URI:
                value = opt_uriPolicy && opt_uriPolicy(value);
                break;
              case html4.atype.URI_FRAGMENT:
                if (value && '#' === value.charAt(0)) {
                  value = opt_nmTokenPolicy ? opt_nmTokenPolicy(value) : value;
                  if (value) { value = '#' + value; }
                } else {
                  value = null;
                }
                break;
              default:
                value = null;
                break;
            }
          } else {
            value = null;
          }
          attribs[i + 1] = value;
        }
        return attribs;
      })(htmlText, out);
  return out.join('');
}

/* Copyright Google Inc.
 * Licensed under the Apache Licence Version 2.0
 * Autogenerated at Fri Aug 13 11:26:55 PDT 2010
 * @provides html4
 */
var html4 = {};
html4 .atype = {
  'NONE': 0,
  'URI': 1,
  'URI_FRAGMENT': 11,
  'SCRIPT': 2,
  'STYLE': 3,
  'ID': 4,
  'IDREF': 5,
  'IDREFS': 6,
  'GLOBAL_NAME': 7,
  'LOCAL_NAME': 8,
  'CLASSES': 9,
  'FRAME_TARGET': 10
};
html4 .ATTRIBS = {
  '*::class': 9,
  '*::dir': 0,
  '*::id': 4,
  '*::lang': 0,
  '*::onclick': 2,
  '*::ondblclick': 2,
  '*::onkeydown': 2,
  '*::onkeypress': 2,
  '*::onkeyup': 2,
  '*::onload': 2,
  '*::onmousedown': 2,
  '*::onmousemove': 2,
  '*::onmouseout': 2,
  '*::onmouseover': 2,
  '*::onmouseup': 2,
  '*::style': 3,
  '*::title': 0,
  'a::accesskey': 0,
  'a::coords': 0,
  'a::href': 1,
  'a::hreflang': 0,
  'a::name': 7,
  'a::onblur': 2,
  'a::onfocus': 2,
  'a::rel': 0,
  'a::rev': 0,
  'a::shape': 0,
  'a::tabindex': 0,
  'a::target': 10,
  'a::type': 0,
  'area::accesskey': 0,
  'area::alt': 0,
  'area::coords': 0,
  'area::href': 1,
  'area::nohref': 0,
  'area::onblur': 2,
  'area::onfocus': 2,
  'area::shape': 0,
  'area::tabindex': 0,
  'area::target': 10,
  'bdo::dir': 0,
  'blockquote::cite': 1,
  'br::clear': 0,
  'button::accesskey': 0,
  'button::disabled': 0,
  'button::name': 8,
  'button::onblur': 2,
  'button::onfocus': 2,
  'button::tabindex': 0,
  'button::type': 0,
  'button::value': 0,
  'caption::align': 0,
  'col::align': 0,
  'col::char': 0,
  'col::charoff': 0,
  'col::span': 0,
  'col::valign': 0,
  'col::width': 0,
  'colgroup::align': 0,
  'colgroup::char': 0,
  'colgroup::charoff': 0,
  'colgroup::span': 0,
  'colgroup::valign': 0,
  'colgroup::width': 0,
  'del::cite': 1,
  'del::datetime': 0,
  'dir::compact': 0,
  'div::align': 0,
  'dl::compact': 0,
  'font::color': 0,
  'font::face': 0,
  'font::size': 0,
  'form::accept': 0,
  'form::action': 1,
  'form::autocomplete': 0,
  'form::enctype': 0,
  'form::method': 0,
  'form::name': 7,
  'form::onreset': 2,
  'form::onsubmit': 2,
  'form::target': 10,
  'h1::align': 0,
  'h2::align': 0,
  'h3::align': 0,
  'h4::align': 0,
  'h5::align': 0,
  'h6::align': 0,
  'hr::align': 0,
  'hr::noshade': 0,
  'hr::size': 0,
  'hr::width': 0,
  'iframe::align': 0,
  'iframe::frameborder': 0,
  'iframe::height': 0,
  'iframe::marginheight': 0,
  'iframe::marginwidth': 0,
  'iframe::width': 0,
  'img::align': 0,
  'img::alt': 0,
  'img::border': 0,
  'img::height': 0,
  'img::hspace': 0,
  'img::ismap': 0,
  'img::name': 7,
  'img::src': 1,
  'img::usemap': 11,
  'img::vspace': 0,
  'img::width': 0,
  'input::accept': 0,
  'input::accesskey': 0,
  'input::align': 0,
  'input::alt': 0,
  'input::autocomplete': 0,
  'input::checked': 0,
  'input::disabled': 0,
  'input::ismap': 0,
  'input::maxlength': 0,
  'input::name': 8,
  'input::onblur': 2,
  'input::onchange': 2,
  'input::onfocus': 2,
  'input::onselect': 2,
  'input::readonly': 0,
  'input::size': 0,
  'input::src': 1,
  'input::tabindex': 0,
  'input::type': 0,
  'input::usemap': 11,
  'input::value': 0,
  'ins::cite': 1,
  'ins::datetime': 0,
  'label::accesskey': 0,
  'label::for': 5,
  'label::onblur': 2,
  'label::onfocus': 2,
  'legend::accesskey': 0,
  'legend::align': 0,
  'li::type': 0,
  'li::value': 0,
  'map::name': 7,
  'menu::compact': 0,
  'ol::compact': 0,
  'ol::start': 0,
  'ol::type': 0,
  'optgroup::disabled': 0,
  'optgroup::label': 0,
  'option::disabled': 0,
  'option::label': 0,
  'option::selected': 0,
  'option::value': 0,
  'p::align': 0,
  'pre::width': 0,
  'q::cite': 1,
  'select::disabled': 0,
  'select::multiple': 0,
  'select::name': 8,
  'select::onblur': 2,
  'select::onchange': 2,
  'select::onfocus': 2,
  'select::size': 0,
  'select::tabindex': 0,
  'table::align': 0,
  'table::bgcolor': 0,
  'table::border': 0,
  'table::cellpadding': 0,
  'table::cellspacing': 0,
  'table::frame': 0,
  'table::rules': 0,
  'table::summary': 0,
  'table::width': 0,
  'tbody::align': 0,
  'tbody::char': 0,
  'tbody::charoff': 0,
  'tbody::valign': 0,
  'td::abbr': 0,
  'td::align': 0,
  'td::axis': 0,
  'td::bgcolor': 0,
  'td::char': 0,
  'td::charoff': 0,
  'td::colspan': 0,
  'td::headers': 6,
  'td::height': 0,
  'td::nowrap': 0,
  'td::rowspan': 0,
  'td::scope': 0,
  'td::valign': 0,
  'td::width': 0,
  'textarea::accesskey': 0,
  'textarea::cols': 0,
  'textarea::disabled': 0,
  'textarea::name': 8,
  'textarea::onblur': 2,
  'textarea::onchange': 2,
  'textarea::onfocus': 2,
  'textarea::onselect': 2,
  'textarea::readonly': 0,
  'textarea::rows': 0,
  'textarea::tabindex': 0,
  'tfoot::align': 0,
  'tfoot::char': 0,
  'tfoot::charoff': 0,
  'tfoot::valign': 0,
  'th::abbr': 0,
  'th::align': 0,
  'th::axis': 0,
  'th::bgcolor': 0,
  'th::char': 0,
  'th::charoff': 0,
  'th::colspan': 0,
  'th::headers': 6,
  'th::height': 0,
  'th::nowrap': 0,
  'th::rowspan': 0,
  'th::scope': 0,
  'th::valign': 0,
  'th::width': 0,
  'thead::align': 0,
  'thead::char': 0,
  'thead::charoff': 0,
  'thead::valign': 0,
  'tr::align': 0,
  'tr::bgcolor': 0,
  'tr::char': 0,
  'tr::charoff': 0,
  'tr::valign': 0,
  'ul::compact': 0,
  'ul::type': 0
};
html4 .eflags = {
  'OPTIONAL_ENDTAG': 1,
  'EMPTY': 2,
  'CDATA': 4,
  'RCDATA': 8,
  'UNSAFE': 16,
  'FOLDABLE': 32,
  'SCRIPT': 64,
  'STYLE': 128
};
html4 .ELEMENTS = {
  'a': 0,
  'abbr': 0,
  'acronym': 0,
  'address': 0,
  'applet': 16,
  'area': 2,
  'b': 0,
  'base': 18,
  'basefont': 18,
  'bdo': 0,
  'big': 0,
  'blockquote': 0,
  'body': 49,
  'br': 2,
  'button': 0,
  'caption': 0,
  'center': 0,
  'cite': 0,
  'code': 0,
  'col': 2,
  'colgroup': 1,
  'dd': 1,
  'del': 0,
  'dfn': 0,
  'dir': 0,
  'div': 0,
  'dl': 0,
  'dt': 1,
  'em': 0,
  'fieldset': 0,
  'font': 0,
  'form': 0,
  'frame': 18,
  'frameset': 16,
  'h1': 0,
  'h2': 0,
  'h3': 0,
  'h4': 0,
  'h5': 0,
  'h6': 0,
  'head': 49,
  'hr': 2,
  'html': 49,
  'i': 0,
  'iframe': 4,
  'img': 2,
  'input': 2,
  'ins': 0,
  'isindex': 18,
  'kbd': 0,
  'label': 0,
  'legend': 0,
  'li': 1,
  'link': 18,
  'map': 0,
  'menu': 0,
  'meta': 18,
  'noframes': 20,
  'noscript': 20,
  'object': 16,
  'ol': 0,
  'optgroup': 0,
  'option': 1,
  'p': 1,
  'param': 18,
  'pre': 0,
  'q': 0,
  's': 0,
  'samp': 0,
  'script': 84,
  'select': 0,
  'small': 0,
  'span': 0,
  'strike': 0,
  'strong': 0,
  'style': 148,
  'sub': 0,
  'sup': 0,
  'table': 0,
  'tbody': 1,
  'td': 1,
  'textarea': 8,
  'tfoot': 1,
  'th': 1,
  'thead': 1,
  'title': 24,
  'tr': 1,
  'tt': 0,
  'u': 0,
  'ul': 0,
  'var': 0
};

exports.escape = html.escapeAttrib;
exports.makeSaxParser = html.makeSaxParser;
exports.normalizeRCData = html.normalizeRCData;
exports.sanitize = html_sanitize;
exports.unescapeEntities = html.unescapeEntities;
});

require.define("/views/modal-share-view.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneAdapter = require('../backbone-adapter.js');
require('../bootstrap-modal.js');


var ModalShareView = Backbone.View.extend({
    events: {
        'show': 'updateCountdown',
        'change #comment': 'updateCountdown',
        'keyup #comment': 'updateCountdown',
        'click .share-ext': 'sendShare'
    },
    el: "#modal-share",

    initialize: function () {
    },
    
    showForMessage: function(message) {
        $(this.el).data('url', message.mainLink());
        $('#comment').val(message.get('title') + " - " + message.get('source').title);
        $(this.el).modal('show');
    },
    
    updateCountdown: function() {
        var lngth = $("#comment").val().length;
        $("#character-count").text(lngth + " characters");
        if(lngth > 120) {
            $(".btn.twitter").addClass("disabled");
        }
    },
    
    sendShare: function(e) {
        var url = encodeURI($('#modal-share').data('url'));
        var service = $(e.target).data('service');
        var comment = encodeURI($('#comment').val());
        chrome.extension.sendRequest({
            signature: "tab",
            params: {url: "http://msgboy.com/share/prepare?url=" + url + "&comment=" + comment + "&service=" + service, selected: true}
        });
        $('#modal-share').modal('hide');
    }
});

exports.ModalShareView = ModalShareView;

});

require.define("/bootstrap-modal.js", function (require, module, exports, __dirname, __filename) {
/* =========================================================
 * bootstrap-modal.js v1.3.0
 * http://twitter.github.com/bootstrap/javascript.html#modal
 * =========================================================
 * Copyright 2011 Twitter, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ========================================================= */


!function( $ ){

 /* CSS TRANSITION SUPPORT (https://gist.github.com/373874)
  * ======================================================= */

  var transitionEnd

  $(document).ready(function () {

    $.support.transition = (function () {
      var thisBody = document.body || document.documentElement
        , thisStyle = thisBody.style
        , support = thisStyle.transition !== undefined || thisStyle.WebkitTransition !== undefined || thisStyle.MozTransition !== undefined || thisStyle.MsTransition !== undefined || thisStyle.OTransition !== undefined
      return support
    })()

    // set CSS transition event type
    if ( $.support.transition ) {
      transitionEnd = "TransitionEnd"
      if ( $.browser.webkit ) {
      	transitionEnd = "webkitTransitionEnd"
      } else if ( $.browser.mozilla ) {
      	transitionEnd = "transitionend"
      } else if ( $.browser.opera ) {
      	transitionEnd = "oTransitionEnd"
      }
    }

  })


 /* MODAL PUBLIC CLASS DEFINITION
  * ============================= */

  var Modal = function ( content, options ) {
    this.settings = $.extend({}, $.fn.modal.defaults, options)
    this.$element = $(content)
      .delegate('.close', 'click.modal', $.proxy(this.hide, this))

    if ( this.settings.show ) {
      this.show()
    }

    return this
  }

  Modal.prototype = {

      toggle: function () {
        return this[!this.isShown ? 'show' : 'hide']()
      }

    , show: function () {
        var that = this
        this.isShown = true
        this.$element.trigger('show')

        escape.call(this)
        backdrop.call(this, function () {
          var transition = $.support.transition && that.$element.hasClass('fade')

          that.$element
            .appendTo(document.body)
            .show()

          if (transition) {
            that.$element[0].offsetWidth // force reflow
          }

          that.$element
            .addClass('in')

          transition ?
            that.$element.one(transitionEnd, function () { that.$element.trigger('shown') }) :
            that.$element.trigger('shown')

        })

        return this
      }

    , hide: function (e) {
        e && e.preventDefault()

        if ( !this.isShown ) {
          return this
        }

        var that = this
        this.isShown = false

        escape.call(this)

        this.$element
          .trigger('hide')
          .removeClass('in')

        function removeElement () {
          that.$element
            .hide()
            .trigger('hidden')

          backdrop.call(that)
        }

        $.support.transition && this.$element.hasClass('fade') ?
          this.$element.one(transitionEnd, removeElement) :
          removeElement()

        return this
      }

  }


 /* MODAL PRIVATE METHODS
  * ===================== */

  function backdrop ( callback ) {
    var that = this
      , animate = this.$element.hasClass('fade') ? 'fade' : ''
    if ( this.isShown && this.settings.backdrop ) {
      var doAnimate = $.support.transition && animate

      this.$backdrop = $('<div class="modal-backdrop ' + animate + '" />')
        .appendTo(document.body)

      if ( this.settings.backdrop != 'static' ) {
        this.$backdrop.click($.proxy(this.hide, this))
      }

      if ( doAnimate ) {
        this.$backdrop[0].offsetWidth // force reflow
      }

      this.$backdrop.addClass('in')

      doAnimate ?
        this.$backdrop.one(transitionEnd, callback) :
        callback()

    } else if ( !this.isShown && this.$backdrop ) {
      this.$backdrop.removeClass('in')

      function removeElement() {
        that.$backdrop.remove()
        that.$backdrop = null
      }

      $.support.transition && this.$element.hasClass('fade')?
        this.$backdrop.one(transitionEnd, removeElement) :
        removeElement()
    } else if ( callback ) {
       callback()
    }
  }

  function escape() {
    var that = this
    if ( this.isShown && this.settings.keyboard ) {
      $(document).bind('keyup.modal', function ( e ) {
        if ( e.which == 27 ) {
          that.hide()
        }
      })
    } else if ( !this.isShown ) {
      $(document).unbind('keyup.modal')
    }
  }


 /* MODAL PLUGIN DEFINITION
  * ======================= */

  $.fn.modal = function ( options ) {
    var modal = this.data('modal')

    if (!modal) {

      if (typeof options == 'string') {
        options = {
          show: /show|toggle/.test(options)
        }
      }

      return this.each(function () {
        $(this).data('modal', new Modal(this, options))
      })
    }

    if ( options === true ) {
      return modal
    }

    if ( typeof options == 'string' ) {
      modal[options]()
    } else if ( modal ) {
      modal.toggle()
    }

    return this
  }

  $.fn.modal.Modal = Modal

  $.fn.modal.defaults = {
    backdrop: false
  , keyboard: false
  , show: false
  }


 /* MODAL DATA- IMPLEMENTATION
  * ========================== */

  $(document).ready(function () {
    $('body').delegate('[data-controls-modal]', 'click', function (e) {
      e.preventDefault()
      var $this = $(this).data('show', true)
      $('#' + $this.attr('data-controls-modal')).modal( $this.data() )
    })
  })

}( window.jQuery || window.ender );
});

require.alias("jquery-browserify", "/node_modules/jquery");

require.alias("backbone-browserify", "/node_modules/backbone");

require.alias("../backbone-indexeddb.js", "../backbone-adapter.js");

require.define("/dashboard.js", function (require, module, exports, __dirname, __filename) {
    var Msgboy = require('./msgboy.js').Msgboy;
var $ = jQuery = require('jquery');
var Archive = require('./models/archive.js').Archive;
var ArchiveView = require('./views/archive-view.js').ArchiveView;
var ModalShareView = require('./views/modal-share-view.js').ModalShareView;

Msgboy.bind("loaded", function () {
    // Bam. Msgboy loaded
    var archive = new Archive();
        
     // The archiveView Object
     var archiveView = new ArchiveView({
         el: $("#archive"),
         collection: archive,
     });
     
     // The modalShareView Object.
     var modalShareView = new ModalShareView({
         el: "#modal-share"
     });
     
     // When a message is shared
     archive.bind("share", function (message) {
         modalShareView.showForMessage(message);
     });
     
     // Refresh the page! Maybe it would actually be fancier to add the elements to the archive and then push them in front. TODO
     $("#new_messages").click(function () {
         window.location.reload(true);
     }) 
     
     // Listening to the events from the background page.
     chrome.extension.onRequest.addListener(function (request, sender, sendResponse) {
         if (request.signature == "notify" && request.params) {
             // Cool, we have a new message. Let's see if we add it to the top, or reload the page.
             // Let's get the content of $("#new_messages")
             var count = parseInt($("#new_messages").attr("data-unread"));
             if (count) {
                 $("#new_messages").attr("data-unread", count + 1);
                 $("#new_messages").text("View " + (count + 1) + " new messages");
             } else {
                 $("#new_messages").css("top","0");
                 $("#new_messages").attr("data-unread", "1");
                 $("#new_messages").text("View 1 new message");
             }
         }
     });
});
Msgboy.run();

});
require("/dashboard.js");
