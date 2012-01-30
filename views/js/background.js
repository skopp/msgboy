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

require.define("/strophejs/core.js", function (require, module, exports, __dirname, __filename) {
var Base64 = require('./base64.js').Base64;

/*
    This program is distributed under the terms of the MIT license.
    Please see the LICENSE file for details.

    Copyright 2006-2008, OGG, LLC
*/

/* jslint configuration: */
/*global document, window, setTimeout, clearTimeout, console,
    XMLHttpRequest, ActiveXObject,
    Base64, MD5,
    Strophe, $build, $msg, $iq, $pres */

/** File: core.js
 *  A JavaScript library for XMPP.
 *
 *  This is the JavaScript version of the Strophe library.  It relies on
 *  an underlying protocol.
 */

/** File: bosh.js
 *  Since JavaScript has no facilities for persistent TCP connections, this 
 *  library uses Bidirectional-streams Over Synchronous HTTP (BOSH) to emulate
 *  a persistent, stateful, two-way connection to an XMPP server.  More
 *  information on BOSH can be found in XEP 124.
 */

/** File: websocket.js
 *	Uses HTML5s websocket as the underlying protocol to allow for fast
 *  communication from the browser to the XMPP server.
 *  It needs an Ejabberd server that is able to deal with Websockets.
 */ 

/** PrivateFunction: Function.prototype.bind
 *  Bind a function to an instance.
 *
 *  This Function object extension method creates a bound method similar
 *  to those in Python.  This means that the 'this' object will point
 *  to the instance you want.  See
 *  <a href='https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/bind'>MDC's bind() documentation</a> and 
 *  <a href='http://benjamin.smedbergs.us/blog/2007-01-03/bound-functions-and-function-imports-in-javascript/'>Bound Functions and Function Imports in JavaScript</a>
 *  for a complete explanation.
 *
 *  This extension already exists in some browsers (namely, Firefox 3), but
 *  we provide it to support those that don't.
 *
 *  Parameters:
 *    (Object) obj - The object that will become 'this' in the bound function.
 *    (Object) argN - An option argument that will be prepended to the 
 *      arguments given for the function call
 *
 *  Returns:
 *    The bound function.
 */
if (!Function.prototype.bind) {
    Function.prototype.bind = function (obj /*, arg1, arg2, ... */)
    {
        var func = this;
        var _slice = Array.prototype.slice;
        var _concat = Array.prototype.concat;
        var _args = _slice.call(arguments, 1);
        
        return function () {
            return func.apply(obj ? obj : this,
                              _concat.call(_args,
                                           _slice.call(arguments, 0)));
        };
    };
}

/** PrivateFunction: Array.prototype.indexOf
 *  Return the index of an object in an array.
 *
 *  This function is not supplied by some JavaScript implementations, so
 *  we provide it if it is missing.  This code is from:
 *  http://developer.mozilla.org/En/Core_JavaScript_1.5_Reference:Objects:Array:indexOf
 *
 *  Parameters:
 *    (Object) elt - The object to look for.
 *    (Integer) from - The index from which to start looking. (optional).
 *
 *  Returns:
 *    The index of elt in the array or -1 if not found.
 */
if (!Array.prototype.indexOf)
{
    Array.prototype.indexOf = function (elt /*, from*/)
    {
        var len = this.length;

        var from = Number(arguments[1]) || 0;
        from = (from < 0) ? Math.ceil(from) : Math.floor(from);
        if (from < 0) {
            from += len;
        }

        for (; from < len; from++) {
            if (from in this && this[from] === elt) {
                return from;
            }
        }

        return -1;
    };
}

/* All of the Strophe globals are defined in this special function below so
 * that references to the globals become closures.  This will ensure that
 * on page reload, these references will still be available to callbacks
 * that are still executing.
 */

(function (callback) {
var Strophe;

/** Function: $build
 *  Create a Strophe.Builder.
 *  This is an alias for 'new Strophe.Builder(name, attrs)'.
 *
 *  Parameters:
 *    (String) name - The root element name.
 *    (Object) attrs - The attributes for the root element in object notation.
 *
 *  Returns:
 *    A new Strophe.Builder object.
 */
function $build(name, attrs) { return new Strophe.Builder(name, attrs); }
/** Function: $msg
 *  Create a Strophe.Builder with a <message/> element as the root.
 *
 *  Parmaeters:
 *    (Object) attrs - The <message/> element attributes in object notation.
 *
 *  Returns:
 *    A new Strophe.Builder object.
 */
function $msg(attrs) { return new Strophe.Builder("message", attrs); }
/** Function: $iq
 *  Create a Strophe.Builder with an <iq/> element as the root.
 *
 *  Parameters:
 *    (Object) attrs - The <iq/> element attributes in object notation.
 *
 *  Returns:
 *    A new Strophe.Builder object.
 */
function $iq(attrs) { return new Strophe.Builder("iq", attrs); }
/** Function: $pres
 *  Create a Strophe.Builder with a <presence/> element as the root.
 *
 *  Parameters:
 *    (Object) attrs - The <presence/> element attributes in object notation.
 *
 *  Returns:
 *    A new Strophe.Builder object.
 */
function $pres(attrs) { return new Strophe.Builder("presence", attrs); }

/** Class: Strophe
 *  An object container for all Strophe library functions.
 *
 *  This class is just a container for all the objects and constants
 *  used in the library.  It is not meant to be instantiated, but to
 *  provide a namespace for library objects, constants, and functions.
 */
Strophe = {
    /** Constant: VERSION
     *  The version of the Strophe library. Unreleased builds will have
     *  a version of head-HASH where HASH is a partial revision.
     */
    VERSION: "@VERSION@",

    /** Constants: XMPP Namespace Constants
     *  Common namespace constants from the XMPP RFCs and XEPs.
     *
     *  NS.CLIENT - Main XMPP client namespace.
     *  NS.AUTH - Legacy authentication namespace.
     *  NS.ROSTER - Roster operations namespace.
     *  NS.PROFILE - Profile namespace.
     *  NS.DISCO_INFO - Service discovery info namespace from XEP 30.
     *  NS.DISCO_ITEMS - Service discovery items namespace from XEP 30.
     *  NS.MUC - Multi-User Chat namespace from XEP 45.
     *  NS.SASL - XMPP SASL namespace from RFC 3920.
     *  NS.STREAM - XMPP Streams namespace from RFC 3920.
     *  NS.BIND - XMPP Binding namespace from RFC 3920.
     *  NS.SESSION - XMPP Session namespace from RFC 3920.
     */
    NS: {
        CLIENT: "jabber:client",
        AUTH: "jabber:iq:auth",
        ROSTER: "jabber:iq:roster",
        PROFILE: "jabber:iq:profile",
        DISCO_INFO: "http://jabber.org/protocol/disco#info",
        DISCO_ITEMS: "http://jabber.org/protocol/disco#items",
        MUC: "http://jabber.org/protocol/muc",
        SASL: "urn:ietf:params:xml:ns:xmpp-sasl",
        STREAM: "http://etherx.jabber.org/streams",
        BIND: "urn:ietf:params:xml:ns:xmpp-bind",
        SESSION: "urn:ietf:params:xml:ns:xmpp-session",
        VERSION: "jabber:iq:version",
        STANZAS: "urn:ietf:params:xml:ns:xmpp-stanzas"
    },

    /** Function: addNamespace
     *  This function is used to extend the current namespaces in
     *	Strophe.NS.  It takes a key and a value with the key being the
     *	name of the new namespace, with its actual value.
     *	For example:
     *	Strophe.addNamespace('PUBSUB', "http://jabber.org/protocol/pubsub");
     *
     *  Parameters:
     *    (String) name - The name under which the namespace will be
     *      referenced under Strophe.NS
     *    (String) value - The actual namespace.
     */
    addNamespace: function (name, value)
    {
	Strophe.NS[name] = value;
    },

    /** Constants: Connection Status Constants
     *  Connection status constants for use by the connection handler
     *  callback.
     *
     *  Status.ERROR - An error has occurred
     *  Status.CONNECTING - The connection is currently being made
     *  Status.CONNFAIL - The connection attempt failed
     *  Status.AUTHENTICATING - The connection is authenticating
     *  Status.AUTHFAIL - The authentication attempt failed
     *  Status.CONNECTED - The connection has succeeded
     *  Status.DISCONNECTED - The connection has been terminated
     *  Status.DISCONNECTING - The connection is currently being terminated
     *  Status.ATTACHED - The connection has been attached
     */
    Status: {
        ERROR: 0,
        CONNECTING: 1,
        CONNFAIL: 2,
        AUTHENTICATING: 3,
        AUTHFAIL: 4,
        CONNECTED: 5,
        DISCONNECTED: 6,
        DISCONNECTING: 7,
        ATTACHED: 8
    },

    /** Constants: Log Level Constants
     *  Logging level indicators.
     *
     *  LogLevel.DEBUG - Debug output
     *  LogLevel.INFO - Informational output
     *  LogLevel.WARN - Warnings
     *  LogLevel.ERROR - Errors
     *  LogLevel.FATAL - Fatal errors
     */
    LogLevel: {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4
    },

    /** PrivateConstants: DOM Element Type Constants
     *  DOM element types.
     *
     *  ElementType.NORMAL - Normal element.
     *  ElementType.TEXT - Text data element.
     */
    ElementType: {
        NORMAL: 1,
        TEXT: 3
    },


    /** Function: forEachChild
     *  Map a function over some or all child elements of a given element.
     *
     *  This is a small convenience function for mapping a function over
     *  some or all of the children of an element.  If elemName is null, all
     *  children will be passed to the function, otherwise only children
     *  whose tag names match elemName will be passed.
     *
     *  Parameters:
     *    (XMLElement) elem - The element to operate on.
     *    (String) elemName - The child element tag name filter.
     *    (Function) func - The function to apply to each child.  This
     *      function should take a single argument, a DOM element.
     */
    forEachChild: function (elem, elemName, func)
    {
        var i, childNode;

        for (i = 0; i < elem.childNodes.length; i++) {
            childNode = elem.childNodes[i];
            if (childNode.nodeType == Strophe.ElementType.NORMAL &&
                (!elemName || this.isTagEqual(childNode, elemName))) {
                func(childNode);
            }
        }
    },

    /** Function: isTagEqual
     *  Compare an element's tag name with a string.
     *
     *  This function is case insensitive.
     *
     *  Parameters:
     *    (XMLElement) el - A DOM element.
     *    (String) name - The element name.
     *
     *  Returns:
     *    true if the element's tag name matches _el_, and false
     *    otherwise.
     */
    isTagEqual: function (el, name)
    {
        return el.tagName.toLowerCase() == name.toLowerCase();
    },

    /** PrivateVariable: _xmlGenerator
     *  _Private_ variable that caches a DOM document to
     *  generate elements.
     */
    _xmlGenerator: null,

    /** PrivateFunction: _makeGenerator
     *  _Private_ function that creates a dummy XML DOM document to serve as
     *  an element and text node generator.
     */
    _makeGenerator: function () {
        var doc;

        if (window.ActiveXObject) {
            doc = this._getIEXmlDom();
            doc.appendChild(doc.createElement('strophe'));
        } else {
            doc = document.implementation
                .createDocument('jabber:client', 'strophe', null);
        }

        return doc;
    },

    /** Function: xmlGenerator
     *  Get the DOM document to generate elements.
     *
     *  Returns:
     *    The currently used DOM document.
     */
    xmlGenerator: function () {
        if (!Strophe._xmlGenerator) {
            Strophe._xmlGenerator = Strophe._makeGenerator();
        }
        return Strophe._xmlGenerator;
    },

    /** PrivateFunction: _getIEXmlDom
     *  Gets IE xml doc object
     *
     *  Returns:
     *    A Microsoft XML DOM Object
     *  See Also:
     *    http://msdn.microsoft.com/en-us/library/ms757837%28VS.85%29.aspx
     */
    _getIEXmlDom : function () {
        var doc = null;
        var docStrings = [
            "Msxml2.DOMDocument.6.0",
            "Msxml2.DOMDocument.5.0",
            "Msxml2.DOMDocument.4.0",
            "MSXML2.DOMDocument.3.0",
            "MSXML2.DOMDocument",
            "MSXML.DOMDocument",
            "Microsoft.XMLDOM"
        ];

        for (var d = 0; d < docStrings.length; d++) {
            if (doc === null) {
                try {
                    doc = new ActiveXObject(docStrings[d]);
                } catch (e) {
                    doc = null;
                }
            } else {
                break;
            }
        }

        return doc;
    },

    /** Function: xmlElement
     *  Create an XML DOM element.
     *
     *  This function creates an XML DOM element correctly across all
     *  implementations. Note that these are not HTML DOM elements, which
     *  aren't appropriate for XMPP stanzas.
     *
     *  Parameters:
     *    (String) name - The name for the element.
     *    (Array|Object) attrs - An optional array or object containing
     *      key/value pairs to use as element attributes. The object should
     *      be in the format {'key': 'value'} or {key: 'value'}. The array
     *      should have the format [['key1', 'value1'], ['key2', 'value2']].
     *    (String) text - The text child data for the element.
     *
     *  Returns:
     *    A new XML DOM element.
     */
    xmlElement: function (name)
    {
        if (!name) { return null; }

        var node = Strophe.xmlGenerator().createElement(name);

        // FIXME: this should throw errors if args are the wrong type or
        // there are more than two optional args
        var a, i, k;
        for (a = 1; a < arguments.length; a++) {
            if (!arguments[a]) { continue; }
            if (typeof(arguments[a]) == "string" ||
                typeof(arguments[a]) == "number") {
                node.appendChild(Strophe.xmlTextNode(arguments[a]));
            } else if (typeof(arguments[a]) == "object" &&
                       typeof(arguments[a].sort) == "function") {
                for (i = 0; i < arguments[a].length; i++) {
                    if (typeof(arguments[a][i]) == "object" &&
                        typeof(arguments[a][i].sort) == "function") {
                        node.setAttribute(arguments[a][i][0],
                                          arguments[a][i][1]);
                    }
                }
            } else if (typeof(arguments[a]) == "object") {
                for (k in arguments[a]) {
                    if (arguments[a].hasOwnProperty(k)) {
                        node.setAttribute(k, arguments[a][k]);
                    }
                }
            }
        }

        return node;
    },

    /*  Function: xmlescape
     *  Excapes invalid xml characters.
     *
     *  Parameters:
     *     (String) text - text to escape.
     *
     *	Returns:
     *      Escaped text.
     */
    xmlescape: function (text)
    {
	text = text.replace(/\&/g, "&amp;");
        text = text.replace(/</g,  "&lt;");
        text = text.replace(/>/g,  "&gt;");
        return text;
    },

    /** Function: xmlTextNode
     *  Creates an XML DOM text node.
     *
     *  Provides a cross implementation version of document.createTextNode.
     *
     *  Parameters:
     *    (String) text - The content of the text node.
     *
     *  Returns:
     *    A new XML DOM text node.
     */
    xmlTextNode: function (text)
    {
	//ensure text is escaped
	text = Strophe.xmlescape(text);

        return Strophe.xmlGenerator().createTextNode(text);
    },

    /** Function: getText
     *  Get the concatenation of all text children of an element.
     *
     *  Parameters:
     *    (XMLElement) elem - A DOM element.
     *
     *  Returns:
     *    A String with the concatenated text of all text element children.
     */
    getText: function (elem)
    {
        if (!elem) { return null; }

        var str = "";
        if (elem.childNodes.length === 0 && elem.nodeType ==
            Strophe.ElementType.TEXT) {
            str += elem.nodeValue;
        }

        for (var i = 0; i < elem.childNodes.length; i++) {
            if (elem.childNodes[i].nodeType == Strophe.ElementType.TEXT) {
                str += elem.childNodes[i].nodeValue;
            }
        }

        return str;
    },

    /** Function: copyElement
     *  Copy an XML DOM element.
     *
     *  This function copies a DOM element and all its descendants and returns
     *  the new copy.
     *
     *  Parameters:
     *    (XMLElement) elem - A DOM element.
     *
     *  Returns:
     *    A new, copied DOM element tree.
     */
    copyElement: function (elem)
    {
        var i, el;
        if (elem.nodeType == Strophe.ElementType.NORMAL) {
            el = Strophe.xmlElement(elem.tagName);

            for (i = 0; i < elem.attributes.length; i++) {
                el.setAttribute(elem.attributes[i].nodeName.toLowerCase(),
                                elem.attributes[i].value);
            }

            for (i = 0; i < elem.childNodes.length; i++) {
                el.appendChild(Strophe.copyElement(elem.childNodes[i]));
            }
        } else if (elem.nodeType == Strophe.ElementType.TEXT) {
            el = Strophe.xmlTextNode(elem.nodeValue);
        }

        return el;
    },

    /** Function: escapeNode
     *  Escape the node part (also called local part) of a JID.
     *
     *  Parameters:
     *    (String) node - A node (or local part).
     *
     *  Returns:
     *    An escaped node (or local part).
     */
    escapeNode: function (node)
    {
        return node.replace(/^\s+|\s+$/g, '')
            .replace(/\\/g,  "\\5c")
            .replace(/ /g,   "\\20")
            .replace(/\"/g,  "\\22")
            .replace(/\&/g,  "\\26")
            .replace(/\'/g,  "\\27")
            .replace(/\//g,  "\\2f")
            .replace(/:/g,   "\\3a")
            .replace(/</g,   "\\3c")
            .replace(/>/g,   "\\3e")
            .replace(/@/g,   "\\40");
    },

    /** Function: unescapeNode
     *  Unescape a node part (also called local part) of a JID.
     *
     *  Parameters:
     *    (String) node - A node (or local part).
     *
     *  Returns:
     *    An unescaped node (or local part).
     */
    unescapeNode: function (node)
    {
        return node.replace(/\\20/g, " ")
            .replace(/\\22/g, '"')
            .replace(/\\26/g, "&")
            .replace(/\\27/g, "'")
            .replace(/\\2f/g, "/")
            .replace(/\\3a/g, ":")
            .replace(/\\3c/g, "<")
            .replace(/\\3e/g, ">")
            .replace(/\\40/g, "@")
            .replace(/\\5c/g, "\\");
    },

    /** Function: getNodeFromJid
     *  Get the node portion of a JID String.
     *
     *  Parameters:
     *    (String) jid - A JID.
     *
     *  Returns:
     *    A String containing the node.
     */
    getNodeFromJid: function (jid)
    {
        if (jid.indexOf("@") < 0) { return null; }
        return jid.split("@")[0];
    },

    /** Function: getDomainFromJid
     *  Get the domain portion of a JID String.
     *
     *  Parameters:
     *    (String) jid - A JID.
     *
     *  Returns:
     *    A String containing the domain.
     */
    getDomainFromJid: function (jid)
    {
        var bare = Strophe.getBareJidFromJid(jid);
        if (bare.indexOf("@") < 0) {
            return bare;
        } else {
            var parts = bare.split("@");
            parts.splice(0, 1);
            return parts.join('@');
        }
    },

    /** Function: getResourceFromJid
     *  Get the resource portion of a JID String.
     *
     *  Parameters:
     *    (String) jid - A JID.
     *
     *  Returns:
     *    A String containing the resource.
     */
    getResourceFromJid: function (jid)
    {
        var s = jid.split("/");
        if (s.length < 2) { return null; }
        s.splice(0, 1);
        return s.join('/');
    },

    /** Function: getBareJidFromJid
     *  Get the bare JID from a JID String.
     *
     *  Parameters:
     *    (String) jid - A JID.
     *
     *  Returns:
     *    A String containing the bare JID.
     */
    getBareJidFromJid: function (jid)
    {
        return jid ? jid.split("/")[0] : null;
    },

    /** Function: log
     *  User overrideable logging function.
     *
     *  This function is called whenever the Strophe library calls any
     *  of the logging functions.  The default implementation of this
     *  function does nothing.  If client code wishes to handle the logging
     *  messages, it should override this with
     *  > Strophe.log = function (level, msg) {
     *  >   (user code here)
     *  > };
     *
     *  Please note that data sent and received over the wire is logged
     *  via Strophe.Connection.rawInput() and Strophe.Connection.rawOutput().
     *
     *  The different levels and their meanings are
     *
     *    DEBUG - Messages useful for debugging purposes.
     *    INFO - Informational messages.  This is mostly information like
     *      'disconnect was called' or 'SASL auth succeeded'.
     *    WARN - Warnings about potential problems.  This is mostly used
     *      to report transient connection errors like request timeouts.
     *    ERROR - Some error occurred.
     *    FATAL - A non-recoverable fatal error occurred.
     *
     *  Parameters:
     *    (Integer) level - The log level of the log message.  This will
     *      be one of the values in Strophe.LogLevel.
     *    (String) msg - The log message.
     */
    log: function (level, msg)
    {
        return;
    },

    /** Function: debug
     *  Log a message at the Strophe.LogLevel.DEBUG level.
     *
     *  Parameters:
     *    (String) msg - The log message.
     */
    debug: function (msg)
    {
        this.log(this.LogLevel.DEBUG, msg);
    },

    /** Function: info
     *  Log a message at the Strophe.LogLevel.INFO level.
     *
     *  Parameters:
     *    (String) msg - The log message.
     */
    info: function (msg)
    {
        this.log(this.LogLevel.INFO, msg);
    },

    /** Function: warn
     *  Log a message at the Strophe.LogLevel.WARN level.
     *
     *  Parameters:
     *    (String) msg - The log message.
     */
    warn: function (msg)
    {
        this.log(this.LogLevel.WARN, msg);
    },

    /** Function: error
     *  Log a message at the Strophe.LogLevel.ERROR level.
     *
     *  Parameters:
     *    (String) msg - The log message.
     */
    error: function (msg)
    {
        this.log(this.LogLevel.ERROR, msg);
    },

    /** Function: fatal
     *  Log a message at the Strophe.LogLevel.FATAL level.
     *
     *  Parameters:
     *    (String) msg - The log message.
     */
    fatal: function (msg)
    {
        this.log(this.LogLevel.FATAL, msg);
    },

    /** Function: serialize
     *  Render a DOM element and all descendants to a String.
     *
     *  Parameters:
     *    (XMLElement) elem - A DOM element.
     *
     *  Returns:
     *    The serialized element tree as a String.
     */
    serialize: function (elem)
    {
        var result;

        if (!elem) { return null; }

        if (typeof(elem.tree) === "function") {
            elem = elem.tree();
        }

        var nodeName = elem.nodeName;
        var i, child;

        if (elem.getAttribute("_realname")) {
            nodeName = elem.getAttribute("_realname");
        }

        result = "<" + nodeName;
        for (i = 0; i < elem.attributes.length; i++) {
               if (elem.attributes[i].nodeName != "_realname") {
                 result += " " + elem.attributes[i].nodeName.toLowerCase() +
                "='" + elem.attributes[i].value
                    .replace(/&/g, "&amp;")
                       .replace(/\'/g, "&apos;")
                       .replace(/</g, "&lt;") + "'";
               }
        }

        if (elem.childNodes.length > 0) {
            result += ">";
            for (i = 0; i < elem.childNodes.length; i++) {
                child = elem.childNodes[i];
                if (child.nodeType == Strophe.ElementType.NORMAL) {
                    // normal element, so recurse
                    result += Strophe.serialize(child);
                } else if (child.nodeType == Strophe.ElementType.TEXT) {
                    // text element
                    result += child.nodeValue;
                }
            }
            result += "</" + nodeName + ">";
        } else {
            result += "/>";
        }

        return result;
    },

    /** PrivateVariable: _requestId
     *  _Private_ variable that keeps track of the request ids for
     *  connections.
     */
    _requestId: 0,

    /** PrivateVariable: Strophe.connectionPlugins
     *  _Private_ variable Used to store plugin names that need
     *  initialization on Strophe.Connection construction.
     */
    _connectionPlugins: {},

    /** Function: addConnectionPlugin
     *  Extends the Strophe.Connection object with the given plugin.
     *
     *  Paramaters:
     *    (String) name - The name of the extension.
     *    (Object) ptype - The plugin's prototype.
     */
    addConnectionPlugin: function (name, ptype)
    {
        Strophe._connectionPlugins[name] = ptype;
    }
};

/** Class: Strophe.Builder
 *  XML DOM builder.
 *
 *  This object provides an interface similar to JQuery but for building
 *  DOM element easily and rapidly.  All the functions except for toString()
 *  and tree() return the object, so calls can be chained.  Here's an
 *  example using the $iq() builder helper.
 *  > $iq({to: 'you', from: 'me', type: 'get', id: '1'})
 *  >     .c('query', {xmlns: 'strophe:example'})
 *  >     .c('example')
 *  >     .toString()
 *  The above generates this XML fragment
 *  > <iq to='you' from='me' type='get' id='1'>
 *  >   <query xmlns='strophe:example'>
 *  >     <example/>
 *  >   </query>
 *  > </iq>
 *  The corresponding DOM manipulations to get a similar fragment would be
 *  a lot more tedious and probably involve several helper variables.
 *
 *  Since adding children makes new operations operate on the child, up()
 *  is provided to traverse up the tree.  To add two children, do
 *  > builder.c('child1', ...).up().c('child2', ...)
 *  The next operation on the Builder will be relative to the second child.
 */

/** Constructor: Strophe.Builder
 *  Create a Strophe.Builder object.
 *
 *  The attributes should be passed in object notation.  For example
 *  > var b = new Builder('message', {to: 'you', from: 'me'});
 *  or
 *  > var b = new Builder('messsage', {'xml:lang': 'en'});
 *
 *  Parameters:
 *    (String) name - The name of the root element.
 *    (Object) attrs - The attributes for the root element in object notation.
 *
 *  Returns:
 *    A new Strophe.Builder.
 */
Strophe.Builder = function (name, attrs)
{
    // Set correct namespace for jabber:client elements
    if (name == "presence" || name == "message" || name == "iq") {
        if (attrs && !attrs.xmlns) {
            attrs.xmlns = Strophe.NS.CLIENT;
        } else if (!attrs) {
            attrs = {xmlns: Strophe.NS.CLIENT};
        }
    }

    // Holds the tree being built.
    this.nodeTree = Strophe.xmlElement(name, attrs);

    // Points to the current operation node.
    this.node = this.nodeTree;
};

Strophe.Builder.prototype = {
    /** Function: tree
     *  Return the DOM tree.
     *
     *  This function returns the current DOM tree as an element object.  This
     *  is suitable for passing to functions like Strophe.Connection.send().
     *
     *  Returns:
     *    The DOM tree as a element object.
     */
    tree: function ()
    {
        return this.nodeTree;
    },

    /** Function: toString
     *  Serialize the DOM tree to a String.
     *
     *  This function returns a string serialization of the current DOM
     *  tree.  It is often used internally to pass data to a
     *  Strophe.Request object.
     *
     *  Returns:
     *    The serialized DOM tree in a String.
     */
    toString: function ()
    {
        return Strophe.serialize(this.nodeTree);
    },

    /** Function: up
     *  Make the current parent element the new current element.
     *
     *  This function is often used after c() to traverse back up the tree.
     *  For example, to add two children to the same element
     *  > builder.c('child1', {}).up().c('child2', {});
     *
     *  Returns:
     *    The Stophe.Builder object.
     */
    up: function ()
    {
        this.node = this.node.parentNode;
        return this;
    },

    /** Function: attrs
     *  Add or modify attributes of the current element.
     *
     *  The attributes should be passed in object notation.  This function
     *  does not move the current element pointer.
     *
     *  Parameters:
     *    (Object) moreattrs - The attributes to add/modify in object notation.
     *
     *  Returns:
     *    The Strophe.Builder object.
     */
    attrs: function (moreattrs)
    {
        for (var k in moreattrs) {
            if (moreattrs.hasOwnProperty(k)) {
                this.node.setAttribute(k, moreattrs[k]);
            }
        }
        return this;
    },

    /** Function: c
     *  Add a child to the current element and make it the new current
     *  element.
     *
     *  This function moves the current element pointer to the child.  If you
     *  need to add another child, it is necessary to use up() to go back
     *  to the parent in the tree.
     *
     *  Parameters:
     *    (String) name - The name of the child.
     *    (Object) attrs - The attributes of the child in object notation.
     *
     *  Returns:
     *    The Strophe.Builder object.
     */
    c: function (name, attrs)
    {
        var child = Strophe.xmlElement(name, attrs);
        this.node.appendChild(child);
        this.node = child;
        return this;
    },

    /** Function: cnode
     *  Add a child to the current element and make it the new current
     *  element.
     *
     *  This function is the same as c() except that instead of using a
     *  name and an attributes object to create the child it uses an
     *  existing DOM element object.
     *
     *  Parameters:
     *    (XMLElement) elem - A DOM element.
     *
     *  Returns:
     *    The Strophe.Builder object.
     */
    cnode: function (elem)
    {
        var xmlGen = Strophe.xmlGenerator();
        var newElem = xmlGen.importNode ? xmlGen.importNode(elem, true) : Strophe.copyElement(elem);
        this.node.appendChild(newElem);
        this.node = newElem;
        return this;
    },

    /** Function: t
     *  Add a child text element.
     *
     *  This *does not* make the child the new current element since there
     *  are no children of text elements.
     *
     *  Parameters:
     *    (String) text - The text data to append to the current element.
     *
     *  Returns:
     *    The Strophe.Builder object.
     */
    t: function (text)
    {
        var child = Strophe.xmlTextNode(text);
        this.node.appendChild(child);
        return this;
    }
};


/** PrivateClass: Strophe.Handler
 *  _Private_ helper class for managing stanza handlers.
 *
 *  A Strophe.Handler encapsulates a user provided callback function to be
 *  executed when matching stanzas are received by the connection.
 *  Handlers can be either one-off or persistant depending on their
 *  return value. Returning true will cause a Handler to remain active, and
 *  returning false will remove the Handler.
 *
 *  Users will not use Strophe.Handler objects directly, but instead they
 *  will use Strophe.Connection.addHandler() and
 *  Strophe.Connection.deleteHandler().
 */

/** PrivateConstructor: Strophe.Handler
 *  Create and initialize a new Strophe.Handler.
 *
 *  Parameters:
 *    (Function) handler - A function to be executed when the handler is run.
 *    (String) ns - The namespace to match.
 *    (String) name - The element name to match.
 *    (String) type - The element type to match.
 *    (String) id - The element id attribute to match.
 *    (String) from - The element from attribute to match.
 *    (Object) options - Handler options
 *
 *  Returns:
 *    A new Strophe.Handler object.
 */
Strophe.Handler = function (handler, ns, name, type, id, from, options)
{
    this.handler = handler;
    this.ns = ns;
    this.name = name;
    this.type = type;
    this.id = id;
    this.options = options || {matchbare: false};

    // default matchBare to false if undefined
    if (!this.options.matchBare) {
        this.options.matchBare = false;
    }

    if (this.options.matchBare) {
        this.from = from ? Strophe.getBareJidFromJid(from) : null;
    } else {
        this.from = from;
    }

    // whether the handler is a user handler or a system handler
    this.user = true;
};

Strophe.Handler.prototype = {
    /** PrivateFunction: isMatch
     *  Tests if a stanza matches the Strophe.Handler.
     *
     *  Parameters:
     *    (XMLElement) elem - The XML element to test.
     *
     *  Returns:
     *    true if the stanza matches and false otherwise.
     */
    isMatch: function (elem)
    {
        var nsMatch;
        var from = null;

        if (this.options.matchBare) {
            from = Strophe.getBareJidFromJid(elem.getAttribute('from'));
        } else {
            from = elem.getAttribute('from');
        }

        nsMatch = false;
        if (!this.ns) {
            nsMatch = true;
        } else {
            var that = this;
            Strophe.forEachChild(elem, null, function (elem) {
                if (elem.getAttribute("xmlns") == that.ns) {
                    nsMatch = true;
                }
            });

            nsMatch = nsMatch || elem.getAttribute("xmlns") == this.ns;
        }

        if (nsMatch &&
            (!this.name || Strophe.isTagEqual(elem, this.name)) &&
            (!this.type || elem.getAttribute("type") == this.type) &&
            (!this.id || elem.getAttribute("id") == this.id) &&
            (!this.from || from == this.from)) {
                return true;
        }

        return false;
    },

    /** PrivateFunction: run
     *  Run the callback on a matching stanza.
     *
     *  Parameters:
     *    (XMLElement) elem - The DOM element that triggered the
     *      Strophe.Handler.
     *
     *  Returns:
     *    A boolean indicating if the handler should remain active.
     */
    run: function (elem)
    {
        var result = null;
        // try {
            result = this.handler(elem);
        // } catch (e) {
        //     if (e.sourceURL) {
        //         Strophe.fatal("error: " + this.handler +
        //                       " " + e.sourceURL + ":" +
        //                       e.line + " - " + e.name + ": " + e.message);
        //     } else if (e.fileName) {
        //         if (typeof(console) != "undefined") {
        //             console.trace();
        //             console.error(this.handler, " - error - ", e, e.message);
        //         }
        //         Strophe.fatal("error: " + this.handler + " " +
        //                       e.fileName + ":" + e.lineNumber + " - " +
        //                       e.name + ": " + e.message);
        //     } else {
        //         Strophe.fatal("error: " + this.handler);
        //     }
        // 
        //     throw e;
        // }

        return result;
    },

    /** PrivateFunction: toString
     *  Get a String representation of the Strophe.Handler object.
     *
     *  Returns:
     *    A String.
     */
    toString: function ()
    {
        return "{Handler: " + this.handler + "(" + this.name + "," +
            this.id + "," + this.ns + ")}";
    }
};

/** PrivateClass: Strophe.TimedHandler
 *  _Private_ helper class for managing timed handlers.
 *
 *  A Strophe.TimedHandler encapsulates a user provided callback that
 *  should be called after a certain period of time or at regular
 *  intervals.  The return value of the callback determines whether the
 *  Strophe.TimedHandler will continue to fire.
 *
 *  Users will not use Strophe.TimedHandler objects directly, but instead
 *  they will use Strophe.Connection.addTimedHandler() and
 *  Strophe.Connection.deleteTimedHandler().
 */

/** PrivateConstructor: Strophe.TimedHandler
 *  Create and initialize a new Strophe.TimedHandler object.
 *
 *  Parameters:
 *    (Integer) period - The number of milliseconds to wait before the
 *      handler is called.
 *    (Function) handler - The callback to run when the handler fires.  This
 *      function should take no arguments.
 *
 *  Returns:
 *    A new Strophe.TimedHandler object.
 */
Strophe.TimedHandler = function (period, handler)
{
    this.period = period;
    this.handler = handler;

    this.lastCalled = new Date().getTime();
    this.user = true;
};

Strophe.TimedHandler.prototype = {
    /** PrivateFunction: run
     *  Run the callback for the Strophe.TimedHandler.
     *
     *  Returns:
     *    true if the Strophe.TimedHandler should be called again, and false
     *      otherwise.
     */
    run: function ()
    {
        this.lastCalled = new Date().getTime();
        return this.handler();
    },

    /** PrivateFunction: reset
     *  Reset the last called time for the Strophe.TimedHandler.
     */
    reset: function ()
    {
        this.lastCalled = new Date().getTime();
    },

    /** PrivateFunction: toString
     *  Get a string representation of the Strophe.TimedHandler object.
     *
     *  Returns:
     *    The string representation.
     */
    toString: function ()
    {
        return "{TimedHandler: " + this.handler + "(" + this.period +")}";
    }
};


/** Class: Strophe.Connection
 *  XMPP Connection manager.
 *
 *  Thie class is the main part of Strophe.  It manages the connection
 *  to an XMPP server and dispatches events to the user callbacks as
 *  data arrives.  It supports SASL PLAIN, SASL DIGEST-MD5, and legacy
 *  authentication.
 *  For the connection to the XMPP server it uses and underlying protocol
 *  supplied when starting the connection.
 *
 *  After creating a Strophe.Connection object, the user will typically
 *  call connect() with a user supplied callback to handle connection level
 *  events like authentication failure, disconnection, or connection
 *  complete.
 *
 *  The user will also have several event handlers defined by using
 *  addHandler() and addTimedHandler().  These will allow the user code to
 *  respond to interesting stanzas or do something periodically with the
 *  connection.  These handlers will be active once authentication is
 *  finished.
 *
 *  To send data to the connection, use send().
 */

/** Constructor: Strophe.Connection
 *  Create and initialize a Strophe.Connection object.
 *
 *  Parameters:
 *    (Object) params - An Object with a new protocl object.
 *    For Bosh, connection = new Strophe.Connection({protocol: new Strophe.Bosh(BOSH_SERVICE)});
 *    Currently supported protocols : Bosh, Websocket.
 * 	  Coming : XMPP socket (for use in Node.js), Socket.io...
 *
 *  Returns:
 *    A new Strophe.Connection object.
 */
Strophe.Connection = function (service)
{
	if (service.protocol) {
		this.protocol = service.protocol;
	}
	else {
		console.log("Warning : this syntax will be deprecated to leave room for othe protocols. Please use new Strophe.Connection({proto : new Strophe.Bosh(BOSH_SERVICE)})" )
	    /* The path to the httpbind service. */
	    this.protocol = new Strophe.Bosh(service);
	}

	/* The connected JID. */
    this.jid = "";
    /* stream:features */
    this.features = null;

    // SASL
    this.do_session = false;
    this.do_bind = false;

    // handler lists
    this.timedHandlers = [];
    this.handlers = [];
    this.removeTimeds = [];
    this.removeHandlers = [];
    this.addTimeds = [];
    this.addHandlers = [];

    this.authenticated = false;
    this.disconnecting = false;
    this.connected = false;
	this.status = null;
	this._stanzas = [];

    this.errors = 0;

    this._uniqueId = Math.round(Math.random() * 10000);

    this._sasl_success_handler = null;
    this._sasl_failure_handler = null;
    this._sasl_challenge_handler = null;
    this._throttle_stanzas_handler = null;

	this.max_stanzas_per_second = 10; // Traffic shaper at 10 stanzas per second, max.

    // initialize plugins
    for (var k in Strophe._connectionPlugins) {
        if (Strophe._connectionPlugins.hasOwnProperty(k)) {
	    var ptype = Strophe._connectionPlugins[k];
            // jslint complaints about the below line, but this is fine
            var F = function () {};
            F.prototype = ptype;
            this[k] = new F();
	    this[k].init(this);
        }
    }
};

Strophe.Connection.prototype = {
    /** Function: reset
     *  Reset the connection.
     *
     *  This function should be called after a connection is disconnected
     *  before that connection is reused.
     */
    reset: function ()
    {
        // SASL
        this.do_session = false;
        this.do_bind = false;

        // handler lists
        this.timedHandlers = [];
        this.handlers = [];
        this.removeTimeds = [];
        this.removeHandlers = [];
        this.addTimeds = [];
        this.addHandlers = [];

        this.authenticated = false;
        this.disconnecting = false;
        this.connected = false;
		this.status = null;

        this.errors = 0;

        this._uniqueId = Math.round(Math.random()*10000);
    },

    /** Function: getUniqueId
     *  Generate a unique ID for use in <iq/> elements.
     *
     *  All <iq/> stanzas are required to have unique id attributes.  This
     *  function makes creating these easy.  Each connection instance has
     *  a counter which starts from zero, and the value of this counter
     *  plus a colon followed by the suffix becomes the unique id. If no
     *  suffix is supplied, the counter is used as the unique id.
     *
     *  Suffixes are used to make debugging easier when reading the stream
     *  data, and their use is recommended.  The counter resets to 0 for
     *  every new connection for the same reason.  For connections to the
     *  same server that authenticate the same way, all the ids should be
     *  the same, which makes it easy to see changes.  This is useful for
     *  automated testing as well.
     *
     *  Parameters:
     *    (String) suffix - A optional suffix to append to the id.
     *
     *  Returns:
     *    A unique string to be used for the id attribute.
     */
    getUniqueId: function (suffix)
    {
        if (typeof(suffix) == "string" || typeof(suffix) == "number") {
            return ++this._uniqueId + ":" + suffix;
        } else {
            return ++this._uniqueId + "";
        }
    },

    /** Function: connect
     *  Starts the connection process.
     *
     *  As the connection process proceeds, the user supplied callback will
     *  be triggered multiple times with status updates.  The callback
     *  should take two arguments - the status code and the error condition.
     *
     *  The status code will be one of the values in the Strophe.Status
     *  constants.  The error condition will be one of the conditions
     *  defined in RFC 3920 or the condition 'strophe-parsererror'.
     *
     *  Please see XEP 124 for a more detailed explanation of the optional
     *  parameters below.
     *
     *  Parameters:
     *    (String) jid - The user's JID.  This may be a bare JID,
     *      or a full JID.  If a node is not supplied, SASL ANONYMOUS
     *      authentication will be attempted.
     *    (String) pass - The user's password.
     *    (Function) callback The connect callback function.
     *    (Integer) wait - The optional HTTPBIND wait value.  This is the
     *      time the server will wait before returning an empty result for
     *      a request.  The default setting of 60 seconds is recommended.
     *      Other settings will require tweaks to the Strophe.TIMEOUT value.
     *    (Integer) hold - The optional HTTPBIND hold value.  This is the
     *      number of connections the server will hold at one time.  This
     *      should almost always be set to 1 (the default).
     */
    connect: function (jid, pass, callback, wait, hold)
    {
		this.changeConnectStatus(Strophe.Status.CONNECTING, null);
        this.jid = jid;
        this.pass = pass;
        this.connect_callback = callback;
        this.disconnecting = false;
        this.connected = false;
        this.authenticated = false;
        this.errors = 0;

        // parse jid for domain and resource
        this.domain = Strophe.getDomainFromJid(this.jid);
		// Let's start the throttler.
		this._throttleStanzas();
		// Let's go.
		this.protocol.connect(this);
    },

	/** Function start
	 * This function initializes the stream
	 * <stream:stream
       to='example.com'
       xmlns='jabber:client'
       xmlns:stream='http://etherx.jabber.org/streams'
       version='1.0'>
	
	 */
	start: function () {
		this.send($build('stream:stream', {
			to: this.domain,
			'xmlns': 'jabber:client',
			'xmlns:stream': 'http://etherx.jabber.org/streams',
			'version': '1.0'}).tree());
	},

    /** Function: xmlInput
     *  User overrideable function that receives XML data coming into the
     *  connection.
     *
     *  The default function does nothing.  User code can override this with
     *  > Strophe.Connection.xmlInput = function (elem) {
     *  >   (user code)
     *  > };
     *
     *  Parameters:
     *    (XMLElement) elem - The XML data received by the connection.
     */
    xmlInput: function (elem)
    {
        return;
    },

    /** Function: xmlOutput
     *  User overrideable function that receives XML data sent to the
     *  connection.
     *
     *  The default function does nothing.  User code can override this with
     *  > Strophe.Connection.xmlOutput = function (elem) {
     *  >   (user code)
     *  > };
     *
     *  Parameters:
     *    (XMLElement) elem - The XMLdata sent by the connection.
     */
    xmlOutput: function (elem)
    {
        return;
    },

    /** Function: rawInput
     *  User overrideable function that receives raw data coming into the
     *  connection.
     *
     *  The default function does nothing.  User code can override this with
     *  > Strophe.Connection.rawInput = function (data) {
     *  >   (user code)
     *  > };
     *
     *  Parameters:
     *    (String) data - The data received by the connection.
     */
    rawInput: function (data)
    {
        return;
    },

    /** Function: rawOutput
     *  User overrideable function that receives raw data sent to the
     *  connection.
     *
     *  The default function does nothing.  User code can override this with
     *  > Strophe.Connection.rawOutput = function (data) {
     *  >   (user code)
     *  > };
     *
     *  Parameters:
     *    (String) data - The data sent by the connection.
     */
    rawOutput: function (data)
    {
        return;
    },

    /** Function: send
     *  Send a stanza.
     *
     *  This function is called to push data to the server through the 
	 *  protocol object.
     *
     *  Parameters:
     *    (XMLElement |
     *     [XMLElement] |
     *     Strophe.Builder) elem - The stanza to send.
     */
    send: function (elem)
    {
        if (elem === null) { return ; }
        if (typeof(elem.sort) === "function") {
            for (var i = 0; i < elem.length; i++) {
				if (this._ensureDOMElement(elem[i])) {
					this._stanzas.push(elem[i]);
				}
            }
        } else if (typeof(elem.tree) === "function") {
			if (this._ensureDOMElement(elem.tree())) {
				this._stanzas.push(elem.tree());
				
			}
        } else {
			if (this._ensureDOMElement(elem)) {
				this._stanzas.push(elem);
			}
        }
    },

    /** Function: sendIQ
     *  Helper function to send IQ stanzas.
     *
     *  Parameters:
     *    (XMLElement) elem - The stanza to send.
     *    (Function) callback - The callback function for a successful request.
     *    (Function) errback - The callback function for a failed or timed
     *      out request.  On timeout, the stanza will be null.
     *    (Integer) timeout - The time specified in milliseconds for a
     *      timeout to occur.
     *
     *  Returns:
     *    The id used to send the IQ.
    */
    sendIQ: function (elem, callback, errback, timeout) {
        var timeoutHandler = null;
        var that = this;

        if (typeof(elem.tree) === "function") {
            elem = elem.tree();
        }
	var id = elem.getAttribute('id');

	// inject id if not found
	if (!id) {
	    id = this.getUniqueId("sendIQ");
	    elem.setAttribute("id", id);
	}

	var handler = this.addHandler(function (stanza) {
	    // remove timeout handler if there is one
            if (timeoutHandler) {
                that.deleteTimedHandler(timeoutHandler);
            }

            var iqtype = stanza.getAttribute('type');
	    if (iqtype == 'result') {
		if (callback) {
                    callback(stanza);
                }
	    } else if (iqtype == 'error') {
		if (errback) {
                    errback(stanza);
                }
	    } else {
                throw {
                    name: "StropheError",
                    message: "Got bad IQ type of " + iqtype
                };
            }
	}, null, 'iq', null, id);

	// if timeout specified, setup timeout handler.
	if (timeout) {
	    timeoutHandler = this.addTimedHandler(timeout, function () {
                // get rid of normal handler
                that.deleteHandler(handler);

	        // call errback on timeout with null stanza
                if (errback) {
		    errback(null);
                }
		return false;
	    });
	}

	this.send(elem);

	return id;
    },


    /** PrivateFunction: _ensureDOMElement
     *  Ensures that the data is a DOMElement.
     */
	_ensureDOMElement: function (element) {
		if (element === null || !element.tagName || !element.childNodes) {
			throw {
				name: "StropheError",
				message: "Cannot queue non-DOMElement."
			};
		}
		return true;
	},


    /** Function: addTimedHandler
     *  Add a timed handler to the connection.
     *
     *  This function adds a timed handler.  The provided handler will
     *  be called every period milliseconds until it returns false,
     *  the connection is terminated, or the handler is removed.  Handlers
     *  that wish to continue being invoked should return true.
     *
     *  Because of method binding it is necessary to save the result of
     *  this function if you wish to remove a handler with
     *  deleteTimedHandler().
     *
     *  Note that user handlers are not active until authentication is
     *  successful.
     *
     *  Parameters:
     *    (Integer) period - The period of the handler.
     *    (Function) handler - The callback function.
     *
     *  Returns:
     *    A reference to the handler that can be used to remove it.
     */
    addTimedHandler: function (period, handler)
    {
        var thand = new Strophe.TimedHandler(period, handler);
        this.addTimeds.push(thand);
        return thand;
    },

    /** Function: deleteTimedHandler
     *  Delete a timed handler for a connection.
     *
     *  This function removes a timed handler from the connection.  The
     *  handRef parameter is *not* the function passed to addTimedHandler(),
     *  but is the reference returned from addTimedHandler().
     *
     *  Parameters:
     *    (Strophe.TimedHandler) handRef - The handler reference.
     */
    deleteTimedHandler: function (handRef)
    {
        // this must be done in the Idle loop so that we don't change
        // the handlers during iteration
        this.removeTimeds.push(handRef);
    },

    /** Function: addHandler
     *  Add a stanza handler for the connection.
     *
     *  This function adds a stanza handler to the connection.  The
     *  handler callback will be called for any stanza that matches
     *  the parameters.  Note that if multiple parameters are supplied,
     *  they must all match for the handler to be invoked.
     *
     *  The handler will receive the stanza that triggered it as its argument.
     *  The handler should return true if it is to be invoked again;
     *  returning false will remove the handler after it returns.
     *
     *  As a convenience, the ns parameters applies to the top level element
     *  and also any of its immediate children.  This is primarily to make
     *  matching /iq/query elements easy.
     *
     *  The options argument contains handler matching flags that affect how
     *  matches are determined. Currently the only flag is matchBare (a
     *  boolean). When matchBare is true, the from parameter and the from
     *  attribute on the stanza will be matched as bare JIDs instead of
     *  full JIDs. To use this, pass {matchBare: true} as the value of
     *  options. The default value for matchBare is false.
     *
     *  The return value should be saved if you wish to remove the handler
     *  with deleteHandler().
     *
     *  Parameters:
     *    (Function) handler - The user callback.
     *    (String) ns - The namespace to match.
     *    (String) name - The stanza name to match.
     *    (String) type - The stanza type attribute to match.
     *    (String) id - The stanza id attribute to match.
     *    (String) from - The stanza from attribute to match.
     *    (String) options - The handler options
     *
     *  Returns:
     *    A reference to the handler that can be used to remove it.
     */
    addHandler: function (handler, ns, name, type, id, from, options)
    {
        var hand = new Strophe.Handler(handler, ns, name, type, id, from, options);
        this.addHandlers.push(hand);
        return hand;
    },

    /** Function: deleteHandler
     *  Delete a stanza handler for a connection.
     *
     *  This function removes a stanza handler from the connection.  The
     *  handRef parameter is *not* the function passed to addHandler(),
     *  but is the reference returned from addHandler().
     *
     *  Parameters:
     *    (Strophe.Handler) handRef - The handler reference.
     */
    deleteHandler: function (handRef) {
        // this must be done in the Idle loop so that we don't change
        // the handlers during iteration
        this.removeHandlers.push(handRef);
    },

    /** Function: disconnect
     *  Start the graceful disconnection process.
     *
     *  This function starts the disconnection process.  This process starts
     *  by sending unavailable presence.  
	 *  A timeout handler makes sure that disconnection happens.
     *
     *  The user supplied connection callback will be notified of the
     *  progress as this process happens.
     *
     *  Parameters:
     *    (String) reason - The reason the disconnect is occuring.
     */
    disconnect: function (reason)
    {
        Strophe.info("Disconnect was called because: " + reason);
        this.changeConnectStatus(Strophe.Status.DISCONNECTING, reason);
        if (this.connected) {
	        this.disconnecting = true;
            // setup timeout handler
            this._disconnectTimeout = this._addSysTimedHandler(3000, this._onDisconnectTimeout.bind(this));
		 	if (this.authenticated) {
	            this.send($pres({xmlns: Strophe.NS.CLIENT, type: 'unavailable'}));
	        }
			this.protocol.disconnect();
        }
    },

    /** PrivateFunction: changeConnectStatus
     *  _Private_ helper function that makes sure plugins and the user's
     *  callback are notified of connection status changes.
     *
     *  Parameters:
     *    (Integer) status - the new connection status, one of the values
     *      in Strophe.Status
     *    (String) condition - the error condition or null
     */
    changeConnectStatus: function (status, condition)
    {
		this.status = status;
        // notify all plugins listening for status changes
        for (var k in Strophe._connectionPlugins) {
            if (Strophe._connectionPlugins.hasOwnProperty(k)) {
                var plugin = this[k];
                if (plugin.statusChanged) {
                    try {
                        plugin.statusChanged(status, condition);
                    } catch (err) {
                        Strophe.error("" + k + " plugin caused an exception " +
                                      "changing status: " + err);
                    }
                }
            }
        }

        // notify the user's callback
        if (this.connect_callback) {
            // try {
                this.connect_callback(status, condition);
            // } catch (e) {
            //     Strophe.error("User connection callback caused an " +
            //                   "exception: " + e);
            // }
        }
    },

    /** PrivateFunction: _doDisconnect
     *  _Private_ function to disconnect.
     *
     *  This is the last piece of the disconnection logic in the XMPP connection.  
	 *  This resets the connection and alerts the user's connection callback.
     */
    _doDisconnect: function ()
    {
        // delete handlers
        this.handlers = [];
        this.timedHandlers = [];
        this.removeTimeds = [];
        this.removeHandlers = [];
        this.addTimeds = [];
        this.addHandlers = [];

        this.connected = false;
        this.protocol.finish();
        // tell the parent we disconnected
        this.changeConnectStatus(Strophe.Status.DISCONNECTED, null);
    },

    /** Function: receiveData
     *  Handler to processes incoming stanza from the protocol layer. It should _not_ be called by the user.
     *
     *  Parameters:
     *    (Strophe.Request) elem - The received stanza
     */
    receiveData: function (elem) {
		var do_sasl_plain = false;
		var do_sasl_digest_md5 = false;
		var do_sasl_anonymous = false;
		
	    this.connected = true; // We're connected since we got data
        if (elem === null) { return; }

        this.xmlInput(elem);

        // remove handlers scheduled for deletion
        var i, hand;
        while (this.removeHandlers.length > 0) {
            hand = this.removeHandlers.pop();
            i = this.handlers.indexOf(hand);
            if (i >= 0) {
                this.handlers.splice(i, 1);
            }
        }

        // add handlers scheduled for addition
        while (this.addHandlers.length > 0) {
            this.handlers.push(this.addHandlers.pop());
        }

		// send each incoming stanza through the handler chain
		var i, newList;
		// process handlers
        newList = this.handlers;
		this.handlers = [];
		for (i = 0; i < newList.length; i++) {
			var hand = newList[i];
			if (hand.isMatch(elem) && (this.authenticated || !hand.user)) {
				if (hand.run(elem)) {
					this.handlers.push(hand);
				}
			} else {
				this.handlers.push(hand);
            }
		}

		// Now, the connection stuff. Technically, these should probably be handlers too, but it seems that they're not currently.
		var mechanisms = elem.getElementsByTagName("mechanism");
        var i, mech, auth_str, hashed_auth_str;
        if (mechanisms.length > 0) {
            for (i = 0; i < mechanisms.length; i++) {
                mech = Strophe.getText(mechanisms[i]);
                if (mech == 'DIGEST-MD5') {
                    do_sasl_digest_md5 = true;
                } else if (mech == 'PLAIN') {
                    do_sasl_plain = true;
                } else if (mech == 'ANONYMOUS') {
                    do_sasl_anonymous = true;
                }
            }
        } 


		if (this.status == Strophe.Status.CONNECTING) {
			this.changeConnectStatus(Strophe.Status.AUTHENTICATING, null);
			if (Strophe.getNodeFromJid(this.jid) === null && do_sasl_anonymous) {
	            this._sasl_success_handler = this._addSysHandler(this._sasl_success_cb.bind(this), null, "success", null, null);
	            this._sasl_failure_handler = this._addSysHandler(this._sasl_failure_cb.bind(this), null, "failure", null, null);

	            this.send($build("auth", {
	                xmlns: Strophe.NS.SASL,
	                mechanism: "ANONYMOUS"
	            }).tree());

	        } else if (Strophe.getNodeFromJid(this.jid) === null) {
	            // we don't have a node, which is required for non-anonymous
	            // client connections
	            this.changeConnectStatus(Strophe.Status.CONNFAIL, 'x-strophe-bad-non-anon-jid');
	            this.disconnect();
	        } else if (do_sasl_digest_md5) {
	            this._sasl_challenge_handler = this._addSysHandler(this._sasl_challenge1_cb.bind(this), null, "challenge", null, null);
	            this._sasl_failure_handler = this._addSysHandler(this._sasl_failure_cb.bind(this), null, "failure", null, null);

	            this.send($build("auth", {
	                xmlns: Strophe.NS.SASL,
	                mechanism: "DIGEST-MD5"
	            }).tree());
	        } else if (do_sasl_plain) {
	            // Build the plain auth string (barejid null
	            // username null password) and base 64 encoded.
	            auth_str = Strophe.getBareJidFromJid(this.jid);
	            auth_str = auth_str + "\u0000";
	            auth_str = auth_str + Strophe.getNodeFromJid(this.jid);
	            auth_str = auth_str + "\u0000";
	            auth_str = auth_str + this.pass;

	            this._sasl_success_handler = this._addSysHandler(this._sasl_success_cb.bind(this), null, "success", null, null);
	            this._sasl_failure_handler = this._addSysHandler(this._sasl_failure_cb.bind(this), null, "failure", null, null);

	            hashed_auth_str = Base64.encode(auth_str);
	            this.send($build("auth", {
	                xmlns: Strophe.NS.SASL,
	                mechanism: "PLAIN"
	            }).t(hashed_auth_str).tree());
	        } else {
	            this._addSysHandler(this._auth1_cb.bind(this), null, null, null, "_auth_1");

	            this.send($iq({
	                type: "get",
	                to: this.domain,
	                id: "_auth_1"
	            }).c("query", {
	                xmlns: Strophe.NS.AUTH
	            }).c("username", {}).t(Strophe.getNodeFromJid(this.jid)).tree());
	        }
		}
    },

    /** PrivateFunction: _sasl_challenge1_cb
     *  _Private_ handler for DIGEST-MD5 SASL authentication.
     *
     *  Parameters:
     *    (XMLElement) elem - The challenge stanza.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _sasl_challenge1_cb: function (elem)
    {
        var attribMatch = /([a-z]+)=("[^"]+"|[^,"]+)(?:,|$)/;

        var challenge = Base64.decode(Strophe.getText(elem));
        var cnonce = MD5.hexdigest(Math.random() * 1234567890);
        var realm = "";
        var host = null;
        var nonce = "";
        var qop = "";
        var matches;

        // remove unneeded handlers
        this.deleteHandler(this._sasl_failure_handler);

        while (challenge.match(attribMatch)) {
            matches = challenge.match(attribMatch);
            challenge = challenge.replace(matches[0], "");
            matches[2] = matches[2].replace(/^"(.+)"$/, "$1");
            switch (matches[1]) {
            case "realm":
                realm = matches[2];
                break;
            case "nonce":
                nonce = matches[2];
                break;
            case "qop":
                qop = matches[2];
                break;
            case "host":
                host = matches[2];
                break;
            }
        }

        var digest_uri = "xmpp/" + this.domain;
        if (host !== null) {
            digest_uri = digest_uri + "/" + host;
        }

        var A1 = MD5.hash(Strophe.getNodeFromJid(this.jid) +
                          ":" + realm + ":" + this.pass) +
            ":" + nonce + ":" + cnonce;
        var A2 = 'AUTHENTICATE:' + digest_uri;

        var responseText = "";
        responseText += 'username=' +
            this._quote(Strophe.getNodeFromJid(this.jid)) + ',';
        responseText += 'realm=' + this._quote(realm) + ',';
        responseText += 'nonce=' + this._quote(nonce) + ',';
        responseText += 'cnonce=' + this._quote(cnonce) + ',';
        responseText += 'nc="00000001",';
        responseText += 'qop="auth",';
        responseText += 'digest-uri=' + this._quote(digest_uri) + ',';
        responseText += 'response=' + this._quote(
            MD5.hexdigest(MD5.hexdigest(A1) + ":" +
                          nonce + ":00000001:" +
                          cnonce + ":auth:" +
                          MD5.hexdigest(A2))) + ',';
        responseText += 'charset="utf-8"';

        this._sasl_challenge_handler = this._addSysHandler(this._sasl_challenge2_cb.bind(this), null, "challenge", null, null);
        this._sasl_success_handler = this._addSysHandler(this._sasl_success_cb.bind(this), null, "success", null, null);
        this._sasl_failure_handler = this._addSysHandler(this._sasl_failure_cb.bind(this), null, "failure", null, null);

        this.send($build('response', {
            xmlns: Strophe.NS.SASL
        }).t(Base64.encode(responseText)).tree());

        return false;
    },

    /** PrivateFunction: _quote
     *  _Private_ utility function to backslash escape and quote strings.
     *
     *  Parameters:
     *    (String) str - The string to be quoted.
     *
     *  Returns:
     *    quoted string
     */
    _quote: function (str)
    {
        return '"' + str.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
        //" end string workaround for emacs
    },


    /** PrivateFunction: _sasl_challenge2_cb
     *  _Private_ handler for second step of DIGEST-MD5 SASL authentication.
     *
     *  Parameters:
     *    (XMLElement) elem - The challenge stanza.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _sasl_challenge2_cb: function (elem)
    {
        // remove unneeded handlers
        this.deleteHandler(this._sasl_success_handler);
        this.deleteHandler(this._sasl_failure_handler);

        this._sasl_success_handler = this._addSysHandler(this._sasl_success_cb.bind(this), null, "success", null, null);
        this._sasl_failure_handler = this._addSysHandler(this._sasl_failure_cb.bind(this), null, "failure", null, null);

        this.send($build('response', {xmlns: Strophe.NS.SASL}).tree());
        return false;
    },

    /** PrivateFunction: _auth1_cb
     *  _Private_ handler for legacy authentication.
     *
     *  This handler is called in response to the initial <iq type='get'/>
     *  for legacy authentication.  It builds an authentication <iq/> and
     *  sends it, creating a handler (calling back to _auth2_cb()) to
     *  handle the result
     *
     *  Parameters:
     *    (XMLElement) elem - The stanza that triggered the callback.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _auth1_cb: function (elem)
    {
        // build plaintext auth iq
        var iq = $iq({type: "set", id: "_auth_2"})
            .c('query', {xmlns: Strophe.NS.AUTH})
            .c('username', {}).t(Strophe.getNodeFromJid(this.jid))
            .up()
            .c('password').t(this.pass);

        if (!Strophe.getResourceFromJid(this.jid)) {
            // since the user has not supplied a resource, we pick
            // a default one here.  unlike other auth methods, the server
            // cannot do this for us.
            this.jid = Strophe.getBareJidFromJid(this.jid) + '/strophe';
        }
        iq.up().c('resource', {}).t(Strophe.getResourceFromJid(this.jid));

        this._addSysHandler(this._auth2_cb.bind(this), null,
                            null, null, "_auth_2");

        this.send(iq.tree());

        return false;
    },

    /** PrivateFunction: _sasl_success_cb
     *  _Private_ handler for succesful SASL authentication.
     *
     *  Parameters:
     *    (XMLElement) elem - The matching stanza.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _sasl_success_cb: function (elem)
    {
        Strophe.info("SASL authentication succeeded.");

        // remove old handlers
        this.deleteHandler(this._sasl_failure_handler);
        this._sasl_failure_handler = null;
        if (this._sasl_challenge_handler) {
            this.deleteHandler(this._sasl_challenge_handler);
            this._sasl_challenge_handler = null;
        }

        this._addSysHandler(this._sasl_auth1_cb.bind(this), null, "stream:features", null, null);

		
        // we must send an xmpp:restart now
		this.protocol.restart();
        
        return false;
    },

    /** PrivateFunction: _sasl_auth1_cb
     *  _Private_ handler to start stream binding.
     *
     *  Parameters:
     *    (XMLElement) elem - The matching stanza.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _sasl_auth1_cb: function (elem)
    {
        // save stream:features for future usage
        this.features = elem;

        var i, child;

        for (i = 0; i < elem.childNodes.length; i++) {
            child = elem.childNodes[i];
            if (child.nodeName == 'bind') {
                this.do_bind = true;
            }

            if (child.nodeName == 'session') {
                this.do_session = true;
            }
        }

        if (!this.do_bind) {
            this.changeConnectStatus(Strophe.Status.AUTHFAIL, null);
            return false;
        } else {
            this._addSysHandler(this._sasl_bind_cb.bind(this), null, null, null, "_bind_auth_2");

            var resource = Strophe.getResourceFromJid(this.jid);
            if (resource) {
                this.send($iq({type: "set", id: "_bind_auth_2"})
                          .c('bind', {xmlns: Strophe.NS.BIND})
                          .c('resource', {}).t(resource).tree());
            } else {
                this.send($iq({type: "set", id: "_bind_auth_2"})
                          .c('bind', {xmlns: Strophe.NS.BIND})
                          .tree());
            }
        }

        return false;
    },

    /** PrivateFunction: _sasl_bind_cb
     *  _Private_ handler for binding result and session start.
     *
     *  Parameters:
     *    (XMLElement) elem - The matching stanza.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _sasl_bind_cb: function (elem)
    {
        if (elem.getAttribute("type") == "error") {
            Strophe.info("SASL binding failed.");
            this.changeConnectStatus(Strophe.Status.AUTHFAIL, null);
            return false;
        }

        // TODO - need to grab errors
        var bind = elem.getElementsByTagName("bind");
        var jidNode;
        if (bind.length > 0) {
            // Grab jid
            jidNode = bind[0].getElementsByTagName("jid");
            if (jidNode.length > 0) {
                this.jid = Strophe.getText(jidNode[0]);

                if (this.do_session) {
                    this._addSysHandler(this._sasl_session_cb.bind(this),
                                        null, null, null, "_session_auth_2");

                    this.send($iq({type: "set", id: "_session_auth_2"})
                                  .c('session', {xmlns: Strophe.NS.SESSION})
                                  .tree());
                } else {
                    this.authenticated = true;
                    this.changeConnectStatus(Strophe.Status.CONNECTED, null);
                }
            }
        } else {
            Strophe.info("SASL binding failed.");
            this.changeConnectStatus(Strophe.Status.AUTHFAIL, null);
            return false;
        }
    },

    /** PrivateFunction: _sasl_session_cb
     *  _Private_ handler to finish successful SASL connection.
     *
     *  This sets Connection.authenticated to true on success, which
     *  starts the processing of user handlers.
     *
     *  Parameters:
     *    (XMLElement) elem - The matching stanza.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _sasl_session_cb: function (elem)
    {
        if (elem.getAttribute("type") == "result") {
            this.authenticated = true;
            this.changeConnectStatus(Strophe.Status.CONNECTED, null);
        } else if (elem.getAttribute("type") == "error") {
            Strophe.info("Session creation failed.");
            this.changeConnectStatus(Strophe.Status.AUTHFAIL, null);
            return false;
        }

        return false;
    },

    /** PrivateFunction: _sasl_failure_cb
     *  _Private_ handler for SASL authentication failure.
     *
     *  Parameters:
     *    (XMLElement) elem - The matching stanza.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _sasl_failure_cb: function (elem)
    {
        // delete unneeded handlers
        if (this._sasl_success_handler) {
            this.deleteHandler(this._sasl_success_handler);
            this._sasl_success_handler = null;
        }
        if (this._sasl_challenge_handler) {
            this.deleteHandler(this._sasl_challenge_handler);
            this._sasl_challenge_handler = null;
        }

        this._doDisconnect();
        this.changeConnectStatus(Strophe.Status.AUTHFAIL, null);
        return false;
    },

    /** PrivateFunction: _auth2_cb
     *  _Private_ handler to finish legacy authentication.
     *
     *  This handler is called when the result from the jabber:iq:auth
     *  <iq/> stanza is returned.
     *
     *  Parameters:
     *    (XMLElement) elem - The stanza that triggered the callback.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _auth2_cb: function (elem)
    {
        if (elem.getAttribute("type") == "result") {
            this.authenticated = true;
            this.changeConnectStatus(Strophe.Status.CONNECTED, null);
        } else if (elem.getAttribute("type") == "error") {
            this.changeConnectStatus(Strophe.Status.AUTHFAIL, null);
            this.disconnect();
        }

        return false;
    },

    /** PrivateFunction: _addSysTimedHandler
     *  _Private_ function to add a system level timed handler.
     *
     *  This function is used to add a Strophe.TimedHandler for the
     *  library code.  System timed handlers are allowed to run before
     *  authentication is complete.
     *
     *  Parameters:
     *    (Integer) period - The period of the handler.
     *    (Function) handler - The callback function.
     */
    _addSysTimedHandler: function (period, handler)
    {
        var thand = new Strophe.TimedHandler(period, handler);
        thand.user = false;
        this.addTimeds.push(thand);
        return thand;
    },

    /** PrivateFunction: _addSysHandler
     *  _Private_ function to add a system level stanza handler.
     *
     *  This function is used to add a Strophe.Handler for the
     *  library code.  System stanza handlers are allowed to run before
     *  authentication is complete.
     *
     *  Parameters:
     *    (Function) handler - The callback function.
     *    (String) ns - The namespace to match.
     *    (String) name - The stanza name to match.
     *    (String) type - The stanza type attribute to match.
     *    (String) id - The stanza id attribute to match.
     */
    _addSysHandler: function (handler, ns, name, type, id)
    {
        var hand = new Strophe.Handler(handler, ns, name, type, id);
        hand.user = false;
        this.addHandlers.push(hand);
        return hand;
    },

    /** PrivateFunction: _onDisconnectTimeout
     *  _Private_ timeout handler for handling non-graceful disconnection.
     *
     *  If the graceful disconnect process does not complete within the
     *  time allotted, this handler finishes the disconnect anyway.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _onDisconnectTimeout: function ()
    {
        Strophe.info("_onDisconnectTimeout was called");
        // actually disconnect
        this._doDisconnect();
        return false;
    },

	/** PrivateFunction: _throttleStanzas
	*  _Private_ function to throttle stanzas sent to the protocol.
	*
	*  Most servers will implement traffic shapers to ensure that a given client does 
	*  not consume too many resources.
	*  This function just picks stanza in the _stanzas FIFO and sends them to the 
	*  protocol layer. The protocol layer may also very well implement a specific 
	*  throttling, based on their needs.
	* 
	* 
	* 
	*/
	_throttleStanzas: function () {
		stanza = this._stanzas.shift();
		if (stanza) {
			if (this.protocol.send(stanza)) {
			    // Stanza was sent.
			}
			else {
			    // Stack it back up.
			    this._stanzas.unshift(stanza);
			}
		}
		this._throttle_stanzas_handler = setTimeout(this._throttleStanzas.bind(this), 100 * 1/this.max_stanzas_per_second); // 
	}

};

if (callback) {
    callback(Strophe, $build, $msg, $iq, $pres);
}

})(function () {
    window.Strophe = arguments[0];
    window.$build = arguments[1];
    window.$msg = arguments[2];
    window.$iq = arguments[3];
    window.$pres = arguments[4];
});


/* The Websocket Stuff */

if (typeof(DOMParser) == 'undefined') {
 DOMParser = function () {}
 DOMParser.prototype.parseFromString = function (str, contentType) {
  if (typeof(ActiveXObject) != 'undefined') {
   var xmldata = new ActiveXObject('MSXML.DomDocument');
   xmldata.async = false;
   xmldata.loadXML(str);
   return xmldata;
  } else if (typeof(XMLHttpRequest) != 'undefined') {
   var xmldata = new XMLHttpRequest;
   if (!contentType) {
    contentType = 'application/xml';
   }
   xmldata.open('GET', 'data:' + contentType + ';charset=utf-8,' + encodeURIComponent(str), false);
   if (xmldata.overrideMimeType) {
    xmldata.overrideMimeType(contentType);
   }
   xmldata.send(null);
   return xmldata.responseXML;
  }
 }
}

Strophe.Websocket = function (service)
{
	// Connection
	this._connection = null;
	this._service	= service;
	this._socket	= null;

	// Requests stack.
	this._requests = [];    
	this.connected = false
};

Strophe.Websocket.prototype = {
	
	/** Function connect 
	 *  Connects to the server using websockets.
	 *  It also assigns the connection to this proto
	 */
	connect: function (connection) {
		if (!this._socket) {
    	    Strophe.log("info", "Websocket connecting to " + this._service);
			this._connection 		= connection;
	        this._socket 			= new WebSocket(this._service);
		    this._socket.onopen     = this._onOpen.bind(this);
			this._socket.onerror 	= this._onError.bind(this);
		    this._socket.onclose 	= this._onClose.bind(this);
		    this._socket.onmessage 	= this._onMessage.bind(this);
		}
	},
	
	/** Function disconnect 
	 *  Disconnects from the server
	 */
	disconnect: function () {
		this._connection.xmlOutput(this._endStream());
		this._sendText(this._endStream());
		this._socket.close(); // Close the socket
	},

	/** Function finish 
	 *  Finishes the connection. It's the last step in the cleanup process.
	 */
	finish: function () {
	    this.connected = false;
		this._socket = null; // Makes sure we delete the socket.
	},
	
	/** Function send 
	 *  Sends messages
	 */
	send: function (msg) {
	    if (this._sendText(Strophe.serialize(msg))) {
    		this._connection.xmlOutput(msg);
	        return true;
	    }
	    else {
	        return false;
	    }
	},
	
	/** Function: restart
     *  Send an xmpp:restart stanza.
     */
	restart: function () {
		this._connection.xmlOutput(this._startStream());
		this._sendText(this._startStream());
	},
	
	/** PrivateFunction: _onError
     *  _Private_ function to handle websockets errors.
     *
     *  Parameters:
     *    () error - The websocket error.
     */
	_onError: function (error) {
		Strophe.log("error", "Websocket error " + error);
	},

	/** PrivateFunction: _onOpen
     *  _Private_ function to handle websockets connections.
     *
     */
	_onOpen: function () {
		Strophe.log("info", "Websocket open");
		this.connected = true;
		this._connection.xmlOutput(this._startStream());
		this._sendText(this._startStream());
		this._keepalive();
	},
	
	/** PrivateFunction: _onClose
     *  _Private_ function to handle websockets closing.
     *
	 */
	_onClose: function (event) {
		Strophe.log("info", "Websocket disconnected");
	    this.connected = false;
		this._connection._doDisconnect();
	},
	
	/** PrivateFunction: _onError
     *  _Private_ function to handle websockets messages.
     *
	 *  This function parses each of the messages as if they are full documents. [TODO : We may actually want to use a SAX Push parser].
	 *  
	 *  Since all XMPP traffic starts with "<stream:stream version='1.0' xml:lang='en' xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' id='3697395463' from='SERVER'>"
	 *  The first stanza will always fail to be parsed...
	 *  Addtionnaly, the seconds stanza will always be a <stream:features> with the stream NS defined in the previous stanza... so we need to 'force' the inclusion of the NS in this stanza!
     * 
	 *  Parameters:
     *    (string) message - The websocket message.
     */
	_onMessage: function (message) {
		this._connection.rawInput(message.data);
		
		string = message.data.replace("<stream:features>", "<stream:features xmlns:stream='http://etherx.jabber.org/streams'>"); // Ugly hack todeal with the problem of stream ns undefined.
		
		parser = new DOMParser();
		elem = parser.parseFromString(string, "text/xml").documentElement;
		
		this._connection.xmlInput(elem);

		if (elem.nodeName == "stream:stream") {
			// Let's just skip this.
		}
		else {
			this._connection.receiveData(elem);
		}
	},
	
	_startStream: function () {
		return "<stream:stream to='" + this._connection.domain + "' xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' version='1.0' />";
	},
	
	_endStream:function () {
		return "</stream:stream>";
	},
	
	_sendText: function (text) {
	    if (this.connected) {
    	    if (this._socket && this._socket.readyState == 1) {
        		this._socket.send(text);
        		this._connection.rawOutput(text);
        		return true;
    	    }
    	    else if (!this.socket || this.socket.readyState == 3) {
    	        // We're either not connected, or the connection is not there.
    	        this._connection._doDisconnect();
    	        return false;
    	    }
    	    else {
    	        // What do we do. It means we're either disconnecting, or connecting. 
    	        return false;
    	    }
	    } else {
	        // We're not connected, so we can't send anything.
	        return false;
	    }
	},
	
	_keepalive: function () {
        if (this.connected) {
    	    setTimeout(function () {
    	        if (this._sendText("")) {
        	        this._keepalive();
    	        }
    	    }.bind(this), 30000);
        }
	}
	
}

exports.Strophe = Strophe
exports.$build = $build
exports.$msg = $msg
exports.$iq = $iq
exports.$pres = $pres

});

require.define("/strophejs/base64.js", function (require, module, exports, __dirname, __filename) {
// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

var Base64 = (function () {
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

    var obj = {
        /**
         * Encodes a string in base64
         * @param {String} input The string to encode in base64.
         */
        encode: function (input) {
            var output = "";
            var chr1, chr2, chr3;
            var enc1, enc2, enc3, enc4;
            var i = 0;

            do {
                chr1 = input.charCodeAt(i++);
                chr2 = input.charCodeAt(i++);
                chr3 = input.charCodeAt(i++);

                enc1 = chr1 >> 2;
                enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                enc4 = chr3 & 63;

                if (isNaN(chr2)) {
                    enc3 = enc4 = 64;
                } else if (isNaN(chr3)) {
                    enc4 = 64;
                }

                output = output + keyStr.charAt(enc1) + keyStr.charAt(enc2) +
                    keyStr.charAt(enc3) + keyStr.charAt(enc4);
            } while (i < input.length);

            return output;
        },

        /**
         * Decodes a base64 string.
         * @param {String} input The string to decode.
         */
        decode: function (input) {
            var output = "";
            var chr1, chr2, chr3;
            var enc1, enc2, enc3, enc4;
            var i = 0;

            // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
            input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

            do {
                enc1 = keyStr.indexOf(input.charAt(i++));
                enc2 = keyStr.indexOf(input.charAt(i++));
                enc3 = keyStr.indexOf(input.charAt(i++));
                enc4 = keyStr.indexOf(input.charAt(i++));

                chr1 = (enc1 << 2) | (enc2 >> 4);
                chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                chr3 = ((enc3 & 3) << 6) | enc4;

                output = output + String.fromCharCode(chr1);

                if (enc3 != 64) {
                    output = output + String.fromCharCode(chr2);
                }
                if (enc4 != 64) {
                    output = output + String.fromCharCode(chr3);
                }
            } while (i < input.length);

            return output;
        }
    };

    return obj;
})();

exports.Base64 = Base64
});

require.define("/msgboy.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneAdapter = require('backbone-adapter');
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
var BackboneAdapter = require('backbone-adapter');
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

require.define("/plugins.js", function (require, module, exports, __dirname, __filename) {
var Plugins = {
    all: [],

    register: function (plugin) {
        this.all.push(plugin);
    },
    importSubscriptions: function (callback, errback) {
        var subscriptions_count = 0;

        var done_with_plugin = _.after(Plugins.all.length, function () {
            // Called when we have processed all plugins.
            Msgboy.log.info("Done with all plugins and subscribed to", subscriptions_count);
        });

        _.each(Plugins.all, function (plugin) {
            plugin.listSubscriptions(function (subscriptions) {
                _.each(subscriptions, function (subscription) {
                    callback({
                        url: subscription.url,
                        title: subscription.title
                    });
                });
            }, function (count) {
                Msgboy.log.info("Done with", plugin.name, "and subscribed to", count);
                subscriptions_count += count;
                done_with_plugin();
            });
        });
    }
};

exports.Plugins = Plugins;

// This is the skeleton for the Plugins
var Plugin = function () {
    this.name = ''; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function () {
        // This method needs to returns true if the plugin needs to be applied on this page.
    };

    this.listSubscriptions = function (callback, done) {
        // This methods will callback with all the subscriptions in this service. It can call the callback several times with more feeds.
        // Feeds have the following form {url: _, title: _}.
        callback([]);
        done(0);
    };

    this.hijack = function (follow, unfollow) {
        // This method will add a callback that hijack a website subscription (or follow, or equivalent) so that msgboy also mirrors this subscription.
        // So actually, we should ask the user if it's fine to subscribe to the feed, and if so, well, that's good, then we will subscribe.
    };

    this.subscribeInBackground = function (callback) {
        // The callback needs to be called with a feed object {url: _, title: _}
        // this function is called from the background and used to define a "chrome-wide" callback. It should probably not be used by any plugin specific to a 3rd pary site, but for plugins like History and/or Bookmarks
    };
};

});

require.define("/models/inbox.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneAdapter = require('backbone-adapter');
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Msgboy = require('../msgboy.js').Msgboy;

var Inbox = Backbone.Model.extend({
    storeName: "inbox",
    database: msgboyDatabase,
    defaults: {
        id: "1",
        options: {
            relevance: 0.0
        }
    },
    initialize: function () {
    },

    // Create credentials and saves them.
    // We may want to not run that again when we already have credentails.
    createCredentials: function () {
        window.open("http://msgboy.com/session/new?ext=" + chrome.i18n.getMessage("@@extension_id"));
    },

    setup: function (username, token) {
        this.save({
            epoch: new Date().getTime(),
            jid: username,
            password: token
        }, {
            success: function () {
                Msgboy.log.debug("Inbox created for " + username);
                this.trigger("ready", this);
                this.trigger("new", this);
            }.bind(this),
            error: function () {
                Msgboy.log.debug("Failed to create inbox for " + username);
            }.bind(this)
        });
    },

    // Fetches and prepares the inbox if needed.
    fetchAndPrepare: function () {
        this.fetch({
            success: function () {
                if (this.attributes.jid && this.attributes.jid !== "" && this.attributes.password && this.attributes.password !== "") {
                    Msgboy.log.debug("Loaded inbox for " + this.attributes.jid);
                    this.trigger("ready", this);
                } else {
                    Msgboy.log.debug("Refreshing new inbox ");
                    this.createCredentials();
                }
            }.bind(this),
            error: function () {
                // Looks like there is no such inbox.
                Msgboy.log.debug("Creating new inbox");
                this.createCredentials();
            }.bind(this)
        });
    },

    // Adds a message in the inbox
    addMessage: function (msg, options) {
        // Adds the message if the message isn't yet present
        var message = new Message({
            'id': msg.id
        });

        message.fetch({
            error: function () {
                // The message was not found, so we just have to create one!
                var message = new Message(msg);
                message.save({}, {
                    success: function () {
                        message.calculateRelevance(function (_relevance) {
                            message.save({
                                relevance: _relevance
                            }, {
                                success: function () {
                                    this.trigger("messages:added", message);
                                    options.success(message);
                                }.bind(this)
                            });
                        }.bind(this));
                    }.bind(this),
                    error: function (object, error) {
                        options.error(object, error);
                    }
                });
            }.bind(this),
            success: function () {
                options.success(null);
            }.bind(this)
        });
    },

});

exports.Inbox = Inbox;
});

require.alias("jquery-browserify", "/node_modules/jquery");

require.alias("backbone-browserify", "/node_modules/backbone");

require.alias("../backbone-indexeddb.js", "/node_modules/backbone-adapter");

require.define("/background.js", function (require, module, exports, __dirname, __filename) {
    var $ = jQuery      = require('jquery');
var Backbone        = require('backbone');
var Strophe         = require('./strophejs/core.js').Strophe
var Msgboy          = require('./msgboy.js').Msgboy;
var Plugins         = require('./plugins.js').Plugins;
var Inbox           = require('./models/inbox.js').Inbox;


Msgboy.bind("loaded", function () {
    Msgboy.inbox = new Inbox();
    
    Msgboy.connection = new Strophe.Connection({
        protocol: new Strophe.Websocket('ws://msgboy.com:5280')
    });
    
    Msgboy.connection.max_stanzas_per_second = 1; // We limit to 1 outgoing stanzas per second.

    Msgboy.connection.rawInput = function (data) {
        console.log(">>", data);
        // Msgboy.log.raw('RECV', data);
    };
    Msgboy.connection.rawOutput = function (data) {
        console.log("<<", data);
        // Msgboy.log.raw('SENT', data);
    };

    Strophe.log = function (level, msg) {
        Msgboy.log.debug(msg);
    }

    // When a new message was added to the inbox
    Msgboy.inbox.bind("messages:added", function (message) {
        if (message.attributes.relevance >= Msgboy.inbox.attributes.options.relevance) {
            Msgboy.log.debug("Showing message : " + message.attributes.id + " (" + message.attributes.relevance + " >= " + Msgboy.inbox.attributes.options.relevance + ") ");
            Msgboy.notify(message.toJSON());
        } else {
            Msgboy.log.debug("Not showing message : " + message.attributes.id + " (" + message.attributes.relevance + " < " + Msgboy.inbox.attributes.options.relevance + ") ");
        }
    });

    // when the inbox is ready
    Msgboy.inbox.bind("ready", function () {
        Msgboy.connect(Msgboy.inbox);
    });

    // When the inbox is new.
    Msgboy.inbox.bind("new", function () {
        // Add a couple boxes for the example!
        for(var i in welcomeMessages) {
            var msg = new Message(welcomeMessages[i]);
            msg.save({}, {
                success: function () {
                    Msgboy.log.debug("Saved message " + msg.id);
                }.bind(this),
                error: function (object, error) {
                    // Message was not saved... probably a dupe
                    Msgboy.log.debug("Could not save message " + JSON.stringify(msg.toJSON()));
                    Msgboy.log.debug(error);
                }.bind(this)
            });
        }
        
        // And import all plugins.
        Plugins.importSubscriptions(function (subs) {
            Msgboy.subscribe(subs.url, function () {
                // Cool. Not much to do.
            });
        });
    });

    // When a new notification was received from XMPP line.
    $(document).bind('notification_received', function (ev, notification) {
        Msgboy.log.debug("Notification received from " + notification.source.url);
        var msg = Msgboy.connection.superfeedr.convertAtomToJson(notification.payload);
        msg.source = notification.source;
        msg.feed = notification.source.url;
        var message = Msgboy.inbox.addMessage(msg, {
            success: function () {
                Msgboy.log.debug("Saved message " + msg.id);
            }.bind(this),
            error: function (object, error) {
                // Message was not saved... probably a dupe
                Msgboy.log.debug("Could not save message " + JSON.stringify(msg));
                Msgboy.log.debug(error);
            }.bind(this),
        });
    });

    // Chrome specific. We want to turn any Chrome API callback into a DOM event. It will greatly improve portability.
    chrome.extension.onRequest.addListener(function (_request, _sender, _sendResponse) {
        $(document).trigger(_request.signature, {
            request: _request,
            sender: _sender,
            sendResponse: _sendResponse
        });
    });
    
    // Let's go.
    Msgboy.inbox.fetchAndPrepare();
    
    // Plugins management
    $.each(Plugins.all, function (index, plugin) {
        if (typeof (plugin.subscribeInBackground) != "undefined") {
            plugin.subscribeInBackground(function (feed) {
                $(document).trigger('subscribe', {request: {params: {url: feed.href}}});
            });
        }
    });
});

// Main!
Msgboy.run();

});
require("/background.js");
