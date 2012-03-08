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
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
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

require.define("/plugins.js", function (require, module, exports, __dirname, __filename) {
var Plugins = {
    all: [],

    register: function (plugin) {
        this.all.push(plugin);
    },
    
    importSubscriptions: function (callback, doneOne, doneAll) {
        var subscriptionsCount = 0;
        
        var processNextPlugin = function(plugins, idx) {
            var plugin = plugins[idx];
            if(plugin) {
                plugin.listSubscriptions(function (subscription) {
                    callback({
                        url: subscription.url,
                        title: subscription.title
                    });
                }, function (count) {
                    doneOne(plugin, count);
                    subscriptionsCount += count;
                    processNextPlugin(plugins, idx + 1);
                });
            }
            else {
                doneAll(subscriptionsCount, idx + 1);
            }
        };

        processNextPlugin(Plugins.all, 0);
    },
    
    httpGet: function(url, success, error) {
        // this is an implementation of Jquery's get $.get, because we don't want to use jquery just for it.
        var client = new XMLHttpRequest(); 
        client.onreadystatechange = function() {
            if(this.readyState == this.DONE) {
                success(client.responseText);
            }
        };
        client.open("GET", url, true); // Open up the connection
        client.send( null ); // Send the request
    },
    
    hasClass: function (elem, selector) {
        var className = " " + selector + " ";
        if ((" " + elem.className + " ").indexOf(className) > -1) {
            return true;
        }
        return false;
    },
    
    getFeedLinkInDocWith: function(doc, mimeType) {
        var links = doc.getElementsByTagName("link");
        for(var i = 0; i < links.length; i++) {
            var link = links[i];
            if(link.getAttribute("rel") === "alternate" && link.getAttribute("type") === mimeType) {
                return link;
            }
        }
        return null;
    },
    
    buildFragmentDocument: function(str) {
        var fragment = document.createDocumentFragment();
        var div = document.createElement('div');
        div.innerHTML = str;
        
        for (var i=0; i < div.childNodes.length; i++) {
          var node = div.childNodes[i].cloneNode(true);
          fragment.appendChild(node);
        };
        return fragment
    }
};

exports.Plugins = Plugins;

// This is the skeleton for the Plugins
var Plugin = function () {
    this.name = ''; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function (doc) {
        // This method needs to returns true if the plugin needs to be applied on this page.
    };

    this.listSubscriptions = function (callback, done) {
        // This methods will callback with all the subscriptions in this service. It can call the callback several times with more feeds.
        // Feeds have the following form {url: _, title: _}.
        done(0);
    };

    this.hijack = function (doc, follow, unfollow) {
        // This method will add a callback that hijack a website subscription (or follow, or equivalent) so that msgboy also mirrors this subscription.
        // So actually, we should ask the user if it's fine to subscribe to the feed, and if so, well, that's good, then we will subscribe.
    };

    this.subscribeInBackground = function (callback) {
        // The callback needs to be called with a feed object {url: _, title: _}
        // this function is called from the background and used to define a "chrome-wide" callback. It should probably not be used by any plugin specific to a 3rd pary site, but for plugins like History and/or Bookmarks
    };
};

});

require.define("/plugins/blogger.js", function (require, module, exports, __dirname, __filename) {
// Blogger

Blogger = function (Plugins) {
    // Let's register
    Plugins.register(this);

    this.name = 'Blogger'; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function (doc) {
        return (doc.location.host === "www.blogger.com" && doc.location.pathname === '/navbar.g');
    };

    this.hijack = function (doc, follow, unfollow) {
        var followLink = doc.getElementById('b-follow-this');
        followLink.addEventListener("click", function() {
            var searchElement = doc.getElementById('searchthis');
            for(var i = 0; i < searchElement.attributes.length; i++ ) {
                var attribute = searchElement.attributes[i];
                if(attribute.name === "action") {
                    follow({
                        title: window.title,
                        url: attribute.nodeValue.replace("search", "feeds/posts/default")
                    }, function () {
                        // Done
                    });
                }
            }
        });
    };

    this.listSubscriptions = function (callback, done) {
        var subscriptionsCount = 0;
        Plugins.httpGet("http://www.blogger.com/manage-blogs-following.g", function (data) {
            var rex = /createSubscriptionInUi\(([\s\S]*?),[\s\S]*?,([\s\S]*?),[\s\S]*?,[\s\S]*?,[\s\S]*?,[\s\S]*?,[\s\S]*?\);/g;
            var match = rex.exec(data);
            while (match) {
                subscriptionsCount += 1;
                callback({
                    url: match[2].replace(/"/g, '').trim() + "feeds/posts/default",
                    title: match[1].replace(/"/g, '').trim()
                });
                match = rex.exec(data);
            }
            done(subscriptionsCount);
        }.bind(this));
    };
};

exports.Blogger = Blogger;

});

require.define("/plugins/disqus.js", function (require, module, exports, __dirname, __filename) {
Disqus = function (Plugins) {
    // Let's register
    Plugins.register(this);

    this.name = 'Disqus Comments';

    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return (doc.getElementById("disqus_thread"));
    };

    this.hijack = function (doc, follow, unfollow) {
        doc.addEventListener("click", function(event) {
            if(Plugins.hasClass(event.target,  "dsq-button")) {
                var feedElem = document.querySelectorAll(".dsq-subscribe-rss")[0];
                follow({
                    url: feedElem.getAttribute("href"),
                    title: document.title + " comments"
                }, function () {
                    //Done
                });
            }
        });
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };

};

exports.Disqus = Disqus;
});

require.define("/plugins/generic.js", function (require, module, exports, __dirname, __filename) {
Generic = function (Plugins) {
    // Let's register
    Plugins.register(this);
    
    this.name = 'Generic';

    this.onSubscriptionPage = function (doc) {
        return true;
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };

    this.hijack = function (doc, follow, unfollow) {
        doc.addEventListener("click", function(event) {
            if(Plugins.hasClass(event.target, "msgboy-follow")) {
                follow({
                    title: event.target.getAttribute("data-msgboy-title"),
                    url: event.target.getAttribute("data-msgboy-url")
                }, function () {
                    //Done
                });
            }
         });
    };
};

exports.Generic = Generic;
});

require.define("/plugins/google-reader.js", function (require, module, exports, __dirname, __filename) {
GoogleReader = function (Plugins) {
    // Let's register
    Plugins.register(this);
    
    this.name = 'Google Reader'; // Name for this plugin. The user will be asked which plugins he wants to use.

    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return (doc.location.host === "www.google.com" && doc.location.pathname === '/reader/view/');
    };

    this.hijack = function (doc, follow, unfollow) {
        // This methods hijacks the susbcription action on the specific website for this plugin.
        var submitted = function () {
            var quickadd = doc.getElementById("quickadd");
            follow({
                url: quickadd.value,
                title: quickadd.value
            }, function () {
                // Done
            });
        };
        var form = doc.getElementById('quick-add-form');
        form.addEventListener('submit', submitted);
        
        var addButton = doc.querySelectorAll('#quick-add-form .goog-button-body')[0];
        addButton.addEventListener('click', submitted);
    };

    this.listSubscriptions = function (callback, done) {
        var feedCount = 0;
        Plugins.httpGet("http://www.google.com/reader/subscriptions/export", function(data) {
            // That was successful!
            var fragment = Plugins.buildFragmentDocument(data);
            var outlines = fragment.querySelectorAll("outline");
            for(var i = 0; i < outlines.length; i++) {
                var line = outlines[i];
                feedCount += 1;
                callback({
                    url:  line.getAttribute("xmlUrl"),
                    title: line.getAttribute("title")
                });
            }
            done(feedCount);
        }, function() {
            // That was a fail :()
        });
    };
};

exports.GoogleReader = GoogleReader;
});

require.define("/plugins/posterous.js", function (require, module, exports, __dirname, __filename) {

Posterous = function (Plugins) {
    // Let's register
    Plugins.register(this);
    

    this.name = 'Posterous';
    this.hijacked = false;

    this.onSubscriptionPage = function (doc) {
        return (doc.getElementById("pbar") !== null);
    };

    this.hijack = function (doc, follow, unfollow) {
        var found = false;
        var followElem = null;
        doc.addEventListener('DOMNodeInserted', function(evt) {
            followElem = doc.querySelectorAll("a.pbar_login_form")[0];
            if(followElem && !found) {
                found = true;
                followElem.addEventListener('click', function(event) {
                    var feedLink = Plugins.getFeedLinkInDocWith(doc, "application/rss+xml");
                    follow({
                        title: doc.title,
                        url: feedLink.getAttribute('href')
                    }, function() {
                        // Done!
                    });
                });
            }
        });
    };

    this.listSubscriptions = function (callback, done) {
        this.listSubscriptionsPage(1, 0, callback, done);
    };

    this.listSubscriptionsPage = function (page, count, callback, done) {
        var that = this;
        
        Plugins.httpGet("http://posterous.com/users/me/subscriptions?page=" + page, function(data) {
            // That was successful!
            var fragment = Plugins.buildFragmentDocument(data);
            var links = fragment.querySelectorAll("#subscriptions td.image a");
            for(var i = 0; i< links.length; i++) {
                var link = links[i];
                callback({
                    url: link.getAttribute("href") + "/rss.xml",
                    title: link.getAttribute("title")
                });
                count += 1;
            }
            if (links.length > 0) {
                this.listSubscriptionsPage(page + 1, count, callback, done);
            } else {
                done(count);
            }
        }.bind(this));
    };
};

exports.Posterous = Posterous;
});

require.define("/plugins/statusnet.js", function (require, module, exports, __dirname, __filename) {


Statusnet = function (Plugins) {
    // Let's register
    Plugins.register(this);
    

    this.name = 'Status.net'; // Name for this plugin. The user will be asked which plugins he wants to use.

    this.onSubscriptionPage = function (doc) {
        // This method needs to returns true if the plugin needs to be applied on this page.
        return (doc.getElementById("showstream") || false);
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };

    this.hijack = function (doc, follow, unfollow) {
        var form = null,
            addButton = null;
        
        var submitted = function () {
            followElem.addEventListener('click', function(event) {
                var feedLink = Plugins.getFeedLinkInDocWith(doc, "application/rss+xml");
                follow({
                    title: doc.title,
                    url: feedLink.getAttribute('href')
                }, function() {
                    // Done!
                });
            });
        };
        
        doc.addEventListener('DOMNodeInserted', function(evt) {
            form = doc.getElementById('form_ostatus_connect');
            addButton = doc.querySelectorAll('#form_ostatus_connect .submit_dialogbox')[0];            
            if(form) {
                form.addEventListener('submit', submitted);
            }
            if(addButton) {
                addButton.addEventListener('click', submitted);
            }
        });

    };
};

exports.Statusnet = Statusnet;
});

require.define("/plugins/tumblr.js", function (require, module, exports, __dirname, __filename) {
Tumblr = function (Plugins) {
    // Let's register
    Plugins.register(this);
    
    this.name = 'Tumblr'; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function (doc) {
        return (doc.location.host === "www.tumblr.com" && doc.location.pathname === '/dashboard/iframe');
    };

    this.hijack = function (doc, follow, unfollow) {
        var found = false;
        var followElem = null;
        var form = doc.getElementsByTagName("form")[0];
        form.addEventListener('submit', function() {
            var tumblr = doc.getElementsByName("id")[0].getAttribute("value");
            follow({
                title: tumblr + " on Tumblr",
                url: "http://" + tumblr + ".tumblr.com/rss"
            }, function () {
                // Done
            });
        });
    };


    this.listSubscriptions = function (callback, done) {
        this.listSubscriptionsPage(1, 0, callback, done);
    };

    this.listSubscriptionsPage = function (page, subscriptions, callback, done) {
        
        Plugins.httpGet("http://www.tumblr.com/following/page/" + page, function(data) {
            // That was successful!
            var fragment = Plugins.buildFragmentDocument(data);
            var links = fragment.querySelectorAll(".follower .name a");
            for(var i = 0; i < links.length; i++) {
                var link = links[i];
                callback({
                    url: link.getAttribute("href") + "rss",
                    title: link.innerText + " on Tumblr"
                });
                subscriptions += 1;
            }
            if (links.length > 0) {
                this.listSubscriptionsPage(page + 1, subscriptions, callback, done);
            } else {
                done(subscriptions);
            }
        }.bind(this));
    };
};

exports.Tumblr = Tumblr;
});

require.define("/plugins/typepad.js", function (require, module, exports, __dirname, __filename) {
var Typepad = function (Plugins) {
    // Let's register
    Plugins.register(this);
    

    this.name = 'Typepad'; // Name for this plugin. The user will be asked which plugins he wants to use.

    this.onSubscriptionPage = function (doc) {
        return (doc.location.host === "www.typepad.com" && doc.location.pathname === '/services/toolbar') || doc.location.host === "profile.typepad.com";
    };

    this.hijack = function (doc, follow, unfollow) {
        var followDisplay = doc.getElementById('follow-display');
        followDisplay.addEventListener("click", function() {
            var profileLink = doc.querySelectorAll("#unfollow-display a")[0];
            follow({
                title: "",
                url: profileLink.getAttribute("href") + "/activity/atom.xml"
            }, function () {
                // Done
            });
        });
        
        var followAction = doc.getElementById('follow-action');
        followAction.addEventListener("click", function() {
            var feedLink = Plugins.getFeedLinkInDocWith(doc, "application/atom+xml");
            follow({
                title: feedLink.getAttribute('title'),
                url: feedLink.getAttribute('href')
            }, function() {
                // Done!
            });
        });
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };
};

exports.Typepad = Typepad;
});

require.define("/plugins/wordpress.js", function (require, module, exports, __dirname, __filename) {
var Wordpress = function (Plugins) {
    // Let's register
    Plugins.register(this);

    this.name = 'Wordpress'; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function (doc) {
        return (doc.getElementById("wpadminbar"));
    };

    this.hijack = function (doc, follow, unfollow) {
        var followLink = doc.getElementById("wpadminbar");
        followLink.addEventListener('click', function(evt) {
            followLink = doc.getElementById("wp-admin-bar-follow");
            if(Plugins.hasClass(followLink, "subscribed")) {
                var feedLink = Plugins.getFeedLinkInDocWith(doc, "application/rss+xml");
                follow({
                    title: feedLink.getAttribute('title'),
                    url: feedLink.getAttribute('href')
                }, function() {
                    // Done!
                });
            }
            else {
                // unfollow
            }
        });
    };

    this.listSubscriptions = function (callback, done) {
        // Looks like WP doesn't allow us to export the list of followed blogs. Boooh.
        done(0);
    };
};

exports.Wordpress = Wordpress;
});

require.define("/run_plugins.js", function (require, module, exports, __dirname, __filename) {
    // Ok. Here, we need to require all the plugins!
var Plugins         = require('./plugins.js').Plugins;

var Blogger = require('./plugins/blogger.js').Blogger;
new Blogger(Plugins);
var Disqus = require('./plugins/disqus.js').Disqus;
new Disqus(Plugins);
var Generic = require('./plugins/generic.js').Generic;
new Generic(Plugins);
var GoogleReader = require('./plugins/google-reader.js').GoogleReader;
new GoogleReader(Plugins);
var Posterous = require('./plugins/posterous.js').Posterous;
new Posterous(Plugins);
var Statusnet = require('./plugins/statusnet.js').Statusnet;
new Statusnet(Plugins);
var Tumblr = require('./plugins/tumblr.js').Tumblr;
new Tumblr(Plugins);
var Typepad = require('./plugins/typepad.js').Typepad;
new Typepad(Plugins);
var Wordpress = require('./plugins/wordpress.js').Wordpress;
new Wordpress(Plugins);

// Runs all the plugins
for (var i = 0; i < Plugins.all.length; i++) {
    var plugin = Plugins.all[i];
    if (plugin.onSubscriptionPage(document)) { // Are we on the plugin's page?
        plugin.hijack(document, function (feed, done) {
            chrome.extension.sendRequest({
                signature: "subscribe",
                params: feed
            }, function (response) {
                done();
            });
        }, function (feed, done) {
            // Unfollow?
            // We should first check whether the user is subscribed, and if he is, then, ask whether he wants to unsubscribe from here as well.
            done();
        });
    }
}

});
require("/run_plugins.js");
