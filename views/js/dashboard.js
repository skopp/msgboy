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
var $ = jQuery = require('jquery-browserify');
var Backbone = require('backbone-browserify');
var BackboneIndexedDB = require('./backbone-indexeddb.js');

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
Msgboy.log.debugLevel = Msgboy.log.levels.DEBUG; // We may want to adjust that in production!
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
        Msgboy.reconnectDelay += 1;
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
        msg = 'Msgboy is disconnected. Reconnect in ' + Msgboy.helper.maths.number.fibonacci(Msgboy.reconnectDelay) + ' seconds.';
    } else if (status === Strophe.Status.CONNECTED) {
        Msgboy.autoReconnect = true; // Set autoReconnect to true only when we've been connected :)
        msg = 'Msgboy is connected.';
        Msgboy.connection.send($pres({})); // Send presence!
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
        }, Msgboy.helper.maths.number.fibonacci(Msgboy.reconnectDelay) * 1000);
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

require.define("/node_modules/jquery-browserify/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"./lib/jquery-1.6.2.js","browserify":{"dependencies":"","main":"lib/jquery-1.6.2.js"}}
});

require.define("/node_modules/jquery-browserify/lib/jquery-1.6.2.js", function (require, module, exports, __dirname, __filename) {
-function(){
  function create(){
    /*!
     * jQuery JavaScript Library v1.6.2
     * http://jquery.com/
     *
     * Copyright 2011, John Resig
     * Dual licensed under the MIT or GPL Version 2 licenses.
     * http://jquery.org/license
     *
     * Includes Sizzle.js
     * http://sizzlejs.com/
     * Copyright 2011, The Dojo Foundation
     * Released under the MIT, BSD, and GPL Licenses.
     *
     * Date: Thu Jun 30 14:16:56 2011 -0400
     */

    // Use the correct document accordingly with window argument (sandbox)
    var document = window.document,
    	navigator = window.navigator,
    	location = window.location;
    var jQuery = (function() {

    // Define a local copy of jQuery
    var jQuery = function( selector, context ) {
    		// The jQuery object is actually just the init constructor 'enhanced'
    		return new jQuery.fn.init( selector, context, rootjQuery );
    	},

    	// Map over jQuery in case of overwrite
    	_jQuery = window.jQuery,

    	// Map over the $ in case of overwrite
    	_$ = window.$,

    	// A central reference to the root jQuery(document)
    	rootjQuery,

    	// A simple way to check for HTML strings or ID strings
    	// (both of which we optimize for)
    	quickExpr = /^(?:[^<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/,

    	// Check if a string has a non-whitespace character in it
    	rnotwhite = /\S/,

    	// Used for trimming whitespace
    	trimLeft = /^\s+/,
    	trimRight = /\s+$/,

    	// Check for digits
    	rdigit = /\d/,

    	// Match a standalone tag
    	rsingleTag = /^<(\w+)\s*\/?>(?:<\/\1>)?$/,

    	// JSON RegExp
    	rvalidchars = /^[\],:{}\s]*$/,
    	rvalidescape = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,
    	rvalidtokens = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,
    	rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g,

    	// Useragent RegExp
    	rwebkit = /(webkit)[ \/]([\w.]+)/,
    	ropera = /(opera)(?:.*version)?[ \/]([\w.]+)/,
    	rmsie = /(msie) ([\w.]+)/,
    	rmozilla = /(mozilla)(?:.*? rv:([\w.]+))?/,

    	// Matches dashed string for camelizing
    	rdashAlpha = /-([a-z])/ig,

    	// Used by jQuery.camelCase as callback to replace()
    	fcamelCase = function( all, letter ) {
    		return letter.toUpperCase();
    	},

    	// Keep a UserAgent string for use with jQuery.browser
    	userAgent = navigator.userAgent,

    	// For matching the engine and version of the browser
    	browserMatch,

    	// The deferred used on DOM ready
    	readyList,

    	// The ready event handler
    	DOMContentLoaded,

    	// Save a reference to some core methods
    	toString = Object.prototype.toString,
    	hasOwn = Object.prototype.hasOwnProperty,
    	push = Array.prototype.push,
    	slice = Array.prototype.slice,
    	trim = String.prototype.trim,
    	indexOf = Array.prototype.indexOf,

    	// [[Class]] -> type pairs
    	class2type = {};

    jQuery.fn = jQuery.prototype = {
    	constructor: jQuery,
    	init: function( selector, context, rootjQuery ) {
    		var match, elem, ret, doc;

    		// Handle $(""), $(null), or $(undefined)
    		if ( !selector ) {
    			return this;
    		}

    		// Handle $(DOMElement)
    		if ( selector.nodeType ) {
    			this.context = this[0] = selector;
    			this.length = 1;
    			return this;
    		}

    		// The body element only exists once, optimize finding it
    		if ( selector === "body" && !context && document.body ) {
    			this.context = document;
    			this[0] = document.body;
    			this.selector = selector;
    			this.length = 1;
    			return this;
    		}

    		// Handle HTML strings
    		if ( typeof selector === "string" ) {
    			// Are we dealing with HTML string or an ID?
    			if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
    				// Assume that strings that start and end with <> are HTML and skip the regex check
    				match = [ null, selector, null ];

    			} else {
    				match = quickExpr.exec( selector );
    			}

    			// Verify a match, and that no context was specified for #id
    			if ( match && (match[1] || !context) ) {

    				// HANDLE: $(html) -> $(array)
    				if ( match[1] ) {
    					context = context instanceof jQuery ? context[0] : context;
    					doc = (context ? context.ownerDocument || context : document);

    					// If a single string is passed in and it's a single tag
    					// just do a createElement and skip the rest
    					ret = rsingleTag.exec( selector );

    					if ( ret ) {
    						if ( jQuery.isPlainObject( context ) ) {
    							selector = [ document.createElement( ret[1] ) ];
    							jQuery.fn.attr.call( selector, context, true );

    						} else {
    							selector = [ doc.createElement( ret[1] ) ];
    						}

    					} else {
    						ret = jQuery.buildFragment( [ match[1] ], [ doc ] );
    						selector = (ret.cacheable ? jQuery.clone(ret.fragment) : ret.fragment).childNodes;
    					}

    					return jQuery.merge( this, selector );

    				// HANDLE: $("#id")
    				} else {
    					elem = document.getElementById( match[2] );

    					// Check parentNode to catch when Blackberry 4.6 returns
    					// nodes that are no longer in the document #6963
    					if ( elem && elem.parentNode ) {
    						// Handle the case where IE and Opera return items
    						// by name instead of ID
    						if ( elem.id !== match[2] ) {
    							return rootjQuery.find( selector );
    						}

    						// Otherwise, we inject the element directly into the jQuery object
    						this.length = 1;
    						this[0] = elem;
    					}

    					this.context = document;
    					this.selector = selector;
    					return this;
    				}

    			// HANDLE: $(expr, $(...))
    			} else if ( !context || context.jquery ) {
    				return (context || rootjQuery).find( selector );

    			// HANDLE: $(expr, context)
    			// (which is just equivalent to: $(context).find(expr)
    			} else {
    				return this.constructor( context ).find( selector );
    			}

    		// HANDLE: $(function)
    		// Shortcut for document ready
    		} else if ( jQuery.isFunction( selector ) ) {
    			return rootjQuery.ready( selector );
    		}

    		if (selector.selector !== undefined) {
    			this.selector = selector.selector;
    			this.context = selector.context;
    		}

    		return jQuery.makeArray( selector, this );
    	},

    	// Start with an empty selector
    	selector: "",

    	// The current version of jQuery being used
    	jquery: "1.6.2",

    	// The default length of a jQuery object is 0
    	length: 0,

    	// The number of elements contained in the matched element set
    	size: function() {
    		return this.length;
    	},

    	toArray: function() {
    		return slice.call( this, 0 );
    	},

    	// Get the Nth element in the matched element set OR
    	// Get the whole matched element set as a clean array
    	get: function( num ) {
    		return num == null ?

    			// Return a 'clean' array
    			this.toArray() :

    			// Return just the object
    			( num < 0 ? this[ this.length + num ] : this[ num ] );
    	},

    	// Take an array of elements and push it onto the stack
    	// (returning the new matched element set)
    	pushStack: function( elems, name, selector ) {
    		// Build a new jQuery matched element set
    		var ret = this.constructor();

    		if ( jQuery.isArray( elems ) ) {
    			push.apply( ret, elems );

    		} else {
    			jQuery.merge( ret, elems );
    		}

    		// Add the old object onto the stack (as a reference)
    		ret.prevObject = this;

    		ret.context = this.context;

    		if ( name === "find" ) {
    			ret.selector = this.selector + (this.selector ? " " : "") + selector;
    		} else if ( name ) {
    			ret.selector = this.selector + "." + name + "(" + selector + ")";
    		}

    		// Return the newly-formed element set
    		return ret;
    	},

    	// Execute a callback for every element in the matched set.
    	// (You can seed the arguments with an array of args, but this is
    	// only used internally.)
    	each: function( callback, args ) {
    		return jQuery.each( this, callback, args );
    	},

    	ready: function( fn ) {
    		// Attach the listeners
    		jQuery.bindReady();

    		// Add the callback
    		readyList.done( fn );

    		return this;
    	},

    	eq: function( i ) {
    		return i === -1 ?
    			this.slice( i ) :
    			this.slice( i, +i + 1 );
    	},

    	first: function() {
    		return this.eq( 0 );
    	},

    	last: function() {
    		return this.eq( -1 );
    	},

    	slice: function() {
    		return this.pushStack( slice.apply( this, arguments ),
    			"slice", slice.call(arguments).join(",") );
    	},

    	map: function( callback ) {
    		return this.pushStack( jQuery.map(this, function( elem, i ) {
    			return callback.call( elem, i, elem );
    		}));
    	},

    	end: function() {
    		return this.prevObject || this.constructor(null);
    	},

    	// For internal use only.
    	// Behaves like an Array's method, not like a jQuery method.
    	push: push,
    	sort: [].sort,
    	splice: [].splice
    };

    // Give the init function the jQuery prototype for later instantiation
    jQuery.fn.init.prototype = jQuery.fn;

    jQuery.extend = jQuery.fn.extend = function() {
    	var options, name, src, copy, copyIsArray, clone,
    		target = arguments[0] || {},
    		i = 1,
    		length = arguments.length,
    		deep = false;

    	// Handle a deep copy situation
    	if ( typeof target === "boolean" ) {
    		deep = target;
    		target = arguments[1] || {};
    		// skip the boolean and the target
    		i = 2;
    	}

    	// Handle case when target is a string or something (possible in deep copy)
    	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
    		target = {};
    	}

    	// extend jQuery itself if only one argument is passed
    	if ( length === i ) {
    		target = this;
    		--i;
    	}

    	for ( ; i < length; i++ ) {
    		// Only deal with non-null/undefined values
    		if ( (options = arguments[ i ]) != null ) {
    			// Extend the base object
    			for ( name in options ) {
    				src = target[ name ];
    				copy = options[ name ];

    				// Prevent never-ending loop
    				if ( target === copy ) {
    					continue;
    				}

    				// Recurse if we're merging plain objects or arrays
    				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
    					if ( copyIsArray ) {
    						copyIsArray = false;
    						clone = src && jQuery.isArray(src) ? src : [];

    					} else {
    						clone = src && jQuery.isPlainObject(src) ? src : {};
    					}

    					// Never move original objects, clone them
    					target[ name ] = jQuery.extend( deep, clone, copy );

    				// Don't bring in undefined values
    				} else if ( copy !== undefined ) {
    					target[ name ] = copy;
    				}
    			}
    		}
    	}

    	// Return the modified object
    	return target;
    };

    jQuery.extend({
    	noConflict: function( deep ) {
    		if ( window.$ === jQuery ) {
    			window.$ = _$;
    		}

    		if ( deep && window.jQuery === jQuery ) {
    			window.jQuery = _jQuery;
    		}

    		return jQuery;
    	},

    	// Is the DOM ready to be used? Set to true once it occurs.
    	isReady: false,

    	// A counter to track how many items to wait for before
    	// the ready event fires. See #6781
    	readyWait: 1,

    	// Hold (or release) the ready event
    	holdReady: function( hold ) {
    		if ( hold ) {
    			jQuery.readyWait++;
    		} else {
    			jQuery.ready( true );
    		}
    	},

    	// Handle when the DOM is ready
    	ready: function( wait ) {
    		// Either a released hold or an DOMready/load event and not yet ready
    		if ( (wait === true && !--jQuery.readyWait) || (wait !== true && !jQuery.isReady) ) {
    			// Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
    			if ( !document.body ) {
    				return setTimeout( jQuery.ready, 1 );
    			}

    			// Remember that the DOM is ready
    			jQuery.isReady = true;

    			// If a normal DOM Ready event fired, decrement, and wait if need be
    			if ( wait !== true && --jQuery.readyWait > 0 ) {
    				return;
    			}

    			// If there are functions bound, to execute
    			readyList.resolveWith( document, [ jQuery ] );

    			// Trigger any bound ready events
    			if ( jQuery.fn.trigger ) {
    				jQuery( document ).trigger( "ready" ).unbind( "ready" );
    			}
    		}
    	},

    	bindReady: function() {
    		if ( readyList ) {
    			return;
    		}

    		readyList = jQuery._Deferred();

    		// Catch cases where $(document).ready() is called after the
    		// browser event has already occurred.
    		if ( document.readyState === "complete" ) {
    			// Handle it asynchronously to allow scripts the opportunity to delay ready
    			return setTimeout( jQuery.ready, 1 );
    		}

    		// Mozilla, Opera and webkit nightlies currently support this event
    		if ( document.addEventListener ) {
    			// Use the handy event callback
    			document.addEventListener( "DOMContentLoaded", DOMContentLoaded, false );

    			// A fallback to window.onload, that will always work
    			window.addEventListener( "load", jQuery.ready, false );

    		// If IE event model is used
    		} else if ( document.attachEvent ) {
    			// ensure firing before onload,
    			// maybe late but safe also for iframes
    			document.attachEvent( "onreadystatechange", DOMContentLoaded );

    			// A fallback to window.onload, that will always work
    			window.attachEvent( "onload", jQuery.ready );

    			// If IE and not a frame
    			// continually check to see if the document is ready
    			var toplevel = false;

    			try {
    				toplevel = window.frameElement == null;
    			} catch(e) {}

    			if ( document.documentElement.doScroll && toplevel ) {
    				doScrollCheck();
    			}
    		}
    	},

    	// See test/unit/core.js for details concerning isFunction.
    	// Since version 1.3, DOM methods and functions like alert
    	// aren't supported. They return false on IE (#2968).
    	isFunction: function( obj ) {
    		return jQuery.type(obj) === "function";
    	},

    	isArray: Array.isArray || function( obj ) {
    		return jQuery.type(obj) === "array";
    	},

    	// A crude way of determining if an object is a window
    	isWindow: function( obj ) {
    		return obj && typeof obj === "object" && "setInterval" in obj;
    	},

    	isNaN: function( obj ) {
    		return obj == null || !rdigit.test( obj ) || isNaN( obj );
    	},

    	type: function( obj ) {
    		return obj == null ?
    			String( obj ) :
    			class2type[ toString.call(obj) ] || "object";
    	},

    	isPlainObject: function( obj ) {
    		// Must be an Object.
    		// Because of IE, we also have to check the presence of the constructor property.
    		// Make sure that DOM nodes and window objects don't pass through, as well
    		if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
    			return false;
    		}

    		// Not own constructor property must be Object
    		if ( obj.constructor &&
    			!hasOwn.call(obj, "constructor") &&
    			!hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
    			return false;
    		}

    		// Own properties are enumerated firstly, so to speed up,
    		// if last one is own, then all properties are own.

    		var key;
    		for ( key in obj ) {}

    		return key === undefined || hasOwn.call( obj, key );
    	},

    	isEmptyObject: function( obj ) {
    		for ( var name in obj ) {
    			return false;
    		}
    		return true;
    	},

    	error: function( msg ) {
    		throw msg;
    	},

    	parseJSON: function( data ) {
    		if ( typeof data !== "string" || !data ) {
    			return null;
    		}

    		// Make sure leading/trailing whitespace is removed (IE can't handle it)
    		data = jQuery.trim( data );

    		// Attempt to parse using the native JSON parser first
    		if ( window.JSON && window.JSON.parse ) {
    			return window.JSON.parse( data );
    		}

    		// Make sure the incoming data is actual JSON
    		// Logic borrowed from http://json.org/json2.js
    		if ( rvalidchars.test( data.replace( rvalidescape, "@" )
    			.replace( rvalidtokens, "]" )
    			.replace( rvalidbraces, "")) ) {

    			return (new Function( "return " + data ))();

    		}
    		jQuery.error( "Invalid JSON: " + data );
    	},

    	// Cross-browser xml parsing
    	// (xml & tmp used internally)
    	parseXML: function( data , xml , tmp ) {

    		if ( window.DOMParser ) { // Standard
    			tmp = new DOMParser();
    			xml = tmp.parseFromString( data , "text/xml" );
    		} else { // IE
    			xml = new ActiveXObject( "Microsoft.XMLDOM" );
    			xml.async = "false";
    			xml.loadXML( data );
    		}

    		tmp = xml.documentElement;

    		if ( ! tmp || ! tmp.nodeName || tmp.nodeName === "parsererror" ) {
    			jQuery.error( "Invalid XML: " + data );
    		}

    		return xml;
    	},

    	noop: function() {},

    	// Evaluates a script in a global context
    	// Workarounds based on findings by Jim Driscoll
    	// http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
    	globalEval: function( data ) {
    		if ( data && rnotwhite.test( data ) ) {
    			// We use execScript on Internet Explorer
    			// We use an anonymous function so that context is window
    			// rather than jQuery in Firefox
    			( window.execScript || function( data ) {
    				window[ "eval" ].call( window, data );
    			} )( data );
    		}
    	},

    	// Converts a dashed string to camelCased string;
    	// Used by both the css and data modules
    	camelCase: function( string ) {
    		return string.replace( rdashAlpha, fcamelCase );
    	},

    	nodeName: function( elem, name ) {
    		return elem.nodeName && elem.nodeName.toUpperCase() === name.toUpperCase();
    	},

    	// args is for internal usage only
    	each: function( object, callback, args ) {
    		var name, i = 0,
    			length = object.length,
    			isObj = length === undefined || jQuery.isFunction( object );

    		if ( args ) {
    			if ( isObj ) {
    				for ( name in object ) {
    					if ( callback.apply( object[ name ], args ) === false ) {
    						break;
    					}
    				}
    			} else {
    				for ( ; i < length; ) {
    					if ( callback.apply( object[ i++ ], args ) === false ) {
    						break;
    					}
    				}
    			}

    		// A special, fast, case for the most common use of each
    		} else {
    			if ( isObj ) {
    				for ( name in object ) {
    					if ( callback.call( object[ name ], name, object[ name ] ) === false ) {
    						break;
    					}
    				}
    			} else {
    				for ( ; i < length; ) {
    					if ( callback.call( object[ i ], i, object[ i++ ] ) === false ) {
    						break;
    					}
    				}
    			}
    		}

    		return object;
    	},

    	// Use native String.trim function wherever possible
    	trim: trim ?
    		function( text ) {
    			return text == null ?
    				"" :
    				trim.call( text );
    		} :

    		// Otherwise use our own trimming functionality
    		function( text ) {
    			return text == null ?
    				"" :
    				text.toString().replace( trimLeft, "" ).replace( trimRight, "" );
    		},

    	// results is for internal usage only
    	makeArray: function( array, results ) {
    		var ret = results || [];

    		if ( array != null ) {
    			// The window, strings (and functions) also have 'length'
    			// The extra typeof function check is to prevent crashes
    			// in Safari 2 (See: #3039)
    			// Tweaked logic slightly to handle Blackberry 4.7 RegExp issues #6930
    			var type = jQuery.type( array );

    			if ( array.length == null || type === "string" || type === "function" || type === "regexp" || jQuery.isWindow( array ) ) {
    				push.call( ret, array );
    			} else {
    				jQuery.merge( ret, array );
    			}
    		}

    		return ret;
    	},

    	inArray: function( elem, array ) {

    		if ( indexOf ) {
    			return indexOf.call( array, elem );
    		}

    		for ( var i = 0, length = array.length; i < length; i++ ) {
    			if ( array[ i ] === elem ) {
    				return i;
    			}
    		}

    		return -1;
    	},

    	merge: function( first, second ) {
    		var i = first.length,
    			j = 0;

    		if ( typeof second.length === "number" ) {
    			for ( var l = second.length; j < l; j++ ) {
    				first[ i++ ] = second[ j ];
    			}

    		} else {
    			while ( second[j] !== undefined ) {
    				first[ i++ ] = second[ j++ ];
    			}
    		}

    		first.length = i;

    		return first;
    	},

    	grep: function( elems, callback, inv ) {
    		var ret = [], retVal;
    		inv = !!inv;

    		// Go through the array, only saving the items
    		// that pass the validator function
    		for ( var i = 0, length = elems.length; i < length; i++ ) {
    			retVal = !!callback( elems[ i ], i );
    			if ( inv !== retVal ) {
    				ret.push( elems[ i ] );
    			}
    		}

    		return ret;
    	},

    	// arg is for internal usage only
    	map: function( elems, callback, arg ) {
    		var value, key, ret = [],
    			i = 0,
    			length = elems.length,
    			// jquery objects are treated as arrays
    			isArray = elems instanceof jQuery || length !== undefined && typeof length === "number" && ( ( length > 0 && elems[ 0 ] && elems[ length -1 ] ) || length === 0 || jQuery.isArray( elems ) ) ;

    		// Go through the array, translating each of the items to their
    		if ( isArray ) {
    			for ( ; i < length; i++ ) {
    				value = callback( elems[ i ], i, arg );

    				if ( value != null ) {
    					ret[ ret.length ] = value;
    				}
    			}

    		// Go through every key on the object,
    		} else {
    			for ( key in elems ) {
    				value = callback( elems[ key ], key, arg );

    				if ( value != null ) {
    					ret[ ret.length ] = value;
    				}
    			}
    		}

    		// Flatten any nested arrays
    		return ret.concat.apply( [], ret );
    	},

    	// A global GUID counter for objects
    	guid: 1,

    	// Bind a function to a context, optionally partially applying any
    	// arguments.
    	proxy: function( fn, context ) {
    		if ( typeof context === "string" ) {
    			var tmp = fn[ context ];
    			context = fn;
    			fn = tmp;
    		}

    		// Quick check to determine if target is callable, in the spec
    		// this throws a TypeError, but we will just return undefined.
    		if ( !jQuery.isFunction( fn ) ) {
    			return undefined;
    		}

    		// Simulated bind
    		var args = slice.call( arguments, 2 ),
    			proxy = function() {
    				return fn.apply( context, args.concat( slice.call( arguments ) ) );
    			};

    		// Set the guid of unique handler to the same of original handler, so it can be removed
    		proxy.guid = fn.guid = fn.guid || proxy.guid || jQuery.guid++;

    		return proxy;
    	},

    	// Mutifunctional method to get and set values to a collection
    	// The value/s can optionally be executed if it's a function
    	access: function( elems, key, value, exec, fn, pass ) {
    		var length = elems.length;

    		// Setting many attributes
    		if ( typeof key === "object" ) {
    			for ( var k in key ) {
    				jQuery.access( elems, k, key[k], exec, fn, value );
    			}
    			return elems;
    		}

    		// Setting one attribute
    		if ( value !== undefined ) {
    			// Optionally, function values get executed if exec is true
    			exec = !pass && exec && jQuery.isFunction(value);

    			for ( var i = 0; i < length; i++ ) {
    				fn( elems[i], key, exec ? value.call( elems[i], i, fn( elems[i], key ) ) : value, pass );
    			}

    			return elems;
    		}

    		// Getting an attribute
    		return length ? fn( elems[0], key ) : undefined;
    	},

    	now: function() {
    		return (new Date()).getTime();
    	},

    	// Use of jQuery.browser is frowned upon.
    	// More details: http://docs.jquery.com/Utilities/jQuery.browser
    	uaMatch: function( ua ) {
    		ua = ua.toLowerCase();

    		var match = rwebkit.exec( ua ) ||
    			ropera.exec( ua ) ||
    			rmsie.exec( ua ) ||
    			ua.indexOf("compatible") < 0 && rmozilla.exec( ua ) ||
    			[];

    		return { browser: match[1] || "", version: match[2] || "0" };
    	},

    	sub: function() {
    		function jQuerySub( selector, context ) {
    			return new jQuerySub.fn.init( selector, context );
    		}
    		jQuery.extend( true, jQuerySub, this );
    		jQuerySub.superclass = this;
    		jQuerySub.fn = jQuerySub.prototype = this();
    		jQuerySub.fn.constructor = jQuerySub;
    		jQuerySub.sub = this.sub;
    		jQuerySub.fn.init = function init( selector, context ) {
    			if ( context && context instanceof jQuery && !(context instanceof jQuerySub) ) {
    				context = jQuerySub( context );
    			}

    			return jQuery.fn.init.call( this, selector, context, rootjQuerySub );
    		};
    		jQuerySub.fn.init.prototype = jQuerySub.fn;
    		var rootjQuerySub = jQuerySub(document);
    		return jQuerySub;
    	},

    	browser: {}
    });

    // Populate the class2type map
    jQuery.each("Boolean Number String Function Array Date RegExp Object".split(" "), function(i, name) {
    	class2type[ "[object " + name + "]" ] = name.toLowerCase();
    });

    browserMatch = jQuery.uaMatch( userAgent );
    if ( browserMatch.browser ) {
    	jQuery.browser[ browserMatch.browser ] = true;
    	jQuery.browser.version = browserMatch.version;
    }

    // Deprecated, use jQuery.browser.webkit instead
    if ( jQuery.browser.webkit ) {
    	jQuery.browser.safari = true;
    }

    // IE doesn't match non-breaking spaces with \s
    if ( rnotwhite.test( "\xA0" ) ) {
    	trimLeft = /^[\s\xA0]+/;
    	trimRight = /[\s\xA0]+$/;
    }

    // All jQuery objects should point back to these
    rootjQuery = jQuery(document);

    // Cleanup functions for the document ready method
    if ( document.addEventListener ) {
    	DOMContentLoaded = function() {
    		document.removeEventListener( "DOMContentLoaded", DOMContentLoaded, false );
    		jQuery.ready();
    	};

    } else if ( document.attachEvent ) {
    	DOMContentLoaded = function() {
    		// Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
    		if ( document.readyState === "complete" ) {
    			document.detachEvent( "onreadystatechange", DOMContentLoaded );
    			jQuery.ready();
    		}
    	};
    }

    // The DOM ready check for Internet Explorer
    function doScrollCheck() {
    	if ( jQuery.isReady ) {
    		return;
    	}

    	try {
    		// If IE is used, use the trick by Diego Perini
    		// http://javascript.nwbox.com/IEContentLoaded/
    		document.documentElement.doScroll("left");
    	} catch(e) {
    		setTimeout( doScrollCheck, 1 );
    		return;
    	}

    	// and execute any waiting functions
    	jQuery.ready();
    }

    return jQuery;

    })();


    var // Promise methods
    	promiseMethods = "done fail isResolved isRejected promise then always pipe".split( " " ),
    	// Static reference to slice
    	sliceDeferred = [].slice;

    jQuery.extend({
    	// Create a simple deferred (one callbacks list)
    	_Deferred: function() {
    		var // callbacks list
    			callbacks = [],
    			// stored [ context , args ]
    			fired,
    			// to avoid firing when already doing so
    			firing,
    			// flag to know if the deferred has been cancelled
    			cancelled,
    			// the deferred itself
    			deferred  = {

    				// done( f1, f2, ...)
    				done: function() {
    					if ( !cancelled ) {
    						var args = arguments,
    							i,
    							length,
    							elem,
    							type,
    							_fired;
    						if ( fired ) {
    							_fired = fired;
    							fired = 0;
    						}
    						for ( i = 0, length = args.length; i < length; i++ ) {
    							elem = args[ i ];
    							type = jQuery.type( elem );
    							if ( type === "array" ) {
    								deferred.done.apply( deferred, elem );
    							} else if ( type === "function" ) {
    								callbacks.push( elem );
    							}
    						}
    						if ( _fired ) {
    							deferred.resolveWith( _fired[ 0 ], _fired[ 1 ] );
    						}
    					}
    					return this;
    				},

    				// resolve with given context and args
    				resolveWith: function( context, args ) {
    					if ( !cancelled && !fired && !firing ) {
    						// make sure args are available (#8421)
    						args = args || [];
    						firing = 1;
    						try {
    							while( callbacks[ 0 ] ) {
    								callbacks.shift().apply( context, args );
    							}
    						}
    						finally {
    							fired = [ context, args ];
    							firing = 0;
    						}
    					}
    					return this;
    				},

    				// resolve with this as context and given arguments
    				resolve: function() {
    					deferred.resolveWith( this, arguments );
    					return this;
    				},

    				// Has this deferred been resolved?
    				isResolved: function() {
    					return !!( firing || fired );
    				},

    				// Cancel
    				cancel: function() {
    					cancelled = 1;
    					callbacks = [];
    					return this;
    				}
    			};

    		return deferred;
    	},

    	// Full fledged deferred (two callbacks list)
    	Deferred: function( func ) {
    		var deferred = jQuery._Deferred(),
    			failDeferred = jQuery._Deferred(),
    			promise;
    		// Add errorDeferred methods, then and promise
    		jQuery.extend( deferred, {
    			then: function( doneCallbacks, failCallbacks ) {
    				deferred.done( doneCallbacks ).fail( failCallbacks );
    				return this;
    			},
    			always: function() {
    				return deferred.done.apply( deferred, arguments ).fail.apply( this, arguments );
    			},
    			fail: failDeferred.done,
    			rejectWith: failDeferred.resolveWith,
    			reject: failDeferred.resolve,
    			isRejected: failDeferred.isResolved,
    			pipe: function( fnDone, fnFail ) {
    				return jQuery.Deferred(function( newDefer ) {
    					jQuery.each( {
    						done: [ fnDone, "resolve" ],
    						fail: [ fnFail, "reject" ]
    					}, function( handler, data ) {
    						var fn = data[ 0 ],
    							action = data[ 1 ],
    							returned;
    						if ( jQuery.isFunction( fn ) ) {
    							deferred[ handler ](function() {
    								returned = fn.apply( this, arguments );
    								if ( returned && jQuery.isFunction( returned.promise ) ) {
    									returned.promise().then( newDefer.resolve, newDefer.reject );
    								} else {
    									newDefer[ action ]( returned );
    								}
    							});
    						} else {
    							deferred[ handler ]( newDefer[ action ] );
    						}
    					});
    				}).promise();
    			},
    			// Get a promise for this deferred
    			// If obj is provided, the promise aspect is added to the object
    			promise: function( obj ) {
    				if ( obj == null ) {
    					if ( promise ) {
    						return promise;
    					}
    					promise = obj = {};
    				}
    				var i = promiseMethods.length;
    				while( i-- ) {
    					obj[ promiseMethods[i] ] = deferred[ promiseMethods[i] ];
    				}
    				return obj;
    			}
    		});
    		// Make sure only one callback list will be used
    		deferred.done( failDeferred.cancel ).fail( deferred.cancel );
    		// Unexpose cancel
    		delete deferred.cancel;
    		// Call given func if any
    		if ( func ) {
    			func.call( deferred, deferred );
    		}
    		return deferred;
    	},

    	// Deferred helper
    	when: function( firstParam ) {
    		var args = arguments,
    			i = 0,
    			length = args.length,
    			count = length,
    			deferred = length <= 1 && firstParam && jQuery.isFunction( firstParam.promise ) ?
    				firstParam :
    				jQuery.Deferred();
    		function resolveFunc( i ) {
    			return function( value ) {
    				args[ i ] = arguments.length > 1 ? sliceDeferred.call( arguments, 0 ) : value;
    				if ( !( --count ) ) {
    					// Strange bug in FF4:
    					// Values changed onto the arguments object sometimes end up as undefined values
    					// outside the $.when method. Cloning the object into a fresh array solves the issue
    					deferred.resolveWith( deferred, sliceDeferred.call( args, 0 ) );
    				}
    			};
    		}
    		if ( length > 1 ) {
    			for( ; i < length; i++ ) {
    				if ( args[ i ] && jQuery.isFunction( args[ i ].promise ) ) {
    					args[ i ].promise().then( resolveFunc(i), deferred.reject );
    				} else {
    					--count;
    				}
    			}
    			if ( !count ) {
    				deferred.resolveWith( deferred, args );
    			}
    		} else if ( deferred !== firstParam ) {
    			deferred.resolveWith( deferred, length ? [ firstParam ] : [] );
    		}
    		return deferred.promise();
    	}
    });



    jQuery.support = (function() {

    	var div = document.createElement( "div" ),
    		documentElement = document.documentElement,
    		all,
    		a,
    		select,
    		opt,
    		input,
    		marginDiv,
    		support,
    		fragment,
    		body,
    		testElementParent,
    		testElement,
    		testElementStyle,
    		tds,
    		events,
    		eventName,
    		i,
    		isSupported;

    	// Preliminary tests
    	div.setAttribute("className", "t");
    	div.innerHTML = "   <link/><table></table><a href='/a' style='top:1px;float:left;opacity:.55;'>a</a><input type='checkbox'/>";

    	all = div.getElementsByTagName( "*" );
    	a = div.getElementsByTagName( "a" )[ 0 ];

    	// Can't get basic test support
    	if ( !all || !all.length || !a ) {
    		return {};
    	}

    	// First batch of supports tests
    	select = document.createElement( "select" );
    	opt = select.appendChild( document.createElement("option") );
    	input = div.getElementsByTagName( "input" )[ 0 ];

    	support = {
    		// IE strips leading whitespace when .innerHTML is used
    		leadingWhitespace: ( div.firstChild.nodeType === 3 ),

    		// Make sure that tbody elements aren't automatically inserted
    		// IE will insert them into empty tables
    		tbody: !div.getElementsByTagName( "tbody" ).length,

    		// Make sure that link elements get serialized correctly by innerHTML
    		// This requires a wrapper element in IE
    		htmlSerialize: !!div.getElementsByTagName( "link" ).length,

    		// Get the style information from getAttribute
    		// (IE uses .cssText instead)
    		style: /top/.test( a.getAttribute("style") ),

    		// Make sure that URLs aren't manipulated
    		// (IE normalizes it by default)
    		hrefNormalized: ( a.getAttribute( "href" ) === "/a" ),

    		// Make sure that element opacity exists
    		// (IE uses filter instead)
    		// Use a regex to work around a WebKit issue. See #5145
    		opacity: /^0.55$/.test( a.style.opacity ),

    		// Verify style float existence
    		// (IE uses styleFloat instead of cssFloat)
    		cssFloat: !!a.style.cssFloat,

    		// Make sure that if no value is specified for a checkbox
    		// that it defaults to "on".
    		// (WebKit defaults to "" instead)
    		checkOn: ( input.value === "on" ),

    		// Make sure that a selected-by-default option has a working selected property.
    		// (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
    		optSelected: opt.selected,

    		// Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
    		getSetAttribute: div.className !== "t",

    		// Will be defined later
    		submitBubbles: true,
    		changeBubbles: true,
    		focusinBubbles: false,
    		deleteExpando: true,
    		noCloneEvent: true,
    		inlineBlockNeedsLayout: false,
    		shrinkWrapBlocks: false,
    		reliableMarginRight: true
    	};

    	// Make sure checked status is properly cloned
    	input.checked = true;
    	support.noCloneChecked = input.cloneNode( true ).checked;

    	// Make sure that the options inside disabled selects aren't marked as disabled
    	// (WebKit marks them as disabled)
    	select.disabled = true;
    	support.optDisabled = !opt.disabled;

    	// Test to see if it's possible to delete an expando from an element
    	// Fails in Internet Explorer
    	try {
    		delete div.test;
    	} catch( e ) {
    		support.deleteExpando = false;
    	}

    	if ( !div.addEventListener && div.attachEvent && div.fireEvent ) {
    		div.attachEvent( "onclick", function() {
    			// Cloning a node shouldn't copy over any
    			// bound event handlers (IE does this)
    			support.noCloneEvent = false;
    		});
    		div.cloneNode( true ).fireEvent( "onclick" );
    	}

    	// Check if a radio maintains it's value
    	// after being appended to the DOM
    	input = document.createElement("input");
    	input.value = "t";
    	input.setAttribute("type", "radio");
    	support.radioValue = input.value === "t";

    	input.setAttribute("checked", "checked");
    	div.appendChild( input );
    	fragment = document.createDocumentFragment();
    	fragment.appendChild( div.firstChild );

    	// WebKit doesn't clone checked state correctly in fragments
    	support.checkClone = fragment.cloneNode( true ).cloneNode( true ).lastChild.checked;

    	div.innerHTML = "";

    	// Figure out if the W3C box model works as expected
    	div.style.width = div.style.paddingLeft = "1px";

    	body = document.getElementsByTagName( "body" )[ 0 ];
    	// We use our own, invisible, body unless the body is already present
    	// in which case we use a div (#9239)
    	testElement = document.createElement( body ? "div" : "body" );
    	testElementStyle = {
    		visibility: "hidden",
    		width: 0,
    		height: 0,
    		border: 0,
    		margin: 0
    	};
    	if ( body ) {
    		jQuery.extend( testElementStyle, {
    			position: "absolute",
    			left: -1000,
    			top: -1000
    		});
    	}
    	for ( i in testElementStyle ) {
    		testElement.style[ i ] = testElementStyle[ i ];
    	}
    	testElement.appendChild( div );
    	testElementParent = body || documentElement;
    	testElementParent.insertBefore( testElement, testElementParent.firstChild );

    	// Check if a disconnected checkbox will retain its checked
    	// value of true after appended to the DOM (IE6/7)
    	support.appendChecked = input.checked;

    	support.boxModel = div.offsetWidth === 2;

    	if ( "zoom" in div.style ) {
    		// Check if natively block-level elements act like inline-block
    		// elements when setting their display to 'inline' and giving
    		// them layout
    		// (IE < 8 does this)
    		div.style.display = "inline";
    		div.style.zoom = 1;
    		support.inlineBlockNeedsLayout = ( div.offsetWidth === 2 );

    		// Check if elements with layout shrink-wrap their children
    		// (IE 6 does this)
    		div.style.display = "";
    		div.innerHTML = "<div style='width:4px;'></div>";
    		support.shrinkWrapBlocks = ( div.offsetWidth !== 2 );
    	}

    	div.innerHTML = "<table><tr><td style='padding:0;border:0;display:none'></td><td>t</td></tr></table>";
    	tds = div.getElementsByTagName( "td" );

    	// Check if table cells still have offsetWidth/Height when they are set
    	// to display:none and there are still other visible table cells in a
    	// table row; if so, offsetWidth/Height are not reliable for use when
    	// determining if an element has been hidden directly using
    	// display:none (it is still safe to use offsets if a parent element is
    	// hidden; don safety goggles and see bug #4512 for more information).
    	// (only IE 8 fails this test)
    	isSupported = ( tds[ 0 ].offsetHeight === 0 );

    	tds[ 0 ].style.display = "";
    	tds[ 1 ].style.display = "none";

    	// Check if empty table cells still have offsetWidth/Height
    	// (IE < 8 fail this test)
    	support.reliableHiddenOffsets = isSupported && ( tds[ 0 ].offsetHeight === 0 );
    	div.innerHTML = "";

    	// Check if div with explicit width and no margin-right incorrectly
    	// gets computed margin-right based on width of container. For more
    	// info see bug #3333
    	// Fails in WebKit before Feb 2011 nightlies
    	// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
    	if ( document.defaultView && document.defaultView.getComputedStyle ) {
    		marginDiv = document.createElement( "div" );
    		marginDiv.style.width = "0";
    		marginDiv.style.marginRight = "0";
    		div.appendChild( marginDiv );
    		support.reliableMarginRight =
    			( parseInt( ( document.defaultView.getComputedStyle( marginDiv, null ) || { marginRight: 0 } ).marginRight, 10 ) || 0 ) === 0;
    	}

    	// Remove the body element we added
    	testElement.innerHTML = "";
    	testElementParent.removeChild( testElement );

    	// Technique from Juriy Zaytsev
    	// http://thinkweb2.com/projects/prototype/detecting-event-support-without-browser-sniffing/
    	// We only care about the case where non-standard event systems
    	// are used, namely in IE. Short-circuiting here helps us to
    	// avoid an eval call (in setAttribute) which can cause CSP
    	// to go haywire. See: https://developer.mozilla.org/en/Security/CSP
    	if ( div.attachEvent ) {
    		for( i in {
    			submit: 1,
    			change: 1,
    			focusin: 1
    		} ) {
    			eventName = "on" + i;
    			isSupported = ( eventName in div );
    			if ( !isSupported ) {
    				div.setAttribute( eventName, "return;" );
    				isSupported = ( typeof div[ eventName ] === "function" );
    			}
    			support[ i + "Bubbles" ] = isSupported;
    		}
    	}

    	// Null connected elements to avoid leaks in IE
    	testElement = fragment = select = opt = body = marginDiv = div = input = null;

    	return support;
    })();

    // Keep track of boxModel
    jQuery.boxModel = jQuery.support.boxModel;




    var rbrace = /^(?:\{.*\}|\[.*\])$/,
    	rmultiDash = /([a-z])([A-Z])/g;

    jQuery.extend({
    	cache: {},

    	// Please use with caution
    	uuid: 0,

    	// Unique for each copy of jQuery on the page
    	// Non-digits removed to match rinlinejQuery
    	expando: "jQuery" + ( jQuery.fn.jquery + Math.random() ).replace( /\D/g, "" ),

    	// The following elements throw uncatchable exceptions if you
    	// attempt to add expando properties to them.
    	noData: {
    		"embed": true,
    		// Ban all objects except for Flash (which handle expandos)
    		"object": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",
    		"applet": true
    	},

    	hasData: function( elem ) {
    		elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];

    		return !!elem && !isEmptyDataObject( elem );
    	},

    	data: function( elem, name, data, pvt /* Internal Use Only */ ) {
    		if ( !jQuery.acceptData( elem ) ) {
    			return;
    		}

    		var internalKey = jQuery.expando, getByName = typeof name === "string", thisCache,

    			// We have to handle DOM nodes and JS objects differently because IE6-7
    			// can't GC object references properly across the DOM-JS boundary
    			isNode = elem.nodeType,

    			// Only DOM nodes need the global jQuery cache; JS object data is
    			// attached directly to the object so GC can occur automatically
    			cache = isNode ? jQuery.cache : elem,

    			// Only defining an ID for JS objects if its cache already exists allows
    			// the code to shortcut on the same path as a DOM node with no cache
    			id = isNode ? elem[ jQuery.expando ] : elem[ jQuery.expando ] && jQuery.expando;

    		// Avoid doing any more work than we need to when trying to get data on an
    		// object that has no data at all
    		if ( (!id || (pvt && id && !cache[ id ][ internalKey ])) && getByName && data === undefined ) {
    			return;
    		}

    		if ( !id ) {
    			// Only DOM nodes need a new unique ID for each element since their data
    			// ends up in the global cache
    			if ( isNode ) {
    				elem[ jQuery.expando ] = id = ++jQuery.uuid;
    			} else {
    				id = jQuery.expando;
    			}
    		}

    		if ( !cache[ id ] ) {
    			cache[ id ] = {};

    			// TODO: This is a hack for 1.5 ONLY. Avoids exposing jQuery
    			// metadata on plain JS objects when the object is serialized using
    			// JSON.stringify
    			if ( !isNode ) {
    				cache[ id ].toJSON = jQuery.noop;
    			}
    		}

    		// An object can be passed to jQuery.data instead of a key/value pair; this gets
    		// shallow copied over onto the existing cache
    		if ( typeof name === "object" || typeof name === "function" ) {
    			if ( pvt ) {
    				cache[ id ][ internalKey ] = jQuery.extend(cache[ id ][ internalKey ], name);
    			} else {
    				cache[ id ] = jQuery.extend(cache[ id ], name);
    			}
    		}

    		thisCache = cache[ id ];

    		// Internal jQuery data is stored in a separate object inside the object's data
    		// cache in order to avoid key collisions between internal data and user-defined
    		// data
    		if ( pvt ) {
    			if ( !thisCache[ internalKey ] ) {
    				thisCache[ internalKey ] = {};
    			}

    			thisCache = thisCache[ internalKey ];
    		}

    		if ( data !== undefined ) {
    			thisCache[ jQuery.camelCase( name ) ] = data;
    		}

    		// TODO: This is a hack for 1.5 ONLY. It will be removed in 1.6. Users should
    		// not attempt to inspect the internal events object using jQuery.data, as this
    		// internal data object is undocumented and subject to change.
    		if ( name === "events" && !thisCache[name] ) {
    			return thisCache[ internalKey ] && thisCache[ internalKey ].events;
    		}

    		return getByName ? 
    			// Check for both converted-to-camel and non-converted data property names
    			thisCache[ jQuery.camelCase( name ) ] || thisCache[ name ] :
    			thisCache;
    	},

    	removeData: function( elem, name, pvt /* Internal Use Only */ ) {
    		if ( !jQuery.acceptData( elem ) ) {
    			return;
    		}

    		var internalKey = jQuery.expando, isNode = elem.nodeType,

    			// See jQuery.data for more information
    			cache = isNode ? jQuery.cache : elem,

    			// See jQuery.data for more information
    			id = isNode ? elem[ jQuery.expando ] : jQuery.expando;

    		// If there is already no cache entry for this object, there is no
    		// purpose in continuing
    		if ( !cache[ id ] ) {
    			return;
    		}

    		if ( name ) {
    			var thisCache = pvt ? cache[ id ][ internalKey ] : cache[ id ];

    			if ( thisCache ) {
    				delete thisCache[ name ];

    				// If there is no data left in the cache, we want to continue
    				// and let the cache object itself get destroyed
    				if ( !isEmptyDataObject(thisCache) ) {
    					return;
    				}
    			}
    		}

    		// See jQuery.data for more information
    		if ( pvt ) {
    			delete cache[ id ][ internalKey ];

    			// Don't destroy the parent cache unless the internal data object
    			// had been the only thing left in it
    			if ( !isEmptyDataObject(cache[ id ]) ) {
    				return;
    			}
    		}

    		var internalCache = cache[ id ][ internalKey ];

    		// Browsers that fail expando deletion also refuse to delete expandos on
    		// the window, but it will allow it on all other JS objects; other browsers
    		// don't care
    		if ( jQuery.support.deleteExpando || cache != window ) {
    			delete cache[ id ];
    		} else {
    			cache[ id ] = null;
    		}

    		// We destroyed the entire user cache at once because it's faster than
    		// iterating through each key, but we need to continue to persist internal
    		// data if it existed
    		if ( internalCache ) {
    			cache[ id ] = {};
    			// TODO: This is a hack for 1.5 ONLY. Avoids exposing jQuery
    			// metadata on plain JS objects when the object is serialized using
    			// JSON.stringify
    			if ( !isNode ) {
    				cache[ id ].toJSON = jQuery.noop;
    			}

    			cache[ id ][ internalKey ] = internalCache;

    		// Otherwise, we need to eliminate the expando on the node to avoid
    		// false lookups in the cache for entries that no longer exist
    		} else if ( isNode ) {
    			// IE does not allow us to delete expando properties from nodes,
    			// nor does it have a removeAttribute function on Document nodes;
    			// we must handle all of these cases
    			if ( jQuery.support.deleteExpando ) {
    				delete elem[ jQuery.expando ];
    			} else if ( elem.removeAttribute ) {
    				elem.removeAttribute( jQuery.expando );
    			} else {
    				elem[ jQuery.expando ] = null;
    			}
    		}
    	},

    	// For internal use only.
    	_data: function( elem, name, data ) {
    		return jQuery.data( elem, name, data, true );
    	},

    	// A method for determining if a DOM node can handle the data expando
    	acceptData: function( elem ) {
    		if ( elem.nodeName ) {
    			var match = jQuery.noData[ elem.nodeName.toLowerCase() ];

    			if ( match ) {
    				return !(match === true || elem.getAttribute("classid") !== match);
    			}
    		}

    		return true;
    	}
    });

    jQuery.fn.extend({
    	data: function( key, value ) {
    		var data = null;

    		if ( typeof key === "undefined" ) {
    			if ( this.length ) {
    				data = jQuery.data( this[0] );

    				if ( this[0].nodeType === 1 ) {
    			    var attr = this[0].attributes, name;
    					for ( var i = 0, l = attr.length; i < l; i++ ) {
    						name = attr[i].name;

    						if ( name.indexOf( "data-" ) === 0 ) {
    							name = jQuery.camelCase( name.substring(5) );

    							dataAttr( this[0], name, data[ name ] );
    						}
    					}
    				}
    			}

    			return data;

    		} else if ( typeof key === "object" ) {
    			return this.each(function() {
    				jQuery.data( this, key );
    			});
    		}

    		var parts = key.split(".");
    		parts[1] = parts[1] ? "." + parts[1] : "";

    		if ( value === undefined ) {
    			data = this.triggerHandler("getData" + parts[1] + "!", [parts[0]]);

    			// Try to fetch any internally stored data first
    			if ( data === undefined && this.length ) {
    				data = jQuery.data( this[0], key );
    				data = dataAttr( this[0], key, data );
    			}

    			return data === undefined && parts[1] ?
    				this.data( parts[0] ) :
    				data;

    		} else {
    			return this.each(function() {
    				var $this = jQuery( this ),
    					args = [ parts[0], value ];

    				$this.triggerHandler( "setData" + parts[1] + "!", args );
    				jQuery.data( this, key, value );
    				$this.triggerHandler( "changeData" + parts[1] + "!", args );
    			});
    		}
    	},

    	removeData: function( key ) {
    		return this.each(function() {
    			jQuery.removeData( this, key );
    		});
    	}
    });

    function dataAttr( elem, key, data ) {
    	// If nothing was found internally, try to fetch any
    	// data from the HTML5 data-* attribute
    	if ( data === undefined && elem.nodeType === 1 ) {
    		var name = "data-" + key.replace( rmultiDash, "$1-$2" ).toLowerCase();

    		data = elem.getAttribute( name );

    		if ( typeof data === "string" ) {
    			try {
    				data = data === "true" ? true :
    				data === "false" ? false :
    				data === "null" ? null :
    				!jQuery.isNaN( data ) ? parseFloat( data ) :
    					rbrace.test( data ) ? jQuery.parseJSON( data ) :
    					data;
    			} catch( e ) {}

    			// Make sure we set the data so it isn't changed later
    			jQuery.data( elem, key, data );

    		} else {
    			data = undefined;
    		}
    	}

    	return data;
    }

    // TODO: This is a hack for 1.5 ONLY to allow objects with a single toJSON
    // property to be considered empty objects; this property always exists in
    // order to make sure JSON.stringify does not expose internal metadata
    function isEmptyDataObject( obj ) {
    	for ( var name in obj ) {
    		if ( name !== "toJSON" ) {
    			return false;
    		}
    	}

    	return true;
    }




    function handleQueueMarkDefer( elem, type, src ) {
    	var deferDataKey = type + "defer",
    		queueDataKey = type + "queue",
    		markDataKey = type + "mark",
    		defer = jQuery.data( elem, deferDataKey, undefined, true );
    	if ( defer &&
    		( src === "queue" || !jQuery.data( elem, queueDataKey, undefined, true ) ) &&
    		( src === "mark" || !jQuery.data( elem, markDataKey, undefined, true ) ) ) {
    		// Give room for hard-coded callbacks to fire first
    		// and eventually mark/queue something else on the element
    		setTimeout( function() {
    			if ( !jQuery.data( elem, queueDataKey, undefined, true ) &&
    				!jQuery.data( elem, markDataKey, undefined, true ) ) {
    				jQuery.removeData( elem, deferDataKey, true );
    				defer.resolve();
    			}
    		}, 0 );
    	}
    }

    jQuery.extend({

    	_mark: function( elem, type ) {
    		if ( elem ) {
    			type = (type || "fx") + "mark";
    			jQuery.data( elem, type, (jQuery.data(elem,type,undefined,true) || 0) + 1, true );
    		}
    	},

    	_unmark: function( force, elem, type ) {
    		if ( force !== true ) {
    			type = elem;
    			elem = force;
    			force = false;
    		}
    		if ( elem ) {
    			type = type || "fx";
    			var key = type + "mark",
    				count = force ? 0 : ( (jQuery.data( elem, key, undefined, true) || 1 ) - 1 );
    			if ( count ) {
    				jQuery.data( elem, key, count, true );
    			} else {
    				jQuery.removeData( elem, key, true );
    				handleQueueMarkDefer( elem, type, "mark" );
    			}
    		}
    	},

    	queue: function( elem, type, data ) {
    		if ( elem ) {
    			type = (type || "fx") + "queue";
    			var q = jQuery.data( elem, type, undefined, true );
    			// Speed up dequeue by getting out quickly if this is just a lookup
    			if ( data ) {
    				if ( !q || jQuery.isArray(data) ) {
    					q = jQuery.data( elem, type, jQuery.makeArray(data), true );
    				} else {
    					q.push( data );
    				}
    			}
    			return q || [];
    		}
    	},

    	dequeue: function( elem, type ) {
    		type = type || "fx";

    		var queue = jQuery.queue( elem, type ),
    			fn = queue.shift(),
    			defer;

    		// If the fx queue is dequeued, always remove the progress sentinel
    		if ( fn === "inprogress" ) {
    			fn = queue.shift();
    		}

    		if ( fn ) {
    			// Add a progress sentinel to prevent the fx queue from being
    			// automatically dequeued
    			if ( type === "fx" ) {
    				queue.unshift("inprogress");
    			}

    			fn.call(elem, function() {
    				jQuery.dequeue(elem, type);
    			});
    		}

    		if ( !queue.length ) {
    			jQuery.removeData( elem, type + "queue", true );
    			handleQueueMarkDefer( elem, type, "queue" );
    		}
    	}
    });

    jQuery.fn.extend({
    	queue: function( type, data ) {
    		if ( typeof type !== "string" ) {
    			data = type;
    			type = "fx";
    		}

    		if ( data === undefined ) {
    			return jQuery.queue( this[0], type );
    		}
    		return this.each(function() {
    			var queue = jQuery.queue( this, type, data );

    			if ( type === "fx" && queue[0] !== "inprogress" ) {
    				jQuery.dequeue( this, type );
    			}
    		});
    	},
    	dequeue: function( type ) {
    		return this.each(function() {
    			jQuery.dequeue( this, type );
    		});
    	},
    	// Based off of the plugin by Clint Helfers, with permission.
    	// http://blindsignals.com/index.php/2009/07/jquery-delay/
    	delay: function( time, type ) {
    		time = jQuery.fx ? jQuery.fx.speeds[time] || time : time;
    		type = type || "fx";

    		return this.queue( type, function() {
    			var elem = this;
    			setTimeout(function() {
    				jQuery.dequeue( elem, type );
    			}, time );
    		});
    	},
    	clearQueue: function( type ) {
    		return this.queue( type || "fx", [] );
    	},
    	// Get a promise resolved when queues of a certain type
    	// are emptied (fx is the type by default)
    	promise: function( type, object ) {
    		if ( typeof type !== "string" ) {
    			object = type;
    			type = undefined;
    		}
    		type = type || "fx";
    		var defer = jQuery.Deferred(),
    			elements = this,
    			i = elements.length,
    			count = 1,
    			deferDataKey = type + "defer",
    			queueDataKey = type + "queue",
    			markDataKey = type + "mark",
    			tmp;
    		function resolve() {
    			if ( !( --count ) ) {
    				defer.resolveWith( elements, [ elements ] );
    			}
    		}
    		while( i-- ) {
    			if (( tmp = jQuery.data( elements[ i ], deferDataKey, undefined, true ) ||
    					( jQuery.data( elements[ i ], queueDataKey, undefined, true ) ||
    						jQuery.data( elements[ i ], markDataKey, undefined, true ) ) &&
    					jQuery.data( elements[ i ], deferDataKey, jQuery._Deferred(), true ) )) {
    				count++;
    				tmp.done( resolve );
    			}
    		}
    		resolve();
    		return defer.promise();
    	}
    });




    var rclass = /[\n\t\r]/g,
    	rspace = /\s+/,
    	rreturn = /\r/g,
    	rtype = /^(?:button|input)$/i,
    	rfocusable = /^(?:button|input|object|select|textarea)$/i,
    	rclickable = /^a(?:rea)?$/i,
    	rboolean = /^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i,
    	rinvalidChar = /\:|^on/,
    	formHook, boolHook;

    jQuery.fn.extend({
    	attr: function( name, value ) {
    		return jQuery.access( this, name, value, true, jQuery.attr );
    	},

    	removeAttr: function( name ) {
    		return this.each(function() {
    			jQuery.removeAttr( this, name );
    		});
    	},

    	prop: function( name, value ) {
    		return jQuery.access( this, name, value, true, jQuery.prop );
    	},

    	removeProp: function( name ) {
    		name = jQuery.propFix[ name ] || name;
    		return this.each(function() {
    			// try/catch handles cases where IE balks (such as removing a property on window)
    			try {
    				this[ name ] = undefined;
    				delete this[ name ];
    			} catch( e ) {}
    		});
    	},

    	addClass: function( value ) {
    		var classNames, i, l, elem,
    			setClass, c, cl;

    		if ( jQuery.isFunction( value ) ) {
    			return this.each(function( j ) {
    				jQuery( this ).addClass( value.call(this, j, this.className) );
    			});
    		}

    		if ( value && typeof value === "string" ) {
    			classNames = value.split( rspace );

    			for ( i = 0, l = this.length; i < l; i++ ) {
    				elem = this[ i ];

    				if ( elem.nodeType === 1 ) {
    					if ( !elem.className && classNames.length === 1 ) {
    						elem.className = value;

    					} else {
    						setClass = " " + elem.className + " ";

    						for ( c = 0, cl = classNames.length; c < cl; c++ ) {
    							if ( !~setClass.indexOf( " " + classNames[ c ] + " " ) ) {
    								setClass += classNames[ c ] + " ";
    							}
    						}
    						elem.className = jQuery.trim( setClass );
    					}
    				}
    			}
    		}

    		return this;
    	},

    	removeClass: function( value ) {
    		var classNames, i, l, elem, className, c, cl;

    		if ( jQuery.isFunction( value ) ) {
    			return this.each(function( j ) {
    				jQuery( this ).removeClass( value.call(this, j, this.className) );
    			});
    		}

    		if ( (value && typeof value === "string") || value === undefined ) {
    			classNames = (value || "").split( rspace );

    			for ( i = 0, l = this.length; i < l; i++ ) {
    				elem = this[ i ];

    				if ( elem.nodeType === 1 && elem.className ) {
    					if ( value ) {
    						className = (" " + elem.className + " ").replace( rclass, " " );
    						for ( c = 0, cl = classNames.length; c < cl; c++ ) {
    							className = className.replace(" " + classNames[ c ] + " ", " ");
    						}
    						elem.className = jQuery.trim( className );

    					} else {
    						elem.className = "";
    					}
    				}
    			}
    		}

    		return this;
    	},

    	toggleClass: function( value, stateVal ) {
    		var type = typeof value,
    			isBool = typeof stateVal === "boolean";

    		if ( jQuery.isFunction( value ) ) {
    			return this.each(function( i ) {
    				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
    			});
    		}

    		return this.each(function() {
    			if ( type === "string" ) {
    				// toggle individual class names
    				var className,
    					i = 0,
    					self = jQuery( this ),
    					state = stateVal,
    					classNames = value.split( rspace );

    				while ( (className = classNames[ i++ ]) ) {
    					// check each className given, space seperated list
    					state = isBool ? state : !self.hasClass( className );
    					self[ state ? "addClass" : "removeClass" ]( className );
    				}

    			} else if ( type === "undefined" || type === "boolean" ) {
    				if ( this.className ) {
    					// store className if set
    					jQuery._data( this, "__className__", this.className );
    				}

    				// toggle whole className
    				this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
    			}
    		});
    	},

    	hasClass: function( selector ) {
    		var className = " " + selector + " ";
    		for ( var i = 0, l = this.length; i < l; i++ ) {
    			if ( (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) > -1 ) {
    				return true;
    			}
    		}

    		return false;
    	},

    	val: function( value ) {
    		var hooks, ret,
    			elem = this[0];

    		if ( !arguments.length ) {
    			if ( elem ) {
    				hooks = jQuery.valHooks[ elem.nodeName.toLowerCase() ] || jQuery.valHooks[ elem.type ];

    				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
    					return ret;
    				}

    				ret = elem.value;

    				return typeof ret === "string" ? 
    					// handle most common string cases
    					ret.replace(rreturn, "") : 
    					// handle cases where value is null/undef or number
    					ret == null ? "" : ret;
    			}

    			return undefined;
    		}

    		var isFunction = jQuery.isFunction( value );

    		return this.each(function( i ) {
    			var self = jQuery(this), val;

    			if ( this.nodeType !== 1 ) {
    				return;
    			}

    			if ( isFunction ) {
    				val = value.call( this, i, self.val() );
    			} else {
    				val = value;
    			}

    			// Treat null/undefined as ""; convert numbers to string
    			if ( val == null ) {
    				val = "";
    			} else if ( typeof val === "number" ) {
    				val += "";
    			} else if ( jQuery.isArray( val ) ) {
    				val = jQuery.map(val, function ( value ) {
    					return value == null ? "" : value + "";
    				});
    			}

    			hooks = jQuery.valHooks[ this.nodeName.toLowerCase() ] || jQuery.valHooks[ this.type ];

    			// If set returns undefined, fall back to normal setting
    			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
    				this.value = val;
    			}
    		});
    	}
    });

    jQuery.extend({
    	valHooks: {
    		option: {
    			get: function( elem ) {
    				// attributes.value is undefined in Blackberry 4.7 but
    				// uses .value. See #6932
    				var val = elem.attributes.value;
    				return !val || val.specified ? elem.value : elem.text;
    			}
    		},
    		select: {
    			get: function( elem ) {
    				var value,
    					index = elem.selectedIndex,
    					values = [],
    					options = elem.options,
    					one = elem.type === "select-one";

    				// Nothing was selected
    				if ( index < 0 ) {
    					return null;
    				}

    				// Loop through all the selected options
    				for ( var i = one ? index : 0, max = one ? index + 1 : options.length; i < max; i++ ) {
    					var option = options[ i ];

    					// Don't return options that are disabled or in a disabled optgroup
    					if ( option.selected && (jQuery.support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null) &&
    							(!option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" )) ) {

    						// Get the specific value for the option
    						value = jQuery( option ).val();

    						// We don't need an array for one selects
    						if ( one ) {
    							return value;
    						}

    						// Multi-Selects return an array
    						values.push( value );
    					}
    				}

    				// Fixes Bug #2551 -- select.val() broken in IE after form.reset()
    				if ( one && !values.length && options.length ) {
    					return jQuery( options[ index ] ).val();
    				}

    				return values;
    			},

    			set: function( elem, value ) {
    				var values = jQuery.makeArray( value );

    				jQuery(elem).find("option").each(function() {
    					this.selected = jQuery.inArray( jQuery(this).val(), values ) >= 0;
    				});

    				if ( !values.length ) {
    					elem.selectedIndex = -1;
    				}
    				return values;
    			}
    		}
    	},

    	attrFn: {
    		val: true,
    		css: true,
    		html: true,
    		text: true,
    		data: true,
    		width: true,
    		height: true,
    		offset: true
    	},

    	attrFix: {
    		// Always normalize to ensure hook usage
    		tabindex: "tabIndex"
    	},

    	attr: function( elem, name, value, pass ) {
    		var nType = elem.nodeType;

    		// don't get/set attributes on text, comment and attribute nodes
    		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
    			return undefined;
    		}

    		if ( pass && name in jQuery.attrFn ) {
    			return jQuery( elem )[ name ]( value );
    		}

    		// Fallback to prop when attributes are not supported
    		if ( !("getAttribute" in elem) ) {
    			return jQuery.prop( elem, name, value );
    		}

    		var ret, hooks,
    			notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

    		// Normalize the name if needed
    		if ( notxml ) {
    			name = jQuery.attrFix[ name ] || name;

    			hooks = jQuery.attrHooks[ name ];

    			if ( !hooks ) {
    				// Use boolHook for boolean attributes
    				if ( rboolean.test( name ) ) {

    					hooks = boolHook;

    				// Use formHook for forms and if the name contains certain characters
    				} else if ( formHook && name !== "className" &&
    					(jQuery.nodeName( elem, "form" ) || rinvalidChar.test( name )) ) {

    					hooks = formHook;
    				}
    			}
    		}

    		if ( value !== undefined ) {

    			if ( value === null ) {
    				jQuery.removeAttr( elem, name );
    				return undefined;

    			} else if ( hooks && "set" in hooks && notxml && (ret = hooks.set( elem, value, name )) !== undefined ) {
    				return ret;

    			} else {
    				elem.setAttribute( name, "" + value );
    				return value;
    			}

    		} else if ( hooks && "get" in hooks && notxml && (ret = hooks.get( elem, name )) !== null ) {
    			return ret;

    		} else {

    			ret = elem.getAttribute( name );

    			// Non-existent attributes return null, we normalize to undefined
    			return ret === null ?
    				undefined :
    				ret;
    		}
    	},

    	removeAttr: function( elem, name ) {
    		var propName;
    		if ( elem.nodeType === 1 ) {
    			name = jQuery.attrFix[ name ] || name;

    			if ( jQuery.support.getSetAttribute ) {
    				// Use removeAttribute in browsers that support it
    				elem.removeAttribute( name );
    			} else {
    				jQuery.attr( elem, name, "" );
    				elem.removeAttributeNode( elem.getAttributeNode( name ) );
    			}

    			// Set corresponding property to false for boolean attributes
    			if ( rboolean.test( name ) && (propName = jQuery.propFix[ name ] || name) in elem ) {
    				elem[ propName ] = false;
    			}
    		}
    	},

    	attrHooks: {
    		type: {
    			set: function( elem, value ) {
    				// We can't allow the type property to be changed (since it causes problems in IE)
    				if ( rtype.test( elem.nodeName ) && elem.parentNode ) {
    					jQuery.error( "type property can't be changed" );
    				} else if ( !jQuery.support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
    					// Setting the type on a radio button after the value resets the value in IE6-9
    					// Reset value to it's default in case type is set after value
    					// This is for element creation
    					var val = elem.value;
    					elem.setAttribute( "type", value );
    					if ( val ) {
    						elem.value = val;
    					}
    					return value;
    				}
    			}
    		},
    		tabIndex: {
    			get: function( elem ) {
    				// elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
    				// http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
    				var attributeNode = elem.getAttributeNode("tabIndex");

    				return attributeNode && attributeNode.specified ?
    					parseInt( attributeNode.value, 10 ) :
    					rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
    						0 :
    						undefined;
    			}
    		},
    		// Use the value property for back compat
    		// Use the formHook for button elements in IE6/7 (#1954)
    		value: {
    			get: function( elem, name ) {
    				if ( formHook && jQuery.nodeName( elem, "button" ) ) {
    					return formHook.get( elem, name );
    				}
    				return name in elem ?
    					elem.value :
    					null;
    			},
    			set: function( elem, value, name ) {
    				if ( formHook && jQuery.nodeName( elem, "button" ) ) {
    					return formHook.set( elem, value, name );
    				}
    				// Does not return so that setAttribute is also used
    				elem.value = value;
    			}
    		}
    	},

    	propFix: {
    		tabindex: "tabIndex",
    		readonly: "readOnly",
    		"for": "htmlFor",
    		"class": "className",
    		maxlength: "maxLength",
    		cellspacing: "cellSpacing",
    		cellpadding: "cellPadding",
    		rowspan: "rowSpan",
    		colspan: "colSpan",
    		usemap: "useMap",
    		frameborder: "frameBorder",
    		contenteditable: "contentEditable"
    	},

    	prop: function( elem, name, value ) {
    		var nType = elem.nodeType;

    		// don't get/set properties on text, comment and attribute nodes
    		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
    			return undefined;
    		}

    		var ret, hooks,
    			notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

    		if ( notxml ) {
    			// Fix name and attach hooks
    			name = jQuery.propFix[ name ] || name;
    			hooks = jQuery.propHooks[ name ];
    		}

    		if ( value !== undefined ) {
    			if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
    				return ret;

    			} else {
    				return (elem[ name ] = value);
    			}

    		} else {
    			if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== undefined ) {
    				return ret;

    			} else {
    				return elem[ name ];
    			}
    		}
    	},

    	propHooks: {}
    });

    // Hook for boolean attributes
    boolHook = {
    	get: function( elem, name ) {
    		// Align boolean attributes with corresponding properties
    		return jQuery.prop( elem, name ) ?
    			name.toLowerCase() :
    			undefined;
    	},
    	set: function( elem, value, name ) {
    		var propName;
    		if ( value === false ) {
    			// Remove boolean attributes when set to false
    			jQuery.removeAttr( elem, name );
    		} else {
    			// value is true since we know at this point it's type boolean and not false
    			// Set boolean attributes to the same name and set the DOM property
    			propName = jQuery.propFix[ name ] || name;
    			if ( propName in elem ) {
    				// Only set the IDL specifically if it already exists on the element
    				elem[ propName ] = true;
    			}

    			elem.setAttribute( name, name.toLowerCase() );
    		}
    		return name;
    	}
    };

    // IE6/7 do not support getting/setting some attributes with get/setAttribute
    if ( !jQuery.support.getSetAttribute ) {

    	// propFix is more comprehensive and contains all fixes
    	jQuery.attrFix = jQuery.propFix;

    	// Use this for any attribute on a form in IE6/7
    	formHook = jQuery.attrHooks.name = jQuery.attrHooks.title = jQuery.valHooks.button = {
    		get: function( elem, name ) {
    			var ret;
    			ret = elem.getAttributeNode( name );
    			// Return undefined if nodeValue is empty string
    			return ret && ret.nodeValue !== "" ?
    				ret.nodeValue :
    				undefined;
    		},
    		set: function( elem, value, name ) {
    			// Check form objects in IE (multiple bugs related)
    			// Only use nodeValue if the attribute node exists on the form
    			var ret = elem.getAttributeNode( name );
    			if ( ret ) {
    				ret.nodeValue = value;
    				return value;
    			}
    		}
    	};

    	// Set width and height to auto instead of 0 on empty string( Bug #8150 )
    	// This is for removals
    	jQuery.each([ "width", "height" ], function( i, name ) {
    		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
    			set: function( elem, value ) {
    				if ( value === "" ) {
    					elem.setAttribute( name, "auto" );
    					return value;
    				}
    			}
    		});
    	});
    }


    // Some attributes require a special call on IE
    if ( !jQuery.support.hrefNormalized ) {
    	jQuery.each([ "href", "src", "width", "height" ], function( i, name ) {
    		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
    			get: function( elem ) {
    				var ret = elem.getAttribute( name, 2 );
    				return ret === null ? undefined : ret;
    			}
    		});
    	});
    }

    if ( !jQuery.support.style ) {
    	jQuery.attrHooks.style = {
    		get: function( elem ) {
    			// Return undefined in the case of empty string
    			// Normalize to lowercase since IE uppercases css property names
    			return elem.style.cssText.toLowerCase() || undefined;
    		},
    		set: function( elem, value ) {
    			return (elem.style.cssText = "" + value);
    		}
    	};
    }

    // Safari mis-reports the default selected property of an option
    // Accessing the parent's selectedIndex property fixes it
    if ( !jQuery.support.optSelected ) {
    	jQuery.propHooks.selected = jQuery.extend( jQuery.propHooks.selected, {
    		get: function( elem ) {
    			var parent = elem.parentNode;

    			if ( parent ) {
    				parent.selectedIndex;

    				// Make sure that it also works with optgroups, see #5701
    				if ( parent.parentNode ) {
    					parent.parentNode.selectedIndex;
    				}
    			}
    		}
    	});
    }

    // Radios and checkboxes getter/setter
    if ( !jQuery.support.checkOn ) {
    	jQuery.each([ "radio", "checkbox" ], function() {
    		jQuery.valHooks[ this ] = {
    			get: function( elem ) {
    				// Handle the case where in Webkit "" is returned instead of "on" if a value isn't specified
    				return elem.getAttribute("value") === null ? "on" : elem.value;
    			}
    		};
    	});
    }
    jQuery.each([ "radio", "checkbox" ], function() {
    	jQuery.valHooks[ this ] = jQuery.extend( jQuery.valHooks[ this ], {
    		set: function( elem, value ) {
    			if ( jQuery.isArray( value ) ) {
    				return (elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0);
    			}
    		}
    	});
    });




    var rnamespaces = /\.(.*)$/,
    	rformElems = /^(?:textarea|input|select)$/i,
    	rperiod = /\./g,
    	rspaces = / /g,
    	rescape = /[^\w\s.|`]/g,
    	fcleanup = function( nm ) {
    		return nm.replace(rescape, "\\$&");
    	};

    /*
     * A number of helper functions used for managing events.
     * Many of the ideas behind this code originated from
     * Dean Edwards' addEvent library.
     */
    jQuery.event = {

    	// Bind an event to an element
    	// Original by Dean Edwards
    	add: function( elem, types, handler, data ) {
    		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
    			return;
    		}

    		if ( handler === false ) {
    			handler = returnFalse;
    		} else if ( !handler ) {
    			// Fixes bug #7229. Fix recommended by jdalton
    			return;
    		}

    		var handleObjIn, handleObj;

    		if ( handler.handler ) {
    			handleObjIn = handler;
    			handler = handleObjIn.handler;
    		}

    		// Make sure that the function being executed has a unique ID
    		if ( !handler.guid ) {
    			handler.guid = jQuery.guid++;
    		}

    		// Init the element's event structure
    		var elemData = jQuery._data( elem );

    		// If no elemData is found then we must be trying to bind to one of the
    		// banned noData elements
    		if ( !elemData ) {
    			return;
    		}

    		var events = elemData.events,
    			eventHandle = elemData.handle;

    		if ( !events ) {
    			elemData.events = events = {};
    		}

    		if ( !eventHandle ) {
    			elemData.handle = eventHandle = function( e ) {
    				// Discard the second event of a jQuery.event.trigger() and
    				// when an event is called after a page has unloaded
    				return typeof jQuery !== "undefined" && (!e || jQuery.event.triggered !== e.type) ?
    					jQuery.event.handle.apply( eventHandle.elem, arguments ) :
    					undefined;
    			};
    		}

    		// Add elem as a property of the handle function
    		// This is to prevent a memory leak with non-native events in IE.
    		eventHandle.elem = elem;

    		// Handle multiple events separated by a space
    		// jQuery(...).bind("mouseover mouseout", fn);
    		types = types.split(" ");

    		var type, i = 0, namespaces;

    		while ( (type = types[ i++ ]) ) {
    			handleObj = handleObjIn ?
    				jQuery.extend({}, handleObjIn) :
    				{ handler: handler, data: data };

    			// Namespaced event handlers
    			if ( type.indexOf(".") > -1 ) {
    				namespaces = type.split(".");
    				type = namespaces.shift();
    				handleObj.namespace = namespaces.slice(0).sort().join(".");

    			} else {
    				namespaces = [];
    				handleObj.namespace = "";
    			}

    			handleObj.type = type;
    			if ( !handleObj.guid ) {
    				handleObj.guid = handler.guid;
    			}

    			// Get the current list of functions bound to this event
    			var handlers = events[ type ],
    				special = jQuery.event.special[ type ] || {};

    			// Init the event handler queue
    			if ( !handlers ) {
    				handlers = events[ type ] = [];

    				// Check for a special event handler
    				// Only use addEventListener/attachEvent if the special
    				// events handler returns false
    				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
    					// Bind the global event handler to the element
    					if ( elem.addEventListener ) {
    						elem.addEventListener( type, eventHandle, false );

    					} else if ( elem.attachEvent ) {
    						elem.attachEvent( "on" + type, eventHandle );
    					}
    				}
    			}

    			if ( special.add ) {
    				special.add.call( elem, handleObj );

    				if ( !handleObj.handler.guid ) {
    					handleObj.handler.guid = handler.guid;
    				}
    			}

    			// Add the function to the element's handler list
    			handlers.push( handleObj );

    			// Keep track of which events have been used, for event optimization
    			jQuery.event.global[ type ] = true;
    		}

    		// Nullify elem to prevent memory leaks in IE
    		elem = null;
    	},

    	global: {},

    	// Detach an event or set of events from an element
    	remove: function( elem, types, handler, pos ) {
    		// don't do events on text and comment nodes
    		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
    			return;
    		}

    		if ( handler === false ) {
    			handler = returnFalse;
    		}

    		var ret, type, fn, j, i = 0, all, namespaces, namespace, special, eventType, handleObj, origType,
    			elemData = jQuery.hasData( elem ) && jQuery._data( elem ),
    			events = elemData && elemData.events;

    		if ( !elemData || !events ) {
    			return;
    		}

    		// types is actually an event object here
    		if ( types && types.type ) {
    			handler = types.handler;
    			types = types.type;
    		}

    		// Unbind all events for the element
    		if ( !types || typeof types === "string" && types.charAt(0) === "." ) {
    			types = types || "";

    			for ( type in events ) {
    				jQuery.event.remove( elem, type + types );
    			}

    			return;
    		}

    		// Handle multiple events separated by a space
    		// jQuery(...).unbind("mouseover mouseout", fn);
    		types = types.split(" ");

    		while ( (type = types[ i++ ]) ) {
    			origType = type;
    			handleObj = null;
    			all = type.indexOf(".") < 0;
    			namespaces = [];

    			if ( !all ) {
    				// Namespaced event handlers
    				namespaces = type.split(".");
    				type = namespaces.shift();

    				namespace = new RegExp("(^|\\.)" +
    					jQuery.map( namespaces.slice(0).sort(), fcleanup ).join("\\.(?:.*\\.)?") + "(\\.|$)");
    			}

    			eventType = events[ type ];

    			if ( !eventType ) {
    				continue;
    			}

    			if ( !handler ) {
    				for ( j = 0; j < eventType.length; j++ ) {
    					handleObj = eventType[ j ];

    					if ( all || namespace.test( handleObj.namespace ) ) {
    						jQuery.event.remove( elem, origType, handleObj.handler, j );
    						eventType.splice( j--, 1 );
    					}
    				}

    				continue;
    			}

    			special = jQuery.event.special[ type ] || {};

    			for ( j = pos || 0; j < eventType.length; j++ ) {
    				handleObj = eventType[ j ];

    				if ( handler.guid === handleObj.guid ) {
    					// remove the given handler for the given type
    					if ( all || namespace.test( handleObj.namespace ) ) {
    						if ( pos == null ) {
    							eventType.splice( j--, 1 );
    						}

    						if ( special.remove ) {
    							special.remove.call( elem, handleObj );
    						}
    					}

    					if ( pos != null ) {
    						break;
    					}
    				}
    			}

    			// remove generic event handler if no more handlers exist
    			if ( eventType.length === 0 || pos != null && eventType.length === 1 ) {
    				if ( !special.teardown || special.teardown.call( elem, namespaces ) === false ) {
    					jQuery.removeEvent( elem, type, elemData.handle );
    				}

    				ret = null;
    				delete events[ type ];
    			}
    		}

    		// Remove the expando if it's no longer used
    		if ( jQuery.isEmptyObject( events ) ) {
    			var handle = elemData.handle;
    			if ( handle ) {
    				handle.elem = null;
    			}

    			delete elemData.events;
    			delete elemData.handle;

    			if ( jQuery.isEmptyObject( elemData ) ) {
    				jQuery.removeData( elem, undefined, true );
    			}
    		}
    	},

    	// Events that are safe to short-circuit if no handlers are attached.
    	// Native DOM events should not be added, they may have inline handlers.
    	customEvent: {
    		"getData": true,
    		"setData": true,
    		"changeData": true
    	},

    	trigger: function( event, data, elem, onlyHandlers ) {
    		// Event object or event type
    		var type = event.type || event,
    			namespaces = [],
    			exclusive;

    		if ( type.indexOf("!") >= 0 ) {
    			// Exclusive events trigger only for the exact event (no namespaces)
    			type = type.slice(0, -1);
    			exclusive = true;
    		}

    		if ( type.indexOf(".") >= 0 ) {
    			// Namespaced trigger; create a regexp to match event type in handle()
    			namespaces = type.split(".");
    			type = namespaces.shift();
    			namespaces.sort();
    		}

    		if ( (!elem || jQuery.event.customEvent[ type ]) && !jQuery.event.global[ type ] ) {
    			// No jQuery handlers for this event type, and it can't have inline handlers
    			return;
    		}

    		// Caller can pass in an Event, Object, or just an event type string
    		event = typeof event === "object" ?
    			// jQuery.Event object
    			event[ jQuery.expando ] ? event :
    			// Object literal
    			new jQuery.Event( type, event ) :
    			// Just the event type (string)
    			new jQuery.Event( type );

    		event.type = type;
    		event.exclusive = exclusive;
    		event.namespace = namespaces.join(".");
    		event.namespace_re = new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.)?") + "(\\.|$)");

    		// triggerHandler() and global events don't bubble or run the default action
    		if ( onlyHandlers || !elem ) {
    			event.preventDefault();
    			event.stopPropagation();
    		}

    		// Handle a global trigger
    		if ( !elem ) {
    			// TODO: Stop taunting the data cache; remove global events and always attach to document
    			jQuery.each( jQuery.cache, function() {
    				// internalKey variable is just used to make it easier to find
    				// and potentially change this stuff later; currently it just
    				// points to jQuery.expando
    				var internalKey = jQuery.expando,
    					internalCache = this[ internalKey ];
    				if ( internalCache && internalCache.events && internalCache.events[ type ] ) {
    					jQuery.event.trigger( event, data, internalCache.handle.elem );
    				}
    			});
    			return;
    		}

    		// Don't do events on text and comment nodes
    		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
    			return;
    		}

    		// Clean up the event in case it is being reused
    		event.result = undefined;
    		event.target = elem;

    		// Clone any incoming data and prepend the event, creating the handler arg list
    		data = data != null ? jQuery.makeArray( data ) : [];
    		data.unshift( event );

    		var cur = elem,
    			// IE doesn't like method names with a colon (#3533, #8272)
    			ontype = type.indexOf(":") < 0 ? "on" + type : "";

    		// Fire event on the current element, then bubble up the DOM tree
    		do {
    			var handle = jQuery._data( cur, "handle" );

    			event.currentTarget = cur;
    			if ( handle ) {
    				handle.apply( cur, data );
    			}

    			// Trigger an inline bound script
    			if ( ontype && jQuery.acceptData( cur ) && cur[ ontype ] && cur[ ontype ].apply( cur, data ) === false ) {
    				event.result = false;
    				event.preventDefault();
    			}

    			// Bubble up to document, then to window
    			cur = cur.parentNode || cur.ownerDocument || cur === event.target.ownerDocument && window;
    		} while ( cur && !event.isPropagationStopped() );

    		// If nobody prevented the default action, do it now
    		if ( !event.isDefaultPrevented() ) {
    			var old,
    				special = jQuery.event.special[ type ] || {};

    			if ( (!special._default || special._default.call( elem.ownerDocument, event ) === false) &&
    				!(type === "click" && jQuery.nodeName( elem, "a" )) && jQuery.acceptData( elem ) ) {

    				// Call a native DOM method on the target with the same name name as the event.
    				// Can't use an .isFunction)() check here because IE6/7 fails that test.
    				// IE<9 dies on focus to hidden element (#1486), may want to revisit a try/catch.
    				try {
    					if ( ontype && elem[ type ] ) {
    						// Don't re-trigger an onFOO event when we call its FOO() method
    						old = elem[ ontype ];

    						if ( old ) {
    							elem[ ontype ] = null;
    						}

    						jQuery.event.triggered = type;
    						elem[ type ]();
    					}
    				} catch ( ieError ) {}

    				if ( old ) {
    					elem[ ontype ] = old;
    				}

    				jQuery.event.triggered = undefined;
    			}
    		}

    		return event.result;
    	},

    	handle: function( event ) {
    		event = jQuery.event.fix( event || window.event );
    		// Snapshot the handlers list since a called handler may add/remove events.
    		var handlers = ((jQuery._data( this, "events" ) || {})[ event.type ] || []).slice(0),
    			run_all = !event.exclusive && !event.namespace,
    			args = Array.prototype.slice.call( arguments, 0 );

    		// Use the fix-ed Event rather than the (read-only) native event
    		args[0] = event;
    		event.currentTarget = this;

    		for ( var j = 0, l = handlers.length; j < l; j++ ) {
    			var handleObj = handlers[ j ];

    			// Triggered event must 1) be non-exclusive and have no namespace, or
    			// 2) have namespace(s) a subset or equal to those in the bound event.
    			if ( run_all || event.namespace_re.test( handleObj.namespace ) ) {
    				// Pass in a reference to the handler function itself
    				// So that we can later remove it
    				event.handler = handleObj.handler;
    				event.data = handleObj.data;
    				event.handleObj = handleObj;

    				var ret = handleObj.handler.apply( this, args );

    				if ( ret !== undefined ) {
    					event.result = ret;
    					if ( ret === false ) {
    						event.preventDefault();
    						event.stopPropagation();
    					}
    				}

    				if ( event.isImmediatePropagationStopped() ) {
    					break;
    				}
    			}
    		}
    		return event.result;
    	},

    	props: "altKey attrChange attrName bubbles button cancelable charCode clientX clientY ctrlKey currentTarget data detail eventPhase fromElement handler keyCode layerX layerY metaKey newValue offsetX offsetY pageX pageY prevValue relatedNode relatedTarget screenX screenY shiftKey srcElement target toElement view wheelDelta which".split(" "),

    	fix: function( event ) {
    		if ( event[ jQuery.expando ] ) {
    			return event;
    		}

    		// store a copy of the original event object
    		// and "clone" to set read-only properties
    		var originalEvent = event;
    		event = jQuery.Event( originalEvent );

    		for ( var i = this.props.length, prop; i; ) {
    			prop = this.props[ --i ];
    			event[ prop ] = originalEvent[ prop ];
    		}

    		// Fix target property, if necessary
    		if ( !event.target ) {
    			// Fixes #1925 where srcElement might not be defined either
    			event.target = event.srcElement || document;
    		}

    		// check if target is a textnode (safari)
    		if ( event.target.nodeType === 3 ) {
    			event.target = event.target.parentNode;
    		}

    		// Add relatedTarget, if necessary
    		if ( !event.relatedTarget && event.fromElement ) {
    			event.relatedTarget = event.fromElement === event.target ? event.toElement : event.fromElement;
    		}

    		// Calculate pageX/Y if missing and clientX/Y available
    		if ( event.pageX == null && event.clientX != null ) {
    			var eventDocument = event.target.ownerDocument || document,
    				doc = eventDocument.documentElement,
    				body = eventDocument.body;

    			event.pageX = event.clientX + (doc && doc.scrollLeft || body && body.scrollLeft || 0) - (doc && doc.clientLeft || body && body.clientLeft || 0);
    			event.pageY = event.clientY + (doc && doc.scrollTop  || body && body.scrollTop  || 0) - (doc && doc.clientTop  || body && body.clientTop  || 0);
    		}

    		// Add which for key events
    		if ( event.which == null && (event.charCode != null || event.keyCode != null) ) {
    			event.which = event.charCode != null ? event.charCode : event.keyCode;
    		}

    		// Add metaKey to non-Mac browsers (use ctrl for PC's and Meta for Macs)
    		if ( !event.metaKey && event.ctrlKey ) {
    			event.metaKey = event.ctrlKey;
    		}

    		// Add which for click: 1 === left; 2 === middle; 3 === right
    		// Note: button is not normalized, so don't use it
    		if ( !event.which && event.button !== undefined ) {
    			event.which = (event.button & 1 ? 1 : ( event.button & 2 ? 3 : ( event.button & 4 ? 2 : 0 ) ));
    		}

    		return event;
    	},

    	// Deprecated, use jQuery.guid instead
    	guid: 1E8,

    	// Deprecated, use jQuery.proxy instead
    	proxy: jQuery.proxy,

    	special: {
    		ready: {
    			// Make sure the ready event is setup
    			setup: jQuery.bindReady,
    			teardown: jQuery.noop
    		},

    		live: {
    			add: function( handleObj ) {
    				jQuery.event.add( this,
    					liveConvert( handleObj.origType, handleObj.selector ),
    					jQuery.extend({}, handleObj, {handler: liveHandler, guid: handleObj.handler.guid}) );
    			},

    			remove: function( handleObj ) {
    				jQuery.event.remove( this, liveConvert( handleObj.origType, handleObj.selector ), handleObj );
    			}
    		},

    		beforeunload: {
    			setup: function( data, namespaces, eventHandle ) {
    				// We only want to do this special case on windows
    				if ( jQuery.isWindow( this ) ) {
    					this.onbeforeunload = eventHandle;
    				}
    			},

    			teardown: function( namespaces, eventHandle ) {
    				if ( this.onbeforeunload === eventHandle ) {
    					this.onbeforeunload = null;
    				}
    			}
    		}
    	}
    };

    jQuery.removeEvent = document.removeEventListener ?
    	function( elem, type, handle ) {
    		if ( elem.removeEventListener ) {
    			elem.removeEventListener( type, handle, false );
    		}
    	} :
    	function( elem, type, handle ) {
    		if ( elem.detachEvent ) {
    			elem.detachEvent( "on" + type, handle );
    		}
    	};

    jQuery.Event = function( src, props ) {
    	// Allow instantiation without the 'new' keyword
    	if ( !this.preventDefault ) {
    		return new jQuery.Event( src, props );
    	}

    	// Event object
    	if ( src && src.type ) {
    		this.originalEvent = src;
    		this.type = src.type;

    		// Events bubbling up the document may have been marked as prevented
    		// by a handler lower down the tree; reflect the correct value.
    		this.isDefaultPrevented = (src.defaultPrevented || src.returnValue === false ||
    			src.getPreventDefault && src.getPreventDefault()) ? returnTrue : returnFalse;

    	// Event type
    	} else {
    		this.type = src;
    	}

    	// Put explicitly provided properties onto the event object
    	if ( props ) {
    		jQuery.extend( this, props );
    	}

    	// timeStamp is buggy for some events on Firefox(#3843)
    	// So we won't rely on the native value
    	this.timeStamp = jQuery.now();

    	// Mark it as fixed
    	this[ jQuery.expando ] = true;
    };

    function returnFalse() {
    	return false;
    }
    function returnTrue() {
    	return true;
    }

    // jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
    // http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
    jQuery.Event.prototype = {
    	preventDefault: function() {
    		this.isDefaultPrevented = returnTrue;

    		var e = this.originalEvent;
    		if ( !e ) {
    			return;
    		}

    		// if preventDefault exists run it on the original event
    		if ( e.preventDefault ) {
    			e.preventDefault();

    		// otherwise set the returnValue property of the original event to false (IE)
    		} else {
    			e.returnValue = false;
    		}
    	},
    	stopPropagation: function() {
    		this.isPropagationStopped = returnTrue;

    		var e = this.originalEvent;
    		if ( !e ) {
    			return;
    		}
    		// if stopPropagation exists run it on the original event
    		if ( e.stopPropagation ) {
    			e.stopPropagation();
    		}
    		// otherwise set the cancelBubble property of the original event to true (IE)
    		e.cancelBubble = true;
    	},
    	stopImmediatePropagation: function() {
    		this.isImmediatePropagationStopped = returnTrue;
    		this.stopPropagation();
    	},
    	isDefaultPrevented: returnFalse,
    	isPropagationStopped: returnFalse,
    	isImmediatePropagationStopped: returnFalse
    };

    // Checks if an event happened on an element within another element
    // Used in jQuery.event.special.mouseenter and mouseleave handlers
    var withinElement = function( event ) {

    	// Check if mouse(over|out) are still within the same parent element
    	var related = event.relatedTarget,
    		inside = false,
    		eventType = event.type;

    	event.type = event.data;

    	if ( related !== this ) {

    		if ( related ) {
    			inside = jQuery.contains( this, related );
    		}

    		if ( !inside ) {

    			jQuery.event.handle.apply( this, arguments );

    			event.type = eventType;
    		}
    	}
    },

    // In case of event delegation, we only need to rename the event.type,
    // liveHandler will take care of the rest.
    delegate = function( event ) {
    	event.type = event.data;
    	jQuery.event.handle.apply( this, arguments );
    };

    // Create mouseenter and mouseleave events
    jQuery.each({
    	mouseenter: "mouseover",
    	mouseleave: "mouseout"
    }, function( orig, fix ) {
    	jQuery.event.special[ orig ] = {
    		setup: function( data ) {
    			jQuery.event.add( this, fix, data && data.selector ? delegate : withinElement, orig );
    		},
    		teardown: function( data ) {
    			jQuery.event.remove( this, fix, data && data.selector ? delegate : withinElement );
    		}
    	};
    });

    // submit delegation
    if ( !jQuery.support.submitBubbles ) {

    	jQuery.event.special.submit = {
    		setup: function( data, namespaces ) {
    			if ( !jQuery.nodeName( this, "form" ) ) {
    				jQuery.event.add(this, "click.specialSubmit", function( e ) {
    					var elem = e.target,
    						type = elem.type;

    					if ( (type === "submit" || type === "image") && jQuery( elem ).closest("form").length ) {
    						trigger( "submit", this, arguments );
    					}
    				});

    				jQuery.event.add(this, "keypress.specialSubmit", function( e ) {
    					var elem = e.target,
    						type = elem.type;

    					if ( (type === "text" || type === "password") && jQuery( elem ).closest("form").length && e.keyCode === 13 ) {
    						trigger( "submit", this, arguments );
    					}
    				});

    			} else {
    				return false;
    			}
    		},

    		teardown: function( namespaces ) {
    			jQuery.event.remove( this, ".specialSubmit" );
    		}
    	};

    }

    // change delegation, happens here so we have bind.
    if ( !jQuery.support.changeBubbles ) {

    	var changeFilters,

    	getVal = function( elem ) {
    		var type = elem.type, val = elem.value;

    		if ( type === "radio" || type === "checkbox" ) {
    			val = elem.checked;

    		} else if ( type === "select-multiple" ) {
    			val = elem.selectedIndex > -1 ?
    				jQuery.map( elem.options, function( elem ) {
    					return elem.selected;
    				}).join("-") :
    				"";

    		} else if ( jQuery.nodeName( elem, "select" ) ) {
    			val = elem.selectedIndex;
    		}

    		return val;
    	},

    	testChange = function testChange( e ) {
    		var elem = e.target, data, val;

    		if ( !rformElems.test( elem.nodeName ) || elem.readOnly ) {
    			return;
    		}

    		data = jQuery._data( elem, "_change_data" );
    		val = getVal(elem);

    		// the current data will be also retrieved by beforeactivate
    		if ( e.type !== "focusout" || elem.type !== "radio" ) {
    			jQuery._data( elem, "_change_data", val );
    		}

    		if ( data === undefined || val === data ) {
    			return;
    		}

    		if ( data != null || val ) {
    			e.type = "change";
    			e.liveFired = undefined;
    			jQuery.event.trigger( e, arguments[1], elem );
    		}
    	};

    	jQuery.event.special.change = {
    		filters: {
    			focusout: testChange,

    			beforedeactivate: testChange,

    			click: function( e ) {
    				var elem = e.target, type = jQuery.nodeName( elem, "input" ) ? elem.type : "";

    				if ( type === "radio" || type === "checkbox" || jQuery.nodeName( elem, "select" ) ) {
    					testChange.call( this, e );
    				}
    			},

    			// Change has to be called before submit
    			// Keydown will be called before keypress, which is used in submit-event delegation
    			keydown: function( e ) {
    				var elem = e.target, type = jQuery.nodeName( elem, "input" ) ? elem.type : "";

    				if ( (e.keyCode === 13 && !jQuery.nodeName( elem, "textarea" ) ) ||
    					(e.keyCode === 32 && (type === "checkbox" || type === "radio")) ||
    					type === "select-multiple" ) {
    					testChange.call( this, e );
    				}
    			},

    			// Beforeactivate happens also before the previous element is blurred
    			// with this event you can't trigger a change event, but you can store
    			// information
    			beforeactivate: function( e ) {
    				var elem = e.target;
    				jQuery._data( elem, "_change_data", getVal(elem) );
    			}
    		},

    		setup: function( data, namespaces ) {
    			if ( this.type === "file" ) {
    				return false;
    			}

    			for ( var type in changeFilters ) {
    				jQuery.event.add( this, type + ".specialChange", changeFilters[type] );
    			}

    			return rformElems.test( this.nodeName );
    		},

    		teardown: function( namespaces ) {
    			jQuery.event.remove( this, ".specialChange" );

    			return rformElems.test( this.nodeName );
    		}
    	};

    	changeFilters = jQuery.event.special.change.filters;

    	// Handle when the input is .focus()'d
    	changeFilters.focus = changeFilters.beforeactivate;
    }

    function trigger( type, elem, args ) {
    	// Piggyback on a donor event to simulate a different one.
    	// Fake originalEvent to avoid donor's stopPropagation, but if the
    	// simulated event prevents default then we do the same on the donor.
    	// Don't pass args or remember liveFired; they apply to the donor event.
    	var event = jQuery.extend( {}, args[ 0 ] );
    	event.type = type;
    	event.originalEvent = {};
    	event.liveFired = undefined;
    	jQuery.event.handle.call( elem, event );
    	if ( event.isDefaultPrevented() ) {
    		args[ 0 ].preventDefault();
    	}
    }

    // Create "bubbling" focus and blur events
    if ( !jQuery.support.focusinBubbles ) {
    	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

    		// Attach a single capturing handler while someone wants focusin/focusout
    		var attaches = 0;

    		jQuery.event.special[ fix ] = {
    			setup: function() {
    				if ( attaches++ === 0 ) {
    					document.addEventListener( orig, handler, true );
    				}
    			},
    			teardown: function() {
    				if ( --attaches === 0 ) {
    					document.removeEventListener( orig, handler, true );
    				}
    			}
    		};

    		function handler( donor ) {
    			// Donor event is always a native one; fix it and switch its type.
    			// Let focusin/out handler cancel the donor focus/blur event.
    			var e = jQuery.event.fix( donor );
    			e.type = fix;
    			e.originalEvent = {};
    			jQuery.event.trigger( e, null, e.target );
    			if ( e.isDefaultPrevented() ) {
    				donor.preventDefault();
    			}
    		}
    	});
    }

    jQuery.each(["bind", "one"], function( i, name ) {
    	jQuery.fn[ name ] = function( type, data, fn ) {
    		var handler;

    		// Handle object literals
    		if ( typeof type === "object" ) {
    			for ( var key in type ) {
    				this[ name ](key, data, type[key], fn);
    			}
    			return this;
    		}

    		if ( arguments.length === 2 || data === false ) {
    			fn = data;
    			data = undefined;
    		}

    		if ( name === "one" ) {
    			handler = function( event ) {
    				jQuery( this ).unbind( event, handler );
    				return fn.apply( this, arguments );
    			};
    			handler.guid = fn.guid || jQuery.guid++;
    		} else {
    			handler = fn;
    		}

    		if ( type === "unload" && name !== "one" ) {
    			this.one( type, data, fn );

    		} else {
    			for ( var i = 0, l = this.length; i < l; i++ ) {
    				jQuery.event.add( this[i], type, handler, data );
    			}
    		}

    		return this;
    	};
    });

    jQuery.fn.extend({
    	unbind: function( type, fn ) {
    		// Handle object literals
    		if ( typeof type === "object" && !type.preventDefault ) {
    			for ( var key in type ) {
    				this.unbind(key, type[key]);
    			}

    		} else {
    			for ( var i = 0, l = this.length; i < l; i++ ) {
    				jQuery.event.remove( this[i], type, fn );
    			}
    		}

    		return this;
    	},

    	delegate: function( selector, types, data, fn ) {
    		return this.live( types, data, fn, selector );
    	},

    	undelegate: function( selector, types, fn ) {
    		if ( arguments.length === 0 ) {
    			return this.unbind( "live" );

    		} else {
    			return this.die( types, null, fn, selector );
    		}
    	},

    	trigger: function( type, data ) {
    		return this.each(function() {
    			jQuery.event.trigger( type, data, this );
    		});
    	},

    	triggerHandler: function( type, data ) {
    		if ( this[0] ) {
    			return jQuery.event.trigger( type, data, this[0], true );
    		}
    	},

    	toggle: function( fn ) {
    		// Save reference to arguments for access in closure
    		var args = arguments,
    			guid = fn.guid || jQuery.guid++,
    			i = 0,
    			toggler = function( event ) {
    				// Figure out which function to execute
    				var lastToggle = ( jQuery.data( this, "lastToggle" + fn.guid ) || 0 ) % i;
    				jQuery.data( this, "lastToggle" + fn.guid, lastToggle + 1 );

    				// Make sure that clicks stop
    				event.preventDefault();

    				// and execute the function
    				return args[ lastToggle ].apply( this, arguments ) || false;
    			};

    		// link all the functions, so any of them can unbind this click handler
    		toggler.guid = guid;
    		while ( i < args.length ) {
    			args[ i++ ].guid = guid;
    		}

    		return this.click( toggler );
    	},

    	hover: function( fnOver, fnOut ) {
    		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
    	}
    });

    var liveMap = {
    	focus: "focusin",
    	blur: "focusout",
    	mouseenter: "mouseover",
    	mouseleave: "mouseout"
    };

    jQuery.each(["live", "die"], function( i, name ) {
    	jQuery.fn[ name ] = function( types, data, fn, origSelector /* Internal Use Only */ ) {
    		var type, i = 0, match, namespaces, preType,
    			selector = origSelector || this.selector,
    			context = origSelector ? this : jQuery( this.context );

    		if ( typeof types === "object" && !types.preventDefault ) {
    			for ( var key in types ) {
    				context[ name ]( key, data, types[key], selector );
    			}

    			return this;
    		}

    		if ( name === "die" && !types &&
    					origSelector && origSelector.charAt(0) === "." ) {

    			context.unbind( origSelector );

    			return this;
    		}

    		if ( data === false || jQuery.isFunction( data ) ) {
    			fn = data || returnFalse;
    			data = undefined;
    		}

    		types = (types || "").split(" ");

    		while ( (type = types[ i++ ]) != null ) {
    			match = rnamespaces.exec( type );
    			namespaces = "";

    			if ( match )  {
    				namespaces = match[0];
    				type = type.replace( rnamespaces, "" );
    			}

    			if ( type === "hover" ) {
    				types.push( "mouseenter" + namespaces, "mouseleave" + namespaces );
    				continue;
    			}

    			preType = type;

    			if ( liveMap[ type ] ) {
    				types.push( liveMap[ type ] + namespaces );
    				type = type + namespaces;

    			} else {
    				type = (liveMap[ type ] || type) + namespaces;
    			}

    			if ( name === "live" ) {
    				// bind live handler
    				for ( var j = 0, l = context.length; j < l; j++ ) {
    					jQuery.event.add( context[j], "live." + liveConvert( type, selector ),
    						{ data: data, selector: selector, handler: fn, origType: type, origHandler: fn, preType: preType } );
    				}

    			} else {
    				// unbind live handler
    				context.unbind( "live." + liveConvert( type, selector ), fn );
    			}
    		}

    		return this;
    	};
    });

    function liveHandler( event ) {
    	var stop, maxLevel, related, match, handleObj, elem, j, i, l, data, close, namespace, ret,
    		elems = [],
    		selectors = [],
    		events = jQuery._data( this, "events" );

    	// Make sure we avoid non-left-click bubbling in Firefox (#3861) and disabled elements in IE (#6911)
    	if ( event.liveFired === this || !events || !events.live || event.target.disabled || event.button && event.type === "click" ) {
    		return;
    	}

    	if ( event.namespace ) {
    		namespace = new RegExp("(^|\\.)" + event.namespace.split(".").join("\\.(?:.*\\.)?") + "(\\.|$)");
    	}

    	event.liveFired = this;

    	var live = events.live.slice(0);

    	for ( j = 0; j < live.length; j++ ) {
    		handleObj = live[j];

    		if ( handleObj.origType.replace( rnamespaces, "" ) === event.type ) {
    			selectors.push( handleObj.selector );

    		} else {
    			live.splice( j--, 1 );
    		}
    	}

    	match = jQuery( event.target ).closest( selectors, event.currentTarget );

    	for ( i = 0, l = match.length; i < l; i++ ) {
    		close = match[i];

    		for ( j = 0; j < live.length; j++ ) {
    			handleObj = live[j];

    			if ( close.selector === handleObj.selector && (!namespace || namespace.test( handleObj.namespace )) && !close.elem.disabled ) {
    				elem = close.elem;
    				related = null;

    				// Those two events require additional checking
    				if ( handleObj.preType === "mouseenter" || handleObj.preType === "mouseleave" ) {
    					event.type = handleObj.preType;
    					related = jQuery( event.relatedTarget ).closest( handleObj.selector )[0];

    					// Make sure not to accidentally match a child element with the same selector
    					if ( related && jQuery.contains( elem, related ) ) {
    						related = elem;
    					}
    				}

    				if ( !related || related !== elem ) {
    					elems.push({ elem: elem, handleObj: handleObj, level: close.level });
    				}
    			}
    		}
    	}

    	for ( i = 0, l = elems.length; i < l; i++ ) {
    		match = elems[i];

    		if ( maxLevel && match.level > maxLevel ) {
    			break;
    		}

    		event.currentTarget = match.elem;
    		event.data = match.handleObj.data;
    		event.handleObj = match.handleObj;

    		ret = match.handleObj.origHandler.apply( match.elem, arguments );

    		if ( ret === false || event.isPropagationStopped() ) {
    			maxLevel = match.level;

    			if ( ret === false ) {
    				stop = false;
    			}
    			if ( event.isImmediatePropagationStopped() ) {
    				break;
    			}
    		}
    	}

    	return stop;
    }

    function liveConvert( type, selector ) {
    	return (type && type !== "*" ? type + "." : "") + selector.replace(rperiod, "`").replace(rspaces, "&");
    }

    jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
    	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
    	"change select submit keydown keypress keyup error").split(" "), function( i, name ) {

    	// Handle event binding
    	jQuery.fn[ name ] = function( data, fn ) {
    		if ( fn == null ) {
    			fn = data;
    			data = null;
    		}

    		return arguments.length > 0 ?
    			this.bind( name, data, fn ) :
    			this.trigger( name );
    	};

    	if ( jQuery.attrFn ) {
    		jQuery.attrFn[ name ] = true;
    	}
    });



    /*!
     * Sizzle CSS Selector Engine
     *  Copyright 2011, The Dojo Foundation
     *  Released under the MIT, BSD, and GPL Licenses.
     *  More information: http://sizzlejs.com/
     */
    (function(){

    var chunker = /((?:\((?:\([^()]+\)|[^()]+)+\)|\[(?:\[[^\[\]]*\]|['"][^'"]*['"]|[^\[\]'"]+)+\]|\\.|[^ >+~,(\[\\]+)+|[>+~])(\s*,\s*)?((?:.|\r|\n)*)/g,
    	done = 0,
    	toString = Object.prototype.toString,
    	hasDuplicate = false,
    	baseHasDuplicate = true,
    	rBackslash = /\\/g,
    	rNonWord = /\W/;

    // Here we check if the JavaScript engine is using some sort of
    // optimization where it does not always call our comparision
    // function. If that is the case, discard the hasDuplicate value.
    //   Thus far that includes Google Chrome.
    [0, 0].sort(function() {
    	baseHasDuplicate = false;
    	return 0;
    });

    var Sizzle = function( selector, context, results, seed ) {
    	results = results || [];
    	context = context || document;

    	var origContext = context;

    	if ( context.nodeType !== 1 && context.nodeType !== 9 ) {
    		return [];
    	}

    	if ( !selector || typeof selector !== "string" ) {
    		return results;
    	}

    	var m, set, checkSet, extra, ret, cur, pop, i,
    		prune = true,
    		contextXML = Sizzle.isXML( context ),
    		parts = [],
    		soFar = selector;

    	// Reset the position of the chunker regexp (start from head)
    	do {
    		chunker.exec( "" );
    		m = chunker.exec( soFar );

    		if ( m ) {
    			soFar = m[3];

    			parts.push( m[1] );

    			if ( m[2] ) {
    				extra = m[3];
    				break;
    			}
    		}
    	} while ( m );

    	if ( parts.length > 1 && origPOS.exec( selector ) ) {

    		if ( parts.length === 2 && Expr.relative[ parts[0] ] ) {
    			set = posProcess( parts[0] + parts[1], context );

    		} else {
    			set = Expr.relative[ parts[0] ] ?
    				[ context ] :
    				Sizzle( parts.shift(), context );

    			while ( parts.length ) {
    				selector = parts.shift();

    				if ( Expr.relative[ selector ] ) {
    					selector += parts.shift();
    				}

    				set = posProcess( selector, set );
    			}
    		}

    	} else {
    		// Take a shortcut and set the context if the root selector is an ID
    		// (but not if it'll be faster if the inner selector is an ID)
    		if ( !seed && parts.length > 1 && context.nodeType === 9 && !contextXML &&
    				Expr.match.ID.test(parts[0]) && !Expr.match.ID.test(parts[parts.length - 1]) ) {

    			ret = Sizzle.find( parts.shift(), context, contextXML );
    			context = ret.expr ?
    				Sizzle.filter( ret.expr, ret.set )[0] :
    				ret.set[0];
    		}

    		if ( context ) {
    			ret = seed ?
    				{ expr: parts.pop(), set: makeArray(seed) } :
    				Sizzle.find( parts.pop(), parts.length === 1 && (parts[0] === "~" || parts[0] === "+") && context.parentNode ? context.parentNode : context, contextXML );

    			set = ret.expr ?
    				Sizzle.filter( ret.expr, ret.set ) :
    				ret.set;

    			if ( parts.length > 0 ) {
    				checkSet = makeArray( set );

    			} else {
    				prune = false;
    			}

    			while ( parts.length ) {
    				cur = parts.pop();
    				pop = cur;

    				if ( !Expr.relative[ cur ] ) {
    					cur = "";
    				} else {
    					pop = parts.pop();
    				}

    				if ( pop == null ) {
    					pop = context;
    				}

    				Expr.relative[ cur ]( checkSet, pop, contextXML );
    			}

    		} else {
    			checkSet = parts = [];
    		}
    	}

    	if ( !checkSet ) {
    		checkSet = set;
    	}

    	if ( !checkSet ) {
    		Sizzle.error( cur || selector );
    	}

    	if ( toString.call(checkSet) === "[object Array]" ) {
    		if ( !prune ) {
    			results.push.apply( results, checkSet );

    		} else if ( context && context.nodeType === 1 ) {
    			for ( i = 0; checkSet[i] != null; i++ ) {
    				if ( checkSet[i] && (checkSet[i] === true || checkSet[i].nodeType === 1 && Sizzle.contains(context, checkSet[i])) ) {
    					results.push( set[i] );
    				}
    			}

    		} else {
    			for ( i = 0; checkSet[i] != null; i++ ) {
    				if ( checkSet[i] && checkSet[i].nodeType === 1 ) {
    					results.push( set[i] );
    				}
    			}
    		}

    	} else {
    		makeArray( checkSet, results );
    	}

    	if ( extra ) {
    		Sizzle( extra, origContext, results, seed );
    		Sizzle.uniqueSort( results );
    	}

    	return results;
    };

    Sizzle.uniqueSort = function( results ) {
    	if ( sortOrder ) {
    		hasDuplicate = baseHasDuplicate;
    		results.sort( sortOrder );

    		if ( hasDuplicate ) {
    			for ( var i = 1; i < results.length; i++ ) {
    				if ( results[i] === results[ i - 1 ] ) {
    					results.splice( i--, 1 );
    				}
    			}
    		}
    	}

    	return results;
    };

    Sizzle.matches = function( expr, set ) {
    	return Sizzle( expr, null, null, set );
    };

    Sizzle.matchesSelector = function( node, expr ) {
    	return Sizzle( expr, null, null, [node] ).length > 0;
    };

    Sizzle.find = function( expr, context, isXML ) {
    	var set;

    	if ( !expr ) {
    		return [];
    	}

    	for ( var i = 0, l = Expr.order.length; i < l; i++ ) {
    		var match,
    			type = Expr.order[i];

    		if ( (match = Expr.leftMatch[ type ].exec( expr )) ) {
    			var left = match[1];
    			match.splice( 1, 1 );

    			if ( left.substr( left.length - 1 ) !== "\\" ) {
    				match[1] = (match[1] || "").replace( rBackslash, "" );
    				set = Expr.find[ type ]( match, context, isXML );

    				if ( set != null ) {
    					expr = expr.replace( Expr.match[ type ], "" );
    					break;
    				}
    			}
    		}
    	}

    	if ( !set ) {
    		set = typeof context.getElementsByTagName !== "undefined" ?
    			context.getElementsByTagName( "*" ) :
    			[];
    	}

    	return { set: set, expr: expr };
    };

    Sizzle.filter = function( expr, set, inplace, not ) {
    	var match, anyFound,
    		old = expr,
    		result = [],
    		curLoop = set,
    		isXMLFilter = set && set[0] && Sizzle.isXML( set[0] );

    	while ( expr && set.length ) {
    		for ( var type in Expr.filter ) {
    			if ( (match = Expr.leftMatch[ type ].exec( expr )) != null && match[2] ) {
    				var found, item,
    					filter = Expr.filter[ type ],
    					left = match[1];

    				anyFound = false;

    				match.splice(1,1);

    				if ( left.substr( left.length - 1 ) === "\\" ) {
    					continue;
    				}

    				if ( curLoop === result ) {
    					result = [];
    				}

    				if ( Expr.preFilter[ type ] ) {
    					match = Expr.preFilter[ type ]( match, curLoop, inplace, result, not, isXMLFilter );

    					if ( !match ) {
    						anyFound = found = true;

    					} else if ( match === true ) {
    						continue;
    					}
    				}

    				if ( match ) {
    					for ( var i = 0; (item = curLoop[i]) != null; i++ ) {
    						if ( item ) {
    							found = filter( item, match, i, curLoop );
    							var pass = not ^ !!found;

    							if ( inplace && found != null ) {
    								if ( pass ) {
    									anyFound = true;

    								} else {
    									curLoop[i] = false;
    								}

    							} else if ( pass ) {
    								result.push( item );
    								anyFound = true;
    							}
    						}
    					}
    				}

    				if ( found !== undefined ) {
    					if ( !inplace ) {
    						curLoop = result;
    					}

    					expr = expr.replace( Expr.match[ type ], "" );

    					if ( !anyFound ) {
    						return [];
    					}

    					break;
    				}
    			}
    		}

    		// Improper expression
    		if ( expr === old ) {
    			if ( anyFound == null ) {
    				Sizzle.error( expr );

    			} else {
    				break;
    			}
    		}

    		old = expr;
    	}

    	return curLoop;
    };

    Sizzle.error = function( msg ) {
    	throw "Syntax error, unrecognized expression: " + msg;
    };

    var Expr = Sizzle.selectors = {
    	order: [ "ID", "NAME", "TAG" ],

    	match: {
    		ID: /#((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
    		CLASS: /\.((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
    		NAME: /\[name=['"]*((?:[\w\u00c0-\uFFFF\-]|\\.)+)['"]*\]/,
    		ATTR: /\[\s*((?:[\w\u00c0-\uFFFF\-]|\\.)+)\s*(?:(\S?=)\s*(?:(['"])(.*?)\3|(#?(?:[\w\u00c0-\uFFFF\-]|\\.)*)|)|)\s*\]/,
    		TAG: /^((?:[\w\u00c0-\uFFFF\*\-]|\\.)+)/,
    		CHILD: /:(only|nth|last|first)-child(?:\(\s*(even|odd|(?:[+\-]?\d+|(?:[+\-]?\d*)?n\s*(?:[+\-]\s*\d+)?))\s*\))?/,
    		POS: /:(nth|eq|gt|lt|first|last|even|odd)(?:\((\d*)\))?(?=[^\-]|$)/,
    		PSEUDO: /:((?:[\w\u00c0-\uFFFF\-]|\\.)+)(?:\((['"]?)((?:\([^\)]+\)|[^\(\)]*)+)\2\))?/
    	},

    	leftMatch: {},

    	attrMap: {
    		"class": "className",
    		"for": "htmlFor"
    	},

    	attrHandle: {
    		href: function( elem ) {
    			return elem.getAttribute( "href" );
    		},
    		type: function( elem ) {
    			return elem.getAttribute( "type" );
    		}
    	},

    	relative: {
    		"+": function(checkSet, part){
    			var isPartStr = typeof part === "string",
    				isTag = isPartStr && !rNonWord.test( part ),
    				isPartStrNotTag = isPartStr && !isTag;

    			if ( isTag ) {
    				part = part.toLowerCase();
    			}

    			for ( var i = 0, l = checkSet.length, elem; i < l; i++ ) {
    				if ( (elem = checkSet[i]) ) {
    					while ( (elem = elem.previousSibling) && elem.nodeType !== 1 ) {}

    					checkSet[i] = isPartStrNotTag || elem && elem.nodeName.toLowerCase() === part ?
    						elem || false :
    						elem === part;
    				}
    			}

    			if ( isPartStrNotTag ) {
    				Sizzle.filter( part, checkSet, true );
    			}
    		},

    		">": function( checkSet, part ) {
    			var elem,
    				isPartStr = typeof part === "string",
    				i = 0,
    				l = checkSet.length;

    			if ( isPartStr && !rNonWord.test( part ) ) {
    				part = part.toLowerCase();

    				for ( ; i < l; i++ ) {
    					elem = checkSet[i];

    					if ( elem ) {
    						var parent = elem.parentNode;
    						checkSet[i] = parent.nodeName.toLowerCase() === part ? parent : false;
    					}
    				}

    			} else {
    				for ( ; i < l; i++ ) {
    					elem = checkSet[i];

    					if ( elem ) {
    						checkSet[i] = isPartStr ?
    							elem.parentNode :
    							elem.parentNode === part;
    					}
    				}

    				if ( isPartStr ) {
    					Sizzle.filter( part, checkSet, true );
    				}
    			}
    		},

    		"": function(checkSet, part, isXML){
    			var nodeCheck,
    				doneName = done++,
    				checkFn = dirCheck;

    			if ( typeof part === "string" && !rNonWord.test( part ) ) {
    				part = part.toLowerCase();
    				nodeCheck = part;
    				checkFn = dirNodeCheck;
    			}

    			checkFn( "parentNode", part, doneName, checkSet, nodeCheck, isXML );
    		},

    		"~": function( checkSet, part, isXML ) {
    			var nodeCheck,
    				doneName = done++,
    				checkFn = dirCheck;

    			if ( typeof part === "string" && !rNonWord.test( part ) ) {
    				part = part.toLowerCase();
    				nodeCheck = part;
    				checkFn = dirNodeCheck;
    			}

    			checkFn( "previousSibling", part, doneName, checkSet, nodeCheck, isXML );
    		}
    	},

    	find: {
    		ID: function( match, context, isXML ) {
    			if ( typeof context.getElementById !== "undefined" && !isXML ) {
    				var m = context.getElementById(match[1]);
    				// Check parentNode to catch when Blackberry 4.6 returns
    				// nodes that are no longer in the document #6963
    				return m && m.parentNode ? [m] : [];
    			}
    		},

    		NAME: function( match, context ) {
    			if ( typeof context.getElementsByName !== "undefined" ) {
    				var ret = [],
    					results = context.getElementsByName( match[1] );

    				for ( var i = 0, l = results.length; i < l; i++ ) {
    					if ( results[i].getAttribute("name") === match[1] ) {
    						ret.push( results[i] );
    					}
    				}

    				return ret.length === 0 ? null : ret;
    			}
    		},

    		TAG: function( match, context ) {
    			if ( typeof context.getElementsByTagName !== "undefined" ) {
    				return context.getElementsByTagName( match[1] );
    			}
    		}
    	},
    	preFilter: {
    		CLASS: function( match, curLoop, inplace, result, not, isXML ) {
    			match = " " + match[1].replace( rBackslash, "" ) + " ";

    			if ( isXML ) {
    				return match;
    			}

    			for ( var i = 0, elem; (elem = curLoop[i]) != null; i++ ) {
    				if ( elem ) {
    					if ( not ^ (elem.className && (" " + elem.className + " ").replace(/[\t\n\r]/g, " ").indexOf(match) >= 0) ) {
    						if ( !inplace ) {
    							result.push( elem );
    						}

    					} else if ( inplace ) {
    						curLoop[i] = false;
    					}
    				}
    			}

    			return false;
    		},

    		ID: function( match ) {
    			return match[1].replace( rBackslash, "" );
    		},

    		TAG: function( match, curLoop ) {
    			return match[1].replace( rBackslash, "" ).toLowerCase();
    		},

    		CHILD: function( match ) {
    			if ( match[1] === "nth" ) {
    				if ( !match[2] ) {
    					Sizzle.error( match[0] );
    				}

    				match[2] = match[2].replace(/^\+|\s*/g, '');

    				// parse equations like 'even', 'odd', '5', '2n', '3n+2', '4n-1', '-n+6'
    				var test = /(-?)(\d*)(?:n([+\-]?\d*))?/.exec(
    					match[2] === "even" && "2n" || match[2] === "odd" && "2n+1" ||
    					!/\D/.test( match[2] ) && "0n+" + match[2] || match[2]);

    				// calculate the numbers (first)n+(last) including if they are negative
    				match[2] = (test[1] + (test[2] || 1)) - 0;
    				match[3] = test[3] - 0;
    			}
    			else if ( match[2] ) {
    				Sizzle.error( match[0] );
    			}

    			// TODO: Move to normal caching system
    			match[0] = done++;

    			return match;
    		},

    		ATTR: function( match, curLoop, inplace, result, not, isXML ) {
    			var name = match[1] = match[1].replace( rBackslash, "" );

    			if ( !isXML && Expr.attrMap[name] ) {
    				match[1] = Expr.attrMap[name];
    			}

    			// Handle if an un-quoted value was used
    			match[4] = ( match[4] || match[5] || "" ).replace( rBackslash, "" );

    			if ( match[2] === "~=" ) {
    				match[4] = " " + match[4] + " ";
    			}

    			return match;
    		},

    		PSEUDO: function( match, curLoop, inplace, result, not ) {
    			if ( match[1] === "not" ) {
    				// If we're dealing with a complex expression, or a simple one
    				if ( ( chunker.exec(match[3]) || "" ).length > 1 || /^\w/.test(match[3]) ) {
    					match[3] = Sizzle(match[3], null, null, curLoop);

    				} else {
    					var ret = Sizzle.filter(match[3], curLoop, inplace, true ^ not);

    					if ( !inplace ) {
    						result.push.apply( result, ret );
    					}

    					return false;
    				}

    			} else if ( Expr.match.POS.test( match[0] ) || Expr.match.CHILD.test( match[0] ) ) {
    				return true;
    			}

    			return match;
    		},

    		POS: function( match ) {
    			match.unshift( true );

    			return match;
    		}
    	},

    	filters: {
    		enabled: function( elem ) {
    			return elem.disabled === false && elem.type !== "hidden";
    		},

    		disabled: function( elem ) {
    			return elem.disabled === true;
    		},

    		checked: function( elem ) {
    			return elem.checked === true;
    		},

    		selected: function( elem ) {
    			// Accessing this property makes selected-by-default
    			// options in Safari work properly
    			if ( elem.parentNode ) {
    				elem.parentNode.selectedIndex;
    			}

    			return elem.selected === true;
    		},

    		parent: function( elem ) {
    			return !!elem.firstChild;
    		},

    		empty: function( elem ) {
    			return !elem.firstChild;
    		},

    		has: function( elem, i, match ) {
    			return !!Sizzle( match[3], elem ).length;
    		},

    		header: function( elem ) {
    			return (/h\d/i).test( elem.nodeName );
    		},

    		text: function( elem ) {
    			var attr = elem.getAttribute( "type" ), type = elem.type;
    			// IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc) 
    			// use getAttribute instead to test this case
    			return elem.nodeName.toLowerCase() === "input" && "text" === type && ( attr === type || attr === null );
    		},

    		radio: function( elem ) {
    			return elem.nodeName.toLowerCase() === "input" && "radio" === elem.type;
    		},

    		checkbox: function( elem ) {
    			return elem.nodeName.toLowerCase() === "input" && "checkbox" === elem.type;
    		},

    		file: function( elem ) {
    			return elem.nodeName.toLowerCase() === "input" && "file" === elem.type;
    		},

    		password: function( elem ) {
    			return elem.nodeName.toLowerCase() === "input" && "password" === elem.type;
    		},

    		submit: function( elem ) {
    			var name = elem.nodeName.toLowerCase();
    			return (name === "input" || name === "button") && "submit" === elem.type;
    		},

    		image: function( elem ) {
    			return elem.nodeName.toLowerCase() === "input" && "image" === elem.type;
    		},

    		reset: function( elem ) {
    			var name = elem.nodeName.toLowerCase();
    			return (name === "input" || name === "button") && "reset" === elem.type;
    		},

    		button: function( elem ) {
    			var name = elem.nodeName.toLowerCase();
    			return name === "input" && "button" === elem.type || name === "button";
    		},

    		input: function( elem ) {
    			return (/input|select|textarea|button/i).test( elem.nodeName );
    		},

    		focus: function( elem ) {
    			return elem === elem.ownerDocument.activeElement;
    		}
    	},
    	setFilters: {
    		first: function( elem, i ) {
    			return i === 0;
    		},

    		last: function( elem, i, match, array ) {
    			return i === array.length - 1;
    		},

    		even: function( elem, i ) {
    			return i % 2 === 0;
    		},

    		odd: function( elem, i ) {
    			return i % 2 === 1;
    		},

    		lt: function( elem, i, match ) {
    			return i < match[3] - 0;
    		},

    		gt: function( elem, i, match ) {
    			return i > match[3] - 0;
    		},

    		nth: function( elem, i, match ) {
    			return match[3] - 0 === i;
    		},

    		eq: function( elem, i, match ) {
    			return match[3] - 0 === i;
    		}
    	},
    	filter: {
    		PSEUDO: function( elem, match, i, array ) {
    			var name = match[1],
    				filter = Expr.filters[ name ];

    			if ( filter ) {
    				return filter( elem, i, match, array );

    			} else if ( name === "contains" ) {
    				return (elem.textContent || elem.innerText || Sizzle.getText([ elem ]) || "").indexOf(match[3]) >= 0;

    			} else if ( name === "not" ) {
    				var not = match[3];

    				for ( var j = 0, l = not.length; j < l; j++ ) {
    					if ( not[j] === elem ) {
    						return false;
    					}
    				}

    				return true;

    			} else {
    				Sizzle.error( name );
    			}
    		},

    		CHILD: function( elem, match ) {
    			var type = match[1],
    				node = elem;

    			switch ( type ) {
    				case "only":
    				case "first":
    					while ( (node = node.previousSibling) )	 {
    						if ( node.nodeType === 1 ) { 
    							return false; 
    						}
    					}

    					if ( type === "first" ) { 
    						return true; 
    					}

    					node = elem;

    				case "last":
    					while ( (node = node.nextSibling) )	 {
    						if ( node.nodeType === 1 ) { 
    							return false; 
    						}
    					}

    					return true;

    				case "nth":
    					var first = match[2],
    						last = match[3];

    					if ( first === 1 && last === 0 ) {
    						return true;
    					}

    					var doneName = match[0],
    						parent = elem.parentNode;

    					if ( parent && (parent.sizcache !== doneName || !elem.nodeIndex) ) {
    						var count = 0;

    						for ( node = parent.firstChild; node; node = node.nextSibling ) {
    							if ( node.nodeType === 1 ) {
    								node.nodeIndex = ++count;
    							}
    						} 

    						parent.sizcache = doneName;
    					}

    					var diff = elem.nodeIndex - last;

    					if ( first === 0 ) {
    						return diff === 0;

    					} else {
    						return ( diff % first === 0 && diff / first >= 0 );
    					}
    			}
    		},

    		ID: function( elem, match ) {
    			return elem.nodeType === 1 && elem.getAttribute("id") === match;
    		},

    		TAG: function( elem, match ) {
    			return (match === "*" && elem.nodeType === 1) || elem.nodeName.toLowerCase() === match;
    		},

    		CLASS: function( elem, match ) {
    			return (" " + (elem.className || elem.getAttribute("class")) + " ")
    				.indexOf( match ) > -1;
    		},

    		ATTR: function( elem, match ) {
    			var name = match[1],
    				result = Expr.attrHandle[ name ] ?
    					Expr.attrHandle[ name ]( elem ) :
    					elem[ name ] != null ?
    						elem[ name ] :
    						elem.getAttribute( name ),
    				value = result + "",
    				type = match[2],
    				check = match[4];

    			return result == null ?
    				type === "!=" :
    				type === "=" ?
    				value === check :
    				type === "*=" ?
    				value.indexOf(check) >= 0 :
    				type === "~=" ?
    				(" " + value + " ").indexOf(check) >= 0 :
    				!check ?
    				value && result !== false :
    				type === "!=" ?
    				value !== check :
    				type === "^=" ?
    				value.indexOf(check) === 0 :
    				type === "$=" ?
    				value.substr(value.length - check.length) === check :
    				type === "|=" ?
    				value === check || value.substr(0, check.length + 1) === check + "-" :
    				false;
    		},

    		POS: function( elem, match, i, array ) {
    			var name = match[2],
    				filter = Expr.setFilters[ name ];

    			if ( filter ) {
    				return filter( elem, i, match, array );
    			}
    		}
    	}
    };

    var origPOS = Expr.match.POS,
    	fescape = function(all, num){
    		return "\\" + (num - 0 + 1);
    	};

    for ( var type in Expr.match ) {
    	Expr.match[ type ] = new RegExp( Expr.match[ type ].source + (/(?![^\[]*\])(?![^\(]*\))/.source) );
    	Expr.leftMatch[ type ] = new RegExp( /(^(?:.|\r|\n)*?)/.source + Expr.match[ type ].source.replace(/\\(\d+)/g, fescape) );
    }

    var makeArray = function( array, results ) {
    	array = Array.prototype.slice.call( array, 0 );

    	if ( results ) {
    		results.push.apply( results, array );
    		return results;
    	}

    	return array;
    };

    // Perform a simple check to determine if the browser is capable of
    // converting a NodeList to an array using builtin methods.
    // Also verifies that the returned array holds DOM nodes
    // (which is not the case in the Blackberry browser)
    try {
    	Array.prototype.slice.call( document.documentElement.childNodes, 0 )[0].nodeType;

    // Provide a fallback method if it does not work
    } catch( e ) {
    	makeArray = function( array, results ) {
    		var i = 0,
    			ret = results || [];

    		if ( toString.call(array) === "[object Array]" ) {
    			Array.prototype.push.apply( ret, array );

    		} else {
    			if ( typeof array.length === "number" ) {
    				for ( var l = array.length; i < l; i++ ) {
    					ret.push( array[i] );
    				}

    			} else {
    				for ( ; array[i]; i++ ) {
    					ret.push( array[i] );
    				}
    			}
    		}

    		return ret;
    	};
    }

    var sortOrder, siblingCheck;

    if ( document.documentElement.compareDocumentPosition ) {
    	sortOrder = function( a, b ) {
    		if ( a === b ) {
    			hasDuplicate = true;
    			return 0;
    		}

    		if ( !a.compareDocumentPosition || !b.compareDocumentPosition ) {
    			return a.compareDocumentPosition ? -1 : 1;
    		}

    		return a.compareDocumentPosition(b) & 4 ? -1 : 1;
    	};

    } else {
    	sortOrder = function( a, b ) {
    		// The nodes are identical, we can exit early
    		if ( a === b ) {
    			hasDuplicate = true;
    			return 0;

    		// Fallback to using sourceIndex (in IE) if it's available on both nodes
    		} else if ( a.sourceIndex && b.sourceIndex ) {
    			return a.sourceIndex - b.sourceIndex;
    		}

    		var al, bl,
    			ap = [],
    			bp = [],
    			aup = a.parentNode,
    			bup = b.parentNode,
    			cur = aup;

    		// If the nodes are siblings (or identical) we can do a quick check
    		if ( aup === bup ) {
    			return siblingCheck( a, b );

    		// If no parents were found then the nodes are disconnected
    		} else if ( !aup ) {
    			return -1;

    		} else if ( !bup ) {
    			return 1;
    		}

    		// Otherwise they're somewhere else in the tree so we need
    		// to build up a full list of the parentNodes for comparison
    		while ( cur ) {
    			ap.unshift( cur );
    			cur = cur.parentNode;
    		}

    		cur = bup;

    		while ( cur ) {
    			bp.unshift( cur );
    			cur = cur.parentNode;
    		}

    		al = ap.length;
    		bl = bp.length;

    		// Start walking down the tree looking for a discrepancy
    		for ( var i = 0; i < al && i < bl; i++ ) {
    			if ( ap[i] !== bp[i] ) {
    				return siblingCheck( ap[i], bp[i] );
    			}
    		}

    		// We ended someplace up the tree so do a sibling check
    		return i === al ?
    			siblingCheck( a, bp[i], -1 ) :
    			siblingCheck( ap[i], b, 1 );
    	};

    	siblingCheck = function( a, b, ret ) {
    		if ( a === b ) {
    			return ret;
    		}

    		var cur = a.nextSibling;

    		while ( cur ) {
    			if ( cur === b ) {
    				return -1;
    			}

    			cur = cur.nextSibling;
    		}

    		return 1;
    	};
    }

    // Utility function for retreiving the text value of an array of DOM nodes
    Sizzle.getText = function( elems ) {
    	var ret = "", elem;

    	for ( var i = 0; elems[i]; i++ ) {
    		elem = elems[i];

    		// Get the text from text nodes and CDATA nodes
    		if ( elem.nodeType === 3 || elem.nodeType === 4 ) {
    			ret += elem.nodeValue;

    		// Traverse everything else, except comment nodes
    		} else if ( elem.nodeType !== 8 ) {
    			ret += Sizzle.getText( elem.childNodes );
    		}
    	}

    	return ret;
    };

    // Check to see if the browser returns elements by name when
    // querying by getElementById (and provide a workaround)
    (function(){
    	// We're going to inject a fake input element with a specified name
    	var form = document.createElement("div"),
    		id = "script" + (new Date()).getTime(),
    		root = document.documentElement;

    	form.innerHTML = "<a name='" + id + "'/>";

    	// Inject it into the root element, check its status, and remove it quickly
    	root.insertBefore( form, root.firstChild );

    	// The workaround has to do additional checks after a getElementById
    	// Which slows things down for other browsers (hence the branching)
    	if ( document.getElementById( id ) ) {
    		Expr.find.ID = function( match, context, isXML ) {
    			if ( typeof context.getElementById !== "undefined" && !isXML ) {
    				var m = context.getElementById(match[1]);

    				return m ?
    					m.id === match[1] || typeof m.getAttributeNode !== "undefined" && m.getAttributeNode("id").nodeValue === match[1] ?
    						[m] :
    						undefined :
    					[];
    			}
    		};

    		Expr.filter.ID = function( elem, match ) {
    			var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");

    			return elem.nodeType === 1 && node && node.nodeValue === match;
    		};
    	}

    	root.removeChild( form );

    	// release memory in IE
    	root = form = null;
    })();

    (function(){
    	// Check to see if the browser returns only elements
    	// when doing getElementsByTagName("*")

    	// Create a fake element
    	var div = document.createElement("div");
    	div.appendChild( document.createComment("") );

    	// Make sure no comments are found
    	if ( div.getElementsByTagName("*").length > 0 ) {
    		Expr.find.TAG = function( match, context ) {
    			var results = context.getElementsByTagName( match[1] );

    			// Filter out possible comments
    			if ( match[1] === "*" ) {
    				var tmp = [];

    				for ( var i = 0; results[i]; i++ ) {
    					if ( results[i].nodeType === 1 ) {
    						tmp.push( results[i] );
    					}
    				}

    				results = tmp;
    			}

    			return results;
    		};
    	}

    	// Check to see if an attribute returns normalized href attributes
    	div.innerHTML = "<a href='#'></a>";

    	if ( div.firstChild && typeof div.firstChild.getAttribute !== "undefined" &&
    			div.firstChild.getAttribute("href") !== "#" ) {

    		Expr.attrHandle.href = function( elem ) {
    			return elem.getAttribute( "href", 2 );
    		};
    	}

    	// release memory in IE
    	div = null;
    })();

    if ( document.querySelectorAll ) {
    	(function(){
    		var oldSizzle = Sizzle,
    			div = document.createElement("div"),
    			id = "__sizzle__";

    		div.innerHTML = "<p class='TEST'></p>";

    		// Safari can't handle uppercase or unicode characters when
    		// in quirks mode.
    		if ( div.querySelectorAll && div.querySelectorAll(".TEST").length === 0 ) {
    			return;
    		}

    		Sizzle = function( query, context, extra, seed ) {
    			context = context || document;

    			// Only use querySelectorAll on non-XML documents
    			// (ID selectors don't work in non-HTML documents)
    			if ( !seed && !Sizzle.isXML(context) ) {
    				// See if we find a selector to speed up
    				var match = /^(\w+$)|^\.([\w\-]+$)|^#([\w\-]+$)/.exec( query );

    				if ( match && (context.nodeType === 1 || context.nodeType === 9) ) {
    					// Speed-up: Sizzle("TAG")
    					if ( match[1] ) {
    						return makeArray( context.getElementsByTagName( query ), extra );

    					// Speed-up: Sizzle(".CLASS")
    					} else if ( match[2] && Expr.find.CLASS && context.getElementsByClassName ) {
    						return makeArray( context.getElementsByClassName( match[2] ), extra );
    					}
    				}

    				if ( context.nodeType === 9 ) {
    					// Speed-up: Sizzle("body")
    					// The body element only exists once, optimize finding it
    					if ( query === "body" && context.body ) {
    						return makeArray( [ context.body ], extra );

    					// Speed-up: Sizzle("#ID")
    					} else if ( match && match[3] ) {
    						var elem = context.getElementById( match[3] );

    						// Check parentNode to catch when Blackberry 4.6 returns
    						// nodes that are no longer in the document #6963
    						if ( elem && elem.parentNode ) {
    							// Handle the case where IE and Opera return items
    							// by name instead of ID
    							if ( elem.id === match[3] ) {
    								return makeArray( [ elem ], extra );
    							}

    						} else {
    							return makeArray( [], extra );
    						}
    					}

    					try {
    						return makeArray( context.querySelectorAll(query), extra );
    					} catch(qsaError) {}

    				// qSA works strangely on Element-rooted queries
    				// We can work around this by specifying an extra ID on the root
    				// and working up from there (Thanks to Andrew Dupont for the technique)
    				// IE 8 doesn't work on object elements
    				} else if ( context.nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
    					var oldContext = context,
    						old = context.getAttribute( "id" ),
    						nid = old || id,
    						hasParent = context.parentNode,
    						relativeHierarchySelector = /^\s*[+~]/.test( query );

    					if ( !old ) {
    						context.setAttribute( "id", nid );
    					} else {
    						nid = nid.replace( /'/g, "\\$&" );
    					}
    					if ( relativeHierarchySelector && hasParent ) {
    						context = context.parentNode;
    					}

    					try {
    						if ( !relativeHierarchySelector || hasParent ) {
    							return makeArray( context.querySelectorAll( "[id='" + nid + "'] " + query ), extra );
    						}

    					} catch(pseudoError) {
    					} finally {
    						if ( !old ) {
    							oldContext.removeAttribute( "id" );
    						}
    					}
    				}
    			}

    			return oldSizzle(query, context, extra, seed);
    		};

    		for ( var prop in oldSizzle ) {
    			Sizzle[ prop ] = oldSizzle[ prop ];
    		}

    		// release memory in IE
    		div = null;
    	})();
    }

    (function(){
    	var html = document.documentElement,
    		matches = html.matchesSelector || html.mozMatchesSelector || html.webkitMatchesSelector || html.msMatchesSelector;

    	if ( matches ) {
    		// Check to see if it's possible to do matchesSelector
    		// on a disconnected node (IE 9 fails this)
    		var disconnectedMatch = !matches.call( document.createElement( "div" ), "div" ),
    			pseudoWorks = false;

    		try {
    			// This should fail with an exception
    			// Gecko does not error, returns false instead
    			matches.call( document.documentElement, "[test!='']:sizzle" );

    		} catch( pseudoError ) {
    			pseudoWorks = true;
    		}

    		Sizzle.matchesSelector = function( node, expr ) {
    			// Make sure that attribute selectors are quoted
    			expr = expr.replace(/\=\s*([^'"\]]*)\s*\]/g, "='$1']");

    			if ( !Sizzle.isXML( node ) ) {
    				try { 
    					if ( pseudoWorks || !Expr.match.PSEUDO.test( expr ) && !/!=/.test( expr ) ) {
    						var ret = matches.call( node, expr );

    						// IE 9's matchesSelector returns false on disconnected nodes
    						if ( ret || !disconnectedMatch ||
    								// As well, disconnected nodes are said to be in a document
    								// fragment in IE 9, so check for that
    								node.document && node.document.nodeType !== 11 ) {
    							return ret;
    						}
    					}
    				} catch(e) {}
    			}

    			return Sizzle(expr, null, null, [node]).length > 0;
    		};
    	}
    })();

    (function(){
    	var div = document.createElement("div");

    	div.innerHTML = "<div class='test e'></div><div class='test'></div>";

    	// Opera can't find a second classname (in 9.6)
    	// Also, make sure that getElementsByClassName actually exists
    	if ( !div.getElementsByClassName || div.getElementsByClassName("e").length === 0 ) {
    		return;
    	}

    	// Safari caches class attributes, doesn't catch changes (in 3.2)
    	div.lastChild.className = "e";

    	if ( div.getElementsByClassName("e").length === 1 ) {
    		return;
    	}

    	Expr.order.splice(1, 0, "CLASS");
    	Expr.find.CLASS = function( match, context, isXML ) {
    		if ( typeof context.getElementsByClassName !== "undefined" && !isXML ) {
    			return context.getElementsByClassName(match[1]);
    		}
    	};

    	// release memory in IE
    	div = null;
    })();

    function dirNodeCheck( dir, cur, doneName, checkSet, nodeCheck, isXML ) {
    	for ( var i = 0, l = checkSet.length; i < l; i++ ) {
    		var elem = checkSet[i];

    		if ( elem ) {
    			var match = false;

    			elem = elem[dir];

    			while ( elem ) {
    				if ( elem.sizcache === doneName ) {
    					match = checkSet[elem.sizset];
    					break;
    				}

    				if ( elem.nodeType === 1 && !isXML ){
    					elem.sizcache = doneName;
    					elem.sizset = i;
    				}

    				if ( elem.nodeName.toLowerCase() === cur ) {
    					match = elem;
    					break;
    				}

    				elem = elem[dir];
    			}

    			checkSet[i] = match;
    		}
    	}
    }

    function dirCheck( dir, cur, doneName, checkSet, nodeCheck, isXML ) {
    	for ( var i = 0, l = checkSet.length; i < l; i++ ) {
    		var elem = checkSet[i];

    		if ( elem ) {
    			var match = false;

    			elem = elem[dir];

    			while ( elem ) {
    				if ( elem.sizcache === doneName ) {
    					match = checkSet[elem.sizset];
    					break;
    				}

    				if ( elem.nodeType === 1 ) {
    					if ( !isXML ) {
    						elem.sizcache = doneName;
    						elem.sizset = i;
    					}

    					if ( typeof cur !== "string" ) {
    						if ( elem === cur ) {
    							match = true;
    							break;
    						}

    					} else if ( Sizzle.filter( cur, [elem] ).length > 0 ) {
    						match = elem;
    						break;
    					}
    				}

    				elem = elem[dir];
    			}

    			checkSet[i] = match;
    		}
    	}
    }

    if ( document.documentElement.contains ) {
    	Sizzle.contains = function( a, b ) {
    		return a !== b && (a.contains ? a.contains(b) : true);
    	};

    } else if ( document.documentElement.compareDocumentPosition ) {
    	Sizzle.contains = function( a, b ) {
    		return !!(a.compareDocumentPosition(b) & 16);
    	};

    } else {
    	Sizzle.contains = function() {
    		return false;
    	};
    }

    Sizzle.isXML = function( elem ) {
    	// documentElement is verified for cases where it doesn't yet exist
    	// (such as loading iframes in IE - #4833) 
    	var documentElement = (elem ? elem.ownerDocument || elem : 0).documentElement;

    	return documentElement ? documentElement.nodeName !== "HTML" : false;
    };

    var posProcess = function( selector, context ) {
    	var match,
    		tmpSet = [],
    		later = "",
    		root = context.nodeType ? [context] : context;

    	// Position selectors must be done after the filter
    	// And so must :not(positional) so we move all PSEUDOs to the end
    	while ( (match = Expr.match.PSEUDO.exec( selector )) ) {
    		later += match[0];
    		selector = selector.replace( Expr.match.PSEUDO, "" );
    	}

    	selector = Expr.relative[selector] ? selector + "*" : selector;

    	for ( var i = 0, l = root.length; i < l; i++ ) {
    		Sizzle( selector, root[i], tmpSet );
    	}

    	return Sizzle.filter( later, tmpSet );
    };

    // EXPOSE
    jQuery.find = Sizzle;
    jQuery.expr = Sizzle.selectors;
    jQuery.expr[":"] = jQuery.expr.filters;
    jQuery.unique = Sizzle.uniqueSort;
    jQuery.text = Sizzle.getText;
    jQuery.isXMLDoc = Sizzle.isXML;
    jQuery.contains = Sizzle.contains;


    })();


    var runtil = /Until$/,
    	rparentsprev = /^(?:parents|prevUntil|prevAll)/,
    	// Note: This RegExp should be improved, or likely pulled from Sizzle
    	rmultiselector = /,/,
    	isSimple = /^.[^:#\[\.,]*$/,
    	slice = Array.prototype.slice,
    	POS = jQuery.expr.match.POS,
    	// methods guaranteed to produce a unique set when starting from a unique set
    	guaranteedUnique = {
    		children: true,
    		contents: true,
    		next: true,
    		prev: true
    	};

    jQuery.fn.extend({
    	find: function( selector ) {
    		var self = this,
    			i, l;

    		if ( typeof selector !== "string" ) {
    			return jQuery( selector ).filter(function() {
    				for ( i = 0, l = self.length; i < l; i++ ) {
    					if ( jQuery.contains( self[ i ], this ) ) {
    						return true;
    					}
    				}
    			});
    		}

    		var ret = this.pushStack( "", "find", selector ),
    			length, n, r;

    		for ( i = 0, l = this.length; i < l; i++ ) {
    			length = ret.length;
    			jQuery.find( selector, this[i], ret );

    			if ( i > 0 ) {
    				// Make sure that the results are unique
    				for ( n = length; n < ret.length; n++ ) {
    					for ( r = 0; r < length; r++ ) {
    						if ( ret[r] === ret[n] ) {
    							ret.splice(n--, 1);
    							break;
    						}
    					}
    				}
    			}
    		}

    		return ret;
    	},

    	has: function( target ) {
    		var targets = jQuery( target );
    		return this.filter(function() {
    			for ( var i = 0, l = targets.length; i < l; i++ ) {
    				if ( jQuery.contains( this, targets[i] ) ) {
    					return true;
    				}
    			}
    		});
    	},

    	not: function( selector ) {
    		return this.pushStack( winnow(this, selector, false), "not", selector);
    	},

    	filter: function( selector ) {
    		return this.pushStack( winnow(this, selector, true), "filter", selector );
    	},

    	is: function( selector ) {
    		return !!selector && ( typeof selector === "string" ?
    			jQuery.filter( selector, this ).length > 0 :
    			this.filter( selector ).length > 0 );
    	},

    	closest: function( selectors, context ) {
    		var ret = [], i, l, cur = this[0];

    		// Array
    		if ( jQuery.isArray( selectors ) ) {
    			var match, selector,
    				matches = {},
    				level = 1;

    			if ( cur && selectors.length ) {
    				for ( i = 0, l = selectors.length; i < l; i++ ) {
    					selector = selectors[i];

    					if ( !matches[ selector ] ) {
    						matches[ selector ] = POS.test( selector ) ?
    							jQuery( selector, context || this.context ) :
    							selector;
    					}
    				}

    				while ( cur && cur.ownerDocument && cur !== context ) {
    					for ( selector in matches ) {
    						match = matches[ selector ];

    						if ( match.jquery ? match.index( cur ) > -1 : jQuery( cur ).is( match ) ) {
    							ret.push({ selector: selector, elem: cur, level: level });
    						}
    					}

    					cur = cur.parentNode;
    					level++;
    				}
    			}

    			return ret;
    		}

    		// String
    		var pos = POS.test( selectors ) || typeof selectors !== "string" ?
    				jQuery( selectors, context || this.context ) :
    				0;

    		for ( i = 0, l = this.length; i < l; i++ ) {
    			cur = this[i];

    			while ( cur ) {
    				if ( pos ? pos.index(cur) > -1 : jQuery.find.matchesSelector(cur, selectors) ) {
    					ret.push( cur );
    					break;

    				} else {
    					cur = cur.parentNode;
    					if ( !cur || !cur.ownerDocument || cur === context || cur.nodeType === 11 ) {
    						break;
    					}
    				}
    			}
    		}

    		ret = ret.length > 1 ? jQuery.unique( ret ) : ret;

    		return this.pushStack( ret, "closest", selectors );
    	},

    	// Determine the position of an element within
    	// the matched set of elements
    	index: function( elem ) {
    		if ( !elem || typeof elem === "string" ) {
    			return jQuery.inArray( this[0],
    				// If it receives a string, the selector is used
    				// If it receives nothing, the siblings are used
    				elem ? jQuery( elem ) : this.parent().children() );
    		}
    		// Locate the position of the desired element
    		return jQuery.inArray(
    			// If it receives a jQuery object, the first element is used
    			elem.jquery ? elem[0] : elem, this );
    	},

    	add: function( selector, context ) {
    		var set = typeof selector === "string" ?
    				jQuery( selector, context ) :
    				jQuery.makeArray( selector && selector.nodeType ? [ selector ] : selector ),
    			all = jQuery.merge( this.get(), set );

    		return this.pushStack( isDisconnected( set[0] ) || isDisconnected( all[0] ) ?
    			all :
    			jQuery.unique( all ) );
    	},

    	andSelf: function() {
    		return this.add( this.prevObject );
    	}
    });

    // A painfully simple check to see if an element is disconnected
    // from a document (should be improved, where feasible).
    function isDisconnected( node ) {
    	return !node || !node.parentNode || node.parentNode.nodeType === 11;
    }

    jQuery.each({
    	parent: function( elem ) {
    		var parent = elem.parentNode;
    		return parent && parent.nodeType !== 11 ? parent : null;
    	},
    	parents: function( elem ) {
    		return jQuery.dir( elem, "parentNode" );
    	},
    	parentsUntil: function( elem, i, until ) {
    		return jQuery.dir( elem, "parentNode", until );
    	},
    	next: function( elem ) {
    		return jQuery.nth( elem, 2, "nextSibling" );
    	},
    	prev: function( elem ) {
    		return jQuery.nth( elem, 2, "previousSibling" );
    	},
    	nextAll: function( elem ) {
    		return jQuery.dir( elem, "nextSibling" );
    	},
    	prevAll: function( elem ) {
    		return jQuery.dir( elem, "previousSibling" );
    	},
    	nextUntil: function( elem, i, until ) {
    		return jQuery.dir( elem, "nextSibling", until );
    	},
    	prevUntil: function( elem, i, until ) {
    		return jQuery.dir( elem, "previousSibling", until );
    	},
    	siblings: function( elem ) {
    		return jQuery.sibling( elem.parentNode.firstChild, elem );
    	},
    	children: function( elem ) {
    		return jQuery.sibling( elem.firstChild );
    	},
    	contents: function( elem ) {
    		return jQuery.nodeName( elem, "iframe" ) ?
    			elem.contentDocument || elem.contentWindow.document :
    			jQuery.makeArray( elem.childNodes );
    	}
    }, function( name, fn ) {
    	jQuery.fn[ name ] = function( until, selector ) {
    		var ret = jQuery.map( this, fn, until ),
    			// The variable 'args' was introduced in
    			// https://github.com/jquery/jquery/commit/52a0238
    			// to work around a bug in Chrome 10 (Dev) and should be removed when the bug is fixed.
    			// http://code.google.com/p/v8/issues/detail?id=1050
    			args = slice.call(arguments);

    		if ( !runtil.test( name ) ) {
    			selector = until;
    		}

    		if ( selector && typeof selector === "string" ) {
    			ret = jQuery.filter( selector, ret );
    		}

    		ret = this.length > 1 && !guaranteedUnique[ name ] ? jQuery.unique( ret ) : ret;

    		if ( (this.length > 1 || rmultiselector.test( selector )) && rparentsprev.test( name ) ) {
    			ret = ret.reverse();
    		}

    		return this.pushStack( ret, name, args.join(",") );
    	};
    });

    jQuery.extend({
    	filter: function( expr, elems, not ) {
    		if ( not ) {
    			expr = ":not(" + expr + ")";
    		}

    		return elems.length === 1 ?
    			jQuery.find.matchesSelector(elems[0], expr) ? [ elems[0] ] : [] :
    			jQuery.find.matches(expr, elems);
    	},

    	dir: function( elem, dir, until ) {
    		var matched = [],
    			cur = elem[ dir ];

    		while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
    			if ( cur.nodeType === 1 ) {
    				matched.push( cur );
    			}
    			cur = cur[dir];
    		}
    		return matched;
    	},

    	nth: function( cur, result, dir, elem ) {
    		result = result || 1;
    		var num = 0;

    		for ( ; cur; cur = cur[dir] ) {
    			if ( cur.nodeType === 1 && ++num === result ) {
    				break;
    			}
    		}

    		return cur;
    	},

    	sibling: function( n, elem ) {
    		var r = [];

    		for ( ; n; n = n.nextSibling ) {
    			if ( n.nodeType === 1 && n !== elem ) {
    				r.push( n );
    			}
    		}

    		return r;
    	}
    });

    // Implement the identical functionality for filter and not
    function winnow( elements, qualifier, keep ) {

    	// Can't pass null or undefined to indexOf in Firefox 4
    	// Set to 0 to skip string check
    	qualifier = qualifier || 0;

    	if ( jQuery.isFunction( qualifier ) ) {
    		return jQuery.grep(elements, function( elem, i ) {
    			var retVal = !!qualifier.call( elem, i, elem );
    			return retVal === keep;
    		});

    	} else if ( qualifier.nodeType ) {
    		return jQuery.grep(elements, function( elem, i ) {
    			return (elem === qualifier) === keep;
    		});

    	} else if ( typeof qualifier === "string" ) {
    		var filtered = jQuery.grep(elements, function( elem ) {
    			return elem.nodeType === 1;
    		});

    		if ( isSimple.test( qualifier ) ) {
    			return jQuery.filter(qualifier, filtered, !keep);
    		} else {
    			qualifier = jQuery.filter( qualifier, filtered );
    		}
    	}

    	return jQuery.grep(elements, function( elem, i ) {
    		return (jQuery.inArray( elem, qualifier ) >= 0) === keep;
    	});
    }




    var rinlinejQuery = / jQuery\d+="(?:\d+|null)"/g,
    	rleadingWhitespace = /^\s+/,
    	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/ig,
    	rtagName = /<([\w:]+)/,
    	rtbody = /<tbody/i,
    	rhtml = /<|&#?\w+;/,
    	rnocache = /<(?:script|object|embed|option|style)/i,
    	// checked="checked" or checked
    	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
    	rscriptType = /\/(java|ecma)script/i,
    	rcleanScript = /^\s*<!(?:\[CDATA\[|\-\-)/,
    	wrapMap = {
    		option: [ 1, "<select multiple='multiple'>", "</select>" ],
    		legend: [ 1, "<fieldset>", "</fieldset>" ],
    		thead: [ 1, "<table>", "</table>" ],
    		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
    		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],
    		col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
    		area: [ 1, "<map>", "</map>" ],
    		_default: [ 0, "", "" ]
    	};

    wrapMap.optgroup = wrapMap.option;
    wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
    wrapMap.th = wrapMap.td;

    // IE can't serialize <link> and <script> tags normally
    if ( !jQuery.support.htmlSerialize ) {
    	wrapMap._default = [ 1, "div<div>", "</div>" ];
    }

    jQuery.fn.extend({
    	text: function( text ) {
    		if ( jQuery.isFunction(text) ) {
    			return this.each(function(i) {
    				var self = jQuery( this );

    				self.text( text.call(this, i, self.text()) );
    			});
    		}

    		if ( typeof text !== "object" && text !== undefined ) {
    			return this.empty().append( (this[0] && this[0].ownerDocument || document).createTextNode( text ) );
    		}

    		return jQuery.text( this );
    	},

    	wrapAll: function( html ) {
    		if ( jQuery.isFunction( html ) ) {
    			return this.each(function(i) {
    				jQuery(this).wrapAll( html.call(this, i) );
    			});
    		}

    		if ( this[0] ) {
    			// The elements to wrap the target around
    			var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

    			if ( this[0].parentNode ) {
    				wrap.insertBefore( this[0] );
    			}

    			wrap.map(function() {
    				var elem = this;

    				while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
    					elem = elem.firstChild;
    				}

    				return elem;
    			}).append( this );
    		}

    		return this;
    	},

    	wrapInner: function( html ) {
    		if ( jQuery.isFunction( html ) ) {
    			return this.each(function(i) {
    				jQuery(this).wrapInner( html.call(this, i) );
    			});
    		}

    		return this.each(function() {
    			var self = jQuery( this ),
    				contents = self.contents();

    			if ( contents.length ) {
    				contents.wrapAll( html );

    			} else {
    				self.append( html );
    			}
    		});
    	},

    	wrap: function( html ) {
    		return this.each(function() {
    			jQuery( this ).wrapAll( html );
    		});
    	},

    	unwrap: function() {
    		return this.parent().each(function() {
    			if ( !jQuery.nodeName( this, "body" ) ) {
    				jQuery( this ).replaceWith( this.childNodes );
    			}
    		}).end();
    	},

    	append: function() {
    		return this.domManip(arguments, true, function( elem ) {
    			if ( this.nodeType === 1 ) {
    				this.appendChild( elem );
    			}
    		});
    	},

    	prepend: function() {
    		return this.domManip(arguments, true, function( elem ) {
    			if ( this.nodeType === 1 ) {
    				this.insertBefore( elem, this.firstChild );
    			}
    		});
    	},

    	before: function() {
    		if ( this[0] && this[0].parentNode ) {
    			return this.domManip(arguments, false, function( elem ) {
    				this.parentNode.insertBefore( elem, this );
    			});
    		} else if ( arguments.length ) {
    			var set = jQuery(arguments[0]);
    			set.push.apply( set, this.toArray() );
    			return this.pushStack( set, "before", arguments );
    		}
    	},

    	after: function() {
    		if ( this[0] && this[0].parentNode ) {
    			return this.domManip(arguments, false, function( elem ) {
    				this.parentNode.insertBefore( elem, this.nextSibling );
    			});
    		} else if ( arguments.length ) {
    			var set = this.pushStack( this, "after", arguments );
    			set.push.apply( set, jQuery(arguments[0]).toArray() );
    			return set;
    		}
    	},

    	// keepData is for internal use only--do not document
    	remove: function( selector, keepData ) {
    		for ( var i = 0, elem; (elem = this[i]) != null; i++ ) {
    			if ( !selector || jQuery.filter( selector, [ elem ] ).length ) {
    				if ( !keepData && elem.nodeType === 1 ) {
    					jQuery.cleanData( elem.getElementsByTagName("*") );
    					jQuery.cleanData( [ elem ] );
    				}

    				if ( elem.parentNode ) {
    					elem.parentNode.removeChild( elem );
    				}
    			}
    		}

    		return this;
    	},

    	empty: function() {
    		for ( var i = 0, elem; (elem = this[i]) != null; i++ ) {
    			// Remove element nodes and prevent memory leaks
    			if ( elem.nodeType === 1 ) {
    				jQuery.cleanData( elem.getElementsByTagName("*") );
    			}

    			// Remove any remaining nodes
    			while ( elem.firstChild ) {
    				elem.removeChild( elem.firstChild );
    			}
    		}

    		return this;
    	},

    	clone: function( dataAndEvents, deepDataAndEvents ) {
    		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
    		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

    		return this.map( function () {
    			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
    		});
    	},

    	html: function( value ) {
    		if ( value === undefined ) {
    			return this[0] && this[0].nodeType === 1 ?
    				this[0].innerHTML.replace(rinlinejQuery, "") :
    				null;

    		// See if we can take a shortcut and just use innerHTML
    		} else if ( typeof value === "string" && !rnocache.test( value ) &&
    			(jQuery.support.leadingWhitespace || !rleadingWhitespace.test( value )) &&
    			!wrapMap[ (rtagName.exec( value ) || ["", ""])[1].toLowerCase() ] ) {

    			value = value.replace(rxhtmlTag, "<$1></$2>");

    			try {
    				for ( var i = 0, l = this.length; i < l; i++ ) {
    					// Remove element nodes and prevent memory leaks
    					if ( this[i].nodeType === 1 ) {
    						jQuery.cleanData( this[i].getElementsByTagName("*") );
    						this[i].innerHTML = value;
    					}
    				}

    			// If using innerHTML throws an exception, use the fallback method
    			} catch(e) {
    				this.empty().append( value );
    			}

    		} else if ( jQuery.isFunction( value ) ) {
    			this.each(function(i){
    				var self = jQuery( this );

    				self.html( value.call(this, i, self.html()) );
    			});

    		} else {
    			this.empty().append( value );
    		}

    		return this;
    	},

    	replaceWith: function( value ) {
    		if ( this[0] && this[0].parentNode ) {
    			// Make sure that the elements are removed from the DOM before they are inserted
    			// this can help fix replacing a parent with child elements
    			if ( jQuery.isFunction( value ) ) {
    				return this.each(function(i) {
    					var self = jQuery(this), old = self.html();
    					self.replaceWith( value.call( this, i, old ) );
    				});
    			}

    			if ( typeof value !== "string" ) {
    				value = jQuery( value ).detach();
    			}

    			return this.each(function() {
    				var next = this.nextSibling,
    					parent = this.parentNode;

    				jQuery( this ).remove();

    				if ( next ) {
    					jQuery(next).before( value );
    				} else {
    					jQuery(parent).append( value );
    				}
    			});
    		} else {
    			return this.length ?
    				this.pushStack( jQuery(jQuery.isFunction(value) ? value() : value), "replaceWith", value ) :
    				this;
    		}
    	},

    	detach: function( selector ) {
    		return this.remove( selector, true );
    	},

    	domManip: function( args, table, callback ) {
    		var results, first, fragment, parent,
    			value = args[0],
    			scripts = [];

    		// We can't cloneNode fragments that contain checked, in WebKit
    		if ( !jQuery.support.checkClone && arguments.length === 3 && typeof value === "string" && rchecked.test( value ) ) {
    			return this.each(function() {
    				jQuery(this).domManip( args, table, callback, true );
    			});
    		}

    		if ( jQuery.isFunction(value) ) {
    			return this.each(function(i) {
    				var self = jQuery(this);
    				args[0] = value.call(this, i, table ? self.html() : undefined);
    				self.domManip( args, table, callback );
    			});
    		}

    		if ( this[0] ) {
    			parent = value && value.parentNode;

    			// If we're in a fragment, just use that instead of building a new one
    			if ( jQuery.support.parentNode && parent && parent.nodeType === 11 && parent.childNodes.length === this.length ) {
    				results = { fragment: parent };

    			} else {
    				results = jQuery.buildFragment( args, this, scripts );
    			}

    			fragment = results.fragment;

    			if ( fragment.childNodes.length === 1 ) {
    				first = fragment = fragment.firstChild;
    			} else {
    				first = fragment.firstChild;
    			}

    			if ( first ) {
    				table = table && jQuery.nodeName( first, "tr" );

    				for ( var i = 0, l = this.length, lastIndex = l - 1; i < l; i++ ) {
    					callback.call(
    						table ?
    							root(this[i], first) :
    							this[i],
    						// Make sure that we do not leak memory by inadvertently discarding
    						// the original fragment (which might have attached data) instead of
    						// using it; in addition, use the original fragment object for the last
    						// item instead of first because it can end up being emptied incorrectly
    						// in certain situations (Bug #8070).
    						// Fragments from the fragment cache must always be cloned and never used
    						// in place.
    						results.cacheable || (l > 1 && i < lastIndex) ?
    							jQuery.clone( fragment, true, true ) :
    							fragment
    					);
    				}
    			}

    			if ( scripts.length ) {
    				jQuery.each( scripts, evalScript );
    			}
    		}

    		return this;
    	}
    });

    function root( elem, cur ) {
    	return jQuery.nodeName(elem, "table") ?
    		(elem.getElementsByTagName("tbody")[0] ||
    		elem.appendChild(elem.ownerDocument.createElement("tbody"))) :
    		elem;
    }

    function cloneCopyEvent( src, dest ) {

    	if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
    		return;
    	}

    	var internalKey = jQuery.expando,
    		oldData = jQuery.data( src ),
    		curData = jQuery.data( dest, oldData );

    	// Switch to use the internal data object, if it exists, for the next
    	// stage of data copying
    	if ( (oldData = oldData[ internalKey ]) ) {
    		var events = oldData.events;
    				curData = curData[ internalKey ] = jQuery.extend({}, oldData);

    		if ( events ) {
    			delete curData.handle;
    			curData.events = {};

    			for ( var type in events ) {
    				for ( var i = 0, l = events[ type ].length; i < l; i++ ) {
    					jQuery.event.add( dest, type + ( events[ type ][ i ].namespace ? "." : "" ) + events[ type ][ i ].namespace, events[ type ][ i ], events[ type ][ i ].data );
    				}
    			}
    		}
    	}
    }

    function cloneFixAttributes( src, dest ) {
    	var nodeName;

    	// We do not need to do anything for non-Elements
    	if ( dest.nodeType !== 1 ) {
    		return;
    	}

    	// clearAttributes removes the attributes, which we don't want,
    	// but also removes the attachEvent events, which we *do* want
    	if ( dest.clearAttributes ) {
    		dest.clearAttributes();
    	}

    	// mergeAttributes, in contrast, only merges back on the
    	// original attributes, not the events
    	if ( dest.mergeAttributes ) {
    		dest.mergeAttributes( src );
    	}

    	nodeName = dest.nodeName.toLowerCase();

    	// IE6-8 fail to clone children inside object elements that use
    	// the proprietary classid attribute value (rather than the type
    	// attribute) to identify the type of content to display
    	if ( nodeName === "object" ) {
    		dest.outerHTML = src.outerHTML;

    	} else if ( nodeName === "input" && (src.type === "checkbox" || src.type === "radio") ) {
    		// IE6-8 fails to persist the checked state of a cloned checkbox
    		// or radio button. Worse, IE6-7 fail to give the cloned element
    		// a checked appearance if the defaultChecked value isn't also set
    		if ( src.checked ) {
    			dest.defaultChecked = dest.checked = src.checked;
    		}

    		// IE6-7 get confused and end up setting the value of a cloned
    		// checkbox/radio button to an empty string instead of "on"
    		if ( dest.value !== src.value ) {
    			dest.value = src.value;
    		}

    	// IE6-8 fails to return the selected option to the default selected
    	// state when cloning options
    	} else if ( nodeName === "option" ) {
    		dest.selected = src.defaultSelected;

    	// IE6-8 fails to set the defaultValue to the correct value when
    	// cloning other types of input fields
    	} else if ( nodeName === "input" || nodeName === "textarea" ) {
    		dest.defaultValue = src.defaultValue;
    	}

    	// Event data gets referenced instead of copied if the expando
    	// gets copied too
    	dest.removeAttribute( jQuery.expando );
    }

    jQuery.buildFragment = function( args, nodes, scripts ) {
    	var fragment, cacheable, cacheresults, doc;

      // nodes may contain either an explicit document object,
      // a jQuery collection or context object.
      // If nodes[0] contains a valid object to assign to doc
      if ( nodes && nodes[0] ) {
        doc = nodes[0].ownerDocument || nodes[0];
      }

      // Ensure that an attr object doesn't incorrectly stand in as a document object
    	// Chrome and Firefox seem to allow this to occur and will throw exception
    	// Fixes #8950
    	if ( !doc.createDocumentFragment ) {
    		doc = document;
    	}

    	// Only cache "small" (1/2 KB) HTML strings that are associated with the main document
    	// Cloning options loses the selected state, so don't cache them
    	// IE 6 doesn't like it when you put <object> or <embed> elements in a fragment
    	// Also, WebKit does not clone 'checked' attributes on cloneNode, so don't cache
    	if ( args.length === 1 && typeof args[0] === "string" && args[0].length < 512 && doc === document &&
    		args[0].charAt(0) === "<" && !rnocache.test( args[0] ) && (jQuery.support.checkClone || !rchecked.test( args[0] )) ) {

    		cacheable = true;

    		cacheresults = jQuery.fragments[ args[0] ];
    		if ( cacheresults && cacheresults !== 1 ) {
    			fragment = cacheresults;
    		}
    	}

    	if ( !fragment ) {
    		fragment = doc.createDocumentFragment();
    		jQuery.clean( args, doc, fragment, scripts );
    	}

    	if ( cacheable ) {
    		jQuery.fragments[ args[0] ] = cacheresults ? fragment : 1;
    	}

    	return { fragment: fragment, cacheable: cacheable };
    };

    jQuery.fragments = {};

    jQuery.each({
    	appendTo: "append",
    	prependTo: "prepend",
    	insertBefore: "before",
    	insertAfter: "after",
    	replaceAll: "replaceWith"
    }, function( name, original ) {
    	jQuery.fn[ name ] = function( selector ) {
    		var ret = [],
    			insert = jQuery( selector ),
    			parent = this.length === 1 && this[0].parentNode;

    		if ( parent && parent.nodeType === 11 && parent.childNodes.length === 1 && insert.length === 1 ) {
    			insert[ original ]( this[0] );
    			return this;

    		} else {
    			for ( var i = 0, l = insert.length; i < l; i++ ) {
    				var elems = (i > 0 ? this.clone(true) : this).get();
    				jQuery( insert[i] )[ original ]( elems );
    				ret = ret.concat( elems );
    			}

    			return this.pushStack( ret, name, insert.selector );
    		}
    	};
    });

    function getAll( elem ) {
    	if ( "getElementsByTagName" in elem ) {
    		return elem.getElementsByTagName( "*" );

    	} else if ( "querySelectorAll" in elem ) {
    		return elem.querySelectorAll( "*" );

    	} else {
    		return [];
    	}
    }

    // Used in clean, fixes the defaultChecked property
    function fixDefaultChecked( elem ) {
    	if ( elem.type === "checkbox" || elem.type === "radio" ) {
    		elem.defaultChecked = elem.checked;
    	}
    }
    // Finds all inputs and passes them to fixDefaultChecked
    function findInputs( elem ) {
    	if ( jQuery.nodeName( elem, "input" ) ) {
    		fixDefaultChecked( elem );
    	} else if ( "getElementsByTagName" in elem ) {
    		jQuery.grep( elem.getElementsByTagName("input"), fixDefaultChecked );
    	}
    }

    jQuery.extend({
    	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
    		var clone = elem.cloneNode(true),
    				srcElements,
    				destElements,
    				i;

    		if ( (!jQuery.support.noCloneEvent || !jQuery.support.noCloneChecked) &&
    				(elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {
    			// IE copies events bound via attachEvent when using cloneNode.
    			// Calling detachEvent on the clone will also remove the events
    			// from the original. In order to get around this, we use some
    			// proprietary methods to clear the events. Thanks to MooTools
    			// guys for this hotness.

    			cloneFixAttributes( elem, clone );

    			// Using Sizzle here is crazy slow, so we use getElementsByTagName
    			// instead
    			srcElements = getAll( elem );
    			destElements = getAll( clone );

    			// Weird iteration because IE will replace the length property
    			// with an element if you are cloning the body and one of the
    			// elements on the page has a name or id of "length"
    			for ( i = 0; srcElements[i]; ++i ) {
    				cloneFixAttributes( srcElements[i], destElements[i] );
    			}
    		}

    		// Copy the events from the original to the clone
    		if ( dataAndEvents ) {
    			cloneCopyEvent( elem, clone );

    			if ( deepDataAndEvents ) {
    				srcElements = getAll( elem );
    				destElements = getAll( clone );

    				for ( i = 0; srcElements[i]; ++i ) {
    					cloneCopyEvent( srcElements[i], destElements[i] );
    				}
    			}
    		}

    		srcElements = destElements = null;

    		// Return the cloned set
    		return clone;
    	},

    	clean: function( elems, context, fragment, scripts ) {
    		var checkScriptType;

    		context = context || document;

    		// !context.createElement fails in IE with an error but returns typeof 'object'
    		if ( typeof context.createElement === "undefined" ) {
    			context = context.ownerDocument || context[0] && context[0].ownerDocument || document;
    		}

    		var ret = [], j;

    		for ( var i = 0, elem; (elem = elems[i]) != null; i++ ) {
    			if ( typeof elem === "number" ) {
    				elem += "";
    			}

    			if ( !elem ) {
    				continue;
    			}

    			// Convert html string into DOM nodes
    			if ( typeof elem === "string" ) {
    				if ( !rhtml.test( elem ) ) {
    					elem = context.createTextNode( elem );
    				} else {
    					// Fix "XHTML"-style tags in all browsers
    					elem = elem.replace(rxhtmlTag, "<$1></$2>");

    					// Trim whitespace, otherwise indexOf won't work as expected
    					var tag = (rtagName.exec( elem ) || ["", ""])[1].toLowerCase(),
    						wrap = wrapMap[ tag ] || wrapMap._default,
    						depth = wrap[0],
    						div = context.createElement("div");

    					// Go to html and back, then peel off extra wrappers
    					div.innerHTML = wrap[1] + elem + wrap[2];

    					// Move to the right depth
    					while ( depth-- ) {
    						div = div.lastChild;
    					}

    					// Remove IE's autoinserted <tbody> from table fragments
    					if ( !jQuery.support.tbody ) {

    						// String was a <table>, *may* have spurious <tbody>
    						var hasBody = rtbody.test(elem),
    							tbody = tag === "table" && !hasBody ?
    								div.firstChild && div.firstChild.childNodes :

    								// String was a bare <thead> or <tfoot>
    								wrap[1] === "<table>" && !hasBody ?
    									div.childNodes :
    									[];

    						for ( j = tbody.length - 1; j >= 0 ; --j ) {
    							if ( jQuery.nodeName( tbody[ j ], "tbody" ) && !tbody[ j ].childNodes.length ) {
    								tbody[ j ].parentNode.removeChild( tbody[ j ] );
    							}
    						}
    					}

    					// IE completely kills leading whitespace when innerHTML is used
    					if ( !jQuery.support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
    						div.insertBefore( context.createTextNode( rleadingWhitespace.exec(elem)[0] ), div.firstChild );
    					}

    					elem = div.childNodes;
    				}
    			}

    			// Resets defaultChecked for any radios and checkboxes
    			// about to be appended to the DOM in IE 6/7 (#8060)
    			var len;
    			if ( !jQuery.support.appendChecked ) {
    				if ( elem[0] && typeof (len = elem.length) === "number" ) {
    					for ( j = 0; j < len; j++ ) {
    						findInputs( elem[j] );
    					}
    				} else {
    					findInputs( elem );
    				}
    			}

    			if ( elem.nodeType ) {
    				ret.push( elem );
    			} else {
    				ret = jQuery.merge( ret, elem );
    			}
    		}

    		if ( fragment ) {
    			checkScriptType = function( elem ) {
    				return !elem.type || rscriptType.test( elem.type );
    			};
    			for ( i = 0; ret[i]; i++ ) {
    				if ( scripts && jQuery.nodeName( ret[i], "script" ) && (!ret[i].type || ret[i].type.toLowerCase() === "text/javascript") ) {
    					scripts.push( ret[i].parentNode ? ret[i].parentNode.removeChild( ret[i] ) : ret[i] );

    				} else {
    					if ( ret[i].nodeType === 1 ) {
    						var jsTags = jQuery.grep( ret[i].getElementsByTagName( "script" ), checkScriptType );

    						ret.splice.apply( ret, [i + 1, 0].concat( jsTags ) );
    					}
    					fragment.appendChild( ret[i] );
    				}
    			}
    		}

    		return ret;
    	},

    	cleanData: function( elems ) {
    		var data, id, cache = jQuery.cache, internalKey = jQuery.expando, special = jQuery.event.special,
    			deleteExpando = jQuery.support.deleteExpando;

    		for ( var i = 0, elem; (elem = elems[i]) != null; i++ ) {
    			if ( elem.nodeName && jQuery.noData[elem.nodeName.toLowerCase()] ) {
    				continue;
    			}

    			id = elem[ jQuery.expando ];

    			if ( id ) {
    				data = cache[ id ] && cache[ id ][ internalKey ];

    				if ( data && data.events ) {
    					for ( var type in data.events ) {
    						if ( special[ type ] ) {
    							jQuery.event.remove( elem, type );

    						// This is a shortcut to avoid jQuery.event.remove's overhead
    						} else {
    							jQuery.removeEvent( elem, type, data.handle );
    						}
    					}

    					// Null the DOM reference to avoid IE6/7/8 leak (#7054)
    					if ( data.handle ) {
    						data.handle.elem = null;
    					}
    				}

    				if ( deleteExpando ) {
    					delete elem[ jQuery.expando ];

    				} else if ( elem.removeAttribute ) {
    					elem.removeAttribute( jQuery.expando );
    				}

    				delete cache[ id ];
    			}
    		}
    	}
    });

    function evalScript( i, elem ) {
    	if ( elem.src ) {
    		jQuery.ajax({
    			url: elem.src,
    			async: false,
    			dataType: "script"
    		});
    	} else {
    		jQuery.globalEval( ( elem.text || elem.textContent || elem.innerHTML || "" ).replace( rcleanScript, "/*$0*/" ) );
    	}

    	if ( elem.parentNode ) {
    		elem.parentNode.removeChild( elem );
    	}
    }



    var ralpha = /alpha\([^)]*\)/i,
    	ropacity = /opacity=([^)]*)/,
    	// fixed for IE9, see #8346
    	rupper = /([A-Z]|^ms)/g,
    	rnumpx = /^-?\d+(?:px)?$/i,
    	rnum = /^-?\d/,
    	rrelNum = /^[+\-]=/,
    	rrelNumFilter = /[^+\-\.\de]+/g,

    	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
    	cssWidth = [ "Left", "Right" ],
    	cssHeight = [ "Top", "Bottom" ],
    	curCSS,

    	getComputedStyle,
    	currentStyle;

    jQuery.fn.css = function( name, value ) {
    	// Setting 'undefined' is a no-op
    	if ( arguments.length === 2 && value === undefined ) {
    		return this;
    	}

    	return jQuery.access( this, name, value, true, function( elem, name, value ) {
    		return value !== undefined ?
    			jQuery.style( elem, name, value ) :
    			jQuery.css( elem, name );
    	});
    };

    jQuery.extend({
    	// Add in style property hooks for overriding the default
    	// behavior of getting and setting a style property
    	cssHooks: {
    		opacity: {
    			get: function( elem, computed ) {
    				if ( computed ) {
    					// We should always get a number back from opacity
    					var ret = curCSS( elem, "opacity", "opacity" );
    					return ret === "" ? "1" : ret;

    				} else {
    					return elem.style.opacity;
    				}
    			}
    		}
    	},

    	// Exclude the following css properties to add px
    	cssNumber: {
    		"fillOpacity": true,
    		"fontWeight": true,
    		"lineHeight": true,
    		"opacity": true,
    		"orphans": true,
    		"widows": true,
    		"zIndex": true,
    		"zoom": true
    	},

    	// Add in properties whose names you wish to fix before
    	// setting or getting the value
    	cssProps: {
    		// normalize float css property
    		"float": jQuery.support.cssFloat ? "cssFloat" : "styleFloat"
    	},

    	// Get and set the style property on a DOM Node
    	style: function( elem, name, value, extra ) {
    		// Don't set styles on text and comment nodes
    		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
    			return;
    		}

    		// Make sure that we're working with the right name
    		var ret, type, origName = jQuery.camelCase( name ),
    			style = elem.style, hooks = jQuery.cssHooks[ origName ];

    		name = jQuery.cssProps[ origName ] || origName;

    		// Check if we're setting a value
    		if ( value !== undefined ) {
    			type = typeof value;

    			// Make sure that NaN and null values aren't set. See: #7116
    			if ( type === "number" && isNaN( value ) || value == null ) {
    				return;
    			}

    			// convert relative number strings (+= or -=) to relative numbers. #7345
    			if ( type === "string" && rrelNum.test( value ) ) {
    				value = +value.replace( rrelNumFilter, "" ) + parseFloat( jQuery.css( elem, name ) );
    				// Fixes bug #9237
    				type = "number";
    			}

    			// If a number was passed in, add 'px' to the (except for certain CSS properties)
    			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
    				value += "px";
    			}

    			// If a hook was provided, use that value, otherwise just set the specified value
    			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value )) !== undefined ) {
    				// Wrapped to prevent IE from throwing errors when 'invalid' values are provided
    				// Fixes bug #5509
    				try {
    					style[ name ] = value;
    				} catch(e) {}
    			}

    		} else {
    			// If a hook was provided get the non-computed value from there
    			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
    				return ret;
    			}

    			// Otherwise just get the value from the style object
    			return style[ name ];
    		}
    	},

    	css: function( elem, name, extra ) {
    		var ret, hooks;

    		// Make sure that we're working with the right name
    		name = jQuery.camelCase( name );
    		hooks = jQuery.cssHooks[ name ];
    		name = jQuery.cssProps[ name ] || name;

    		// cssFloat needs a special treatment
    		if ( name === "cssFloat" ) {
    			name = "float";
    		}

    		// If a hook was provided get the computed value from there
    		if ( hooks && "get" in hooks && (ret = hooks.get( elem, true, extra )) !== undefined ) {
    			return ret;

    		// Otherwise, if a way to get the computed value exists, use that
    		} else if ( curCSS ) {
    			return curCSS( elem, name );
    		}
    	},

    	// A method for quickly swapping in/out CSS properties to get correct calculations
    	swap: function( elem, options, callback ) {
    		var old = {};

    		// Remember the old values, and insert the new ones
    		for ( var name in options ) {
    			old[ name ] = elem.style[ name ];
    			elem.style[ name ] = options[ name ];
    		}

    		callback.call( elem );

    		// Revert the old values
    		for ( name in options ) {
    			elem.style[ name ] = old[ name ];
    		}
    	}
    });

    // DEPRECATED, Use jQuery.css() instead
    jQuery.curCSS = jQuery.css;

    jQuery.each(["height", "width"], function( i, name ) {
    	jQuery.cssHooks[ name ] = {
    		get: function( elem, computed, extra ) {
    			var val;

    			if ( computed ) {
    				if ( elem.offsetWidth !== 0 ) {
    					return getWH( elem, name, extra );
    				} else {
    					jQuery.swap( elem, cssShow, function() {
    						val = getWH( elem, name, extra );
    					});
    				}

    				return val;
    			}
    		},

    		set: function( elem, value ) {
    			if ( rnumpx.test( value ) ) {
    				// ignore negative width and height values #1599
    				value = parseFloat( value );

    				if ( value >= 0 ) {
    					return value + "px";
    				}

    			} else {
    				return value;
    			}
    		}
    	};
    });

    if ( !jQuery.support.opacity ) {
    	jQuery.cssHooks.opacity = {
    		get: function( elem, computed ) {
    			// IE uses filters for opacity
    			return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
    				( parseFloat( RegExp.$1 ) / 100 ) + "" :
    				computed ? "1" : "";
    		},

    		set: function( elem, value ) {
    			var style = elem.style,
    				currentStyle = elem.currentStyle;

    			// IE has trouble with opacity if it does not have layout
    			// Force it by setting the zoom level
    			style.zoom = 1;

    			// Set the alpha filter to set the opacity
    			var opacity = jQuery.isNaN( value ) ?
    				"" :
    				"alpha(opacity=" + value * 100 + ")",
    				filter = currentStyle && currentStyle.filter || style.filter || "";

    			style.filter = ralpha.test( filter ) ?
    				filter.replace( ralpha, opacity ) :
    				filter + " " + opacity;
    		}
    	};
    }

    jQuery(function() {
    	// This hook cannot be added until DOM ready because the support test
    	// for it is not run until after DOM ready
    	if ( !jQuery.support.reliableMarginRight ) {
    		jQuery.cssHooks.marginRight = {
    			get: function( elem, computed ) {
    				// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
    				// Work around by temporarily setting element display to inline-block
    				var ret;
    				jQuery.swap( elem, { "display": "inline-block" }, function() {
    					if ( computed ) {
    						ret = curCSS( elem, "margin-right", "marginRight" );
    					} else {
    						ret = elem.style.marginRight;
    					}
    				});
    				return ret;
    			}
    		};
    	}
    });

    if ( document.defaultView && document.defaultView.getComputedStyle ) {
    	getComputedStyle = function( elem, name ) {
    		var ret, defaultView, computedStyle;

    		name = name.replace( rupper, "-$1" ).toLowerCase();

    		if ( !(defaultView = elem.ownerDocument.defaultView) ) {
    			return undefined;
    		}

    		if ( (computedStyle = defaultView.getComputedStyle( elem, null )) ) {
    			ret = computedStyle.getPropertyValue( name );
    			if ( ret === "" && !jQuery.contains( elem.ownerDocument.documentElement, elem ) ) {
    				ret = jQuery.style( elem, name );
    			}
    		}

    		return ret;
    	};
    }

    if ( document.documentElement.currentStyle ) {
    	currentStyle = function( elem, name ) {
    		var left,
    			ret = elem.currentStyle && elem.currentStyle[ name ],
    			rsLeft = elem.runtimeStyle && elem.runtimeStyle[ name ],
    			style = elem.style;

    		// From the awesome hack by Dean Edwards
    		// http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

    		// If we're not dealing with a regular pixel number
    		// but a number that has a weird ending, we need to convert it to pixels
    		if ( !rnumpx.test( ret ) && rnum.test( ret ) ) {
    			// Remember the original values
    			left = style.left;

    			// Put in the new values to get a computed value out
    			if ( rsLeft ) {
    				elem.runtimeStyle.left = elem.currentStyle.left;
    			}
    			style.left = name === "fontSize" ? "1em" : (ret || 0);
    			ret = style.pixelLeft + "px";

    			// Revert the changed values
    			style.left = left;
    			if ( rsLeft ) {
    				elem.runtimeStyle.left = rsLeft;
    			}
    		}

    		return ret === "" ? "auto" : ret;
    	};
    }

    curCSS = getComputedStyle || currentStyle;

    function getWH( elem, name, extra ) {

    	// Start with offset property
    	var val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
    		which = name === "width" ? cssWidth : cssHeight;

    	if ( val > 0 ) {
    		if ( extra !== "border" ) {
    			jQuery.each( which, function() {
    				if ( !extra ) {
    					val -= parseFloat( jQuery.css( elem, "padding" + this ) ) || 0;
    				}
    				if ( extra === "margin" ) {
    					val += parseFloat( jQuery.css( elem, extra + this ) ) || 0;
    				} else {
    					val -= parseFloat( jQuery.css( elem, "border" + this + "Width" ) ) || 0;
    				}
    			});
    		}

    		return val + "px";
    	}

    	// Fall back to computed then uncomputed css if necessary
    	val = curCSS( elem, name, name );
    	if ( val < 0 || val == null ) {
    		val = elem.style[ name ] || 0;
    	}
    	// Normalize "", auto, and prepare for extra
    	val = parseFloat( val ) || 0;

    	// Add padding, border, margin
    	if ( extra ) {
    		jQuery.each( which, function() {
    			val += parseFloat( jQuery.css( elem, "padding" + this ) ) || 0;
    			if ( extra !== "padding" ) {
    				val += parseFloat( jQuery.css( elem, "border" + this + "Width" ) ) || 0;
    			}
    			if ( extra === "margin" ) {
    				val += parseFloat( jQuery.css( elem, extra + this ) ) || 0;
    			}
    		});
    	}

    	return val + "px";
    }

    if ( jQuery.expr && jQuery.expr.filters ) {
    	jQuery.expr.filters.hidden = function( elem ) {
    		var width = elem.offsetWidth,
    			height = elem.offsetHeight;

    		return (width === 0 && height === 0) || (!jQuery.support.reliableHiddenOffsets && (elem.style.display || jQuery.css( elem, "display" )) === "none");
    	};

    	jQuery.expr.filters.visible = function( elem ) {
    		return !jQuery.expr.filters.hidden( elem );
    	};
    }




    var r20 = /%20/g,
    	rbracket = /\[\]$/,
    	rCRLF = /\r?\n/g,
    	rhash = /#.*$/,
    	rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
    	rinput = /^(?:color|date|datetime|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i,
    	// #7653, #8125, #8152: local protocol detection
    	rlocalProtocol = /^(?:about|app|app\-storage|.+\-extension|file|widget):$/,
    	rnoContent = /^(?:GET|HEAD)$/,
    	rprotocol = /^\/\//,
    	rquery = /\?/,
    	rscript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    	rselectTextarea = /^(?:select|textarea)/i,
    	rspacesAjax = /\s+/,
    	rts = /([?&])_=[^&]*/,
    	rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/,

    	// Keep a copy of the old load method
    	_load = jQuery.fn.load,

    	/* Prefilters
    	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
    	 * 2) These are called:
    	 *    - BEFORE asking for a transport
    	 *    - AFTER param serialization (s.data is a string if s.processData is true)
    	 * 3) key is the dataType
    	 * 4) the catchall symbol "*" can be used
    	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
    	 */
    	prefilters = {},

    	/* Transports bindings
    	 * 1) key is the dataType
    	 * 2) the catchall symbol "*" can be used
    	 * 3) selection will start with transport dataType and THEN go to "*" if needed
    	 */
    	transports = {},

    	// Document location
    	ajaxLocation,

    	// Document location segments
    	ajaxLocParts;

    // #8138, IE may throw an exception when accessing
    // a field from window.location if document.domain has been set
    try {
    	ajaxLocation = location.href;
    } catch( e ) {
    	// Use the href attribute of an A element
    	// since IE will modify it given document.location
    	ajaxLocation = document.createElement( "a" );
    	ajaxLocation.href = "";
    	ajaxLocation = ajaxLocation.href;
    }

    // Segment location into parts
    ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

    // Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
    function addToPrefiltersOrTransports( structure ) {

    	// dataTypeExpression is optional and defaults to "*"
    	return function( dataTypeExpression, func ) {

    		if ( typeof dataTypeExpression !== "string" ) {
    			func = dataTypeExpression;
    			dataTypeExpression = "*";
    		}

    		if ( jQuery.isFunction( func ) ) {
    			var dataTypes = dataTypeExpression.toLowerCase().split( rspacesAjax ),
    				i = 0,
    				length = dataTypes.length,
    				dataType,
    				list,
    				placeBefore;

    			// For each dataType in the dataTypeExpression
    			for(; i < length; i++ ) {
    				dataType = dataTypes[ i ];
    				// We control if we're asked to add before
    				// any existing element
    				placeBefore = /^\+/.test( dataType );
    				if ( placeBefore ) {
    					dataType = dataType.substr( 1 ) || "*";
    				}
    				list = structure[ dataType ] = structure[ dataType ] || [];
    				// then we add to the structure accordingly
    				list[ placeBefore ? "unshift" : "push" ]( func );
    			}
    		}
    	};
    }

    // Base inspection function for prefilters and transports
    function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR,
    		dataType /* internal */, inspected /* internal */ ) {

    	dataType = dataType || options.dataTypes[ 0 ];
    	inspected = inspected || {};

    	inspected[ dataType ] = true;

    	var list = structure[ dataType ],
    		i = 0,
    		length = list ? list.length : 0,
    		executeOnly = ( structure === prefilters ),
    		selection;

    	for(; i < length && ( executeOnly || !selection ); i++ ) {
    		selection = list[ i ]( options, originalOptions, jqXHR );
    		// If we got redirected to another dataType
    		// we try there if executing only and not done already
    		if ( typeof selection === "string" ) {
    			if ( !executeOnly || inspected[ selection ] ) {
    				selection = undefined;
    			} else {
    				options.dataTypes.unshift( selection );
    				selection = inspectPrefiltersOrTransports(
    						structure, options, originalOptions, jqXHR, selection, inspected );
    			}
    		}
    	}
    	// If we're only executing or nothing was selected
    	// we try the catchall dataType if not done already
    	if ( ( executeOnly || !selection ) && !inspected[ "*" ] ) {
    		selection = inspectPrefiltersOrTransports(
    				structure, options, originalOptions, jqXHR, "*", inspected );
    	}
    	// unnecessary when only executing (prefilters)
    	// but it'll be ignored by the caller in that case
    	return selection;
    }

    jQuery.fn.extend({
    	load: function( url, params, callback ) {
    		if ( typeof url !== "string" && _load ) {
    			return _load.apply( this, arguments );

    		// Don't do a request if no elements are being requested
    		} else if ( !this.length ) {
    			return this;
    		}

    		var off = url.indexOf( " " );
    		if ( off >= 0 ) {
    			var selector = url.slice( off, url.length );
    			url = url.slice( 0, off );
    		}

    		// Default to a GET request
    		var type = "GET";

    		// If the second parameter was provided
    		if ( params ) {
    			// If it's a function
    			if ( jQuery.isFunction( params ) ) {
    				// We assume that it's the callback
    				callback = params;
    				params = undefined;

    			// Otherwise, build a param string
    			} else if ( typeof params === "object" ) {
    				params = jQuery.param( params, jQuery.ajaxSettings.traditional );
    				type = "POST";
    			}
    		}

    		var self = this;

    		// Request the remote document
    		jQuery.ajax({
    			url: url,
    			type: type,
    			dataType: "html",
    			data: params,
    			// Complete callback (responseText is used internally)
    			complete: function( jqXHR, status, responseText ) {
    				// Store the response as specified by the jqXHR object
    				responseText = jqXHR.responseText;
    				// If successful, inject the HTML into all the matched elements
    				if ( jqXHR.isResolved() ) {
    					// #4825: Get the actual response in case
    					// a dataFilter is present in ajaxSettings
    					jqXHR.done(function( r ) {
    						responseText = r;
    					});
    					// See if a selector was specified
    					self.html( selector ?
    						// Create a dummy div to hold the results
    						jQuery("<div>")
    							// inject the contents of the document in, removing the scripts
    							// to avoid any 'Permission Denied' errors in IE
    							.append(responseText.replace(rscript, ""))

    							// Locate the specified elements
    							.find(selector) :

    						// If not, just inject the full result
    						responseText );
    				}

    				if ( callback ) {
    					self.each( callback, [ responseText, status, jqXHR ] );
    				}
    			}
    		});

    		return this;
    	},

    	serialize: function() {
    		return jQuery.param( this.serializeArray() );
    	},

    	serializeArray: function() {
    		return this.map(function(){
    			return this.elements ? jQuery.makeArray( this.elements ) : this;
    		})
    		.filter(function(){
    			return this.name && !this.disabled &&
    				( this.checked || rselectTextarea.test( this.nodeName ) ||
    					rinput.test( this.type ) );
    		})
    		.map(function( i, elem ){
    			var val = jQuery( this ).val();

    			return val == null ?
    				null :
    				jQuery.isArray( val ) ?
    					jQuery.map( val, function( val, i ){
    						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
    					}) :
    					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
    		}).get();
    	}
    });

    // Attach a bunch of functions for handling common AJAX events
    jQuery.each( "ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split( " " ), function( i, o ){
    	jQuery.fn[ o ] = function( f ){
    		return this.bind( o, f );
    	};
    });

    jQuery.each( [ "get", "post" ], function( i, method ) {
    	jQuery[ method ] = function( url, data, callback, type ) {
    		// shift arguments if data argument was omitted
    		if ( jQuery.isFunction( data ) ) {
    			type = type || callback;
    			callback = data;
    			data = undefined;
    		}

    		return jQuery.ajax({
    			type: method,
    			url: url,
    			data: data,
    			success: callback,
    			dataType: type
    		});
    	};
    });

    jQuery.extend({

    	getScript: function( url, callback ) {
    		return jQuery.get( url, undefined, callback, "script" );
    	},

    	getJSON: function( url, data, callback ) {
    		return jQuery.get( url, data, callback, "json" );
    	},

    	// Creates a full fledged settings object into target
    	// with both ajaxSettings and settings fields.
    	// If target is omitted, writes into ajaxSettings.
    	ajaxSetup: function ( target, settings ) {
    		if ( !settings ) {
    			// Only one parameter, we extend ajaxSettings
    			settings = target;
    			target = jQuery.extend( true, jQuery.ajaxSettings, settings );
    		} else {
    			// target was provided, we extend into it
    			jQuery.extend( true, target, jQuery.ajaxSettings, settings );
    		}
    		// Flatten fields we don't want deep extended
    		for( var field in { context: 1, url: 1 } ) {
    			if ( field in settings ) {
    				target[ field ] = settings[ field ];
    			} else if( field in jQuery.ajaxSettings ) {
    				target[ field ] = jQuery.ajaxSettings[ field ];
    			}
    		}
    		return target;
    	},

    	ajaxSettings: {
    		url: ajaxLocation,
    		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
    		global: true,
    		type: "GET",
    		contentType: "application/x-www-form-urlencoded",
    		processData: true,
    		async: true,
    		/*
    		timeout: 0,
    		data: null,
    		dataType: null,
    		username: null,
    		password: null,
    		cache: null,
    		traditional: false,
    		headers: {},
    		*/

    		accepts: {
    			xml: "application/xml, text/xml",
    			html: "text/html",
    			text: "text/plain",
    			json: "application/json, text/javascript",
    			"*": "*/*"
    		},

    		contents: {
    			xml: /xml/,
    			html: /html/,
    			json: /json/
    		},

    		responseFields: {
    			xml: "responseXML",
    			text: "responseText"
    		},

    		// List of data converters
    		// 1) key format is "source_type destination_type" (a single space in-between)
    		// 2) the catchall symbol "*" can be used for source_type
    		converters: {

    			// Convert anything to text
    			"* text": window.String,

    			// Text to html (true = no transformation)
    			"text html": true,

    			// Evaluate text as a json expression
    			"text json": jQuery.parseJSON,

    			// Parse text as xml
    			"text xml": jQuery.parseXML
    		}
    	},

    	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
    	ajaxTransport: addToPrefiltersOrTransports( transports ),

    	// Main method
    	ajax: function( url, options ) {

    		// If url is an object, simulate pre-1.5 signature
    		if ( typeof url === "object" ) {
    			options = url;
    			url = undefined;
    		}

    		// Force options to be an object
    		options = options || {};

    		var // Create the final options object
    			s = jQuery.ajaxSetup( {}, options ),
    			// Callbacks context
    			callbackContext = s.context || s,
    			// Context for global events
    			// It's the callbackContext if one was provided in the options
    			// and if it's a DOM node or a jQuery collection
    			globalEventContext = callbackContext !== s &&
    				( callbackContext.nodeType || callbackContext instanceof jQuery ) ?
    						jQuery( callbackContext ) : jQuery.event,
    			// Deferreds
    			deferred = jQuery.Deferred(),
    			completeDeferred = jQuery._Deferred(),
    			// Status-dependent callbacks
    			statusCode = s.statusCode || {},
    			// ifModified key
    			ifModifiedKey,
    			// Headers (they are sent all at once)
    			requestHeaders = {},
    			requestHeadersNames = {},
    			// Response headers
    			responseHeadersString,
    			responseHeaders,
    			// transport
    			transport,
    			// timeout handle
    			timeoutTimer,
    			// Cross-domain detection vars
    			parts,
    			// The jqXHR state
    			state = 0,
    			// To know if global events are to be dispatched
    			fireGlobals,
    			// Loop variable
    			i,
    			// Fake xhr
    			jqXHR = {

    				readyState: 0,

    				// Caches the header
    				setRequestHeader: function( name, value ) {
    					if ( !state ) {
    						var lname = name.toLowerCase();
    						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
    						requestHeaders[ name ] = value;
    					}
    					return this;
    				},

    				// Raw string
    				getAllResponseHeaders: function() {
    					return state === 2 ? responseHeadersString : null;
    				},

    				// Builds headers hashtable if needed
    				getResponseHeader: function( key ) {
    					var match;
    					if ( state === 2 ) {
    						if ( !responseHeaders ) {
    							responseHeaders = {};
    							while( ( match = rheaders.exec( responseHeadersString ) ) ) {
    								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
    							}
    						}
    						match = responseHeaders[ key.toLowerCase() ];
    					}
    					return match === undefined ? null : match;
    				},

    				// Overrides response content-type header
    				overrideMimeType: function( type ) {
    					if ( !state ) {
    						s.mimeType = type;
    					}
    					return this;
    				},

    				// Cancel the request
    				abort: function( statusText ) {
    					statusText = statusText || "abort";
    					if ( transport ) {
    						transport.abort( statusText );
    					}
    					done( 0, statusText );
    					return this;
    				}
    			};

    		// Callback for when everything is done
    		// It is defined here because jslint complains if it is declared
    		// at the end of the function (which would be more logical and readable)
    		function done( status, statusText, responses, headers ) {

    			// Called once
    			if ( state === 2 ) {
    				return;
    			}

    			// State is "done" now
    			state = 2;

    			// Clear timeout if it exists
    			if ( timeoutTimer ) {
    				clearTimeout( timeoutTimer );
    			}

    			// Dereference transport for early garbage collection
    			// (no matter how long the jqXHR object will be used)
    			transport = undefined;

    			// Cache response headers
    			responseHeadersString = headers || "";

    			// Set readyState
    			jqXHR.readyState = status ? 4 : 0;

    			var isSuccess,
    				success,
    				error,
    				response = responses ? ajaxHandleResponses( s, jqXHR, responses ) : undefined,
    				lastModified,
    				etag;

    			// If successful, handle type chaining
    			if ( status >= 200 && status < 300 || status === 304 ) {

    				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
    				if ( s.ifModified ) {

    					if ( ( lastModified = jqXHR.getResponseHeader( "Last-Modified" ) ) ) {
    						jQuery.lastModified[ ifModifiedKey ] = lastModified;
    					}
    					if ( ( etag = jqXHR.getResponseHeader( "Etag" ) ) ) {
    						jQuery.etag[ ifModifiedKey ] = etag;
    					}
    				}

    				// If not modified
    				if ( status === 304 ) {

    					statusText = "notmodified";
    					isSuccess = true;

    				// If we have data
    				} else {

    					try {
    						success = ajaxConvert( s, response );
    						statusText = "success";
    						isSuccess = true;
    					} catch(e) {
    						// We have a parsererror
    						statusText = "parsererror";
    						error = e;
    					}
    				}
    			} else {
    				// We extract error from statusText
    				// then normalize statusText and status for non-aborts
    				error = statusText;
    				if( !statusText || status ) {
    					statusText = "error";
    					if ( status < 0 ) {
    						status = 0;
    					}
    				}
    			}

    			// Set data for the fake xhr object
    			jqXHR.status = status;
    			jqXHR.statusText = statusText;

    			// Success/Error
    			if ( isSuccess ) {
    				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
    			} else {
    				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
    			}

    			// Status-dependent callbacks
    			jqXHR.statusCode( statusCode );
    			statusCode = undefined;

    			if ( fireGlobals ) {
    				globalEventContext.trigger( "ajax" + ( isSuccess ? "Success" : "Error" ),
    						[ jqXHR, s, isSuccess ? success : error ] );
    			}

    			// Complete
    			completeDeferred.resolveWith( callbackContext, [ jqXHR, statusText ] );

    			if ( fireGlobals ) {
    				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s] );
    				// Handle the global AJAX counter
    				if ( !( --jQuery.active ) ) {
    					jQuery.event.trigger( "ajaxStop" );
    				}
    			}
    		}

    		// Attach deferreds
    		deferred.promise( jqXHR );
    		jqXHR.success = jqXHR.done;
    		jqXHR.error = jqXHR.fail;
    		jqXHR.complete = completeDeferred.done;

    		// Status-dependent callbacks
    		jqXHR.statusCode = function( map ) {
    			if ( map ) {
    				var tmp;
    				if ( state < 2 ) {
    					for( tmp in map ) {
    						statusCode[ tmp ] = [ statusCode[tmp], map[tmp] ];
    					}
    				} else {
    					tmp = map[ jqXHR.status ];
    					jqXHR.then( tmp, tmp );
    				}
    			}
    			return this;
    		};

    		// Remove hash character (#7531: and string promotion)
    		// Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
    		// We also use the url parameter if available
    		s.url = ( ( url || s.url ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

    		// Extract dataTypes list
    		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().split( rspacesAjax );

    		// Determine if a cross-domain request is in order
    		if ( s.crossDomain == null ) {
    			parts = rurl.exec( s.url.toLowerCase() );
    			s.crossDomain = !!( parts &&
    				( parts[ 1 ] != ajaxLocParts[ 1 ] || parts[ 2 ] != ajaxLocParts[ 2 ] ||
    					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? 80 : 443 ) ) !=
    						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? 80 : 443 ) ) )
    			);
    		}

    		// Convert data if not already a string
    		if ( s.data && s.processData && typeof s.data !== "string" ) {
    			s.data = jQuery.param( s.data, s.traditional );
    		}

    		// Apply prefilters
    		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

    		// If request was aborted inside a prefiler, stop there
    		if ( state === 2 ) {
    			return false;
    		}

    		// We can fire global events as of now if asked to
    		fireGlobals = s.global;

    		// Uppercase the type
    		s.type = s.type.toUpperCase();

    		// Determine if request has content
    		s.hasContent = !rnoContent.test( s.type );

    		// Watch for a new set of requests
    		if ( fireGlobals && jQuery.active++ === 0 ) {
    			jQuery.event.trigger( "ajaxStart" );
    		}

    		// More options handling for requests with no content
    		if ( !s.hasContent ) {

    			// If data is available, append data to url
    			if ( s.data ) {
    				s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.data;
    			}

    			// Get ifModifiedKey before adding the anti-cache parameter
    			ifModifiedKey = s.url;

    			// Add anti-cache in url if needed
    			if ( s.cache === false ) {

    				var ts = jQuery.now(),
    					// try replacing _= if it is there
    					ret = s.url.replace( rts, "$1_=" + ts );

    				// if nothing was replaced, add timestamp to the end
    				s.url = ret + ( (ret === s.url ) ? ( rquery.test( s.url ) ? "&" : "?" ) + "_=" + ts : "" );
    			}
    		}

    		// Set the correct header, if data is being sent
    		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
    			jqXHR.setRequestHeader( "Content-Type", s.contentType );
    		}

    		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
    		if ( s.ifModified ) {
    			ifModifiedKey = ifModifiedKey || s.url;
    			if ( jQuery.lastModified[ ifModifiedKey ] ) {
    				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ ifModifiedKey ] );
    			}
    			if ( jQuery.etag[ ifModifiedKey ] ) {
    				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ ifModifiedKey ] );
    			}
    		}

    		// Set the Accepts header for the server, depending on the dataType
    		jqXHR.setRequestHeader(
    			"Accept",
    			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
    				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", */*; q=0.01" : "" ) :
    				s.accepts[ "*" ]
    		);

    		// Check for headers option
    		for ( i in s.headers ) {
    			jqXHR.setRequestHeader( i, s.headers[ i ] );
    		}

    		// Allow custom headers/mimetypes and early abort
    		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
    				// Abort if not done already
    				jqXHR.abort();
    				return false;

    		}

    		// Install callbacks on deferreds
    		for ( i in { success: 1, error: 1, complete: 1 } ) {
    			jqXHR[ i ]( s[ i ] );
    		}

    		// Get transport
    		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

    		// If no transport, we auto-abort
    		if ( !transport ) {
    			done( -1, "No Transport" );
    		} else {
    			jqXHR.readyState = 1;
    			// Send global event
    			if ( fireGlobals ) {
    				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
    			}
    			// Timeout
    			if ( s.async && s.timeout > 0 ) {
    				timeoutTimer = setTimeout( function(){
    					jqXHR.abort( "timeout" );
    				}, s.timeout );
    			}

    			try {
    				state = 1;
    				transport.send( requestHeaders, done );
    			} catch (e) {
    				// Propagate exception as error if not done
    				if ( status < 2 ) {
    					done( -1, e );
    				// Simply rethrow otherwise
    				} else {
    					jQuery.error( e );
    				}
    			}
    		}

    		return jqXHR;
    	},

    	// Serialize an array of form elements or a set of
    	// key/values into a query string
    	param: function( a, traditional ) {
    		var s = [],
    			add = function( key, value ) {
    				// If value is a function, invoke it and return its value
    				value = jQuery.isFunction( value ) ? value() : value;
    				s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
    			};

    		// Set traditional to true for jQuery <= 1.3.2 behavior.
    		if ( traditional === undefined ) {
    			traditional = jQuery.ajaxSettings.traditional;
    		}

    		// If an array was passed in, assume that it is an array of form elements.
    		if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
    			// Serialize the form elements
    			jQuery.each( a, function() {
    				add( this.name, this.value );
    			});

    		} else {
    			// If traditional, encode the "old" way (the way 1.3.2 or older
    			// did it), otherwise encode params recursively.
    			for ( var prefix in a ) {
    				buildParams( prefix, a[ prefix ], traditional, add );
    			}
    		}

    		// Return the resulting serialization
    		return s.join( "&" ).replace( r20, "+" );
    	}
    });

    function buildParams( prefix, obj, traditional, add ) {
    	if ( jQuery.isArray( obj ) ) {
    		// Serialize array item.
    		jQuery.each( obj, function( i, v ) {
    			if ( traditional || rbracket.test( prefix ) ) {
    				// Treat each array item as a scalar.
    				add( prefix, v );

    			} else {
    				// If array item is non-scalar (array or object), encode its
    				// numeric index to resolve deserialization ambiguity issues.
    				// Note that rack (as of 1.0.0) can't currently deserialize
    				// nested arrays properly, and attempting to do so may cause
    				// a server error. Possible fixes are to modify rack's
    				// deserialization algorithm or to provide an option or flag
    				// to force array serialization to be shallow.
    				buildParams( prefix + "[" + ( typeof v === "object" || jQuery.isArray(v) ? i : "" ) + "]", v, traditional, add );
    			}
    		});

    	} else if ( !traditional && obj != null && typeof obj === "object" ) {
    		// Serialize object item.
    		for ( var name in obj ) {
    			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
    		}

    	} else {
    		// Serialize scalar item.
    		add( prefix, obj );
    	}
    }

    // This is still on the jQuery object... for now
    // Want to move this to jQuery.ajax some day
    jQuery.extend({

    	// Counter for holding the number of active queries
    	active: 0,

    	// Last-Modified header cache for next request
    	lastModified: {},
    	etag: {}

    });

    /* Handles responses to an ajax request:
     * - sets all responseXXX fields accordingly
     * - finds the right dataType (mediates between content-type and expected dataType)
     * - returns the corresponding response
     */
    function ajaxHandleResponses( s, jqXHR, responses ) {

    	var contents = s.contents,
    		dataTypes = s.dataTypes,
    		responseFields = s.responseFields,
    		ct,
    		type,
    		finalDataType,
    		firstDataType;

    	// Fill responseXXX fields
    	for( type in responseFields ) {
    		if ( type in responses ) {
    			jqXHR[ responseFields[type] ] = responses[ type ];
    		}
    	}

    	// Remove auto dataType and get content-type in the process
    	while( dataTypes[ 0 ] === "*" ) {
    		dataTypes.shift();
    		if ( ct === undefined ) {
    			ct = s.mimeType || jqXHR.getResponseHeader( "content-type" );
    		}
    	}

    	// Check if we're dealing with a known content-type
    	if ( ct ) {
    		for ( type in contents ) {
    			if ( contents[ type ] && contents[ type ].test( ct ) ) {
    				dataTypes.unshift( type );
    				break;
    			}
    		}
    	}

    	// Check to see if we have a response for the expected dataType
    	if ( dataTypes[ 0 ] in responses ) {
    		finalDataType = dataTypes[ 0 ];
    	} else {
    		// Try convertible dataTypes
    		for ( type in responses ) {
    			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
    				finalDataType = type;
    				break;
    			}
    			if ( !firstDataType ) {
    				firstDataType = type;
    			}
    		}
    		// Or just use first one
    		finalDataType = finalDataType || firstDataType;
    	}

    	// If we found a dataType
    	// We add the dataType to the list if needed
    	// and return the corresponding response
    	if ( finalDataType ) {
    		if ( finalDataType !== dataTypes[ 0 ] ) {
    			dataTypes.unshift( finalDataType );
    		}
    		return responses[ finalDataType ];
    	}
    }

    // Chain conversions given the request and the original response
    function ajaxConvert( s, response ) {

    	// Apply the dataFilter if provided
    	if ( s.dataFilter ) {
    		response = s.dataFilter( response, s.dataType );
    	}

    	var dataTypes = s.dataTypes,
    		converters = {},
    		i,
    		key,
    		length = dataTypes.length,
    		tmp,
    		// Current and previous dataTypes
    		current = dataTypes[ 0 ],
    		prev,
    		// Conversion expression
    		conversion,
    		// Conversion function
    		conv,
    		// Conversion functions (transitive conversion)
    		conv1,
    		conv2;

    	// For each dataType in the chain
    	for( i = 1; i < length; i++ ) {

    		// Create converters map
    		// with lowercased keys
    		if ( i === 1 ) {
    			for( key in s.converters ) {
    				if( typeof key === "string" ) {
    					converters[ key.toLowerCase() ] = s.converters[ key ];
    				}
    			}
    		}

    		// Get the dataTypes
    		prev = current;
    		current = dataTypes[ i ];

    		// If current is auto dataType, update it to prev
    		if( current === "*" ) {
    			current = prev;
    		// If no auto and dataTypes are actually different
    		} else if ( prev !== "*" && prev !== current ) {

    			// Get the converter
    			conversion = prev + " " + current;
    			conv = converters[ conversion ] || converters[ "* " + current ];

    			// If there is no direct converter, search transitively
    			if ( !conv ) {
    				conv2 = undefined;
    				for( conv1 in converters ) {
    					tmp = conv1.split( " " );
    					if ( tmp[ 0 ] === prev || tmp[ 0 ] === "*" ) {
    						conv2 = converters[ tmp[1] + " " + current ];
    						if ( conv2 ) {
    							conv1 = converters[ conv1 ];
    							if ( conv1 === true ) {
    								conv = conv2;
    							} else if ( conv2 === true ) {
    								conv = conv1;
    							}
    							break;
    						}
    					}
    				}
    			}
    			// If we found no converter, dispatch an error
    			if ( !( conv || conv2 ) ) {
    				jQuery.error( "No conversion from " + conversion.replace(" "," to ") );
    			}
    			// If found converter is not an equivalence
    			if ( conv !== true ) {
    				// Convert with 1 or 2 converters accordingly
    				response = conv ? conv( response ) : conv2( conv1(response) );
    			}
    		}
    	}
    	return response;
    }




    var jsc = jQuery.now(),
    	jsre = /(\=)\?(&|$)|\?\?/i;

    // Default jsonp settings
    jQuery.ajaxSetup({
    	jsonp: "callback",
    	jsonpCallback: function() {
    		return jQuery.expando + "_" + ( jsc++ );
    	}
    });

    // Detect, normalize options and install callbacks for jsonp requests
    jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

    	var inspectData = s.contentType === "application/x-www-form-urlencoded" &&
    		( typeof s.data === "string" );

    	if ( s.dataTypes[ 0 ] === "jsonp" ||
    		s.jsonp !== false && ( jsre.test( s.url ) ||
    				inspectData && jsre.test( s.data ) ) ) {

    		var responseContainer,
    			jsonpCallback = s.jsonpCallback =
    				jQuery.isFunction( s.jsonpCallback ) ? s.jsonpCallback() : s.jsonpCallback,
    			previous = window[ jsonpCallback ],
    			url = s.url,
    			data = s.data,
    			replace = "$1" + jsonpCallback + "$2";

    		if ( s.jsonp !== false ) {
    			url = url.replace( jsre, replace );
    			if ( s.url === url ) {
    				if ( inspectData ) {
    					data = data.replace( jsre, replace );
    				}
    				if ( s.data === data ) {
    					// Add callback manually
    					url += (/\?/.test( url ) ? "&" : "?") + s.jsonp + "=" + jsonpCallback;
    				}
    			}
    		}

    		s.url = url;
    		s.data = data;

    		// Install callback
    		window[ jsonpCallback ] = function( response ) {
    			responseContainer = [ response ];
    		};

    		// Clean-up function
    		jqXHR.always(function() {
    			// Set callback back to previous value
    			window[ jsonpCallback ] = previous;
    			// Call if it was a function and we have a response
    			if ( responseContainer && jQuery.isFunction( previous ) ) {
    				window[ jsonpCallback ]( responseContainer[ 0 ] );
    			}
    		});

    		// Use data converter to retrieve json after script execution
    		s.converters["script json"] = function() {
    			if ( !responseContainer ) {
    				jQuery.error( jsonpCallback + " was not called" );
    			}
    			return responseContainer[ 0 ];
    		};

    		// force json dataType
    		s.dataTypes[ 0 ] = "json";

    		// Delegate to script
    		return "script";
    	}
    });




    // Install script dataType
    jQuery.ajaxSetup({
    	accepts: {
    		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
    	},
    	contents: {
    		script: /javascript|ecmascript/
    	},
    	converters: {
    		"text script": function( text ) {
    			jQuery.globalEval( text );
    			return text;
    		}
    	}
    });

    // Handle cache's special case and global
    jQuery.ajaxPrefilter( "script", function( s ) {
    	if ( s.cache === undefined ) {
    		s.cache = false;
    	}
    	if ( s.crossDomain ) {
    		s.type = "GET";
    		s.global = false;
    	}
    });

    // Bind script tag hack transport
    jQuery.ajaxTransport( "script", function(s) {

    	// This transport only deals with cross domain requests
    	if ( s.crossDomain ) {

    		var script,
    			head = document.head || document.getElementsByTagName( "head" )[0] || document.documentElement;

    		return {

    			send: function( _, callback ) {

    				script = document.createElement( "script" );

    				script.async = "async";

    				if ( s.scriptCharset ) {
    					script.charset = s.scriptCharset;
    				}

    				script.src = s.url;

    				// Attach handlers for all browsers
    				script.onload = script.onreadystatechange = function( _, isAbort ) {

    					if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

    						// Handle memory leak in IE
    						script.onload = script.onreadystatechange = null;

    						// Remove the script
    						if ( head && script.parentNode ) {
    							head.removeChild( script );
    						}

    						// Dereference the script
    						script = undefined;

    						// Callback if not abort
    						if ( !isAbort ) {
    							callback( 200, "success" );
    						}
    					}
    				};
    				// Use insertBefore instead of appendChild  to circumvent an IE6 bug.
    				// This arises when a base node is used (#2709 and #4378).
    				head.insertBefore( script, head.firstChild );
    			},

    			abort: function() {
    				if ( script ) {
    					script.onload( 0, 1 );
    				}
    			}
    		};
    	}
    });




    var // #5280: Internet Explorer will keep connections alive if we don't abort on unload
    	xhrOnUnloadAbort = window.ActiveXObject ? function() {
    		// Abort all pending requests
    		for ( var key in xhrCallbacks ) {
    			xhrCallbacks[ key ]( 0, 1 );
    		}
    	} : false,
    	xhrId = 0,
    	xhrCallbacks;

    // Functions to create xhrs
    function createStandardXHR() {
    	try {
    		return new window.XMLHttpRequest();
    	} catch( e ) {}
    }

    function createActiveXHR() {
    	try {
    		return new window.ActiveXObject( "Microsoft.XMLHTTP" );
    	} catch( e ) {}
    }

    // Create the request object
    // (This is still attached to ajaxSettings for backward compatibility)
    jQuery.ajaxSettings.xhr = window.ActiveXObject ?
    	/* Microsoft failed to properly
    	 * implement the XMLHttpRequest in IE7 (can't request local files),
    	 * so we use the ActiveXObject when it is available
    	 * Additionally XMLHttpRequest can be disabled in IE7/IE8 so
    	 * we need a fallback.
    	 */
    	function() {
    		return !this.isLocal && createStandardXHR() || createActiveXHR();
    	} :
    	// For all other browsers, use the standard XMLHttpRequest object
    	createStandardXHR;

    // Determine support properties
    (function( xhr ) {
    	jQuery.extend( jQuery.support, {
    		ajax: !!xhr,
    		cors: !!xhr && ( "withCredentials" in xhr )
    	});
    })( jQuery.ajaxSettings.xhr() );

    // Create transport if the browser can provide an xhr
    if ( jQuery.support.ajax ) {

    	jQuery.ajaxTransport(function( s ) {
    		// Cross domain only allowed if supported through XMLHttpRequest
    		if ( !s.crossDomain || jQuery.support.cors ) {

    			var callback;

    			return {
    				send: function( headers, complete ) {

    					// Get a new xhr
    					var xhr = s.xhr(),
    						handle,
    						i;

    					// Open the socket
    					// Passing null username, generates a login popup on Opera (#2865)
    					if ( s.username ) {
    						xhr.open( s.type, s.url, s.async, s.username, s.password );
    					} else {
    						xhr.open( s.type, s.url, s.async );
    					}

    					// Apply custom fields if provided
    					if ( s.xhrFields ) {
    						for ( i in s.xhrFields ) {
    							xhr[ i ] = s.xhrFields[ i ];
    						}
    					}

    					// Override mime type if needed
    					if ( s.mimeType && xhr.overrideMimeType ) {
    						xhr.overrideMimeType( s.mimeType );
    					}

    					// X-Requested-With header
    					// For cross-domain requests, seeing as conditions for a preflight are
    					// akin to a jigsaw puzzle, we simply never set it to be sure.
    					// (it can always be set on a per-request basis or even using ajaxSetup)
    					// For same-domain requests, won't change header if already provided.
    					if ( !s.crossDomain && !headers["X-Requested-With"] ) {
    						headers[ "X-Requested-With" ] = "XMLHttpRequest";
    					}

    					// Need an extra try/catch for cross domain requests in Firefox 3
    					try {
    						for ( i in headers ) {
    							xhr.setRequestHeader( i, headers[ i ] );
    						}
    					} catch( _ ) {}

    					// Do send the request
    					// This may raise an exception which is actually
    					// handled in jQuery.ajax (so no try/catch here)
    					xhr.send( ( s.hasContent && s.data ) || null );

    					// Listener
    					callback = function( _, isAbort ) {

    						var status,
    							statusText,
    							responseHeaders,
    							responses,
    							xml;

    						// Firefox throws exceptions when accessing properties
    						// of an xhr when a network error occured
    						// http://helpful.knobs-dials.com/index.php/Component_returned_failure_code:_0x80040111_(NS_ERROR_NOT_AVAILABLE)
    						try {

    							// Was never called and is aborted or complete
    							if ( callback && ( isAbort || xhr.readyState === 4 ) ) {

    								// Only called once
    								callback = undefined;

    								// Do not keep as active anymore
    								if ( handle ) {
    									xhr.onreadystatechange = jQuery.noop;
    									if ( xhrOnUnloadAbort ) {
    										delete xhrCallbacks[ handle ];
    									}
    								}

    								// If it's an abort
    								if ( isAbort ) {
    									// Abort it manually if needed
    									if ( xhr.readyState !== 4 ) {
    										xhr.abort();
    									}
    								} else {
    									status = xhr.status;
    									responseHeaders = xhr.getAllResponseHeaders();
    									responses = {};
    									xml = xhr.responseXML;

    									// Construct response list
    									if ( xml && xml.documentElement /* #4958 */ ) {
    										responses.xml = xml;
    									}
    									responses.text = xhr.responseText;

    									// Firefox throws an exception when accessing
    									// statusText for faulty cross-domain requests
    									try {
    										statusText = xhr.statusText;
    									} catch( e ) {
    										// We normalize with Webkit giving an empty statusText
    										statusText = "";
    									}

    									// Filter status for non standard behaviors

    									// If the request is local and we have data: assume a success
    									// (success with no data won't get notified, that's the best we
    									// can do given current implementations)
    									if ( !status && s.isLocal && !s.crossDomain ) {
    										status = responses.text ? 200 : 404;
    									// IE - #1450: sometimes returns 1223 when it should be 204
    									} else if ( status === 1223 ) {
    										status = 204;
    									}
    								}
    							}
    						} catch( firefoxAccessException ) {
    							if ( !isAbort ) {
    								complete( -1, firefoxAccessException );
    							}
    						}

    						// Call complete if needed
    						if ( responses ) {
    							complete( status, statusText, responses, responseHeaders );
    						}
    					};

    					// if we're in sync mode or it's in cache
    					// and has been retrieved directly (IE6 & IE7)
    					// we need to manually fire the callback
    					if ( !s.async || xhr.readyState === 4 ) {
    						callback();
    					} else {
    						handle = ++xhrId;
    						if ( xhrOnUnloadAbort ) {
    							// Create the active xhrs callbacks list if needed
    							// and attach the unload handler
    							if ( !xhrCallbacks ) {
    								xhrCallbacks = {};
    								jQuery( window ).unload( xhrOnUnloadAbort );
    							}
    							// Add to list of active xhrs callbacks
    							xhrCallbacks[ handle ] = callback;
    						}
    						xhr.onreadystatechange = callback;
    					}
    				},

    				abort: function() {
    					if ( callback ) {
    						callback(0,1);
    					}
    				}
    			};
    		}
    	});
    }




    var elemdisplay = {},
    	iframe, iframeDoc,
    	rfxtypes = /^(?:toggle|show|hide)$/,
    	rfxnum = /^([+\-]=)?([\d+.\-]+)([a-z%]*)$/i,
    	timerId,
    	fxAttrs = [
    		// height animations
    		[ "height", "marginTop", "marginBottom", "paddingTop", "paddingBottom" ],
    		// width animations
    		[ "width", "marginLeft", "marginRight", "paddingLeft", "paddingRight" ],
    		// opacity animations
    		[ "opacity" ]
    	],
    	fxNow,
    	requestAnimationFrame = window.webkitRequestAnimationFrame ||
    		window.mozRequestAnimationFrame ||
    		window.oRequestAnimationFrame;

    jQuery.fn.extend({
    	show: function( speed, easing, callback ) {
    		var elem, display;

    		if ( speed || speed === 0 ) {
    			return this.animate( genFx("show", 3), speed, easing, callback);

    		} else {
    			for ( var i = 0, j = this.length; i < j; i++ ) {
    				elem = this[i];

    				if ( elem.style ) {
    					display = elem.style.display;

    					// Reset the inline display of this element to learn if it is
    					// being hidden by cascaded rules or not
    					if ( !jQuery._data(elem, "olddisplay") && display === "none" ) {
    						display = elem.style.display = "";
    					}

    					// Set elements which have been overridden with display: none
    					// in a stylesheet to whatever the default browser style is
    					// for such an element
    					if ( display === "" && jQuery.css( elem, "display" ) === "none" ) {
    						jQuery._data(elem, "olddisplay", defaultDisplay(elem.nodeName));
    					}
    				}
    			}

    			// Set the display of most of the elements in a second loop
    			// to avoid the constant reflow
    			for ( i = 0; i < j; i++ ) {
    				elem = this[i];

    				if ( elem.style ) {
    					display = elem.style.display;

    					if ( display === "" || display === "none" ) {
    						elem.style.display = jQuery._data(elem, "olddisplay") || "";
    					}
    				}
    			}

    			return this;
    		}
    	},

    	hide: function( speed, easing, callback ) {
    		if ( speed || speed === 0 ) {
    			return this.animate( genFx("hide", 3), speed, easing, callback);

    		} else {
    			for ( var i = 0, j = this.length; i < j; i++ ) {
    				if ( this[i].style ) {
    					var display = jQuery.css( this[i], "display" );

    					if ( display !== "none" && !jQuery._data( this[i], "olddisplay" ) ) {
    						jQuery._data( this[i], "olddisplay", display );
    					}
    				}
    			}

    			// Set the display of the elements in a second loop
    			// to avoid the constant reflow
    			for ( i = 0; i < j; i++ ) {
    				if ( this[i].style ) {
    					this[i].style.display = "none";
    				}
    			}

    			return this;
    		}
    	},

    	// Save the old toggle function
    	_toggle: jQuery.fn.toggle,

    	toggle: function( fn, fn2, callback ) {
    		var bool = typeof fn === "boolean";

    		if ( jQuery.isFunction(fn) && jQuery.isFunction(fn2) ) {
    			this._toggle.apply( this, arguments );

    		} else if ( fn == null || bool ) {
    			this.each(function() {
    				var state = bool ? fn : jQuery(this).is(":hidden");
    				jQuery(this)[ state ? "show" : "hide" ]();
    			});

    		} else {
    			this.animate(genFx("toggle", 3), fn, fn2, callback);
    		}

    		return this;
    	},

    	fadeTo: function( speed, to, easing, callback ) {
    		return this.filter(":hidden").css("opacity", 0).show().end()
    					.animate({opacity: to}, speed, easing, callback);
    	},

    	animate: function( prop, speed, easing, callback ) {
    		var optall = jQuery.speed(speed, easing, callback);

    		if ( jQuery.isEmptyObject( prop ) ) {
    			return this.each( optall.complete, [ false ] );
    		}

    		// Do not change referenced properties as per-property easing will be lost
    		prop = jQuery.extend( {}, prop );

    		return this[ optall.queue === false ? "each" : "queue" ](function() {
    			// XXX 'this' does not always have a nodeName when running the
    			// test suite

    			if ( optall.queue === false ) {
    				jQuery._mark( this );
    			}

    			var opt = jQuery.extend( {}, optall ),
    				isElement = this.nodeType === 1,
    				hidden = isElement && jQuery(this).is(":hidden"),
    				name, val, p,
    				display, e,
    				parts, start, end, unit;

    			// will store per property easing and be used to determine when an animation is complete
    			opt.animatedProperties = {};

    			for ( p in prop ) {

    				// property name normalization
    				name = jQuery.camelCase( p );
    				if ( p !== name ) {
    					prop[ name ] = prop[ p ];
    					delete prop[ p ];
    				}

    				val = prop[ name ];

    				// easing resolution: per property > opt.specialEasing > opt.easing > 'swing' (default)
    				if ( jQuery.isArray( val ) ) {
    					opt.animatedProperties[ name ] = val[ 1 ];
    					val = prop[ name ] = val[ 0 ];
    				} else {
    					opt.animatedProperties[ name ] = opt.specialEasing && opt.specialEasing[ name ] || opt.easing || 'swing';
    				}

    				if ( val === "hide" && hidden || val === "show" && !hidden ) {
    					return opt.complete.call( this );
    				}

    				if ( isElement && ( name === "height" || name === "width" ) ) {
    					// Make sure that nothing sneaks out
    					// Record all 3 overflow attributes because IE does not
    					// change the overflow attribute when overflowX and
    					// overflowY are set to the same value
    					opt.overflow = [ this.style.overflow, this.style.overflowX, this.style.overflowY ];

    					// Set display property to inline-block for height/width
    					// animations on inline elements that are having width/height
    					// animated
    					if ( jQuery.css( this, "display" ) === "inline" &&
    							jQuery.css( this, "float" ) === "none" ) {
    						if ( !jQuery.support.inlineBlockNeedsLayout ) {
    							this.style.display = "inline-block";

    						} else {
    							display = defaultDisplay( this.nodeName );

    							// inline-level elements accept inline-block;
    							// block-level elements need to be inline with layout
    							if ( display === "inline" ) {
    								this.style.display = "inline-block";

    							} else {
    								this.style.display = "inline";
    								this.style.zoom = 1;
    							}
    						}
    					}
    				}
    			}

    			if ( opt.overflow != null ) {
    				this.style.overflow = "hidden";
    			}

    			for ( p in prop ) {
    				e = new jQuery.fx( this, opt, p );
    				val = prop[ p ];

    				if ( rfxtypes.test(val) ) {
    					e[ val === "toggle" ? hidden ? "show" : "hide" : val ]();

    				} else {
    					parts = rfxnum.exec( val );
    					start = e.cur();

    					if ( parts ) {
    						end = parseFloat( parts[2] );
    						unit = parts[3] || ( jQuery.cssNumber[ p ] ? "" : "px" );

    						// We need to compute starting value
    						if ( unit !== "px" ) {
    							jQuery.style( this, p, (end || 1) + unit);
    							start = ((end || 1) / e.cur()) * start;
    							jQuery.style( this, p, start + unit);
    						}

    						// If a +=/-= token was provided, we're doing a relative animation
    						if ( parts[1] ) {
    							end = ( (parts[ 1 ] === "-=" ? -1 : 1) * end ) + start;
    						}

    						e.custom( start, end, unit );

    					} else {
    						e.custom( start, val, "" );
    					}
    				}
    			}

    			// For JS strict compliance
    			return true;
    		});
    	},

    	stop: function( clearQueue, gotoEnd ) {
    		if ( clearQueue ) {
    			this.queue([]);
    		}

    		this.each(function() {
    			var timers = jQuery.timers,
    				i = timers.length;
    			// clear marker counters if we know they won't be
    			if ( !gotoEnd ) {
    				jQuery._unmark( true, this );
    			}
    			while ( i-- ) {
    				if ( timers[i].elem === this ) {
    					if (gotoEnd) {
    						// force the next step to be the last
    						timers[i](true);
    					}

    					timers.splice(i, 1);
    				}
    			}
    		});

    		// start the next in the queue if the last step wasn't forced
    		if ( !gotoEnd ) {
    			this.dequeue();
    		}

    		return this;
    	}

    });

    // Animations created synchronously will run synchronously
    function createFxNow() {
    	setTimeout( clearFxNow, 0 );
    	return ( fxNow = jQuery.now() );
    }

    function clearFxNow() {
    	fxNow = undefined;
    }

    // Generate parameters to create a standard animation
    function genFx( type, num ) {
    	var obj = {};

    	jQuery.each( fxAttrs.concat.apply([], fxAttrs.slice(0,num)), function() {
    		obj[ this ] = type;
    	});

    	return obj;
    }

    // Generate shortcuts for custom animations
    jQuery.each({
    	slideDown: genFx("show", 1),
    	slideUp: genFx("hide", 1),
    	slideToggle: genFx("toggle", 1),
    	fadeIn: { opacity: "show" },
    	fadeOut: { opacity: "hide" },
    	fadeToggle: { opacity: "toggle" }
    }, function( name, props ) {
    	jQuery.fn[ name ] = function( speed, easing, callback ) {
    		return this.animate( props, speed, easing, callback );
    	};
    });

    jQuery.extend({
    	speed: function( speed, easing, fn ) {
    		var opt = speed && typeof speed === "object" ? jQuery.extend({}, speed) : {
    			complete: fn || !fn && easing ||
    				jQuery.isFunction( speed ) && speed,
    			duration: speed,
    			easing: fn && easing || easing && !jQuery.isFunction(easing) && easing
    		};

    		opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
    			opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[opt.duration] : jQuery.fx.speeds._default;

    		// Queueing
    		opt.old = opt.complete;
    		opt.complete = function( noUnmark ) {
    			if ( jQuery.isFunction( opt.old ) ) {
    				opt.old.call( this );
    			}

    			if ( opt.queue !== false ) {
    				jQuery.dequeue( this );
    			} else if ( noUnmark !== false ) {
    				jQuery._unmark( this );
    			}
    		};

    		return opt;
    	},

    	easing: {
    		linear: function( p, n, firstNum, diff ) {
    			return firstNum + diff * p;
    		},
    		swing: function( p, n, firstNum, diff ) {
    			return ((-Math.cos(p*Math.PI)/2) + 0.5) * diff + firstNum;
    		}
    	},

    	timers: [],

    	fx: function( elem, options, prop ) {
    		this.options = options;
    		this.elem = elem;
    		this.prop = prop;

    		options.orig = options.orig || {};
    	}

    });

    jQuery.fx.prototype = {
    	// Simple function for setting a style value
    	update: function() {
    		if ( this.options.step ) {
    			this.options.step.call( this.elem, this.now, this );
    		}

    		(jQuery.fx.step[this.prop] || jQuery.fx.step._default)( this );
    	},

    	// Get the current size
    	cur: function() {
    		if ( this.elem[this.prop] != null && (!this.elem.style || this.elem.style[this.prop] == null) ) {
    			return this.elem[ this.prop ];
    		}

    		var parsed,
    			r = jQuery.css( this.elem, this.prop );
    		// Empty strings, null, undefined and "auto" are converted to 0,
    		// complex values such as "rotate(1rad)" are returned as is,
    		// simple values such as "10px" are parsed to Float.
    		return isNaN( parsed = parseFloat( r ) ) ? !r || r === "auto" ? 0 : r : parsed;
    	},

    	// Start an animation from one number to another
    	custom: function( from, to, unit ) {
    		var self = this,
    			fx = jQuery.fx,
    			raf;

    		this.startTime = fxNow || createFxNow();
    		this.start = from;
    		this.end = to;
    		this.unit = unit || this.unit || ( jQuery.cssNumber[ this.prop ] ? "" : "px" );
    		this.now = this.start;
    		this.pos = this.state = 0;

    		function t( gotoEnd ) {
    			return self.step(gotoEnd);
    		}

    		t.elem = this.elem;

    		if ( t() && jQuery.timers.push(t) && !timerId ) {
    			// Use requestAnimationFrame instead of setInterval if available
    			if ( requestAnimationFrame ) {
    				timerId = true;
    				raf = function() {
    					// When timerId gets set to null at any point, this stops
    					if ( timerId ) {
    						requestAnimationFrame( raf );
    						fx.tick();
    					}
    				};
    				requestAnimationFrame( raf );
    			} else {
    				timerId = setInterval( fx.tick, fx.interval );
    			}
    		}
    	},

    	// Simple 'show' function
    	show: function() {
    		// Remember where we started, so that we can go back to it later
    		this.options.orig[this.prop] = jQuery.style( this.elem, this.prop );
    		this.options.show = true;

    		// Begin the animation
    		// Make sure that we start at a small width/height to avoid any
    		// flash of content
    		this.custom(this.prop === "width" || this.prop === "height" ? 1 : 0, this.cur());

    		// Start by showing the element
    		jQuery( this.elem ).show();
    	},

    	// Simple 'hide' function
    	hide: function() {
    		// Remember where we started, so that we can go back to it later
    		this.options.orig[this.prop] = jQuery.style( this.elem, this.prop );
    		this.options.hide = true;

    		// Begin the animation
    		this.custom(this.cur(), 0);
    	},

    	// Each step of an animation
    	step: function( gotoEnd ) {
    		var t = fxNow || createFxNow(),
    			done = true,
    			elem = this.elem,
    			options = this.options,
    			i, n;

    		if ( gotoEnd || t >= options.duration + this.startTime ) {
    			this.now = this.end;
    			this.pos = this.state = 1;
    			this.update();

    			options.animatedProperties[ this.prop ] = true;

    			for ( i in options.animatedProperties ) {
    				if ( options.animatedProperties[i] !== true ) {
    					done = false;
    				}
    			}

    			if ( done ) {
    				// Reset the overflow
    				if ( options.overflow != null && !jQuery.support.shrinkWrapBlocks ) {

    					jQuery.each( [ "", "X", "Y" ], function (index, value) {
    						elem.style[ "overflow" + value ] = options.overflow[index];
    					});
    				}

    				// Hide the element if the "hide" operation was done
    				if ( options.hide ) {
    					jQuery(elem).hide();
    				}

    				// Reset the properties, if the item has been hidden or shown
    				if ( options.hide || options.show ) {
    					for ( var p in options.animatedProperties ) {
    						jQuery.style( elem, p, options.orig[p] );
    					}
    				}

    				// Execute the complete function
    				options.complete.call( elem );
    			}

    			return false;

    		} else {
    			// classical easing cannot be used with an Infinity duration
    			if ( options.duration == Infinity ) {
    				this.now = t;
    			} else {
    				n = t - this.startTime;
    				this.state = n / options.duration;

    				// Perform the easing function, defaults to swing
    				this.pos = jQuery.easing[ options.animatedProperties[ this.prop ] ]( this.state, n, 0, 1, options.duration );
    				this.now = this.start + ((this.end - this.start) * this.pos);
    			}
    			// Perform the next step of the animation
    			this.update();
    		}

    		return true;
    	}
    };

    jQuery.extend( jQuery.fx, {
    	tick: function() {
    		for ( var timers = jQuery.timers, i = 0 ; i < timers.length ; ++i ) {
    			if ( !timers[i]() ) {
    				timers.splice(i--, 1);
    			}
    		}

    		if ( !timers.length ) {
    			jQuery.fx.stop();
    		}
    	},

    	interval: 13,

    	stop: function() {
    		clearInterval( timerId );
    		timerId = null;
    	},

    	speeds: {
    		slow: 600,
    		fast: 200,
    		// Default speed
    		_default: 400
    	},

    	step: {
    		opacity: function( fx ) {
    			jQuery.style( fx.elem, "opacity", fx.now );
    		},

    		_default: function( fx ) {
    			if ( fx.elem.style && fx.elem.style[ fx.prop ] != null ) {
    				fx.elem.style[ fx.prop ] = (fx.prop === "width" || fx.prop === "height" ? Math.max(0, fx.now) : fx.now) + fx.unit;
    			} else {
    				fx.elem[ fx.prop ] = fx.now;
    			}
    		}
    	}
    });

    if ( jQuery.expr && jQuery.expr.filters ) {
    	jQuery.expr.filters.animated = function( elem ) {
    		return jQuery.grep(jQuery.timers, function( fn ) {
    			return elem === fn.elem;
    		}).length;
    	};
    }

    // Try to restore the default display value of an element
    function defaultDisplay( nodeName ) {

    	if ( !elemdisplay[ nodeName ] ) {

    		var body = document.body,
    			elem = jQuery( "<" + nodeName + ">" ).appendTo( body ),
    			display = elem.css( "display" );

    		elem.remove();

    		// If the simple way fails,
    		// get element's real default display by attaching it to a temp iframe
    		if ( display === "none" || display === "" ) {
    			// No iframe to use yet, so create it
    			if ( !iframe ) {
    				iframe = document.createElement( "iframe" );
    				iframe.frameBorder = iframe.width = iframe.height = 0;
    			}

    			body.appendChild( iframe );

    			// Create a cacheable copy of the iframe document on first call.
    			// IE and Opera will allow us to reuse the iframeDoc without re-writing the fake HTML
    			// document to it; WebKit & Firefox won't allow reusing the iframe document.
    			if ( !iframeDoc || !iframe.createElement ) {
    				iframeDoc = ( iframe.contentWindow || iframe.contentDocument ).document;
    				iframeDoc.write( ( document.compatMode === "CSS1Compat" ? "<!doctype html>" : "" ) + "<html><body>" );
    				iframeDoc.close();
    			}

    			elem = iframeDoc.createElement( nodeName );

    			iframeDoc.body.appendChild( elem );

    			display = jQuery.css( elem, "display" );

    			body.removeChild( iframe );
    		}

    		// Store the correct default display
    		elemdisplay[ nodeName ] = display;
    	}

    	return elemdisplay[ nodeName ];
    }




    var rtable = /^t(?:able|d|h)$/i,
    	rroot = /^(?:body|html)$/i;

    if ( "getBoundingClientRect" in document.documentElement ) {
    	jQuery.fn.offset = function( options ) {
    		var elem = this[0], box;

    		if ( options ) {
    			return this.each(function( i ) {
    				jQuery.offset.setOffset( this, options, i );
    			});
    		}

    		if ( !elem || !elem.ownerDocument ) {
    			return null;
    		}

    		if ( elem === elem.ownerDocument.body ) {
    			return jQuery.offset.bodyOffset( elem );
    		}

    		try {
    			box = elem.getBoundingClientRect();
    		} catch(e) {}

    		var doc = elem.ownerDocument,
    			docElem = doc.documentElement;

    		// Make sure we're not dealing with a disconnected DOM node
    		if ( !box || !jQuery.contains( docElem, elem ) ) {
    			return box ? { top: box.top, left: box.left } : { top: 0, left: 0 };
    		}

    		var body = doc.body,
    			win = getWindow(doc),
    			clientTop  = docElem.clientTop  || body.clientTop  || 0,
    			clientLeft = docElem.clientLeft || body.clientLeft || 0,
    			scrollTop  = win.pageYOffset || jQuery.support.boxModel && docElem.scrollTop  || body.scrollTop,
    			scrollLeft = win.pageXOffset || jQuery.support.boxModel && docElem.scrollLeft || body.scrollLeft,
    			top  = box.top  + scrollTop  - clientTop,
    			left = box.left + scrollLeft - clientLeft;

    		return { top: top, left: left };
    	};

    } else {
    	jQuery.fn.offset = function( options ) {
    		var elem = this[0];

    		if ( options ) {
    			return this.each(function( i ) {
    				jQuery.offset.setOffset( this, options, i );
    			});
    		}

    		if ( !elem || !elem.ownerDocument ) {
    			return null;
    		}

    		if ( elem === elem.ownerDocument.body ) {
    			return jQuery.offset.bodyOffset( elem );
    		}

    		jQuery.offset.initialize();

    		var computedStyle,
    			offsetParent = elem.offsetParent,
    			prevOffsetParent = elem,
    			doc = elem.ownerDocument,
    			docElem = doc.documentElement,
    			body = doc.body,
    			defaultView = doc.defaultView,
    			prevComputedStyle = defaultView ? defaultView.getComputedStyle( elem, null ) : elem.currentStyle,
    			top = elem.offsetTop,
    			left = elem.offsetLeft;

    		while ( (elem = elem.parentNode) && elem !== body && elem !== docElem ) {
    			if ( jQuery.offset.supportsFixedPosition && prevComputedStyle.position === "fixed" ) {
    				break;
    			}

    			computedStyle = defaultView ? defaultView.getComputedStyle(elem, null) : elem.currentStyle;
    			top  -= elem.scrollTop;
    			left -= elem.scrollLeft;

    			if ( elem === offsetParent ) {
    				top  += elem.offsetTop;
    				left += elem.offsetLeft;

    				if ( jQuery.offset.doesNotAddBorder && !(jQuery.offset.doesAddBorderForTableAndCells && rtable.test(elem.nodeName)) ) {
    					top  += parseFloat( computedStyle.borderTopWidth  ) || 0;
    					left += parseFloat( computedStyle.borderLeftWidth ) || 0;
    				}

    				prevOffsetParent = offsetParent;
    				offsetParent = elem.offsetParent;
    			}

    			if ( jQuery.offset.subtractsBorderForOverflowNotVisible && computedStyle.overflow !== "visible" ) {
    				top  += parseFloat( computedStyle.borderTopWidth  ) || 0;
    				left += parseFloat( computedStyle.borderLeftWidth ) || 0;
    			}

    			prevComputedStyle = computedStyle;
    		}

    		if ( prevComputedStyle.position === "relative" || prevComputedStyle.position === "static" ) {
    			top  += body.offsetTop;
    			left += body.offsetLeft;
    		}

    		if ( jQuery.offset.supportsFixedPosition && prevComputedStyle.position === "fixed" ) {
    			top  += Math.max( docElem.scrollTop, body.scrollTop );
    			left += Math.max( docElem.scrollLeft, body.scrollLeft );
    		}

    		return { top: top, left: left };
    	};
    }

    jQuery.offset = {
    	initialize: function() {
    		var body = document.body, container = document.createElement("div"), innerDiv, checkDiv, table, td, bodyMarginTop = parseFloat( jQuery.css(body, "marginTop") ) || 0,
    			html = "<div style='position:absolute;top:0;left:0;margin:0;border:5px solid #000;padding:0;width:1px;height:1px;'><div></div></div><table style='position:absolute;top:0;left:0;margin:0;border:5px solid #000;padding:0;width:1px;height:1px;' cellpadding='0' cellspacing='0'><tr><td></td></tr></table>";

    		jQuery.extend( container.style, { position: "absolute", top: 0, left: 0, margin: 0, border: 0, width: "1px", height: "1px", visibility: "hidden" } );

    		container.innerHTML = html;
    		body.insertBefore( container, body.firstChild );
    		innerDiv = container.firstChild;
    		checkDiv = innerDiv.firstChild;
    		td = innerDiv.nextSibling.firstChild.firstChild;

    		this.doesNotAddBorder = (checkDiv.offsetTop !== 5);
    		this.doesAddBorderForTableAndCells = (td.offsetTop === 5);

    		checkDiv.style.position = "fixed";
    		checkDiv.style.top = "20px";

    		// safari subtracts parent border width here which is 5px
    		this.supportsFixedPosition = (checkDiv.offsetTop === 20 || checkDiv.offsetTop === 15);
    		checkDiv.style.position = checkDiv.style.top = "";

    		innerDiv.style.overflow = "hidden";
    		innerDiv.style.position = "relative";

    		this.subtractsBorderForOverflowNotVisible = (checkDiv.offsetTop === -5);

    		this.doesNotIncludeMarginInBodyOffset = (body.offsetTop !== bodyMarginTop);

    		body.removeChild( container );
    		jQuery.offset.initialize = jQuery.noop;
    	},

    	bodyOffset: function( body ) {
    		var top = body.offsetTop,
    			left = body.offsetLeft;

    		jQuery.offset.initialize();

    		if ( jQuery.offset.doesNotIncludeMarginInBodyOffset ) {
    			top  += parseFloat( jQuery.css(body, "marginTop") ) || 0;
    			left += parseFloat( jQuery.css(body, "marginLeft") ) || 0;
    		}

    		return { top: top, left: left };
    	},

    	setOffset: function( elem, options, i ) {
    		var position = jQuery.css( elem, "position" );

    		// set position first, in-case top/left are set even on static elem
    		if ( position === "static" ) {
    			elem.style.position = "relative";
    		}

    		var curElem = jQuery( elem ),
    			curOffset = curElem.offset(),
    			curCSSTop = jQuery.css( elem, "top" ),
    			curCSSLeft = jQuery.css( elem, "left" ),
    			calculatePosition = (position === "absolute" || position === "fixed") && jQuery.inArray("auto", [curCSSTop, curCSSLeft]) > -1,
    			props = {}, curPosition = {}, curTop, curLeft;

    		// need to be able to calculate position if either top or left is auto and position is either absolute or fixed
    		if ( calculatePosition ) {
    			curPosition = curElem.position();
    			curTop = curPosition.top;
    			curLeft = curPosition.left;
    		} else {
    			curTop = parseFloat( curCSSTop ) || 0;
    			curLeft = parseFloat( curCSSLeft ) || 0;
    		}

    		if ( jQuery.isFunction( options ) ) {
    			options = options.call( elem, i, curOffset );
    		}

    		if (options.top != null) {
    			props.top = (options.top - curOffset.top) + curTop;
    		}
    		if (options.left != null) {
    			props.left = (options.left - curOffset.left) + curLeft;
    		}

    		if ( "using" in options ) {
    			options.using.call( elem, props );
    		} else {
    			curElem.css( props );
    		}
    	}
    };


    jQuery.fn.extend({
    	position: function() {
    		if ( !this[0] ) {
    			return null;
    		}

    		var elem = this[0],

    		// Get *real* offsetParent
    		offsetParent = this.offsetParent(),

    		// Get correct offsets
    		offset       = this.offset(),
    		parentOffset = rroot.test(offsetParent[0].nodeName) ? { top: 0, left: 0 } : offsetParent.offset();

    		// Subtract element margins
    		// note: when an element has margin: auto the offsetLeft and marginLeft
    		// are the same in Safari causing offset.left to incorrectly be 0
    		offset.top  -= parseFloat( jQuery.css(elem, "marginTop") ) || 0;
    		offset.left -= parseFloat( jQuery.css(elem, "marginLeft") ) || 0;

    		// Add offsetParent borders
    		parentOffset.top  += parseFloat( jQuery.css(offsetParent[0], "borderTopWidth") ) || 0;
    		parentOffset.left += parseFloat( jQuery.css(offsetParent[0], "borderLeftWidth") ) || 0;

    		// Subtract the two offsets
    		return {
    			top:  offset.top  - parentOffset.top,
    			left: offset.left - parentOffset.left
    		};
    	},

    	offsetParent: function() {
    		return this.map(function() {
    			var offsetParent = this.offsetParent || document.body;
    			while ( offsetParent && (!rroot.test(offsetParent.nodeName) && jQuery.css(offsetParent, "position") === "static") ) {
    				offsetParent = offsetParent.offsetParent;
    			}
    			return offsetParent;
    		});
    	}
    });


    // Create scrollLeft and scrollTop methods
    jQuery.each( ["Left", "Top"], function( i, name ) {
    	var method = "scroll" + name;

    	jQuery.fn[ method ] = function( val ) {
    		var elem, win;

    		if ( val === undefined ) {
    			elem = this[ 0 ];

    			if ( !elem ) {
    				return null;
    			}

    			win = getWindow( elem );

    			// Return the scroll offset
    			return win ? ("pageXOffset" in win) ? win[ i ? "pageYOffset" : "pageXOffset" ] :
    				jQuery.support.boxModel && win.document.documentElement[ method ] ||
    					win.document.body[ method ] :
    				elem[ method ];
    		}

    		// Set the scroll offset
    		return this.each(function() {
    			win = getWindow( this );

    			if ( win ) {
    				win.scrollTo(
    					!i ? val : jQuery( win ).scrollLeft(),
    					 i ? val : jQuery( win ).scrollTop()
    				);

    			} else {
    				this[ method ] = val;
    			}
    		});
    	};
    });

    function getWindow( elem ) {
    	return jQuery.isWindow( elem ) ?
    		elem :
    		elem.nodeType === 9 ?
    			elem.defaultView || elem.parentWindow :
    			false;
    }




    // Create width, height, innerHeight, innerWidth, outerHeight and outerWidth methods
    jQuery.each([ "Height", "Width" ], function( i, name ) {

    	var type = name.toLowerCase();

    	// innerHeight and innerWidth
    	jQuery.fn[ "inner" + name ] = function() {
    		var elem = this[0];
    		return elem && elem.style ?
    			parseFloat( jQuery.css( elem, type, "padding" ) ) :
    			null;
    	};

    	// outerHeight and outerWidth
    	jQuery.fn[ "outer" + name ] = function( margin ) {
    		var elem = this[0];
    		return elem && elem.style ?
    			parseFloat( jQuery.css( elem, type, margin ? "margin" : "border" ) ) :
    			null;
    	};

    	jQuery.fn[ type ] = function( size ) {
    		// Get window width or height
    		var elem = this[0];
    		if ( !elem ) {
    			return size == null ? null : this;
    		}

    		if ( jQuery.isFunction( size ) ) {
    			return this.each(function( i ) {
    				var self = jQuery( this );
    				self[ type ]( size.call( this, i, self[ type ]() ) );
    			});
    		}

    		if ( jQuery.isWindow( elem ) ) {
    			// Everyone else use document.documentElement or document.body depending on Quirks vs Standards mode
    			// 3rd condition allows Nokia support, as it supports the docElem prop but not CSS1Compat
    			var docElemProp = elem.document.documentElement[ "client" + name ];
    			return elem.document.compatMode === "CSS1Compat" && docElemProp ||
    				elem.document.body[ "client" + name ] || docElemProp;

    		// Get document width or height
    		} else if ( elem.nodeType === 9 ) {
    			// Either scroll[Width/Height] or offset[Width/Height], whichever is greater
    			return Math.max(
    				elem.documentElement["client" + name],
    				elem.body["scroll" + name], elem.documentElement["scroll" + name],
    				elem.body["offset" + name], elem.documentElement["offset" + name]
    			);

    		// Get or set width or height on the element
    		} else if ( size === undefined ) {
    			var orig = jQuery.css( elem, type ),
    				ret = parseFloat( orig );

    			return jQuery.isNaN( ret ) ? orig : ret;

    		// Set the width or height on the element (default to pixels if value is unitless)
    		} else {
    			return this.css( type, typeof size === "string" ? size : size + "px" );
    		}
    	};

    });
    return jQuery;
  };
  
  if (module == null) { module = {}; };
  module.exports = create(window);
}();
});

require.define("/node_modules/backbone-browserify/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"lib/backbone-browserify.js","browserify":{"dependencies":{"underscore":">=1.1.2"},"main":"lib/backbone-browserify.js"}}
});

require.define("/node_modules/backbone-browserify/lib/backbone-browserify.js", function (require, module, exports, __dirname, __filename) {
//     Backbone.js 0.5.3
//     (c) 2010 Jeremy Ashkenas, DocumentCloud Inc.
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://documentcloud.github.com/backbone

-function(){
  function create(){

    // Initial Setup
    // -------------
    
    // Save a reference to the global object.
    var root = this;
    
    // Save the previous value of the `Backbone` variable.
    var previousBackbone = root.Backbone;
    
    // The top-level namespace. All public Backbone classes and modules will
    // be attached to this. Exported for both CommonJS and the browser.
    var Backbone;
    if (typeof exports !== 'undefined') {
      Backbone = exports;
    } else {
      Backbone = root.Backbone = {};
    }
    
    // Current version of the library. Keep in sync with `package.json`.
    Backbone.VERSION = '0.5.3';
    
    // Require Underscore, if we're on the server, and it's not already present.
    var _ = root._;
    if (!_ && (typeof require !== 'undefined')) _ = require('underscore')._;
    
    // For Backbone's purposes, jQuery or Zepto owns the `$` variable.
    var $ = root.jQuery || root.Zepto;
    
    // Runs Backbone.js in *noConflict* mode, returning the `Backbone` variable
    // to its previous owner. Returns a reference to this Backbone object.
    Backbone.noConflict = function() {
      root.Backbone = previousBackbone;
      return this;
    };
    
    // Turn on `emulateHTTP` to support legacy HTTP servers. Setting this option will
    // fake `"PUT"` and `"DELETE"` requests via the `_method` parameter and set a
    // `X-Http-Method-Override` header.
    Backbone.emulateHTTP = false;
    
    // Turn on `emulateJSON` to support legacy servers that can't deal with direct
    // `application/json` requests ... will encode the body as
    // `application/x-www-form-urlencoded` instead and will send the model in a
    // form param named `model`.
    Backbone.emulateJSON = false;
    
    // Backbone.Events
    // -----------------
    
    // A module that can be mixed in to *any object* in order to provide it with
    // custom events. You may `bind` or `unbind` a callback function to an event;
    // `trigger`-ing an event fires all callbacks in succession.
    //
    //     var object = {};
    //     _.extend(object, Backbone.Events);
    //     object.bind('expand', function(){ alert('expanded'); });
    //     object.trigger('expand');
    //
    Backbone.Events = {
    
      // Bind an event, specified by a string name, `ev`, to a `callback` function.
      // Passing `"all"` will bind the callback to all events fired.
      bind : function(ev, callback, context) {
        var calls = this._callbacks || (this._callbacks = {});
        var list  = calls[ev] || (calls[ev] = []);
        list.push([callback, context]);
        return this;
      },
    
      // Remove one or many callbacks. If `callback` is null, removes all
      // callbacks for the event. If `ev` is null, removes all bound callbacks
      // for all events.
      unbind : function(ev, callback) {
        var calls;
        if (!ev) {
          this._callbacks = {};
        } else if (calls = this._callbacks) {
          if (!callback) {
            calls[ev] = [];
          } else {
            var list = calls[ev];
            if (!list) return this;
            for (var i = 0, l = list.length; i < l; i++) {
              if (list[i] && callback === list[i][0]) {
                list[i] = null;
                break;
              }
            }
          }
        }
        return this;
      },
    
      // Trigger an event, firing all bound callbacks. Callbacks are passed the
      // same arguments as `trigger` is, apart from the event name.
      // Listening for `"all"` passes the true event name as the first argument.
      trigger : function(eventName) {
        var list, calls, ev, callback, args;
        var both = 2;
        if (!(calls = this._callbacks)) return this;
        while (both--) {
          ev = both ? eventName : 'all';
          if (list = calls[ev]) {
            for (var i = 0, l = list.length; i < l; i++) {
              if (!(callback = list[i])) {
                list.splice(i, 1); i--; l--;
              } else {
                args = both ? Array.prototype.slice.call(arguments, 1) : arguments;
                callback[0].apply(callback[1] || this, args);
              }
            }
          }
        }
        return this;
      }
    
    };
    
    // Backbone.Model
    // --------------
    
    // Create a new model, with defined attributes. A client id (`cid`)
    // is automatically generated and assigned for you.
    Backbone.Model = function(attributes, options) {
      var defaults;
      attributes || (attributes = {});
      if (defaults = this.defaults) {
        if (_.isFunction(defaults)) defaults = defaults.call(this);
        attributes = _.extend({}, defaults, attributes);
      }
      this.attributes = {};
      this._escapedAttributes = {};
      this.cid = _.uniqueId('c');
      this.set(attributes, {silent : true});
      this._changed = false;
      this._previousAttributes = _.clone(this.attributes);
      if (options && options.collection) this.collection = options.collection;
      this.initialize(attributes, options);
    };
    
    // Attach all inheritable methods to the Model prototype.
    _.extend(Backbone.Model.prototype, Backbone.Events, {
    
      // A snapshot of the model's previous attributes, taken immediately
      // after the last `"change"` event was fired.
      _previousAttributes : null,
    
      // Has the item been changed since the last `"change"` event?
      _changed : false,
    
      // The default name for the JSON `id` attribute is `"id"`. MongoDB and
      // CouchDB users may want to set this to `"_id"`.
      idAttribute : 'id',
    
      // Initialize is an empty function by default. Override it with your own
      // initialization logic.
      initialize : function(){},
    
      // Return a copy of the model's `attributes` object.
      toJSON : function() {
        return _.clone(this.attributes);
      },
    
      // Get the value of an attribute.
      get : function(attr) {
        return this.attributes[attr];
      },
    
      // Get the HTML-escaped value of an attribute.
      escape : function(attr) {
        var html;
        if (html = this._escapedAttributes[attr]) return html;
        var val = this.attributes[attr];
        return this._escapedAttributes[attr] = escapeHTML(val == null ? '' : '' + val);
      },
    
      // Returns `true` if the attribute contains a value that is not null
      // or undefined.
      has : function(attr) {
        return this.attributes[attr] != null;
      },
    
      // Set a hash of model attributes on the object, firing `"change"` unless you
      // choose to silence it.
      set : function(attrs, options) {
    
        // Extract attributes and options.
        options || (options = {});
        if (!attrs) return this;
        if (attrs.attributes) attrs = attrs.attributes;
        var now = this.attributes, escaped = this._escapedAttributes;
    
        // Run validation.
        if (!options.silent && this.validate && !this._performValidation(attrs, options)) return false;
    
        // Check for changes of `id`.
        if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];
    
        // We're about to start triggering change events.
        var alreadyChanging = this._changing;
        this._changing = true;
    
        // Update attributes.
        for (var attr in attrs) {
          var val = attrs[attr];
          if (!_.isEqual(now[attr], val)) {
            now[attr] = val;
            delete escaped[attr];
            this._changed = true;
            if (!options.silent) this.trigger('change:' + attr, this, val, options);
          }
        }
    
        // Fire the `"change"` event, if the model has been changed.
        if (!alreadyChanging && !options.silent && this._changed) this.change(options);
        this._changing = false;
        return this;
      },
    
      // Remove an attribute from the model, firing `"change"` unless you choose
      // to silence it. `unset` is a noop if the attribute doesn't exist.
      unset : function(attr, options) {
        if (!(attr in this.attributes)) return this;
        options || (options = {});
        var value = this.attributes[attr];
    
        // Run validation.
        var validObj = {};
        validObj[attr] = void 0;
        if (!options.silent && this.validate && !this._performValidation(validObj, options)) return false;
    
        // Remove the attribute.
        delete this.attributes[attr];
        delete this._escapedAttributes[attr];
        if (attr == this.idAttribute) delete this.id;
        this._changed = true;
        if (!options.silent) {
          this.trigger('change:' + attr, this, void 0, options);
          this.change(options);
        }
        return this;
      },
    
      // Clear all attributes on the model, firing `"change"` unless you choose
      // to silence it.
      clear : function(options) {
        options || (options = {});
        var attr;
        var old = this.attributes;
    
        // Run validation.
        var validObj = {};
        for (attr in old) validObj[attr] = void 0;
        if (!options.silent && this.validate && !this._performValidation(validObj, options)) return false;
    
        this.attributes = {};
        this._escapedAttributes = {};
        this._changed = true;
        if (!options.silent) {
          for (attr in old) {
            this.trigger('change:' + attr, this, void 0, options);
          }
          this.change(options);
        }
        return this;
      },
    
      // Fetch the model from the server. If the server's representation of the
      // model differs from its current attributes, they will be overriden,
      // triggering a `"change"` event.
      fetch : function(options) {
        options || (options = {});
        var model = this;
        var success = options.success;
        options.success = function(resp, status, xhr) {
          if (!model.set(model.parse(resp, xhr), options)) return false;
          if (success) success(model, resp);
        };
        options.error = wrapError(options.error, model, options);
        return (this.sync || Backbone.sync).call(this, 'read', this, options);
      },
    
      // Set a hash of model attributes, and sync the model to the server.
      // If the server returns an attributes hash that differs, the model's
      // state will be `set` again.
      save : function(attrs, options) {
        options || (options = {});
        if (attrs && !this.set(attrs, options)) return false;
        var model = this;
        var success = options.success;
        options.success = function(resp, status, xhr) {
          if (!model.set(model.parse(resp, xhr), options)) return false;
          if (success) success(model, resp, xhr);
        };
        options.error = wrapError(options.error, model, options);
        var method = this.isNew() ? 'create' : 'update';
        return (this.sync || Backbone.sync).call(this, method, this, options);
      },
    
      // Destroy this model on the server if it was already persisted. Upon success, the model is removed
      // from its collection, if it has one.
      destroy : function(options) {
        options || (options = {});
        if (this.isNew()) return this.trigger('destroy', this, this.collection, options);
        var model = this;
        var success = options.success;
        options.success = function(resp) {
          model.trigger('destroy', model, model.collection, options);
          if (success) success(model, resp);
        };
        options.error = wrapError(options.error, model, options);
        return (this.sync || Backbone.sync).call(this, 'delete', this, options);
      },
    
      // Default URL for the model's representation on the server -- if you're
      // using Backbone's restful methods, override this to change the endpoint
      // that will be called.
      url : function() {
        var base = getUrl(this.collection) || this.urlRoot || urlError();
        if (this.isNew()) return base;
        return base + (base.charAt(base.length - 1) == '/' ? '' : '/') + encodeURIComponent(this.id);
      },
    
      // **parse** converts a response into the hash of attributes to be `set` on
      // the model. The default implementation is just to pass the response along.
      parse : function(resp, xhr) {
        return resp;
      },
    
      // Create a new model with identical attributes to this one.
      clone : function() {
        return new this.constructor(this);
      },
    
      // A model is new if it has never been saved to the server, and lacks an id.
      isNew : function() {
        return this.id == null;
      },
    
      // Call this method to manually fire a `change` event for this model.
      // Calling this will cause all objects observing the model to update.
      change : function(options) {
        this.trigger('change', this, options);
        this._previousAttributes = _.clone(this.attributes);
        this._changed = false;
      },
    
      // Determine if the model has changed since the last `"change"` event.
      // If you specify an attribute name, determine if that attribute has changed.
      hasChanged : function(attr) {
        if (attr) return this._previousAttributes[attr] != this.attributes[attr];
        return this._changed;
      },
    
      // Return an object containing all the attributes that have changed, or false
      // if there are no changed attributes. Useful for determining what parts of a
      // view need to be updated and/or what attributes need to be persisted to
      // the server.
      changedAttributes : function(now) {
        now || (now = this.attributes);
        var old = this._previousAttributes;
        var changed = false;
        for (var attr in now) {
          if (!_.isEqual(old[attr], now[attr])) {
            changed = changed || {};
            changed[attr] = now[attr];
          }
        }
        return changed;
      },
    
      // Get the previous value of an attribute, recorded at the time the last
      // `"change"` event was fired.
      previous : function(attr) {
        if (!attr || !this._previousAttributes) return null;
        return this._previousAttributes[attr];
      },
    
      // Get all of the attributes of the model at the time of the previous
      // `"change"` event.
      previousAttributes : function() {
        return _.clone(this._previousAttributes);
      },
    
      // Run validation against a set of incoming attributes, returning `true`
      // if all is well. If a specific `error` callback has been passed,
      // call that instead of firing the general `"error"` event.
      _performValidation : function(attrs, options) {
        var error = this.validate(attrs);
        if (error) {
          if (options.error) {
            options.error(this, error, options);
          } else {
            this.trigger('error', this, error, options);
          }
          return false;
        }
        return true;
      }
    
    });
    
    // Backbone.Collection
    // -------------------
    
    // Provides a standard collection class for our sets of models, ordered
    // or unordered. If a `comparator` is specified, the Collection will maintain
    // its models in sort order, as they're added and removed.
    Backbone.Collection = function(models, options) {
      options || (options = {});
      if (options.comparator) this.comparator = options.comparator;
      _.bindAll(this, '_onModelEvent', '_removeReference');
      this._reset();
      if (models) this.reset(models, {silent: true});
      this.initialize.apply(this, arguments);
    };
    
    // Define the Collection's inheritable methods.
    _.extend(Backbone.Collection.prototype, Backbone.Events, {
    
      // The default model for a collection is just a **Backbone.Model**.
      // This should be overridden in most cases.
      model : Backbone.Model,
    
      // Initialize is an empty function by default. Override it with your own
      // initialization logic.
      initialize : function(){},
    
      // The JSON representation of a Collection is an array of the
      // models' attributes.
      toJSON : function() {
        return this.map(function(model){ return model.toJSON(); });
      },
    
      // Add a model, or list of models to the set. Pass **silent** to avoid
      // firing the `added` event for every new model.
      add : function(models, options) {
        if (_.isArray(models)) {
          for (var i = 0, l = models.length; i < l; i++) {
            this._add(models[i], options);
          }
        } else {
          this._add(models, options);
        }
        return this;
      },
    
      // Remove a model, or a list of models from the set. Pass silent to avoid
      // firing the `removed` event for every model removed.
      remove : function(models, options) {
        if (_.isArray(models)) {
          for (var i = 0, l = models.length; i < l; i++) {
            this._remove(models[i], options);
          }
        } else {
          this._remove(models, options);
        }
        return this;
      },
    
      // Get a model from the set by id.
      get : function(id) {
        if (id == null) return null;
        return this._byId[id.id != null ? id.id : id];
      },
    
      // Get a model from the set by client id.
      getByCid : function(cid) {
        return cid && this._byCid[cid.cid || cid];
      },
    
      // Get the model at the given index.
      at: function(index) {
        return this.models[index];
      },
    
      // Force the collection to re-sort itself. You don't need to call this under normal
      // circumstances, as the set will maintain sort order as each item is added.
      sort : function(options) {
        options || (options = {});
        if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
        this.models = this.sortBy(this.comparator);
        if (!options.silent) this.trigger('reset', this, options);
        return this;
      },
    
      // Pluck an attribute from each model in the collection.
      pluck : function(attr) {
        return _.map(this.models, function(model){ return model.get(attr); });
      },
    
      // When you have more items than you want to add or remove individually,
      // you can reset the entire set with a new list of models, without firing
      // any `added` or `removed` events. Fires `reset` when finished.
      reset : function(models, options) {
        models  || (models = []);
        options || (options = {});
        this.each(this._removeReference);
        this._reset();
        this.add(models, {silent: true});
        if (!options.silent) this.trigger('reset', this, options);
        return this;
      },
    
      // Fetch the default set of models for this collection, resetting the
      // collection when they arrive. If `add: true` is passed, appends the
      // models to the collection instead of resetting.
      fetch : function(options) {
        options || (options = {});
        var collection = this;
        var success = options.success;
        options.success = function(resp, status, xhr) {
          collection[options.add ? 'add' : 'reset'](collection.parse(resp, xhr), options);
          if (success) success(collection, resp);
        };
        options.error = wrapError(options.error, collection, options);
        return (this.sync || Backbone.sync).call(this, 'read', this, options);
      },
    
      // Create a new instance of a model in this collection. After the model
      // has been created on the server, it will be added to the collection.
      // Returns the model, or 'false' if validation on a new model fails.
      create : function(model, options) {
        var coll = this;
        options || (options = {});
        model = this._prepareModel(model, options);
        if (!model) return false;
        var success = options.success;
        options.success = function(nextModel, resp, xhr) {
          coll.add(nextModel, options);
          if (success) success(nextModel, resp, xhr);
        };
        model.save(null, options);
        return model;
      },
    
      // **parse** converts a response into a list of models to be added to the
      // collection. The default implementation is just to pass it through.
      parse : function(resp, xhr) {
        return resp;
      },
    
      // Proxy to _'s chain. Can't be proxied the same way the rest of the
      // underscore methods are proxied because it relies on the underscore
      // constructor.
      chain: function () {
        return _(this.models).chain();
      },
    
      // Reset all internal state. Called when the collection is reset.
      _reset : function(options) {
        this.length = 0;
        this.models = [];
        this._byId  = {};
        this._byCid = {};
      },
    
      // Prepare a model to be added to this collection
      _prepareModel: function(model, options) {
        if (!(model instanceof Backbone.Model)) {
          var attrs = model;
          model = new this.model(attrs, {collection: this});
          if (model.validate && !model._performValidation(attrs, options)) model = false;
        } else if (!model.collection) {
          model.collection = this;
        }
        return model;
      },
    
      // Internal implementation of adding a single model to the set, updating
      // hash indexes for `id` and `cid` lookups.
      // Returns the model, or 'false' if validation on a new model fails.
      _add : function(model, options) {
        options || (options = {});
        model = this._prepareModel(model, options);
        if (!model) return false;
        var already = this.getByCid(model);
        if (already) throw new Error(["Can't add the same model to a set twice", already.id]);
        this._byId[model.id] = model;
        this._byCid[model.cid] = model;
        var index = options.at != null ? options.at :
                    this.comparator ? this.sortedIndex(model, this.comparator) :
                    this.length;
        this.models.splice(index, 0, model);
        model.bind('all', this._onModelEvent);
        this.length++;
        if (!options.silent) model.trigger('add', model, this, options);
        return model;
      },
    
      // Internal implementation of removing a single model from the set, updating
      // hash indexes for `id` and `cid` lookups.
      _remove : function(model, options) {
        options || (options = {});
        model = this.getByCid(model) || this.get(model);
        if (!model) return null;
        delete this._byId[model.id];
        delete this._byCid[model.cid];
        this.models.splice(this.indexOf(model), 1);
        this.length--;
        if (!options.silent) model.trigger('remove', model, this, options);
        this._removeReference(model);
        return model;
      },
    
      // Internal method to remove a model's ties to a collection.
      _removeReference : function(model) {
        if (this == model.collection) {
          delete model.collection;
        }
        model.unbind('all', this._onModelEvent);
      },
    
      // Internal method called every time a model in the set fires an event.
      // Sets need to update their indexes when models change ids. All other
      // events simply proxy through. "add" and "remove" events that originate
      // in other collections are ignored.
      _onModelEvent : function(ev, model, collection, options) {
        if ((ev == 'add' || ev == 'remove') && collection != this) return;
        if (ev == 'destroy') {
          this._remove(model, options);
        }
        if (model && ev === 'change:' + model.idAttribute) {
          delete this._byId[model.previous(model.idAttribute)];
          this._byId[model.id] = model;
        }
        this.trigger.apply(this, arguments);
      }
    
    });
    
    // Underscore methods that we want to implement on the Collection.
    var methods = ['forEach', 'each', 'map', 'reduce', 'reduceRight', 'find', 'detect',
      'filter', 'select', 'reject', 'every', 'all', 'some', 'any', 'include',
      'contains', 'invoke', 'max', 'min', 'sortBy', 'sortedIndex', 'toArray', 'size',
      'first', 'rest', 'last', 'without', 'indexOf', 'lastIndexOf', 'isEmpty', 'groupBy'];
    
    // Mix in each Underscore method as a proxy to `Collection#models`.
    _.each(methods, function(method) {
      Backbone.Collection.prototype[method] = function() {
        return _[method].apply(_, [this.models].concat(_.toArray(arguments)));
      };
    });
    
    // Backbone.Router
    // -------------------
    
    // Routers map faux-URLs to actions, and fire events when routes are
    // matched. Creating a new one sets its `routes` hash, if not set statically.
    Backbone.Router = function(options) {
      options || (options = {});
      if (options.routes) this.routes = options.routes;
      this._bindRoutes();
      this.initialize.apply(this, arguments);
    };
    
    // Cached regular expressions for matching named param parts and splatted
    // parts of route strings.
    var namedParam    = /:([\w\d]+)/g;
    var splatParam    = /\*([\w\d]+)/g;
    var escapeRegExp  = /[-[\]{}()+?.,\\^$|#\s]/g;
    
    // Set up all inheritable **Backbone.Router** properties and methods.
    _.extend(Backbone.Router.prototype, Backbone.Events, {
    
      // Initialize is an empty function by default. Override it with your own
      // initialization logic.
      initialize : function(){},
    
      // Manually bind a single named route to a callback. For example:
      //
      //     this.route('search/:query/p:num', 'search', function(query, num) {
      //       ...
      //     });
      //
      route : function(route, name, callback) {
        Backbone.history || (Backbone.history = new Backbone.History);
        if (!_.isRegExp(route)) route = this._routeToRegExp(route);
        Backbone.history.route(route, _.bind(function(fragment) {
          var args = this._extractParameters(route, fragment);
          callback.apply(this, args);
          this.trigger.apply(this, ['route:' + name].concat(args));
        }, this));
      },
    
      // Simple proxy to `Backbone.history` to save a fragment into the history.
      navigate : function(fragment, triggerRoute) {
        Backbone.history.navigate(fragment, triggerRoute);
      },
    
      // Bind all defined routes to `Backbone.history`. We have to reverse the
      // order of the routes here to support behavior where the most general
      // routes can be defined at the bottom of the route map.
      _bindRoutes : function() {
        if (!this.routes) return;
        var routes = [];
        for (var route in this.routes) {
          routes.unshift([route, this.routes[route]]);
        }
        for (var i = 0, l = routes.length; i < l; i++) {
          this.route(routes[i][0], routes[i][1], this[routes[i][1]]);
        }
      },
    
      // Convert a route string into a regular expression, suitable for matching
      // against the current location hash.
      _routeToRegExp : function(route) {
        route = route.replace(escapeRegExp, "\\$&")
                     .replace(namedParam, "([^\/]*)")
                     .replace(splatParam, "(.*?)");
        return new RegExp('^' + route + '$');
      },
    
      // Given a route, and a URL fragment that it matches, return the array of
      // extracted parameters.
      _extractParameters : function(route, fragment) {
        return route.exec(fragment).slice(1);
      }
    
    });
    
    // Backbone.History
    // ----------------
    
    // Handles cross-browser history management, based on URL fragments. If the
    // browser does not support `onhashchange`, falls back to polling.
    Backbone.History = function() {
      this.handlers = [];
      _.bindAll(this, 'checkUrl');
    };
    
    // Cached regex for cleaning hashes.
    var hashStrip = /^#*/;
    
    // Cached regex for detecting MSIE.
    var isExplorer = /msie [\w.]+/;
    
    // Has the history handling already been started?
    var historyStarted = false;
    
    // Set up all inheritable **Backbone.History** properties and methods.
    _.extend(Backbone.History.prototype, {
    
      // The default interval to poll for hash changes, if necessary, is
      // twenty times a second.
      interval: 50,
    
      // Get the cross-browser normalized URL fragment, either from the URL,
      // the hash, or the override.
      getFragment : function(fragment, forcePushState) {
        if (fragment == null) {
          if (this._hasPushState || forcePushState) {
            fragment = window.location.pathname;
            var search = window.location.search;
            if (search) fragment += search;
            if (fragment.indexOf(this.options.root) == 0) fragment = fragment.substr(this.options.root.length);
          } else {
            fragment = window.location.hash;
          }
        }
        return decodeURIComponent(fragment.replace(hashStrip, ''));
      },
    
      // Start the hash change handling, returning `true` if the current URL matches
      // an existing route, and `false` otherwise.
      start : function(options) {
    
        // Figure out the initial configuration. Do we need an iframe?
        // Is pushState desired ... is it available?
        if (historyStarted) throw new Error("Backbone.history has already been started");
        this.options          = _.extend({}, {root: '/'}, this.options, options);
        this._wantsPushState  = !!this.options.pushState;
        this._hasPushState    = !!(this.options.pushState && window.history && window.history.pushState);
        var fragment          = this.getFragment();
        var docMode           = document.documentMode;
        var oldIE             = (isExplorer.exec(navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));
        if (oldIE) {
          this.iframe = $('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo('body')[0].contentWindow;
          this.navigate(fragment);
        }
    
        // Depending on whether we're using pushState or hashes, and whether
        // 'onhashchange' is supported, determine how we check the URL state.
        if (this._hasPushState) {
          $(window).bind('popstate', this.checkUrl);
        } else if ('onhashchange' in window && !oldIE) {
          $(window).bind('hashchange', this.checkUrl);
        } else {
          setInterval(this.checkUrl, this.interval);
        }
    
        // Determine if we need to change the base url, for a pushState link
        // opened by a non-pushState browser.
        this.fragment = fragment;
        historyStarted = true;
        var loc = window.location;
        var atRoot  = loc.pathname == this.options.root;
        if (this._wantsPushState && !this._hasPushState && !atRoot) {
          this.fragment = this.getFragment(null, true);
          window.location.replace(this.options.root + '#' + this.fragment);
          // Return immediately as browser will do redirect to new url
          return true;
        } else if (this._wantsPushState && this._hasPushState && atRoot && loc.hash) {
          this.fragment = loc.hash.replace(hashStrip, '');
          window.history.replaceState({}, document.title, loc.protocol + '//' + loc.host + this.options.root + this.fragment);
        }
    
        if (!this.options.silent) {
          return this.loadUrl();
        }
      },
    
      // Add a route to be tested when the fragment changes. Routes added later may
      // override previous routes.
      route : function(route, callback) {
        this.handlers.unshift({route : route, callback : callback});
      },
    
      // Checks the current URL to see if it has changed, and if it has,
      // calls `loadUrl`, normalizing across the hidden iframe.
      checkUrl : function(e) {
        var current = this.getFragment();
        if (current == this.fragment && this.iframe) current = this.getFragment(this.iframe.location.hash);
        if (current == this.fragment || current == decodeURIComponent(this.fragment)) return false;
        if (this.iframe) this.navigate(current);
        this.loadUrl() || this.loadUrl(window.location.hash);
      },
    
      // Attempt to load the current URL fragment. If a route succeeds with a
      // match, returns `true`. If no defined routes matches the fragment,
      // returns `false`.
      loadUrl : function(fragmentOverride) {
        var fragment = this.fragment = this.getFragment(fragmentOverride);
        var matched = _.any(this.handlers, function(handler) {
          if (handler.route.test(fragment)) {
            handler.callback(fragment);
            return true;
          }
        });
        return matched;
      },
    
      // Save a fragment into the hash history. You are responsible for properly
      // URL-encoding the fragment in advance. This does not trigger
      // a `hashchange` event.
      navigate : function(fragment, triggerRoute) {
        var frag = (fragment || '').replace(hashStrip, '');
        if (this.fragment == frag || this.fragment == decodeURIComponent(frag)) return;
        if (this._hasPushState) {
          var loc = window.location;
          if (frag.indexOf(this.options.root) != 0) frag = this.options.root + frag;
          this.fragment = frag;
          window.history.pushState({}, document.title, loc.protocol + '//' + loc.host + frag);
        } else {
          window.location.hash = this.fragment = frag;
          if (this.iframe && (frag != this.getFragment(this.iframe.location.hash))) {
            this.iframe.document.open().close();
            this.iframe.location.hash = frag;
          }
        }
        if (triggerRoute) this.loadUrl(fragment);
      }
    
    });
    
    // Backbone.View
    // -------------
    
    // Creating a Backbone.View creates its initial element outside of the DOM,
    // if an existing element is not provided...
    Backbone.View = function(options) {
      this.cid = _.uniqueId('view');
      this._configure(options || {});
      this._ensureElement();
      this.delegateEvents();
      this.initialize.apply(this, arguments);
    };
    
    // Element lookup, scoped to DOM elements within the current view.
    // This should be prefered to global lookups, if you're dealing with
    // a specific view.
    var selectorDelegate = function(selector) {
      return $(selector, this.el);
    };
    
    // Cached regex to split keys for `delegate`.
    var eventSplitter = /^(\S+)\s*(.*)$/;
    
    // List of view options to be merged as properties.
    var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName'];
    
    // Set up all inheritable **Backbone.View** properties and methods.
    _.extend(Backbone.View.prototype, Backbone.Events, {
    
      // The default `tagName` of a View's element is `"div"`.
      tagName : 'div',
    
      // Attach the `selectorDelegate` function as the `$` property.
      $       : selectorDelegate,
    
      // Initialize is an empty function by default. Override it with your own
      // initialization logic.
      initialize : function(){},
    
      // **render** is the core function that your view should override, in order
      // to populate its element (`this.el`), with the appropriate HTML. The
      // convention is for **render** to always return `this`.
      render : function() {
        return this;
      },
    
      // Remove this view from the DOM. Note that the view isn't present in the
      // DOM by default, so calling this method may be a no-op.
      remove : function() {
        $(this.el).remove();
        return this;
      },
    
      // For small amounts of DOM Elements, where a full-blown template isn't
      // needed, use **make** to manufacture elements, one at a time.
      //
      //     var el = this.make('li', {'class': 'row'}, this.model.escape('title'));
      //
      make : function(tagName, attributes, content) {
        var el = document.createElement(tagName);
        if (attributes) $(el).attr(attributes);
        if (content) $(el).html(content);
        return el;
      },
    
      // Set callbacks, where `this.callbacks` is a hash of
      //
      // *{"event selector": "callback"}*
      //
      //     {
      //       'mousedown .title':  'edit',
      //       'click .button':     'save'
      //     }
      //
      // pairs. Callbacks will be bound to the view, with `this` set properly.
      // Uses event delegation for efficiency.
      // Omitting the selector binds the event to `this.el`.
      // This only works for delegate-able events: not `focus`, `blur`, and
      // not `change`, `submit`, and `reset` in Internet Explorer.
      delegateEvents : function(events) {
        if (!(events || (events = this.events))) return;
        if (_.isFunction(events)) events = events.call(this);
        $(this.el).unbind('.delegateEvents' + this.cid);
        for (var key in events) {
          var method = this[events[key]];
          if (!method) throw new Error('Event "' + events[key] + '" does not exist');
          var match = key.match(eventSplitter);
          var eventName = match[1], selector = match[2];
          method = _.bind(method, this);
          eventName += '.delegateEvents' + this.cid;
          if (selector === '') {
            $(this.el).bind(eventName, method);
          } else {
            $(this.el).delegate(selector, eventName, method);
          }
        }
      },
    
      // Performs the initial configuration of a View with a set of options.
      // Keys with special meaning *(model, collection, id, className)*, are
      // attached directly to the view.
      _configure : function(options) {
        if (this.options) options = _.extend({}, this.options, options);
        for (var i = 0, l = viewOptions.length; i < l; i++) {
          var attr = viewOptions[i];
          if (options[attr]) this[attr] = options[attr];
        }
        this.options = options;
      },
    
      // Ensure that the View has a DOM element to render into.
      // If `this.el` is a string, pass it through `$()`, take the first
      // matching element, and re-assign it to `el`. Otherwise, create
      // an element from the `id`, `className` and `tagName` proeprties.
      _ensureElement : function() {
        if (!this.el) {
          var attrs = this.attributes || {};
          if (this.id) attrs.id = this.id;
          if (this.className) attrs['class'] = this.className;
          this.el = this.make(this.tagName, attrs);
        } else if (_.isString(this.el)) {
          this.el = $(this.el).get(0);
        }
      }
    
    });
    
    // The self-propagating extend function that Backbone classes use.
    var extend = function (protoProps, classProps) {
      var child = inherits(this, protoProps, classProps);
      child.extend = this.extend;
      return child;
    };
    
    // Set up inheritance for the model, collection, and view.
    Backbone.Model.extend = Backbone.Collection.extend =
      Backbone.Router.extend = Backbone.View.extend = extend;
    
    // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
    var methodMap = {
      'create': 'POST',
      'update': 'PUT',
      'delete': 'DELETE',
      'read'  : 'GET'
    };
    
    // Backbone.sync
    // -------------
    
    // Override this function to change the manner in which Backbone persists
    // models to the server. You will be passed the type of request, and the
    // model in question. By default, uses makes a RESTful Ajax request
    // to the model's `url()`. Some possible customizations could be:
    //
    // * Use `setTimeout` to batch rapid-fire updates into a single request.
    // * Send up the models as XML instead of JSON.
    // * Persist models via WebSockets instead of Ajax.
    //
    // Turn on `Backbone.emulateHTTP` in order to send `PUT` and `DELETE` requests
    // as `POST`, with a `_method` parameter containing the true HTTP method,
    // as well as all requests with the body as `application/x-www-form-urlencoded` instead of
    // `application/json` with the model in a param named `model`.
    // Useful when interfacing with server-side languages like **PHP** that make
    // it difficult to read the body of `PUT` requests.
    Backbone.sync = function(method, model, options) {
      var type = methodMap[method];
    
      // Default JSON-request options.
      var params = _.extend({
        type:         type,
        dataType:     'json'
      }, options);
    
      // Ensure that we have a URL.
      if (!params.url) {
        params.url = getUrl(model) || urlError();
      }
    
      // Ensure that we have the appropriate request data.
      if (!params.data && model && (method == 'create' || method == 'update')) {
        params.contentType = 'application/json';
        params.data = JSON.stringify(model.toJSON());
      }
    
      // For older servers, emulate JSON by encoding the request into an HTML-form.
      if (Backbone.emulateJSON) {
        params.contentType = 'application/x-www-form-urlencoded';
        params.data        = params.data ? {model : params.data} : {};
      }
    
      // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
      // And an `X-HTTP-Method-Override` header.
      if (Backbone.emulateHTTP) {
        if (type === 'PUT' || type === 'DELETE') {
          if (Backbone.emulateJSON) params.data._method = type;
          params.type = 'POST';
          params.beforeSend = function(xhr) {
            xhr.setRequestHeader('X-HTTP-Method-Override', type);
          };
        }
      }
    
      // Don't process data on a non-GET request.
      if (params.type !== 'GET' && !Backbone.emulateJSON) {
        params.processData = false;
      }
    
      // Make the request.
      return $.ajax(params);
    };
    
    // Helpers
    // -------
    
    // Shared empty constructor function to aid in prototype-chain creation.
    var ctor = function(){};
    
    // Helper function to correctly set up the prototype chain, for subclasses.
    // Similar to `goog.inherits`, but uses a hash of prototype properties and
    // class properties to be extended.
    var inherits = function(parent, protoProps, staticProps) {
      var child;
    
      // The constructor function for the new subclass is either defined by you
      // (the "constructor" property in your `extend` definition), or defaulted
      // by us to simply call `super()`.
      if (protoProps && protoProps.hasOwnProperty('constructor')) {
        child = protoProps.constructor;
      } else {
        child = function(){ return parent.apply(this, arguments); };
      }
    
      // Inherit class (static) properties from parent.
      _.extend(child, parent);
    
      // Set the prototype chain to inherit from `parent`, without calling
      // `parent`'s constructor function.
      ctor.prototype = parent.prototype;
      child.prototype = new ctor();
    
      // Add prototype properties (instance properties) to the subclass,
      // if supplied.
      if (protoProps) _.extend(child.prototype, protoProps);
    
      // Add static properties to the constructor function, if supplied.
      if (staticProps) _.extend(child, staticProps);
    
      // Correctly set child's `prototype.constructor`.
      child.prototype.constructor = child;
    
      // Set a convenience property in case the parent's prototype is needed later.
      child.__super__ = parent.prototype;
    
      return child;
    };
    
    // Helper function to get a URL from a Model or Collection as a property
    // or as a function.
    var getUrl = function(object) {
      if (!(object && object.url)) return null;
      return _.isFunction(object.url) ? object.url() : object.url;
    };
    
    // Throw an error when a URL is needed, and none is supplied.
    var urlError = function() {
      throw new Error('A "url" property or function must be specified');
    };
    
    // Wrap an optional error callback with a fallback error event.
    var wrapError = function(onError, model, options) {
      return function(resp) {
        if (onError) {
          onError(model, resp, options);
        } else {
          model.trigger('error', model, resp, options);
        }
      };
    };
    
    // Helper function to escape a string for HTML rendering.
    var escapeHTML = function(string) {
      return string.replace(/&(?!\w+;|#\d+;|#x[\da-f]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
    };
    
    return Backbone;
  };
  
  // Export for browserify
  if (module == null) { module = {}; };
  module.exports = create(this);
    
}(this);
});

require.define("/backbone-indexeddb.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var Backbone = require('backbone-browserify');

(function () { /*global _: false, Backbone: false */
    // Generate four random hex digits.
    function S4() {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    }

    // Generate a pseudo-GUID by concatenating random hexadecimal.
    function guid() {
        return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
    }

    var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
    var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction; // No prefix in moz
    var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange; // No prefix in moz

    /* Horrible Hack to prevent ' Expected an identifier and instead saw 'continue' (a reserved word).'*/
    if (window.indexedDB) {
         indexedDB.prototype._continue =  indexedDB.prototype.continue;
    } else if (window.webkitIDBRequest) {
        webkitIDBRequest.prototype._continue = webkitIDBRequest.prototype.continue;
    } else if(window.mozIndexedDB) {
        mozIndexedDB.prototype._continue = mozIndexedDB.prototype.continue;
    }
    
    // Driver object
    function Driver() {}

    function debugLog(str) {
        if (typeof window.console !== "undefined" && typeof window.console.log !== "undefined") {
            window.console.log(str);
        }
    }

    // Driver Prototype
    Driver.prototype = {

        // Performs all the migrations to reach the right version of the database
        migrate: function (db, migrations, version, options) {
            debugLog("Starting migrations from " + version);
            this._migrate_next(db, migrations, version, options);
        },

        // Performs the next migrations. This method is private and should probably not be called.
        _migrate_next: function (db, migrations, version, options) {
            var that = this;
            var migration = migrations.shift();
            if (migration) {
                if (!version || version < migration.version) {
                    // We need to apply this migration-
                    if (typeof migration.before == "undefined") {
                        migration.before = function (db, next) {
                            next();
                        };
                    }
                    if (typeof migration.after == "undefined") {
                        migration.after = function (db, next) {
                            next();
                        };
                    }
                    // First, let's run the before script
                    migration.before(db, function () {
                        var versionRequest = db.setVersion(migration.version);
                        versionRequest.onsuccess = function (e) {
                            migration.migrate(db, versionRequest, function () {
                                // Migration successfully appliedn let's go to the next one!
                                migration.after(db, function () {
                                    debugLog("Migrated to " + migration.version);
                                    that._migrate_next(db, migrations, version, options);
                                });
                            });
                        };
                    });
                } else {
                    // No need to apply this migration
                    debugLog("Skipping migration " + migration.version);
                    this._migrate_next(db, migrations, version, options);
                }
            } else {
                debugLog("Done migrating");
                // No more migration
                options.success();
            }
        },

        /* This is the main method. */
        execute: function (db, storeName, method, object, options) {
            switch (method) {
            case "create":
                this.write(db, storeName, object, options);
                break;
            case "read":
                if (object instanceof Backbone.Collection) {
                    this.query(db, storeName, object, options); // It's a collection
                } else {
                    this.read(db, storeName, object, options); // It's a Model
                }
                break;
            case "update":
                this.write(db, storeName, object, options); // We may want to check that this is not a collection
                break;
            case "delete":
                this.delete(db, storeName, object, options); // We may want to check that this is not a collection
                break;
            default:
                // Hum what?
            }
        },

        // Writes the json to the storeName in db.
        // options are just success and error callbacks.
        write: function (db, storeName, object, options) {
            var writeTransaction = db.transaction([storeName], IDBTransaction.READ_WRITE);
            var store = writeTransaction.objectStore(storeName);
            var json = object.toJSON();

            if (!json.id) json.id = guid();

            var writeRequest = store.put(json, json.id);

            writeRequest.onerror = function (e) {
                options.error(e);
            };
            writeRequest.onsuccess = function (e) {
                options.success(json);
            };
        },

        // Reads from storeName in db with json.id if it's there of with any json.xxxx as long as xxx is an index in storeName 
        read: function (db, storeName, object, options) {
            var readTransaction = db.transaction([storeName], IDBTransaction.READ_ONLY);
            var store = readTransaction.objectStore(storeName);
            var json = object.toJSON();


            var getRequest = null;
            if (json.id) {
                getRequest = store.get(json.id);
            } else {
                // We need to find which index we have
                _.each(store.indexNames, function (key, index) {
                    index = store.index(key);
                    if (json[index.keyPath] && !getRequest) {
                        getRequest = index.get(json[index.keyPath]);
                    }
                });
            }
            if (getRequest) {
                getRequest.onsuccess = function (event) {
                    if (event.target.result) {
                        options.success(event.target.result);
                    } else {
                        options.error("Not Found");
                    }
                };
                getRequest.onerror = function () {
                    options.error("Not Found"); // We couldn't find the record.
                }
            } else {
                options.error("Not Found"); // We couldn't even look for it, as we don't have enough data.
            }
        },

        // Deletes the json.id key and value in storeName from db.
        delete: function (db, storeName, object, options) {
            var deleteTransaction = db.transaction([storeName], IDBTransaction.READ_WRITE);
            var store = deleteTransaction.objectStore(storeName);
            var json = object.toJSON();

            var deleteRequest = store.delete(json.id);
            deleteRequest.onsuccess = function (event) {
                options.success(null);
            };
            deleteRequest.onerror = function (event) {
                options.error("Not Deleted");
            };
        },

        // Performs a query on storeName in db.
        // options may include :
        // - conditions : value of an index, or range for an index
        // - range : range for the primary key
        // - limit : max number of elements to be yielded
        // - offset : skipped items.
        query: function (db, storeName, collection, options) {
            var elements = [];
            var skipped = 0, processed = 0;
            var queryTransaction = db.transaction([storeName], IDBTransaction.READ_ONLY);
            var readCursor = null;
            var store = queryTransaction.objectStore(storeName);
            var index = null,
                lower = null,
                upper = null,
                bounds = null;

            if (options.conditions) {
                // We have a condition, we need to use it for the cursor
                _.each(store.indexNames, function (key) {
                    if (!readCursor) {
                        index = store.index(key);
                        if (options.conditions[index.keyPath] instanceof Array) {
                            lower = options.conditions[index.keyPath][0] > options.conditions[index.keyPath][1] ? options.conditions[index.keyPath][1] : options.conditions[index.keyPath][0];
                            upper = options.conditions[index.keyPath][0] > options.conditions[index.keyPath][1] ? options.conditions[index.keyPath][0] : options.conditions[index.keyPath][1];
                            bounds = IDBKeyRange.bound(lower, upper, true, true);
                            
                            if (options.conditions[index.keyPath][0] > options.conditions[index.keyPath][1]) {
                                // Looks like we want the DESC order
                                readCursor = index.openCursor(bounds, 2);
                            } else {
                                // We want ASC order
                                readCursor = index.openCursor(bounds, 0);
                            }
                        } else if (options.conditions[index.keyPath]) {
                            bounds = IDBKeyRange.only(options.conditions[index.keyPath]);
                            readCursor = index.openCursor(bounds);
                        }
                    }
                });
            } else {
                // No conditions, use the index
                if (options.range) {
                    lower = options.range[0] > options.range[1] ? options.range[1] : options.range[0];
                    upper = options.range[0] > options.range[1] ? options.range[0] : options.range[1];
                    bounds = IDBKeyRange.bound(lower, upper);
                    if (options.range[0] > options.range[1]) {
                        readCursor = store.openCursor(bounds, 2);
                    } else {
                        readCursor = store.openCursor(bounds, 0);
                    }
                } else {
                    readCursor = store.openCursor();
                }
            }
            
            if (typeof (readCursor) == "undefined" || !readCursor) {
                options.error("No Cursor");
            } else {
                // Setup a handler for the cursor’s `success` event:
                readCursor.onsuccess = function (e) {
                    var cursor = e.target.result;
                    if (!cursor) {
                        if (options.addIndividually || options.clear) {
                            // nothing!
                            // We need to indicate that we're done. But, how?
                            collection.trigger("reset");
                        } else {
                            options.success(elements); // We're done. No more elements.
                        }
                    }
                    else {
                        // Cursor is not over yet.
                        if (options.limit && processed >= options.limit) {
                            // Yet, we have processed enough elements. So, let's just skip.
                            if (bounds && options.conditions[index.keyPath]) {
                                cursor.continue(options.conditions[index.keyPath][1] + 1); /* We need to 'terminate' the cursor cleany, by moving to the end */
                            } else {
                                cursor.continue(); /* We need to 'terminate' the cursor cleany, by moving to the end */
                            }
                        }
                        else if (options.offset && options.offset > skipped) {
                            skipped++;
                            cursor.continue(options.offset - skipped); /* We need to Moving the cursor forward */
                        } else {
                            // This time, it looks like it's good!
                            processed++;
                            if (options.addIndividually) {
                                collection.add(cursor.value);
                            } else if (options.clear) {
                                var deleteRequest = store.delete(cursor.value.id);
                                deleteRequest.onsuccess = function (event) {
                                    elements.push(cursor.value);
                                };
                                deleteRequest.onerror = function (event) {
                                    elements.push(cursor.value);
                                };
                                
                            } else {
                                elements.push(cursor.value);
                            }
                            cursor.continue(); 
                        }
                    }
                };
            }
        }
    };


    // Keeps track of the connections
    var Connections = {};

    // ExecutionQueue object
    function ExecutionQueue(driver, database) {
        this.driver = driver;
        this.database = database
        this.started = false;
        this.stack = [];
        this.connection = null;
        this.dbRequest = indexedDB.open(database.id, database.description || "");
        this.error = null;

        this.dbRequest.onsuccess = function (e) {
            this.connection = e.target.result; // Attach the connection ot the queue.
            if (this.connection.version === _.last(database.migrations).version) {
                // No migration to perform!
                this.ready();
            } else if (this.connection.version < _.last(database.migrations).version) {
                // We need to migrate up to the current migration defined in the database
                driver.migrate(this.connection, database.migrations, this.connection.version, {
                    success: function () {
                        this.ready();
                    }.bind(this),
                    error: function () {
                        this.error = "Database not up to date. " + this.connection.version + " expected was " + _.last(database.migrations).version;
                    }.bind(this)
                });
            } else {
                // Looks like the IndexedDB is at a higher version than the current database.
                this.error = "Database version is greater than current code " + this.connection.version + " expected was " + _.last(database.migrations).version;
            }
        }.bind(this);

        this.dbRequest.onerror = function (e) {
            // Failed to open the database
            this.error = "Couldn't not connect to the database"
        }.bind(this);

        this.dbRequest.onabort = function (e) {
            // Failed to open the database
            this.error = "Connection to the database aborted"
        }.bind(this);


    }

    // ExecutionQueue Prototype
    ExecutionQueue.prototype = {

        ready: function () {
            this.started = true;
            _.each(this.stack, function (message) {
                this.execute(message);
            }.bind(this));
        },

        execute: function (message) {
            if (this.error) {
                message[2].error(this.error);
            } else {
                if (this.started) {
                    this.driver.execute(this.connection, message[1].storeName, message[0], message[1], message[2]); // Upon messages, we execute the query
                } else {
                    this.stack.push(message);
                }
            }
        }

    };

    Backbone.sync = function (method, object, options) {
        var database = object.database;
        var driver = new Driver();

        if (!Connections[database.id]) {
            Connections[database.id] = new ExecutionQueue(driver, database);
        }
        Connections[database.id].execute([method, object, options]);
    };
})();
});

require.define("/models/archive.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery-browserify');
var Backbone = require('backbone-browserify');
var BackboneIndexedDB = require('../backbone-indexeddb.js');
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

require.define("/models/message.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery-browserify');
var parseUri = require('../utils.js').parseUri;
var Backbone = require('backbone-browserify');
var BackboneIndexedDB = require('../backbone-indexeddb.js');
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
var $ = jQuery = require('jquery-browserify');
var Backbone = require('backbone-browserify');
var BackboneIndexedDB = require('../backbone-indexeddb.js');
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
var $ = jQuery = require('jquery-browserify');
var Backbone = require('backbone-browserify');
var BackboneIndexedDB = require('../backbone-indexeddb.js');
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
var $ = jQuery = require('jquery-browserify');
var Backbone = require('backbone-browserify');
var BackboneIndexedDB = require('../backbone-indexeddb.js');
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

require.define("/dashboard.js", function (require, module, exports, __dirname, __filename) {
    var Msgboy = require('./msgboy.js').Msgboy;
var $ = jQuery = require('jquery-browserify');
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
