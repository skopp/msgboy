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

require.define("/node_modules/br-jquery/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"browserify":"browser"}
});

require.define("/node_modules/br-jquery/browser.js", function (require, module, exports, __dirname, __filename) {
(function () {
function create(window) {
  var location, navigator, XMLHttpRequest;

/*!
 * jQuery JavaScript Library v1.7.2
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
 * Date: Wed Mar 21 12:46:34 2012 -0700
 */
(function( window, undefined ) {

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
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	quickExpr = /^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/,

	// Check if a string has a non-whitespace character in it
	rnotwhite = /\S/,

	// Used for trimming whitespace
	trimLeft = /^\s+/,
	trimRight = /\s+$/,

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
	rdashAlpha = /-([a-z]|[0-9])/ig,
	rmsPrefix = /^-ms-/,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return ( letter + "" ).toUpperCase();
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
					doc = ( context ? context.ownerDocument || context : document );

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
						selector = ( ret.cacheable ? jQuery.clone(ret.fragment) : ret.fragment ).childNodes;
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
				return ( context || rootjQuery ).find( selector );

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

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	},

	// Start with an empty selector
	selector: "",

	// The current version of jQuery being used
	jquery: "1.7.2",

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
			ret.selector = this.selector + ( this.selector ? " " : "" ) + selector;
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
		readyList.add( fn );

		return this;
	},

	eq: function( i ) {
		i = +i;
		return i === -1 ?
			this.slice( i ) :
			this.slice( i, i + 1 );
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
			readyList.fireWith( document, [ jQuery ] );

			// Trigger any bound ready events
			if ( jQuery.fn.trigger ) {
				jQuery( document ).trigger( "ready" ).off( "ready" );
			}
		}
	},

	bindReady: function() {
		if ( readyList ) {
			return;
		}

		readyList = jQuery.Callbacks( "once memory" );

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

	isWindow: function( obj ) {
		return obj != null && obj == obj.window;
	},

	isNumeric: function( obj ) {
		return !isNaN( parseFloat(obj) ) && isFinite( obj );
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

		try {
			// Not own constructor property must be Object
			if ( obj.constructor &&
				!hasOwn.call(obj, "constructor") &&
				!hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
				return false;
			}
		} catch ( e ) {
			// IE8,9 Will throw exceptions on certain host objects #9897
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
		throw new Error( msg );
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

			return ( new Function( "return " + data ) )();

		}
		jQuery.error( "Invalid JSON: " + data );
	},

	// Cross-browser xml parsing
	parseXML: function( data ) {
		if ( typeof data !== "string" || !data ) {
			return null;
		}
		var xml, tmp;
		try {
			if ( window.DOMParser ) { // Standard
				tmp = new DOMParser();
				xml = tmp.parseFromString( data , "text/xml" );
			} else { // IE
				xml = new ActiveXObject( "Microsoft.XMLDOM" );
				xml.async = "false";
				xml.loadXML( data );
			}
		} catch( e ) {
			xml = undefined;
		}
		if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
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

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
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

	inArray: function( elem, array, i ) {
		var len;

		if ( array ) {
			if ( indexOf ) {
				return indexOf.call( array, elem, i );
			}

			len = array.length;
			i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

			for ( ; i < len; i++ ) {
				// Skip accessing in sparse arrays
				if ( i in array && array[ i ] === elem ) {
					return i;
				}
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
	access: function( elems, fn, key, value, chainable, emptyGet, pass ) {
		var exec,
			bulk = key == null,
			i = 0,
			length = elems.length;

		// Sets many values
		if ( key && typeof key === "object" ) {
			for ( i in key ) {
				jQuery.access( elems, fn, i, key[i], 1, emptyGet, value );
			}
			chainable = 1;

		// Sets one value
		} else if ( value !== undefined ) {
			// Optionally, function values get executed if exec is true
			exec = pass === undefined && jQuery.isFunction( value );

			if ( bulk ) {
				// Bulk operations only iterate when executing function values
				if ( exec ) {
					exec = fn;
					fn = function( elem, key, value ) {
						return exec.call( jQuery( elem ), value );
					};

				// Otherwise they run against the entire set
				} else {
					fn.call( elems, value );
					fn = null;
				}
			}

			if ( fn ) {
				for (; i < length; i++ ) {
					fn( elems[i], key, exec ? value.call( elems[i], i, fn( elems[i], key ) ) : value, pass );
				}
			}

			chainable = 1;
		}

		return chainable ?
			elems :

			// Gets
			bulk ?
				fn.call( elems ) :
				length ? fn( elems[0], key ) : emptyGet;
	},

	now: function() {
		return ( new Date() ).getTime();
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


// String to Object flags format cache
var flagsCache = {};

// Convert String-formatted flags into Object-formatted ones and store in cache
function createFlags( flags ) {
	var object = flagsCache[ flags ] = {},
		i, length;
	flags = flags.split( /\s+/ );
	for ( i = 0, length = flags.length; i < length; i++ ) {
		object[ flags[i] ] = true;
	}
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	flags:	an optional list of space-separated flags that will change how
 *			the callback list behaves
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible flags:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( flags ) {

	// Convert flags from String-formatted to Object-formatted
	// (we check in cache first)
	flags = flags ? ( flagsCache[ flags ] || createFlags( flags ) ) : {};

	var // Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = [],
		// Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// Flag to know if list is currently firing
		firing,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// Add one or several callbacks to the list
		add = function( args ) {
			var i,
				length,
				elem,
				type,
				actual;
			for ( i = 0, length = args.length; i < length; i++ ) {
				elem = args[ i ];
				type = jQuery.type( elem );
				if ( type === "array" ) {
					// Inspect recursively
					add( elem );
				} else if ( type === "function" ) {
					// Add if not in unique mode and callback is not in
					if ( !flags.unique || !self.has( elem ) ) {
						list.push( elem );
					}
				}
			}
		},
		// Fire callbacks
		fire = function( context, args ) {
			args = args || [];
			memory = !flags.memory || [ context, args ];
			fired = true;
			firing = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( context, args ) === false && flags.stopOnFalse ) {
					memory = true; // Mark as halted
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( !flags.once ) {
					if ( stack && stack.length ) {
						memory = stack.shift();
						self.fireWith( memory[ 0 ], memory[ 1 ] );
					}
				} else if ( memory === true ) {
					self.disable();
				} else {
					list = [];
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					var length = list.length;
					add( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away, unless previous
					// firing was halted (stopOnFalse)
					} else if ( memory && memory !== true ) {
						firingStart = length;
						fire( memory[ 0 ], memory[ 1 ] );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					var args = arguments,
						argIndex = 0,
						argLength = args.length;
					for ( ; argIndex < argLength ; argIndex++ ) {
						for ( var i = 0; i < list.length; i++ ) {
							if ( args[ argIndex ] === list[ i ] ) {
								// Handle firingIndex and firingLength
								if ( firing ) {
									if ( i <= firingLength ) {
										firingLength--;
										if ( i <= firingIndex ) {
											firingIndex--;
										}
									}
								}
								// Remove the element
								list.splice( i--, 1 );
								// If we have some unicity property then
								// we only need to do this once
								if ( flags.unique ) {
									break;
								}
							}
						}
					}
				}
				return this;
			},
			// Control if a given callback is in the list
			has: function( fn ) {
				if ( list ) {
					var i = 0,
						length = list.length;
					for ( ; i < length; i++ ) {
						if ( fn === list[ i ] ) {
							return true;
						}
					}
				}
				return false;
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory || memory === true ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( stack ) {
					if ( firing ) {
						if ( !flags.once ) {
							stack.push( [ context, args ] );
						}
					} else if ( !( flags.once && memory ) ) {
						fire( context, args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};




var // Static reference to slice
	sliceDeferred = [].slice;

jQuery.extend({

	Deferred: function( func ) {
		var doneList = jQuery.Callbacks( "once memory" ),
			failList = jQuery.Callbacks( "once memory" ),
			progressList = jQuery.Callbacks( "memory" ),
			state = "pending",
			lists = {
				resolve: doneList,
				reject: failList,
				notify: progressList
			},
			promise = {
				done: doneList.add,
				fail: failList.add,
				progress: progressList.add,

				state: function() {
					return state;
				},

				// Deprecated
				isResolved: doneList.fired,
				isRejected: failList.fired,

				then: function( doneCallbacks, failCallbacks, progressCallbacks ) {
					deferred.done( doneCallbacks ).fail( failCallbacks ).progress( progressCallbacks );
					return this;
				},
				always: function() {
					deferred.done.apply( deferred, arguments ).fail.apply( deferred, arguments );
					return this;
				},
				pipe: function( fnDone, fnFail, fnProgress ) {
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( {
							done: [ fnDone, "resolve" ],
							fail: [ fnFail, "reject" ],
							progress: [ fnProgress, "notify" ]
						}, function( handler, data ) {
							var fn = data[ 0 ],
								action = data[ 1 ],
								returned;
							if ( jQuery.isFunction( fn ) ) {
								deferred[ handler ](function() {
									returned = fn.apply( this, arguments );
									if ( returned && jQuery.isFunction( returned.promise ) ) {
										returned.promise().then( newDefer.resolve, newDefer.reject, newDefer.notify );
									} else {
										newDefer[ action + "With" ]( this === deferred ? newDefer : this, [ returned ] );
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
						obj = promise;
					} else {
						for ( var key in promise ) {
							obj[ key ] = promise[ key ];
						}
					}
					return obj;
				}
			},
			deferred = promise.promise({}),
			key;

		for ( key in lists ) {
			deferred[ key ] = lists[ key ].fire;
			deferred[ key + "With" ] = lists[ key ].fireWith;
		}

		// Handle state
		deferred.done( function() {
			state = "resolved";
		}, failList.disable, progressList.lock ).fail( function() {
			state = "rejected";
		}, doneList.disable, progressList.lock );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( firstParam ) {
		var args = sliceDeferred.call( arguments, 0 ),
			i = 0,
			length = args.length,
			pValues = new Array( length ),
			count = length,
			pCount = length,
			deferred = length <= 1 && firstParam && jQuery.isFunction( firstParam.promise ) ?
				firstParam :
				jQuery.Deferred(),
			promise = deferred.promise();
		function resolveFunc( i ) {
			return function( value ) {
				args[ i ] = arguments.length > 1 ? sliceDeferred.call( arguments, 0 ) : value;
				if ( !( --count ) ) {
					deferred.resolveWith( deferred, args );
				}
			};
		}
		function progressFunc( i ) {
			return function( value ) {
				pValues[ i ] = arguments.length > 1 ? sliceDeferred.call( arguments, 0 ) : value;
				deferred.notifyWith( promise, pValues );
			};
		}
		if ( length > 1 ) {
			for ( ; i < length; i++ ) {
				if ( args[ i ] && args[ i ].promise && jQuery.isFunction( args[ i ].promise ) ) {
					args[ i ].promise().then( resolveFunc(i), deferred.reject, progressFunc(i) );
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
		return promise;
	}
});




jQuery.support = (function() {

	var support,
		all,
		a,
		select,
		opt,
		input,
		fragment,
		tds,
		events,
		eventName,
		i,
		isSupported,
		div = document.createElement( "div" ),
		documentElement = document.documentElement;

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
		tbody: !div.getElementsByTagName("tbody").length,

		// Make sure that link elements get serialized correctly by innerHTML
		// This requires a wrapper element in IE
		htmlSerialize: !!div.getElementsByTagName("link").length,

		// Get the style information from getAttribute
		// (IE uses .cssText instead)
		style: /top/.test( a.getAttribute("style") ),

		// Make sure that URLs aren't manipulated
		// (IE normalizes it by default)
		hrefNormalized: ( a.getAttribute("href") === "/a" ),

		// Make sure that element opacity exists
		// (IE uses filter instead)
		// Use a regex to work around a WebKit issue. See #5145
		opacity: /^0.55/.test( a.style.opacity ),

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

		// Tests for enctype support on a form(#6743)
		enctype: !!document.createElement("form").enctype,

		// Makes sure cloning an html5 element does not cause problems
		// Where outerHTML is undefined, this still works
		html5Clone: document.createElement("nav").cloneNode( true ).outerHTML !== "<:nav></:nav>",

		// Will be defined later
		submitBubbles: true,
		changeBubbles: true,
		focusinBubbles: false,
		deleteExpando: true,
		noCloneEvent: true,
		inlineBlockNeedsLayout: false,
		shrinkWrapBlocks: false,
		reliableMarginRight: true,
		pixelMargin: true
	};

	// jQuery.boxModel DEPRECATED in 1.3, use jQuery.support.boxModel instead
	jQuery.boxModel = support.boxModel = (document.compatMode === "CSS1Compat");

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

	// Check if a radio maintains its value
	// after being appended to the DOM
	input = document.createElement("input");
	input.value = "t";
	input.setAttribute("type", "radio");
	support.radioValue = input.value === "t";

	input.setAttribute("checked", "checked");

	// #11217 - WebKit loses check when the name is after the checked attribute
	input.setAttribute( "name", "t" );

	div.appendChild( input );
	fragment = document.createDocumentFragment();
	fragment.appendChild( div.lastChild );

	// WebKit doesn't clone checked state correctly in fragments
	support.checkClone = fragment.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Check if a disconnected checkbox will retain its checked
	// value of true after appended to the DOM (IE6/7)
	support.appendChecked = input.checked;

	fragment.removeChild( input );
	fragment.appendChild( div );

	// Technique from Juriy Zaytsev
	// http://perfectionkills.com/detecting-event-support-without-browser-sniffing/
	// We only care about the case where non-standard event systems
	// are used, namely in IE. Short-circuiting here helps us to
	// avoid an eval call (in setAttribute) which can cause CSP
	// to go haywire. See: https://developer.mozilla.org/en/Security/CSP
	if ( div.attachEvent ) {
		for ( i in {
			submit: 1,
			change: 1,
			focusin: 1
		}) {
			eventName = "on" + i;
			isSupported = ( eventName in div );
			if ( !isSupported ) {
				div.setAttribute( eventName, "return;" );
				isSupported = ( typeof div[ eventName ] === "function" );
			}
			support[ i + "Bubbles" ] = isSupported;
		}
	}

	fragment.removeChild( div );

	// Null elements to avoid leaks in IE
	fragment = select = opt = div = input = null;

	// Run tests that need a body at doc ready
	jQuery(function() {
		var container, outer, inner, table, td, offsetSupport,
			marginDiv, conMarginTop, style, html, positionTopLeftWidthHeight,
			paddingMarginBorderVisibility, paddingMarginBorder,
			body = document.getElementsByTagName("body")[0];

		if ( !body ) {
			// Return for frameset docs that don't have a body
			return;
		}

		conMarginTop = 1;
		paddingMarginBorder = "padding:0;margin:0;border:";
		positionTopLeftWidthHeight = "position:absolute;top:0;left:0;width:1px;height:1px;";
		paddingMarginBorderVisibility = paddingMarginBorder + "0;visibility:hidden;";
		style = "style='" + positionTopLeftWidthHeight + paddingMarginBorder + "5px solid #000;";
		html = "<div " + style + "display:block;'><div style='" + paddingMarginBorder + "0;display:block;overflow:hidden;'></div></div>" +
			"<table " + style + "' cellpadding='0' cellspacing='0'>" +
			"<tr><td></td></tr></table>";

		container = document.createElement("div");
		container.style.cssText = paddingMarginBorderVisibility + "width:0;height:0;position:static;top:0;margin-top:" + conMarginTop + "px";
		body.insertBefore( container, body.firstChild );

		// Construct the test element
		div = document.createElement("div");
		container.appendChild( div );

		// Check if table cells still have offsetWidth/Height when they are set
		// to display:none and there are still other visible table cells in a
		// table row; if so, offsetWidth/Height are not reliable for use when
		// determining if an element has been hidden directly using
		// display:none (it is still safe to use offsets if a parent element is
		// hidden; don safety goggles and see bug #4512 for more information).
		// (only IE 8 fails this test)
		div.innerHTML = "<table><tr><td style='" + paddingMarginBorder + "0;display:none'></td><td>t</td></tr></table>";
		tds = div.getElementsByTagName( "td" );
		isSupported = ( tds[ 0 ].offsetHeight === 0 );

		tds[ 0 ].style.display = "";
		tds[ 1 ].style.display = "none";

		// Check if empty table cells still have offsetWidth/Height
		// (IE <= 8 fail this test)
		support.reliableHiddenOffsets = isSupported && ( tds[ 0 ].offsetHeight === 0 );

		// Check if div with explicit width and no margin-right incorrectly
		// gets computed margin-right based on width of container. For more
		// info see bug #3333
		// Fails in WebKit before Feb 2011 nightlies
		// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
		if ( window.getComputedStyle ) {
			div.innerHTML = "";
			marginDiv = document.createElement( "div" );
			marginDiv.style.width = "0";
			marginDiv.style.marginRight = "0";
			div.style.width = "2px";
			div.appendChild( marginDiv );
			support.reliableMarginRight =
				( parseInt( ( window.getComputedStyle( marginDiv, null ) || { marginRight: 0 } ).marginRight, 10 ) || 0 ) === 0;
		}

		if ( typeof div.style.zoom !== "undefined" ) {
			// Check if natively block-level elements act like inline-block
			// elements when setting their display to 'inline' and giving
			// them layout
			// (IE < 8 does this)
			div.innerHTML = "";
			div.style.width = div.style.padding = "1px";
			div.style.border = 0;
			div.style.overflow = "hidden";
			div.style.display = "inline";
			div.style.zoom = 1;
			support.inlineBlockNeedsLayout = ( div.offsetWidth === 3 );

			// Check if elements with layout shrink-wrap their children
			// (IE 6 does this)
			div.style.display = "block";
			div.style.overflow = "visible";
			div.innerHTML = "<div style='width:5px;'></div>";
			support.shrinkWrapBlocks = ( div.offsetWidth !== 3 );
		}

		div.style.cssText = positionTopLeftWidthHeight + paddingMarginBorderVisibility;
		div.innerHTML = html;

		outer = div.firstChild;
		inner = outer.firstChild;
		td = outer.nextSibling.firstChild.firstChild;

		offsetSupport = {
			doesNotAddBorder: ( inner.offsetTop !== 5 ),
			doesAddBorderForTableAndCells: ( td.offsetTop === 5 )
		};

		inner.style.position = "fixed";
		inner.style.top = "20px";

		// safari subtracts parent border width here which is 5px
		offsetSupport.fixedPosition = ( inner.offsetTop === 20 || inner.offsetTop === 15 );
		inner.style.position = inner.style.top = "";

		outer.style.overflow = "hidden";
		outer.style.position = "relative";

		offsetSupport.subtractsBorderForOverflowNotVisible = ( inner.offsetTop === -5 );
		offsetSupport.doesNotIncludeMarginInBodyOffset = ( body.offsetTop !== conMarginTop );

		if ( window.getComputedStyle ) {
			div.style.marginTop = "1%";
			support.pixelMargin = ( window.getComputedStyle( div, null ) || { marginTop: 0 } ).marginTop !== "1%";
		}

		if ( typeof container.style.zoom !== "undefined" ) {
			container.style.zoom = 1;
		}

		body.removeChild( container );
		marginDiv = div = container = null;

		jQuery.extend( support, offsetSupport );
	});

	return support;
})();




var rbrace = /^(?:\{.*\}|\[.*\])$/,
	rmultiDash = /([A-Z])/g;

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

		var privateCache, thisCache, ret,
			internalKey = jQuery.expando,
			getByName = typeof name === "string",

			// We have to handle DOM nodes and JS objects differently because IE6-7
			// can't GC object references properly across the DOM-JS boundary
			isNode = elem.nodeType,

			// Only DOM nodes need the global jQuery cache; JS object data is
			// attached directly to the object so GC can occur automatically
			cache = isNode ? jQuery.cache : elem,

			// Only defining an ID for JS objects if its cache already exists allows
			// the code to shortcut on the same path as a DOM node with no cache
			id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey,
			isEvents = name === "events";

		// Avoid doing any more work than we need to when trying to get data on an
		// object that has no data at all
		if ( (!id || !cache[id] || (!isEvents && !pvt && !cache[id].data)) && getByName && data === undefined ) {
			return;
		}

		if ( !id ) {
			// Only DOM nodes need a new unique ID for each element since their data
			// ends up in the global cache
			if ( isNode ) {
				elem[ internalKey ] = id = ++jQuery.uuid;
			} else {
				id = internalKey;
			}
		}

		if ( !cache[ id ] ) {
			cache[ id ] = {};

			// Avoids exposing jQuery metadata on plain JS objects when the object
			// is serialized using JSON.stringify
			if ( !isNode ) {
				cache[ id ].toJSON = jQuery.noop;
			}
		}

		// An object can be passed to jQuery.data instead of a key/value pair; this gets
		// shallow copied over onto the existing cache
		if ( typeof name === "object" || typeof name === "function" ) {
			if ( pvt ) {
				cache[ id ] = jQuery.extend( cache[ id ], name );
			} else {
				cache[ id ].data = jQuery.extend( cache[ id ].data, name );
			}
		}

		privateCache = thisCache = cache[ id ];

		// jQuery data() is stored in a separate object inside the object's internal data
		// cache in order to avoid key collisions between internal data and user-defined
		// data.
		if ( !pvt ) {
			if ( !thisCache.data ) {
				thisCache.data = {};
			}

			thisCache = thisCache.data;
		}

		if ( data !== undefined ) {
			thisCache[ jQuery.camelCase( name ) ] = data;
		}

		// Users should not attempt to inspect the internal events object using jQuery.data,
		// it is undocumented and subject to change. But does anyone listen? No.
		if ( isEvents && !thisCache[ name ] ) {
			return privateCache.events;
		}

		// Check for both converted-to-camel and non-converted data property names
		// If a data property was specified
		if ( getByName ) {

			// First Try to find as-is property data
			ret = thisCache[ name ];

			// Test for null|undefined property data
			if ( ret == null ) {

				// Try to find the camelCased property
				ret = thisCache[ jQuery.camelCase( name ) ];
			}
		} else {
			ret = thisCache;
		}

		return ret;
	},

	removeData: function( elem, name, pvt /* Internal Use Only */ ) {
		if ( !jQuery.acceptData( elem ) ) {
			return;
		}

		var thisCache, i, l,

			// Reference to internal data cache key
			internalKey = jQuery.expando,

			isNode = elem.nodeType,

			// See jQuery.data for more information
			cache = isNode ? jQuery.cache : elem,

			// See jQuery.data for more information
			id = isNode ? elem[ internalKey ] : internalKey;

		// If there is already no cache entry for this object, there is no
		// purpose in continuing
		if ( !cache[ id ] ) {
			return;
		}

		if ( name ) {

			thisCache = pvt ? cache[ id ] : cache[ id ].data;

			if ( thisCache ) {

				// Support array or space separated string names for data keys
				if ( !jQuery.isArray( name ) ) {

					// try the string as a key before any manipulation
					if ( name in thisCache ) {
						name = [ name ];
					} else {

						// split the camel cased version by spaces unless a key with the spaces exists
						name = jQuery.camelCase( name );
						if ( name in thisCache ) {
							name = [ name ];
						} else {
							name = name.split( " " );
						}
					}
				}

				for ( i = 0, l = name.length; i < l; i++ ) {
					delete thisCache[ name[i] ];
				}

				// If there is no data left in the cache, we want to continue
				// and let the cache object itself get destroyed
				if ( !( pvt ? isEmptyDataObject : jQuery.isEmptyObject )( thisCache ) ) {
					return;
				}
			}
		}

		// See jQuery.data for more information
		if ( !pvt ) {
			delete cache[ id ].data;

			// Don't destroy the parent cache unless the internal data object
			// had been the only thing left in it
			if ( !isEmptyDataObject(cache[ id ]) ) {
				return;
			}
		}

		// Browsers that fail expando deletion also refuse to delete expandos on
		// the window, but it will allow it on all other JS objects; other browsers
		// don't care
		// Ensure that `cache` is not a window object #10080
		if ( jQuery.support.deleteExpando || !cache.setInterval ) {
			delete cache[ id ];
		} else {
			cache[ id ] = null;
		}

		// We destroyed the cache and need to eliminate the expando on the node to avoid
		// false lookups in the cache for entries that no longer exist
		if ( isNode ) {
			// IE does not allow us to delete expando properties from nodes,
			// nor does it have a removeAttribute function on Document nodes;
			// we must handle all of these cases
			if ( jQuery.support.deleteExpando ) {
				delete elem[ internalKey ];
			} else if ( elem.removeAttribute ) {
				elem.removeAttribute( internalKey );
			} else {
				elem[ internalKey ] = null;
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
		var parts, part, attr, name, l,
			elem = this[0],
			i = 0,
			data = null;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = jQuery.data( elem );

				if ( elem.nodeType === 1 && !jQuery._data( elem, "parsedAttrs" ) ) {
					attr = elem.attributes;
					for ( l = attr.length; i < l; i++ ) {
						name = attr[i].name;

						if ( name.indexOf( "data-" ) === 0 ) {
							name = jQuery.camelCase( name.substring(5) );

							dataAttr( elem, name, data[ name ] );
						}
					}
					jQuery._data( elem, "parsedAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				jQuery.data( this, key );
			});
		}

		parts = key.split( ".", 2 );
		parts[1] = parts[1] ? "." + parts[1] : "";
		part = parts[1] + "!";

		return jQuery.access( this, function( value ) {

			if ( value === undefined ) {
				data = this.triggerHandler( "getData" + part, [ parts[0] ] );

				// Try to fetch any internally stored data first
				if ( data === undefined && elem ) {
					data = jQuery.data( elem, key );
					data = dataAttr( elem, key, data );
				}

				return data === undefined && parts[1] ?
					this.data( parts[0] ) :
					data;
			}

			parts[1] = value;
			this.each(function() {
				var self = jQuery( this );

				self.triggerHandler( "setData" + part, parts );
				jQuery.data( this, key, value );
				self.triggerHandler( "changeData" + part, parts );
			});
		}, null, value, arguments.length > 1, null, false );
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

		var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
				data === "false" ? false :
				data === "null" ? null :
				jQuery.isNumeric( data ) ? +data :
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

// checks a cache object for emptiness
function isEmptyDataObject( obj ) {
	for ( var name in obj ) {

		// if the public data object is empty, the private is still empty
		if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
			continue;
		}
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
		defer = jQuery._data( elem, deferDataKey );
	if ( defer &&
		( src === "queue" || !jQuery._data(elem, queueDataKey) ) &&
		( src === "mark" || !jQuery._data(elem, markDataKey) ) ) {
		// Give room for hard-coded callbacks to fire first
		// and eventually mark/queue something else on the element
		setTimeout( function() {
			if ( !jQuery._data( elem, queueDataKey ) &&
				!jQuery._data( elem, markDataKey ) ) {
				jQuery.removeData( elem, deferDataKey, true );
				defer.fire();
			}
		}, 0 );
	}
}

jQuery.extend({

	_mark: function( elem, type ) {
		if ( elem ) {
			type = ( type || "fx" ) + "mark";
			jQuery._data( elem, type, (jQuery._data( elem, type ) || 0) + 1 );
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
				count = force ? 0 : ( (jQuery._data( elem, key ) || 1) - 1 );
			if ( count ) {
				jQuery._data( elem, key, count );
			} else {
				jQuery.removeData( elem, key, true );
				handleQueueMarkDefer( elem, type, "mark" );
			}
		}
	},

	queue: function( elem, type, data ) {
		var q;
		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			q = jQuery._data( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !q || jQuery.isArray(data) ) {
					q = jQuery._data( elem, type, jQuery.makeArray(data) );
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
			hooks = {};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
		}

		if ( fn ) {
			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			jQuery._data( elem, type + ".run", hooks );
			fn.call( elem, function() {
				jQuery.dequeue( elem, type );
			}, hooks );
		}

		if ( !queue.length ) {
			jQuery.removeData( elem, type + "queue " + type + ".run", true );
			handleQueueMarkDefer( elem, type, "queue" );
		}
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
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
		time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
		type = type || "fx";

		return this.queue( type, function( next, hooks ) {
			var timeout = setTimeout( next, time );
			hooks.stop = function() {
				clearTimeout( timeout );
			};
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
					jQuery.data( elements[ i ], deferDataKey, jQuery.Callbacks( "once memory" ), true ) )) {
				count++;
				tmp.add( resolve );
			}
		}
		resolve();
		return defer.promise( object );
	}
});




var rclass = /[\n\t\r]/g,
	rspace = /\s+/,
	rreturn = /\r/g,
	rtype = /^(?:button|input)$/i,
	rfocusable = /^(?:button|input|object|select|textarea)$/i,
	rclickable = /^a(?:rea)?$/i,
	rboolean = /^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i,
	getSetAttribute = jQuery.support.getSetAttribute,
	nodeHook, boolHook, fixSpecified;

jQuery.fn.extend({
	attr: function( name, value ) {
		return jQuery.access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	},

	prop: function( name, value ) {
		return jQuery.access( this, jQuery.prop, name, value, arguments.length > 1 );
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
			classNames = ( value || "" ).split( rspace );

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
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) > -1 ) {
				return true;
			}
		}

		return false;
	},

	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

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

			return;
		}

		isFunction = jQuery.isFunction( value );

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

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

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
				var value, i, max, option,
					index = elem.selectedIndex,
					values = [],
					options = elem.options,
					one = elem.type === "select-one";

				// Nothing was selected
				if ( index < 0 ) {
					return null;
				}

				// Loop through all the selected options
				i = one ? index : 0;
				max = one ? index + 1 : options.length;
				for ( ; i < max; i++ ) {
					option = options[ i ];

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

	attr: function( elem, name, value, pass ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		if ( pass && name in jQuery.attrFn ) {
			return jQuery( elem )[ name ]( value );
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === "undefined" ) {
			return jQuery.prop( elem, name, value );
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( notxml ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] || ( rboolean.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );
				return;

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

	removeAttr: function( elem, value ) {
		var propName, attrNames, name, l, isBool,
			i = 0;

		if ( value && elem.nodeType === 1 ) {
			attrNames = value.toLowerCase().split( rspace );
			l = attrNames.length;

			for ( ; i < l; i++ ) {
				name = attrNames[ i ];

				if ( name ) {
					propName = jQuery.propFix[ name ] || name;
					isBool = rboolean.test( name );

					// See #9699 for explanation of this approach (setting first, then removal)
					// Do not do this for boolean attributes (see #10870)
					if ( !isBool ) {
						jQuery.attr( elem, name, "" );
					}
					elem.removeAttribute( getSetAttribute ? name : propName );

					// Set corresponding property to false for boolean attributes
					if ( isBool && propName in elem ) {
						elem[ propName ] = false;
					}
				}
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
		// Use the value property for back compat
		// Use the nodeHook for button elements in IE6/7 (#1954)
		value: {
			get: function( elem, name ) {
				if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
					return nodeHook.get( elem, name );
				}
				return name in elem ?
					elem.value :
					null;
			},
			set: function( elem, value, name ) {
				if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
					return nodeHook.set( elem, value, name );
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
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

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
				return ( elem[ name ] = value );
			}

		} else {
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
				return ret;

			} else {
				return elem[ name ];
			}
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				// elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
				// http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				var attributeNode = elem.getAttributeNode("tabindex");

				return attributeNode && attributeNode.specified ?
					parseInt( attributeNode.value, 10 ) :
					rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
						0 :
						undefined;
			}
		}
	}
});

// Add the tabIndex propHook to attrHooks for back-compat (different case is intentional)
jQuery.attrHooks.tabindex = jQuery.propHooks.tabIndex;

// Hook for boolean attributes
boolHook = {
	get: function( elem, name ) {
		// Align boolean attributes with corresponding properties
		// Fall back to attribute presence where some booleans are not supported
		var attrNode,
			property = jQuery.prop( elem, name );
		return property === true || typeof property !== "boolean" && ( attrNode = elem.getAttributeNode(name) ) && attrNode.nodeValue !== false ?
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
if ( !getSetAttribute ) {

	fixSpecified = {
		name: true,
		id: true,
		coords: true
	};

	// Use this for any attribute in IE6/7
	// This fixes almost every IE6/7 issue
	nodeHook = jQuery.valHooks.button = {
		get: function( elem, name ) {
			var ret;
			ret = elem.getAttributeNode( name );
			return ret && ( fixSpecified[ name ] ? ret.nodeValue !== "" : ret.specified ) ?
				ret.nodeValue :
				undefined;
		},
		set: function( elem, value, name ) {
			// Set the existing or create a new attribute node
			var ret = elem.getAttributeNode( name );
			if ( !ret ) {
				ret = document.createAttribute( name );
				elem.setAttributeNode( ret );
			}
			return ( ret.nodeValue = value + "" );
		}
	};

	// Apply the nodeHook to tabindex
	jQuery.attrHooks.tabindex.set = nodeHook.set;

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

	// Set contenteditable to false on removals(#10429)
	// Setting to empty string throws an error as an invalid value
	jQuery.attrHooks.contenteditable = {
		get: nodeHook.get,
		set: function( elem, value, name ) {
			if ( value === "" ) {
				value = "false";
			}
			nodeHook.set( elem, value, name );
		}
	};
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
			return ( elem.style.cssText = "" + value );
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
			return null;
		}
	});
}

// IE6/7 call enctype encoding
if ( !jQuery.support.enctype ) {
	jQuery.propFix.enctype = "encoding";
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
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	});
});




var rformElems = /^(?:textarea|input|select)$/i,
	rtypenamespace = /^([^\.]*)?(?:\.(.+))?$/,
	rhoverHack = /(?:^|\s)hover(\.\S+)?\b/,
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rquickIs = /^(\w*)(?:#([\w\-]+))?(?:\.([\w\-]+))?$/,
	quickParse = function( selector ) {
		var quick = rquickIs.exec( selector );
		if ( quick ) {
			//   0  1    2   3
			// [ _, tag, id, class ]
			quick[1] = ( quick[1] || "" ).toLowerCase();
			quick[3] = quick[3] && new RegExp( "(?:^|\\s)" + quick[3] + "(?:\\s|$)" );
		}
		return quick;
	},
	quickIs = function( elem, m ) {
		var attrs = elem.attributes || {};
		return (
			(!m[1] || elem.nodeName.toLowerCase() === m[1]) &&
			(!m[2] || (attrs.id || {}).value === m[2]) &&
			(!m[3] || m[3].test( (attrs[ "class" ] || {}).value ))
		);
	},
	hoverHack = function( events ) {
		return jQuery.event.special.hover ? events : events.replace( rhoverHack, "mouseenter$1 mouseleave$1" );
	};

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	add: function( elem, types, handler, data, selector ) {

		var elemData, eventHandle, events,
			t, tns, type, namespaces, handleObj,
			handleObjIn, quick, handlers, special;

		// Don't attach events to noData or text/comment nodes (allow plain objects tho)
		if ( elem.nodeType === 3 || elem.nodeType === 8 || !types || !handler || !(elemData = jQuery._data( elem )) ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		events = elemData.events;
		if ( !events ) {
			elemData.events = events = {};
		}
		eventHandle = elemData.handle;
		if ( !eventHandle ) {
			elemData.handle = eventHandle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== "undefined" && (!e || jQuery.event.triggered !== e.type) ?
					jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
					undefined;
			};
			// Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
			eventHandle.elem = elem;
		}

		// Handle multiple events separated by a space
		// jQuery(...).bind("mouseover mouseout", fn);
		types = jQuery.trim( hoverHack(types) ).split( " " );
		for ( t = 0; t < types.length; t++ ) {

			tns = rtypenamespace.exec( types[t] ) || [];
			type = tns[1];
			namespaces = ( tns[2] || "" ).split( "." ).sort();

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: tns[1],
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				quick: selector && quickParse( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			handlers = events[ type ];
			if ( !handlers ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener/attachEvent if the special events handler returns false
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

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

		// Nullify elem to prevent memory leaks in IE
		elem = null;
	},

	global: {},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var elemData = jQuery.hasData( elem ) && jQuery._data( elem ),
			t, tns, type, origType, namespaces, origCount,
			j, events, special, handle, eventType, handleObj;

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = jQuery.trim( hoverHack( types || "" ) ).split(" ");
		for ( t = 0; t < types.length; t++ ) {
			tns = rtypenamespace.exec( types[t] ) || [];
			type = origType = tns[1];
			namespaces = tns[2];

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector? special.delegateType : special.bindType ) || type;
			eventType = events[ type ] || [];
			origCount = eventType.length;
			namespaces = namespaces ? new RegExp("(^|\\.)" + namespaces.split(".").sort().join("\\.(?:.*\\.)?") + "(\\.|$)") : null;

			// Remove matching events
			for ( j = 0; j < eventType.length; j++ ) {
				handleObj = eventType[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					 ( !handler || handler.guid === handleObj.guid ) &&
					 ( !namespaces || namespaces.test( handleObj.namespace ) ) &&
					 ( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					eventType.splice( j--, 1 );

					if ( handleObj.selector ) {
						eventType.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( eventType.length === 0 && origCount !== eventType.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			handle = elemData.handle;
			if ( handle ) {
				handle.elem = null;
			}

			// removeData also checks for emptiness and clears the expando if empty
			// so use it instead of delete
			jQuery.removeData( elem, [ "events", "handle" ], true );
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
		// Don't do events on text and comment nodes
		if ( elem && (elem.nodeType === 3 || elem.nodeType === 8) ) {
			return;
		}

		// Event object or event type
		var type = event.type || event,
			namespaces = [],
			cache, exclusive, i, cur, old, ontype, special, handle, eventPath, bubbleType;

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf( "!" ) >= 0 ) {
			// Exclusive events trigger only for the exact event (no namespaces)
			type = type.slice(0, -1);
			exclusive = true;
		}

		if ( type.indexOf( "." ) >= 0 ) {
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
		event.isTrigger = true;
		event.exclusive = exclusive;
		event.namespace = namespaces.join( "." );
		event.namespace_re = event.namespace? new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.)?") + "(\\.|$)") : null;
		ontype = type.indexOf( ":" ) < 0 ? "on" + type : "";

		// Handle a global trigger
		if ( !elem ) {

			// TODO: Stop taunting the data cache; remove global events and always attach to document
			cache = jQuery.cache;
			for ( i in cache ) {
				if ( cache[ i ].events && cache[ i ].events[ type ] ) {
					jQuery.event.trigger( event, data, cache[ i ].handle.elem, true );
				}
			}
			return;
		}

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data != null ? jQuery.makeArray( data ) : [];
		data.unshift( event );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		eventPath = [[ elem, special.bindType || type ]];
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			cur = rfocusMorph.test( bubbleType + type ) ? elem : elem.parentNode;
			old = null;
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push([ cur, bubbleType ]);
				old = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( old && old === elem.ownerDocument ) {
				eventPath.push([ old.defaultView || old.parentWindow || window, bubbleType ]);
			}
		}

		// Fire handlers on the event path
		for ( i = 0; i < eventPath.length && !event.isPropagationStopped(); i++ ) {

			cur = eventPath[i][0];
			event.type = eventPath[i][1];

			handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}
			// Note that this is a bare JS function and not a jQuery handler
			handle = ontype && cur[ ontype ];
			if ( handle && jQuery.acceptData( cur ) && handle.apply( cur, data ) === false ) {
				event.preventDefault();
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( elem.ownerDocument, data ) === false) &&
				!(type === "click" && jQuery.nodeName( elem, "a" )) && jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Can't use an .isFunction() check here because IE6/7 fails that test.
				// Don't do default actions on window, that's where global variables be (#6170)
				// IE<9 dies on focus/blur to hidden element (#1486)
				if ( ontype && elem[ type ] && ((type !== "focus" && type !== "blur") || event.target.offsetWidth !== 0) && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					old = elem[ ontype ];

					if ( old ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					elem[ type ]();
					jQuery.event.triggered = undefined;

					if ( old ) {
						elem[ ontype ] = old;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event || window.event );

		var handlers = ( (jQuery._data( this, "events" ) || {} )[ event.type ] || []),
			delegateCount = handlers.delegateCount,
			args = [].slice.call( arguments, 0 ),
			run_all = !event.exclusive && !event.namespace,
			special = jQuery.event.special[ event.type ] || {},
			handlerQueue = [],
			i, j, cur, jqcur, ret, selMatch, matched, matches, handleObj, sel, related;

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers that should run if there are delegated events
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && !(event.button && event.type === "click") ) {

			// Pregenerate a single jQuery object for reuse with .is()
			jqcur = jQuery(this);
			jqcur.context = this.ownerDocument || this;

			for ( cur = event.target; cur != this; cur = cur.parentNode || this ) {

				// Don't process events on disabled elements (#6911, #8165)
				if ( cur.disabled !== true ) {
					selMatch = {};
					matches = [];
					jqcur[0] = cur;
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];
						sel = handleObj.selector;

						if ( selMatch[ sel ] === undefined ) {
							selMatch[ sel ] = (
								handleObj.quick ? quickIs( cur, handleObj.quick ) : jqcur.is( sel )
							);
						}
						if ( selMatch[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, matches: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( handlers.length > delegateCount ) {
			handlerQueue.push({ elem: this, matches: handlers.slice( delegateCount ) });
		}

		// Run delegates first; they may want to stop propagation beneath us
		for ( i = 0; i < handlerQueue.length && !event.isPropagationStopped(); i++ ) {
			matched = handlerQueue[ i ];
			event.currentTarget = matched.elem;

			for ( j = 0; j < matched.matches.length && !event.isImmediatePropagationStopped(); j++ ) {
				handleObj = matched.matches[ j ];

				// Triggered event must either 1) be non-exclusive and have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( run_all || (!event.namespace && !handleObj.namespace) || event.namespace_re && event.namespace_re.test( handleObj.namespace ) ) {

					event.data = handleObj.data;
					event.handleObj = handleObj;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						event.result = ret;
						if ( ret === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	// *** attrChange attrName relatedNode srcElement  are not normalized, non-W3C, deprecated, will be removed in 1.8 ***
	props: "attrChange attrName relatedNode srcElement altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var eventDoc, doc, body,
				button = original.button,
				fromElement = original.fromElement;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add relatedTarget, if necessary
			if ( !event.relatedTarget && fromElement ) {
				event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop,
			originalEvent = event,
			fixHook = jQuery.event.fixHooks[ event.type ] || {},
			copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = jQuery.Event( originalEvent );

		for ( i = copy.length; i; ) {
			prop = copy[ --i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Fix target property, if necessary (#1925, IE 6/7/8 & Safari2)
		if ( !event.target ) {
			event.target = originalEvent.srcElement || document;
		}

		// Target should not be a text node (#504, Safari)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		// For mouse/key events; add metaKey if it's not there (#3368, IE6/7/8)
		if ( event.metaKey === undefined ) {
			event.metaKey = event.ctrlKey;
		}

		return fixHook.filter? fixHook.filter( event, originalEvent ) : event;
	},

	special: {
		ready: {
			// Make sure the ready event is setup
			setup: jQuery.bindReady
		},

		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},

		focus: {
			delegateType: "focusin"
		},
		blur: {
			delegateType: "focusout"
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
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{ type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

// Some plugins are using, but it's undocumented/deprecated and will be removed.
// The 1.7 special event interface should provide all the hooks needed now.
jQuery.event.handle = jQuery.event.dispatch;

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
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = ( src.defaultPrevented || src.returnValue === false ||
			src.getPreventDefault && src.getPreventDefault() ) ? returnTrue : returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

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

// Create mouseenter/leave events using mouseover/out and event-time checks
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj,
				selector = handleObj.selector,
				ret;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// IE submit delegation
if ( !jQuery.support.submitBubbles ) {

	jQuery.event.special.submit = {
		setup: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Lazy-add a submit handler when a descendant form may potentially be submitted
			jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
				// Node name check avoids a VML-related crash in IE (#9807)
				var elem = e.target,
					form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
				if ( form && !form._submit_attached ) {
					jQuery.event.add( form, "submit._submit", function( event ) {
						event._submit_bubble = true;
					});
					form._submit_attached = true;
				}
			});
			// return undefined since we don't need an event listener
		},
		
		postDispatch: function( event ) {
			// If form was submitted by the user, bubble the event up the tree
			if ( event._submit_bubble ) {
				delete event._submit_bubble;
				if ( this.parentNode && !event.isTrigger ) {
					jQuery.event.simulate( "submit", this.parentNode, event, true );
				}
			}
		},

		teardown: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Remove delegated handlers; cleanData eventually reaps submit handlers attached above
			jQuery.event.remove( this, "._submit" );
		}
	};
}

// IE change delegation and checkbox/radio fix
if ( !jQuery.support.changeBubbles ) {

	jQuery.event.special.change = {

		setup: function() {

			if ( rformElems.test( this.nodeName ) ) {
				// IE doesn't fire change on a check/radio until blur; trigger it on click
				// after a propertychange. Eat the blur-change in special.change.handle.
				// This still fires onchange a second time for check/radio after blur.
				if ( this.type === "checkbox" || this.type === "radio" ) {
					jQuery.event.add( this, "propertychange._change", function( event ) {
						if ( event.originalEvent.propertyName === "checked" ) {
							this._just_changed = true;
						}
					});
					jQuery.event.add( this, "click._change", function( event ) {
						if ( this._just_changed && !event.isTrigger ) {
							this._just_changed = false;
							jQuery.event.simulate( "change", this, event, true );
						}
					});
				}
				return false;
			}
			// Delegated event; lazy-add a change handler on descendant inputs
			jQuery.event.add( this, "beforeactivate._change", function( e ) {
				var elem = e.target;

				if ( rformElems.test( elem.nodeName ) && !elem._change_attached ) {
					jQuery.event.add( elem, "change._change", function( event ) {
						if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
							jQuery.event.simulate( "change", this.parentNode, event, true );
						}
					});
					elem._change_attached = true;
				}
			});
		},

		handle: function( event ) {
			var elem = event.target;

			// Swallow native change events from checkbox/radio, we already triggered them above
			if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
				return event.handleObj.handler.apply( this, arguments );
			}
		},

		teardown: function() {
			jQuery.event.remove( this, "._change" );

			return rformElems.test( this.nodeName );
		}
	};
}

// Create "bubbling" focus and blur events
if ( !jQuery.support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler while someone wants focusin/focusout
		var attaches = 0,
			handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

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
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var origFn, type;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) { // && selector != null
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			var handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( var type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	live: function( types, data, fn ) {
		jQuery( this.context ).on( types, this.selector, data, fn );
		return this;
	},
	die: function( types, fn ) {
		jQuery( this.context ).off( types, this.selector || "**", fn );
		return this;
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length == 1? this.off( selector, "**" ) : this.off( types, selector, fn );
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
				var lastToggle = ( jQuery._data( this, "lastToggle" + fn.guid ) || 0 ) % i;
				jQuery._data( this, "lastToggle" + fn.guid, lastToggle + 1 );

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

jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		if ( fn == null ) {
			fn = data;
			data = null;
		}

		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};

	if ( jQuery.attrFn ) {
		jQuery.attrFn[ name ] = true;
	}

	if ( rkeyEvent.test( name ) ) {
		jQuery.event.fixHooks[ name ] = jQuery.event.keyHooks;
	}

	if ( rmouseEvent.test( name ) ) {
		jQuery.event.fixHooks[ name ] = jQuery.event.mouseHooks;
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
	expando = "sizcache" + (Math.random() + '').replace('.', ''),
	done = 0,
	toString = Object.prototype.toString,
	hasDuplicate = false,
	baseHasDuplicate = true,
	rBackslash = /\\/g,
	rReturn = /\r\n/g,
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
			set = posProcess( parts[0] + parts[1], context, seed );

		} else {
			set = Expr.relative[ parts[0] ] ?
				[ context ] :
				Sizzle( parts.shift(), context );

			while ( parts.length ) {
				selector = parts.shift();

				if ( Expr.relative[ selector ] ) {
					selector += parts.shift();
				}

				set = posProcess( selector, set, seed );
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
	var set, i, len, match, type, left;

	if ( !expr ) {
		return [];
	}

	for ( i = 0, len = Expr.order.length; i < len; i++ ) {
		type = Expr.order[i];

		if ( (match = Expr.leftMatch[ type ].exec( expr )) ) {
			left = match[1];
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
		type, found, item, filter, left,
		i, pass,
		old = expr,
		result = [],
		curLoop = set,
		isXMLFilter = set && set[0] && Sizzle.isXML( set[0] );

	while ( expr && set.length ) {
		for ( type in Expr.filter ) {
			if ( (match = Expr.leftMatch[ type ].exec( expr )) != null && match[2] ) {
				filter = Expr.filter[ type ];
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
					for ( i = 0; (item = curLoop[i]) != null; i++ ) {
						if ( item ) {
							found = filter( item, match, i, curLoop );
							pass = not ^ found;

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
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Utility function for retreiving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
var getText = Sizzle.getText = function( elem ) {
    var i, node,
		nodeType = elem.nodeType,
		ret = "";

	if ( nodeType ) {
		if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
			// Use textContent || innerText for elements
			if ( typeof elem.textContent === 'string' ) {
				return elem.textContent;
			} else if ( typeof elem.innerText === 'string' ) {
				// Replace IE's carriage returns
				return elem.innerText.replace( rReturn, '' );
			} else {
				// Traverse it's children
				for ( elem = elem.firstChild; elem; elem = elem.nextSibling) {
					ret += getText( elem );
				}
			}
		} else if ( nodeType === 3 || nodeType === 4 ) {
			return elem.nodeValue;
		}
	} else {

		// If no nodeType, this is expected to be an array
		for ( i = 0; (node = elem[i]); i++ ) {
			// Do not traverse comment nodes
			if ( node.nodeType !== 8 ) {
				ret += getText( node );
			}
		}
	}
	return ret;
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
				return (elem.textContent || elem.innerText || getText([ elem ]) || "").indexOf(match[3]) >= 0;

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
			var first, last,
				doneName, parent, cache,
				count, diff,
				type = match[1],
				node = elem;

			switch ( type ) {
				case "only":
				case "first":
					while ( (node = node.previousSibling) ) {
						if ( node.nodeType === 1 ) {
							return false;
						}
					}

					if ( type === "first" ) {
						return true;
					}

					node = elem;

					/* falls through */
				case "last":
					while ( (node = node.nextSibling) ) {
						if ( node.nodeType === 1 ) {
							return false;
						}
					}

					return true;

				case "nth":
					first = match[2];
					last = match[3];

					if ( first === 1 && last === 0 ) {
						return true;
					}

					doneName = match[0];
					parent = elem.parentNode;

					if ( parent && (parent[ expando ] !== doneName || !elem.nodeIndex) ) {
						count = 0;

						for ( node = parent.firstChild; node; node = node.nextSibling ) {
							if ( node.nodeType === 1 ) {
								node.nodeIndex = ++count;
							}
						}

						parent[ expando ] = doneName;
					}

					diff = elem.nodeIndex - last;

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
			return (match === "*" && elem.nodeType === 1) || !!elem.nodeName && elem.nodeName.toLowerCase() === match;
		},

		CLASS: function( elem, match ) {
			return (" " + (elem.className || elem.getAttribute("class")) + " ")
				.indexOf( match ) > -1;
		},

		ATTR: function( elem, match ) {
			var name = match[1],
				result = Sizzle.attr ?
					Sizzle.attr( elem, name ) :
					Expr.attrHandle[ name ] ?
					Expr.attrHandle[ name ]( elem ) :
					elem[ name ] != null ?
						elem[ name ] :
						elem.getAttribute( name ),
				value = result + "",
				type = match[2],
				check = match[4];

			return result == null ?
				type === "!=" :
				!type && Sizzle.attr ?
				result != null :
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
// Expose origPOS
// "global" as in regardless of relation to brackets/parens
Expr.match.globalPOS = origPOS;

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
						nid = nid.replace( /'/g, "\\//--jquery--" );
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
				if ( elem[ expando ] === doneName ) {
					match = checkSet[elem.sizset];
					break;
				}

				if ( elem.nodeType === 1 && !isXML ){
					elem[ expando ] = doneName;
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
				if ( elem[ expando ] === doneName ) {
					match = checkSet[elem.sizset];
					break;
				}

				if ( elem.nodeType === 1 ) {
					if ( !isXML ) {
						elem[ expando ] = doneName;
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

var posProcess = function( selector, context, seed ) {
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
		Sizzle( selector, root[i], tmpSet, seed );
	}

	return Sizzle.filter( later, tmpSet );
};

// EXPOSE
// Override sizzle attribute retrieval
Sizzle.attr = jQuery.attr;
Sizzle.selectors.attrMap = {};
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
	POS = jQuery.expr.match.globalPOS,
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
		return !!selector && (
			typeof selector === "string" ?
				// If this is a positional selector, check membership in the returned set
				// so $("p:first").is("p:last") won't return true for a doc with two "p".
				POS.test( selector ) ?
					jQuery( selector, this.context ).index( this[0] ) >= 0 :
					jQuery.filter( selector, this ).length > 0 :
				this.filter( selector ).length > 0 );
	},

	closest: function( selectors, context ) {
		var ret = [], i, l, cur = this[0];

		// Array (deprecated as of jQuery 1.7)
		if ( jQuery.isArray( selectors ) ) {
			var level = 1;

			while ( cur && cur.ownerDocument && cur !== context ) {
				for ( i = 0; i < selectors.length; i++ ) {

					if ( jQuery( cur ).is( selectors[ i ] ) ) {
						ret.push({ selector: selectors[ i ], elem: cur, level: level });
					}
				}

				cur = cur.parentNode;
				level++;
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

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[0] && this[0].parentNode ) ? this.prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return jQuery.inArray( this[0], jQuery( elem ) );
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
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
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
		var ret = jQuery.map( this, fn, until );

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

		return this.pushStack( ret, name, slice.call( arguments ).join(",") );
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
			return ( elem === qualifier ) === keep;
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
		return ( jQuery.inArray( elem, qualifier ) >= 0 ) === keep;
	});
}




function createSafeFragment( document ) {
	var list = nodeNames.split( "|" ),
	safeFrag = document.createDocumentFragment();

	if ( safeFrag.createElement ) {
		while ( list.length ) {
			safeFrag.createElement(
				list.pop()
			);
		}
	}
	return safeFrag;
}

var nodeNames = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|" +
		"header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
	rinlinejQuery = / jQuery\d+="(?:\d+|null)"/g,
	rleadingWhitespace = /^\s+/,
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/ig,
	rtagName = /<([\w:]+)/,
	rtbody = /<tbody/i,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style)/i,
	rnocache = /<(?:script|object|embed|option|style)/i,
	rnoshimcache = new RegExp("<(?:" + nodeNames + ")[\\s/>]", "i"),
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
	},
	safeFragment = createSafeFragment( document );

wrapMap.optgroup = wrapMap.option;
wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// IE can't serialize <link> and <script> tags normally
if ( !jQuery.support.htmlSerialize ) {
	wrapMap._default = [ 1, "div<div>", "</div>" ];
}

jQuery.fn.extend({
	text: function( value ) {
		return jQuery.access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().append( ( this[0] && this[0].ownerDocument || document ).createTextNode( value ) );
		}, null, value, arguments.length );
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
		var isFunction = jQuery.isFunction( html );

		return this.each(function(i) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
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
			var set = jQuery.clean( arguments );
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
			set.push.apply( set, jQuery.clean(arguments) );
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
		return jQuery.access( this, function( value ) {
			var elem = this[0] || {},
				i = 0,
				l = this.length;

			if ( value === undefined ) {
				return elem.nodeType === 1 ?
					elem.innerHTML.replace( rinlinejQuery, "" ) :
					null;
			}


			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				( jQuery.support.leadingWhitespace || !rleadingWhitespace.test( value ) ) &&
				!wrapMap[ ( rtagName.exec( value ) || ["", ""] )[1].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for (; i < l; i++ ) {
						// Remove element nodes and prevent memory leaks
						elem = this[i] || {};
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( elem.getElementsByTagName( "*" ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch(e) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
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
						results.cacheable || ( l > 1 && i < lastIndex ) ?
							jQuery.clone( fragment, true, true ) :
							fragment
					);
				}
			}

			if ( scripts.length ) {
				jQuery.each( scripts, function( i, elem ) {
					if ( elem.src ) {
						jQuery.ajax({
							type: "GET",
							global: false,
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
				});
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

	var type, i, l,
		oldData = jQuery._data( src ),
		curData = jQuery._data( dest, oldData ),
		events = oldData.events;

	if ( events ) {
		delete curData.handle;
		curData.events = {};

		for ( type in events ) {
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				jQuery.event.add( dest, type, events[ type ][ i ] );
			}
		}
	}

	// make the cloned public data object a copy from the original
	if ( curData.data ) {
		curData.data = jQuery.extend( {}, curData.data );
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

	// IE blanks contents when cloning scripts
	} else if ( nodeName === "script" && dest.text !== src.text ) {
		dest.text = src.text;
	}

	// Event data gets referenced instead of copied if the expando
	// gets copied too
	dest.removeAttribute( jQuery.expando );

	// Clear flags for bubbling special change/submit events, they must
	// be reattached when the newly cloned events are first activated
	dest.removeAttribute( "_submit_attached" );
	dest.removeAttribute( "_change_attached" );
}

jQuery.buildFragment = function( args, nodes, scripts ) {
	var fragment, cacheable, cacheresults, doc,
	first = args[ 0 ];

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
	// Lastly, IE6,7,8 will not correctly reuse cached fragments that were created from unknown elems #10501
	if ( args.length === 1 && typeof first === "string" && first.length < 512 && doc === document &&
		first.charAt(0) === "<" && !rnocache.test( first ) &&
		(jQuery.support.checkClone || !rchecked.test( first )) &&
		(jQuery.support.html5Clone || !rnoshimcache.test( first )) ) {

		cacheable = true;

		cacheresults = jQuery.fragments[ first ];
		if ( cacheresults && cacheresults !== 1 ) {
			fragment = cacheresults;
		}
	}

	if ( !fragment ) {
		fragment = doc.createDocumentFragment();
		jQuery.clean( args, doc, fragment, scripts );
	}

	if ( cacheable ) {
		jQuery.fragments[ first ] = cacheresults ? fragment : 1;
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
				var elems = ( i > 0 ? this.clone(true) : this ).get();
				jQuery( insert[i] )[ original ]( elems );
				ret = ret.concat( elems );
			}

			return this.pushStack( ret, name, insert.selector );
		}
	};
});

function getAll( elem ) {
	if ( typeof elem.getElementsByTagName !== "undefined" ) {
		return elem.getElementsByTagName( "*" );

	} else if ( typeof elem.querySelectorAll !== "undefined" ) {
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
	var nodeName = ( elem.nodeName || "" ).toLowerCase();
	if ( nodeName === "input" ) {
		fixDefaultChecked( elem );
	// Skip scripts, get other children
	} else if ( nodeName !== "script" && typeof elem.getElementsByTagName !== "undefined" ) {
		jQuery.grep( elem.getElementsByTagName("input"), fixDefaultChecked );
	}
}

// Derived From: http://www.iecss.com/shimprove/javascript/shimprove.1-0-1.js
function shimCloneNode( elem ) {
	var div = document.createElement( "div" );
	safeFragment.appendChild( div );

	div.innerHTML = elem.outerHTML;
	return div.firstChild;
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var srcElements,
			destElements,
			i,
			// IE<=8 does not properly clone detached, unknown element nodes
			clone = jQuery.support.html5Clone || jQuery.isXMLDoc(elem) || !rnoshimcache.test( "<" + elem.nodeName + ">" ) ?
				elem.cloneNode( true ) :
				shimCloneNode( elem );

		if ( (!jQuery.support.noCloneEvent || !jQuery.support.noCloneChecked) &&
				(elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {
			// IE copies events bound via attachEvent when using cloneNode.
			// Calling detachEvent on the clone will also remove the events
			// from the original. In order to get around this, we use some
			// proprietary methods to clear the events. Thanks to MooTools
			// guys for this hotness.

			cloneFixAttributes( elem, clone );

			// Using Sizzle here is crazy slow, so we use getElementsByTagName instead
			srcElements = getAll( elem );
			destElements = getAll( clone );

			// Weird iteration because IE will replace the length property
			// with an element if you are cloning the body and one of the
			// elements on the page has a name or id of "length"
			for ( i = 0; srcElements[i]; ++i ) {
				// Ensure that the destination node is not null; Fixes #9587
				if ( destElements[i] ) {
					cloneFixAttributes( srcElements[i], destElements[i] );
				}
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
		var checkScriptType, script, j,
				ret = [];

		context = context || document;

		// !context.createElement fails in IE with an error but returns typeof 'object'
		if ( typeof context.createElement === "undefined" ) {
			context = context.ownerDocument || context[0] && context[0].ownerDocument || document;
		}

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
					var tag = ( rtagName.exec( elem ) || ["", ""] )[1].toLowerCase(),
						wrap = wrapMap[ tag ] || wrapMap._default,
						depth = wrap[0],
						div = context.createElement("div"),
						safeChildNodes = safeFragment.childNodes,
						remove;

					// Append wrapper element to unknown element safe doc fragment
					if ( context === document ) {
						// Use the fragment we've already created for this document
						safeFragment.appendChild( div );
					} else {
						// Use a fragment created with the owner document
						createSafeFragment( context ).appendChild( div );
					}

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

					// Clear elements from DocumentFragment (safeFragment or otherwise)
					// to avoid hoarding elements. Fixes #11356
					if ( div ) {
						div.parentNode.removeChild( div );

						// Guard against -1 index exceptions in FF3.6
						if ( safeChildNodes.length > 0 ) {
							remove = safeChildNodes[ safeChildNodes.length - 1 ];

							if ( remove && remove.parentNode ) {
								remove.parentNode.removeChild( remove );
							}
						}
					}
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
				script = ret[i];
				if ( scripts && jQuery.nodeName( script, "script" ) && (!script.type || rscriptType.test( script.type )) ) {
					scripts.push( script.parentNode ? script.parentNode.removeChild( script ) : script );

				} else {
					if ( script.nodeType === 1 ) {
						var jsTags = jQuery.grep( script.getElementsByTagName( "script" ), checkScriptType );

						ret.splice.apply( ret, [i + 1, 0].concat( jsTags ) );
					}
					fragment.appendChild( script );
				}
			}
		}

		return ret;
	},

	cleanData: function( elems ) {
		var data, id,
			cache = jQuery.cache,
			special = jQuery.event.special,
			deleteExpando = jQuery.support.deleteExpando;

		for ( var i = 0, elem; (elem = elems[i]) != null; i++ ) {
			if ( elem.nodeName && jQuery.noData[elem.nodeName.toLowerCase()] ) {
				continue;
			}

			id = elem[ jQuery.expando ];

			if ( id ) {
				data = cache[ id ];

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




var ralpha = /alpha\([^)]*\)/i,
	ropacity = /opacity=([^)]*)/,
	// fixed for IE9, see #8346
	rupper = /([A-Z]|^ms)/g,
	rnum = /^[\-+]?(?:\d*\.)?\d+$/i,
	rnumnonpx = /^-?(?:\d*\.)?\d+(?!px)[^\d\s]+$/i,
	rrelNum = /^([\-+])=([\-+.\de]+)/,
	rmargin = /^margin/,

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },

	// order is important!
	cssExpand = [ "Top", "Right", "Bottom", "Left" ],

	curCSS,

	getComputedStyle,
	currentStyle;

jQuery.fn.css = function( name, value ) {
	return jQuery.access( this, function( elem, name, value ) {
		return value !== undefined ?
			jQuery.style( elem, name, value ) :
			jQuery.css( elem, name );
	}, name, value, arguments.length > 1 );
};

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
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

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( +( ret[1] + 1) * +ret[2] ) + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that NaN and null values aren't set. See: #7116
			if ( value == null || type === "number" && isNaN( value ) ) {
				return;
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
		var old = {},
			ret, name;

		// Remember the old values, and insert the new ones
		for ( name in options ) {
			old[ name ] = elem.style[ name ];
			elem.style[ name ] = options[ name ];
		}

		ret = callback.call( elem );

		// Revert the old values
		for ( name in options ) {
			elem.style[ name ] = old[ name ];
		}

		return ret;
	}
});

// DEPRECATED in 1.3, Use jQuery.css() instead
jQuery.curCSS = jQuery.css;

if ( document.defaultView && document.defaultView.getComputedStyle ) {
	getComputedStyle = function( elem, name ) {
		var ret, defaultView, computedStyle, width,
			style = elem.style;

		name = name.replace( rupper, "-$1" ).toLowerCase();

		if ( (defaultView = elem.ownerDocument.defaultView) &&
				(computedStyle = defaultView.getComputedStyle( elem, null )) ) {

			ret = computedStyle.getPropertyValue( name );
			if ( ret === "" && !jQuery.contains( elem.ownerDocument.documentElement, elem ) ) {
				ret = jQuery.style( elem, name );
			}
		}

		// A tribute to the "awesome hack by Dean Edwards"
		// WebKit uses "computed value (percentage if specified)" instead of "used value" for margins
		// which is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
		if ( !jQuery.support.pixelMargin && computedStyle && rmargin.test( name ) && rnumnonpx.test( ret ) ) {
			width = style.width;
			style.width = ret;
			ret = computedStyle.width;
			style.width = width;
		}

		return ret;
	};
}

if ( document.documentElement.currentStyle ) {
	currentStyle = function( elem, name ) {
		var left, rsLeft, uncomputed,
			ret = elem.currentStyle && elem.currentStyle[ name ],
			style = elem.style;

		// Avoid setting ret to empty string here
		// so we don't default to auto
		if ( ret == null && style && (uncomputed = style[ name ]) ) {
			ret = uncomputed;
		}

		// From the awesome hack by Dean Edwards
		// http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

		// If we're not dealing with a regular pixel number
		// but a number that has a weird ending, we need to convert it to pixels
		if ( rnumnonpx.test( ret ) ) {

			// Remember the original values
			left = style.left;
			rsLeft = elem.runtimeStyle && elem.runtimeStyle.left;

			// Put in the new values to get a computed value out
			if ( rsLeft ) {
				elem.runtimeStyle.left = elem.currentStyle.left;
			}
			style.left = name === "fontSize" ? "1em" : ret;
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

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property
	var val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		i = name === "width" ? 1 : 0,
		len = 4;

	if ( val > 0 ) {
		if ( extra !== "border" ) {
			for ( ; i < len; i += 2 ) {
				if ( !extra ) {
					val -= parseFloat( jQuery.css( elem, "padding" + cssExpand[ i ] ) ) || 0;
				}
				if ( extra === "margin" ) {
					val += parseFloat( jQuery.css( elem, extra + cssExpand[ i ] ) ) || 0;
				} else {
					val -= parseFloat( jQuery.css( elem, "border" + cssExpand[ i ] + "Width" ) ) || 0;
				}
			}
		}

		return val + "px";
	}

	// Fall back to computed then uncomputed css if necessary
	val = curCSS( elem, name );
	if ( val < 0 || val == null ) {
		val = elem.style[ name ];
	}

	// Computed unit is not pixels. Stop here and return.
	if ( rnumnonpx.test(val) ) {
		return val;
	}

	// Normalize "", auto, and prepare for extra
	val = parseFloat( val ) || 0;

	// Add padding, border, margin
	if ( extra ) {
		for ( ; i < len; i += 2 ) {
			val += parseFloat( jQuery.css( elem, "padding" + cssExpand[ i ] ) ) || 0;
			if ( extra !== "padding" ) {
				val += parseFloat( jQuery.css( elem, "border" + cssExpand[ i ] + "Width" ) ) || 0;
			}
			if ( extra === "margin" ) {
				val += parseFloat( jQuery.css( elem, extra + cssExpand[ i ]) ) || 0;
			}
		}
	}

	return val + "px";
}

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				if ( elem.offsetWidth !== 0 ) {
					return getWidthOrHeight( elem, name, extra );
				} else {
					return jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					});
				}
			}
		},

		set: function( elem, value ) {
			return rnum.test( value ) ?
				value + "px" :
				value;
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
				currentStyle = elem.currentStyle,
				opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
				filter = currentStyle && currentStyle.filter || style.filter || "";

			// IE has trouble with opacity if it does not have layout
			// Force it by setting the zoom level
			style.zoom = 1;

			// if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
			if ( value >= 1 && jQuery.trim( filter.replace( ralpha, "" ) ) === "" ) {

				// Setting style.filter to null, "" & " " still leave "filter:" in the cssText
				// if "filter:" is present at all, clearType is disabled, we want to avoid this
				// style.removeAttribute is IE Only, but so apparently is this code path...
				style.removeAttribute( "filter" );

				// if there there is no filter style applied in a css rule, we are done
				if ( currentStyle && !currentStyle.filter ) {
					return;
				}
			}

			// otherwise, set new filter values
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
				return jQuery.swap( elem, { "display": "inline-block" }, function() {
					if ( computed ) {
						return curCSS( elem, "margin-right" );
					} else {
						return elem.style.marginRight;
					}
				});
			}
		};
	}
});

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.hidden = function( elem ) {
		var width = elem.offsetWidth,
			height = elem.offsetHeight;

		return ( width === 0 && height === 0 ) || (!jQuery.support.reliableHiddenOffsets && ((elem.style && elem.style.display) || jQuery.css( elem, "display" )) === "none");
	};

	jQuery.expr.filters.visible = function( elem ) {
		return !jQuery.expr.filters.hidden( elem );
	};
}

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {

	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i,

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ],
				expanded = {};

			for ( i = 0; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};
});




var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rhash = /#.*$/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
	rinput = /^(?:color|date|datetime|datetime-local|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i,
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app\-storage|.+\-extension|file|res|widget):$/,
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
	ajaxLocParts,

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = ["*/"] + ["*"];

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
			for ( ; i < length; i++ ) {
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

	for ( ; i < length && ( executeOnly || !selection ); i++ ) {
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

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};
	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}
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
		return this.on( o, f );
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
	ajaxSetup: function( target, settings ) {
		if ( settings ) {
			// Building a settings object
			ajaxExtend( target, jQuery.ajaxSettings );
		} else {
			// Extending ajaxSettings
			settings = target;
			target = jQuery.ajaxSettings;
		}
		ajaxExtend( target, settings );
		return target;
	},

	ajaxSettings: {
		url: ajaxLocation,
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		type: "GET",
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
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
			"*": allTypes
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
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			context: true,
			url: true
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
			completeDeferred = jQuery.Callbacks( "once memory" ),
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
		function done( status, nativeStatusText, responses, headers ) {

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
			jqXHR.readyState = status > 0 ? 4 : 0;

			var isSuccess,
				success,
				error,
				statusText = nativeStatusText,
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
				if ( !statusText || status ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = "" + ( nativeStatusText || statusText );

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
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
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
		jqXHR.complete = completeDeferred.add;

		// Status-dependent callbacks
		jqXHR.statusCode = function( map ) {
			if ( map ) {
				var tmp;
				if ( state < 2 ) {
					for ( tmp in map ) {
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

		// If request was aborted inside a prefilter, stop there
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
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Get ifModifiedKey before adding the anti-cache parameter
			ifModifiedKey = s.url;

			// Add anti-cache in url if needed
			if ( s.cache === false ) {

				var ts = jQuery.now(),
					// try replacing _= if it is there
					ret = s.url.replace( rts, "$1_=" + ts );

				// if nothing was replaced, add timestamp to the end
				s.url = ret + ( ( ret === s.url ) ? ( rquery.test( s.url ) ? "&" : "?" ) + "_=" + ts : "" );
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
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
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
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
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
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
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
	for ( type in responseFields ) {
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
	for ( i = 1; i < length; i++ ) {

		// Create converters map
		// with lowercased keys
		if ( i === 1 ) {
			for ( key in s.converters ) {
				if ( typeof key === "string" ) {
					converters[ key.toLowerCase() ] = s.converters[ key ];
				}
			}
		}

		// Get the dataTypes
		prev = current;
		current = dataTypes[ i ];

		// If current is auto dataType, update it to prev
		if ( current === "*" ) {
			current = prev;
		// If no auto and dataTypes are actually different
		} else if ( prev !== "*" && prev !== current ) {

			// Get the converter
			conversion = prev + " " + current;
			conv = converters[ conversion ] || converters[ "* " + current ];

			// If there is no direct converter, search transitively
			if ( !conv ) {
				conv2 = undefined;
				for ( conv1 in converters ) {
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

	var inspectData = ( typeof s.data === "string" ) && /^application\/x\-www\-form\-urlencoded/.test( s.contentType );

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

									// When requesting binary data, IE6-9 will throw an exception
									// on any attempt to access responseText (#11426)
									try {
										responses.text = xhr.responseText;
									} catch( _ ) {
									}

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
	fxNow;

jQuery.fn.extend({
	show: function( speed, easing, callback ) {
		var elem, display;

		if ( speed || speed === 0 ) {
			return this.animate( genFx("show", 3), speed, easing, callback );

		} else {
			for ( var i = 0, j = this.length; i < j; i++ ) {
				elem = this[ i ];

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
					if ( (display === "" && jQuery.css(elem, "display") === "none") ||
						!jQuery.contains( elem.ownerDocument.documentElement, elem ) ) {
						jQuery._data( elem, "olddisplay", defaultDisplay(elem.nodeName) );
					}
				}
			}

			// Set the display of most of the elements in a second loop
			// to avoid the constant reflow
			for ( i = 0; i < j; i++ ) {
				elem = this[ i ];

				if ( elem.style ) {
					display = elem.style.display;

					if ( display === "" || display === "none" ) {
						elem.style.display = jQuery._data( elem, "olddisplay" ) || "";
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
			var elem, display,
				i = 0,
				j = this.length;

			for ( ; i < j; i++ ) {
				elem = this[i];
				if ( elem.style ) {
					display = jQuery.css( elem, "display" );

					if ( display !== "none" && !jQuery._data( elem, "olddisplay" ) ) {
						jQuery._data( elem, "olddisplay", display );
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
		var optall = jQuery.speed( speed, easing, callback );

		if ( jQuery.isEmptyObject( prop ) ) {
			return this.each( optall.complete, [ false ] );
		}

		// Do not change referenced properties as per-property easing will be lost
		prop = jQuery.extend( {}, prop );

		function doAnimation() {
			// XXX 'this' does not always have a nodeName when running the
			// test suite

			if ( optall.queue === false ) {
				jQuery._mark( this );
			}

			var opt = jQuery.extend( {}, optall ),
				isElement = this.nodeType === 1,
				hidden = isElement && jQuery(this).is(":hidden"),
				name, val, p, e, hooks, replace,
				parts, start, end, unit,
				method;

			// will store per property easing and be used to determine when an animation is complete
			opt.animatedProperties = {};

			// first pass over propertys to expand / normalize
			for ( p in prop ) {
				name = jQuery.camelCase( p );
				if ( p !== name ) {
					prop[ name ] = prop[ p ];
					delete prop[ p ];
				}

				if ( ( hooks = jQuery.cssHooks[ name ] ) && "expand" in hooks ) {
					replace = hooks.expand( prop[ name ] );
					delete prop[ name ];

					// not quite $.extend, this wont overwrite keys already present.
					// also - reusing 'p' from above because we have the correct "name"
					for ( p in replace ) {
						if ( ! ( p in prop ) ) {
							prop[ p ] = replace[ p ];
						}
					}
				}
			}

			for ( name in prop ) {
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
					// animations on inline elements that are having width/height animated
					if ( jQuery.css( this, "display" ) === "inline" &&
							jQuery.css( this, "float" ) === "none" ) {

						// inline-level elements accept inline-block;
						// block-level elements need to be inline with layout
						if ( !jQuery.support.inlineBlockNeedsLayout || defaultDisplay( this.nodeName ) === "inline" ) {
							this.style.display = "inline-block";

						} else {
							this.style.zoom = 1;
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

				if ( rfxtypes.test( val ) ) {

					// Tracks whether to show or hide based on private
					// data attached to the element
					method = jQuery._data( this, "toggle" + p ) || ( val === "toggle" ? hidden ? "show" : "hide" : 0 );
					if ( method ) {
						jQuery._data( this, "toggle" + p, method === "show" ? "hide" : "show" );
						e[ method ]();
					} else {
						e[ val ]();
					}

				} else {
					parts = rfxnum.exec( val );
					start = e.cur();

					if ( parts ) {
						end = parseFloat( parts[2] );
						unit = parts[3] || ( jQuery.cssNumber[ p ] ? "" : "px" );

						// We need to compute starting value
						if ( unit !== "px" ) {
							jQuery.style( this, p, (end || 1) + unit);
							start = ( (end || 1) / e.cur() ) * start;
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
		}

		return optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},

	stop: function( type, clearQueue, gotoEnd ) {
		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var index,
				hadTimers = false,
				timers = jQuery.timers,
				data = jQuery._data( this );

			// clear marker counters if we know they won't be
			if ( !gotoEnd ) {
				jQuery._unmark( true, this );
			}

			function stopQueue( elem, data, index ) {
				var hooks = data[ index ];
				jQuery.removeData( elem, index, true );
				hooks.stop( gotoEnd );
			}

			if ( type == null ) {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && index.indexOf(".run") === index.length - 4 ) {
						stopQueue( this, data, index );
					}
				}
			} else if ( data[ index = type + ".run" ] && data[ index ].stop ){
				stopQueue( this, data, index );
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					if ( gotoEnd ) {

						// force the next step to be the last
						timers[ index ]( true );
					} else {
						timers[ index ].saveState();
					}
					hadTimers = true;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( !( gotoEnd && hadTimers ) ) {
				jQuery.dequeue( this, type );
			}
		});
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

	jQuery.each( fxAttrs.concat.apply([], fxAttrs.slice( 0, num )), function() {
		obj[ this ] = type;
	});

	return obj;
}

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx( "show", 1 ),
	slideUp: genFx( "hide", 1 ),
	slideToggle: genFx( "toggle", 1 ),
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
		var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
			complete: fn || !fn && easing ||
				jQuery.isFunction( speed ) && speed,
			duration: speed,
			easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
		};

		opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
			opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

		// normalize opt.queue - true/undefined/null -> "fx"
		if ( opt.queue == null || opt.queue === true ) {
			opt.queue = "fx";
		}

		// Queueing
		opt.old = opt.complete;

		opt.complete = function( noUnmark ) {
			if ( jQuery.isFunction( opt.old ) ) {
				opt.old.call( this );
			}

			if ( opt.queue ) {
				jQuery.dequeue( this, opt.queue );
			} else if ( noUnmark !== false ) {
				jQuery._unmark( this );
			}
		};

		return opt;
	},

	easing: {
		linear: function( p ) {
			return p;
		},
		swing: function( p ) {
			return ( -Math.cos( p*Math.PI ) / 2 ) + 0.5;
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

		( jQuery.fx.step[ this.prop ] || jQuery.fx.step._default )( this );
	},

	// Get the current size
	cur: function() {
		if ( this.elem[ this.prop ] != null && (!this.elem.style || this.elem.style[ this.prop ] == null) ) {
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
			fx = jQuery.fx;

		this.startTime = fxNow || createFxNow();
		this.end = to;
		this.now = this.start = from;
		this.pos = this.state = 0;
		this.unit = unit || this.unit || ( jQuery.cssNumber[ this.prop ] ? "" : "px" );

		function t( gotoEnd ) {
			return self.step( gotoEnd );
		}

		t.queue = this.options.queue;
		t.elem = this.elem;
		t.saveState = function() {
			if ( jQuery._data( self.elem, "fxshow" + self.prop ) === undefined ) {
				if ( self.options.hide ) {
					jQuery._data( self.elem, "fxshow" + self.prop, self.start );
				} else if ( self.options.show ) {
					jQuery._data( self.elem, "fxshow" + self.prop, self.end );
				}
			}
		};

		if ( t() && jQuery.timers.push(t) && !timerId ) {
			timerId = setInterval( fx.tick, fx.interval );
		}
	},

	// Simple 'show' function
	show: function() {
		var dataShow = jQuery._data( this.elem, "fxshow" + this.prop );

		// Remember where we started, so that we can go back to it later
		this.options.orig[ this.prop ] = dataShow || jQuery.style( this.elem, this.prop );
		this.options.show = true;

		// Begin the animation
		// Make sure that we start at a small width/height to avoid any flash of content
		if ( dataShow !== undefined ) {
			// This show is picking up where a previous hide or show left off
			this.custom( this.cur(), dataShow );
		} else {
			this.custom( this.prop === "width" || this.prop === "height" ? 1 : 0, this.cur() );
		}

		// Start by showing the element
		jQuery( this.elem ).show();
	},

	// Simple 'hide' function
	hide: function() {
		// Remember where we started, so that we can go back to it later
		this.options.orig[ this.prop ] = jQuery._data( this.elem, "fxshow" + this.prop ) || jQuery.style( this.elem, this.prop );
		this.options.hide = true;

		// Begin the animation
		this.custom( this.cur(), 0 );
	},

	// Each step of an animation
	step: function( gotoEnd ) {
		var p, n, complete,
			t = fxNow || createFxNow(),
			done = true,
			elem = this.elem,
			options = this.options;

		if ( gotoEnd || t >= options.duration + this.startTime ) {
			this.now = this.end;
			this.pos = this.state = 1;
			this.update();

			options.animatedProperties[ this.prop ] = true;

			for ( p in options.animatedProperties ) {
				if ( options.animatedProperties[ p ] !== true ) {
					done = false;
				}
			}

			if ( done ) {
				// Reset the overflow
				if ( options.overflow != null && !jQuery.support.shrinkWrapBlocks ) {

					jQuery.each( [ "", "X", "Y" ], function( index, value ) {
						elem.style[ "overflow" + value ] = options.overflow[ index ];
					});
				}

				// Hide the element if the "hide" operation was done
				if ( options.hide ) {
					jQuery( elem ).hide();
				}

				// Reset the properties, if the item has been hidden or shown
				if ( options.hide || options.show ) {
					for ( p in options.animatedProperties ) {
						jQuery.style( elem, p, options.orig[ p ] );
						jQuery.removeData( elem, "fxshow" + p, true );
						// Toggle data is no longer needed
						jQuery.removeData( elem, "toggle" + p, true );
					}
				}

				// Execute the complete function
				// in the event that the complete function throws an exception
				// we must ensure it won't be called twice. #5684

				complete = options.complete;
				if ( complete ) {

					options.complete = false;
					complete.call( elem );
				}
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
				this.pos = jQuery.easing[ options.animatedProperties[this.prop] ]( this.state, n, 0, 1, options.duration );
				this.now = this.start + ( (this.end - this.start) * this.pos );
			}
			// Perform the next step of the animation
			this.update();
		}

		return true;
	}
};

jQuery.extend( jQuery.fx, {
	tick: function() {
		var timer,
			timers = jQuery.timers,
			i = 0;

		for ( ; i < timers.length; i++ ) {
			timer = timers[ i ];
			// Checks the timer has not already been removed
			if ( !timer() && timers[ i ] === timer ) {
				timers.splice( i--, 1 );
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
				fx.elem.style[ fx.prop ] = fx.now + fx.unit;
			} else {
				fx.elem[ fx.prop ] = fx.now;
			}
		}
	}
});

// Ensure props that can't be negative don't go there on undershoot easing
jQuery.each( fxAttrs.concat.apply( [], fxAttrs ), function( i, prop ) {
	// exclude marginTop, marginLeft, marginBottom and marginRight from this list
	if ( prop.indexOf( "margin" ) ) {
		jQuery.fx.step[ prop ] = function( fx ) {
			jQuery.style( fx.elem, prop, Math.max(0, fx.now) + fx.unit );
		};
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
				iframeDoc.write( ( jQuery.support.boxModel ? "<!doctype html>" : "" ) + "<html><body>" );
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




var getOffset,
	rtable = /^t(?:able|d|h)$/i,
	rroot = /^(?:body|html)$/i;

if ( "getBoundingClientRect" in document.documentElement ) {
	getOffset = function( elem, doc, docElem, box ) {
		try {
			box = elem.getBoundingClientRect();
		} catch(e) {}

		// Make sure we're not dealing with a disconnected DOM node
		if ( !box || !jQuery.contains( docElem, elem ) ) {
			return box ? { top: box.top, left: box.left } : { top: 0, left: 0 };
		}

		var body = doc.body,
			win = getWindow( doc ),
			clientTop  = docElem.clientTop  || body.clientTop  || 0,
			clientLeft = docElem.clientLeft || body.clientLeft || 0,
			scrollTop  = win.pageYOffset || jQuery.support.boxModel && docElem.scrollTop  || body.scrollTop,
			scrollLeft = win.pageXOffset || jQuery.support.boxModel && docElem.scrollLeft || body.scrollLeft,
			top  = box.top  + scrollTop  - clientTop,
			left = box.left + scrollLeft - clientLeft;

		return { top: top, left: left };
	};

} else {
	getOffset = function( elem, doc, docElem ) {
		var computedStyle,
			offsetParent = elem.offsetParent,
			prevOffsetParent = elem,
			body = doc.body,
			defaultView = doc.defaultView,
			prevComputedStyle = defaultView ? defaultView.getComputedStyle( elem, null ) : elem.currentStyle,
			top = elem.offsetTop,
			left = elem.offsetLeft;

		while ( (elem = elem.parentNode) && elem !== body && elem !== docElem ) {
			if ( jQuery.support.fixedPosition && prevComputedStyle.position === "fixed" ) {
				break;
			}

			computedStyle = defaultView ? defaultView.getComputedStyle(elem, null) : elem.currentStyle;
			top  -= elem.scrollTop;
			left -= elem.scrollLeft;

			if ( elem === offsetParent ) {
				top  += elem.offsetTop;
				left += elem.offsetLeft;

				if ( jQuery.support.doesNotAddBorder && !(jQuery.support.doesAddBorderForTableAndCells && rtable.test(elem.nodeName)) ) {
					top  += parseFloat( computedStyle.borderTopWidth  ) || 0;
					left += parseFloat( computedStyle.borderLeftWidth ) || 0;
				}

				prevOffsetParent = offsetParent;
				offsetParent = elem.offsetParent;
			}

			if ( jQuery.support.subtractsBorderForOverflowNotVisible && computedStyle.overflow !== "visible" ) {
				top  += parseFloat( computedStyle.borderTopWidth  ) || 0;
				left += parseFloat( computedStyle.borderLeftWidth ) || 0;
			}

			prevComputedStyle = computedStyle;
		}

		if ( prevComputedStyle.position === "relative" || prevComputedStyle.position === "static" ) {
			top  += body.offsetTop;
			left += body.offsetLeft;
		}

		if ( jQuery.support.fixedPosition && prevComputedStyle.position === "fixed" ) {
			top  += Math.max( docElem.scrollTop, body.scrollTop );
			left += Math.max( docElem.scrollLeft, body.scrollLeft );
		}

		return { top: top, left: left };
	};
}

jQuery.fn.offset = function( options ) {
	if ( arguments.length ) {
		return options === undefined ?
			this :
			this.each(function( i ) {
				jQuery.offset.setOffset( this, options, i );
			});
	}

	var elem = this[0],
		doc = elem && elem.ownerDocument;

	if ( !doc ) {
		return null;
	}

	if ( elem === doc.body ) {
		return jQuery.offset.bodyOffset( elem );
	}

	return getOffset( elem, doc, doc.documentElement );
};

jQuery.offset = {

	bodyOffset: function( body ) {
		var top = body.offsetTop,
			left = body.offsetLeft;

		if ( jQuery.support.doesNotIncludeMarginInBodyOffset ) {
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
			calculatePosition = ( position === "absolute" || position === "fixed" ) && jQuery.inArray("auto", [curCSSTop, curCSSLeft]) > -1,
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

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
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
jQuery.each( {scrollLeft: "pageXOffset", scrollTop: "pageYOffset"}, function( method, prop ) {
	var top = /Y/.test( prop );

	jQuery.fn[ method ] = function( val ) {
		return jQuery.access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? (prop in win) ? win[ prop ] :
					jQuery.support.boxModel && win.document.documentElement[ method ] ||
						win.document.body[ method ] :
					elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : jQuery( win ).scrollLeft(),
					 top ? val : jQuery( win ).scrollTop()
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
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
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	var clientProp = "client" + name,
		scrollProp = "scroll" + name,
		offsetProp = "offset" + name;

	// innerHeight and innerWidth
	jQuery.fn[ "inner" + name ] = function() {
		var elem = this[0];
		return elem ?
			elem.style ?
			parseFloat( jQuery.css( elem, type, "padding" ) ) :
			this[ type ]() :
			null;
	};

	// outerHeight and outerWidth
	jQuery.fn[ "outer" + name ] = function( margin ) {
		var elem = this[0];
		return elem ?
			elem.style ?
			parseFloat( jQuery.css( elem, type, margin ? "margin" : "border" ) ) :
			this[ type ]() :
			null;
	};

	jQuery.fn[ type ] = function( value ) {
		return jQuery.access( this, function( elem, type, value ) {
			var doc, docElemProp, orig, ret;

			if ( jQuery.isWindow( elem ) ) {
				// 3rd condition allows Nokia support, as it supports the docElem prop but not CSS1Compat
				doc = elem.document;
				docElemProp = doc.documentElement[ clientProp ];
				return jQuery.support.boxModel && docElemProp ||
					doc.body && doc.body[ clientProp ] || docElemProp;
			}

			// Get document width or height
			if ( elem.nodeType === 9 ) {
				// Either scroll[Width/Height] or offset[Width/Height], whichever is greater
				doc = elem.documentElement;

				// when a window > document, IE6 reports a offset[Width/Height] > client[Width/Height]
				// so we can't use max, as it'll choose the incorrect offset[Width/Height]
				// instead we use the correct client[Width/Height]
				// support:IE6
				if ( doc[ clientProp ] >= doc[ scrollProp ] ) {
					return doc[ clientProp ];
				}

				return Math.max(
					elem.body[ scrollProp ], doc[ scrollProp ],
					elem.body[ offsetProp ], doc[ offsetProp ]
				);
			}

			// Get width or height on the element
			if ( value === undefined ) {
				orig = jQuery.css( elem, type );
				ret = parseFloat( orig );
				return jQuery.isNumeric( ret ) ? ret : orig;
			}

			// Set the width or height on the element
			jQuery( elem ).css( type, value );
		}, type, value, arguments.length, null );
	};
});




// Expose jQuery to the global object
window.jQuery = window.$ = jQuery;

// Expose jQuery as an AMD module, but only for AMD loaders that
// understand the issues with loading multiple versions of jQuery
// in a page that all might call define(). The loader will indicate
// they have special allowances for multiple jQuery versions by
// specifying define.amd.jQuery = true. Register as a named module,
// since jQuery can be concatenated with other files that may use define,
// but not use a proper concatenation script that understands anonymous
// AMD modules. A named AMD is safest and most robust way to register.
// Lowercase jquery is used because AMD module names are derived from
// file names, and jQuery is normally delivered in a lowercase file name.
// Do this after creating the global so that if an AMD module wants to call
// noConflict to hide this version of jQuery, it will work.
if ( typeof define === "function" && define.amd && define.amd.jQuery ) {
	define( "jquery", [], function () { return jQuery; } );
}



})( window );


  window.jQuery.noConflict();
  return window.jQuery;
}
module.exports = create('undefined' === typeof window ? undefined : window);
module.exports.create = create;
}());

});

require.define("/node_modules/backbone-browserify/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"lib/backbone-browserify.js","browserify":{"dependencies":{"underscore":">=1.1.2"},"main":"lib/backbone-browserify.js"}}
});

require.define("/node_modules/backbone-browserify/lib/backbone-browserify.js", function (require, module, exports, __dirname, __filename) {
//     Backbone.js 0.9.2

//     (c) 2010-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

-function(){
  function create(){

    // Initial Setup
    // -------------
    
    // Save a reference to the global object (`window` in the browser, `global`
    // on the server).
    var root = this;
    
    // Save the previous value of the `Backbone` variable, so that it can be
    // restored later on, if `noConflict` is used.
    var previousBackbone = root.Backbone;
    
    // Create a local reference to slice/splice.
    var slice = Array.prototype.slice;
    var splice = Array.prototype.splice;
    
    // The top-level namespace. All public Backbone classes and modules will
    // be attached to this. Exported for both CommonJS and the browser.
    var Backbone;
    if (typeof exports !== 'undefined') {
      Backbone = exports;
    } else {
      Backbone = root.Backbone = {};
    }
    
    // Current version of the library. Keep in sync with `package.json`.
    Backbone.VERSION = '0.9.2';
    
    // Require Underscore, if we're on the server, and it's not already present.
    var _ = root._;
    if (!_ && (typeof require !== 'undefined')) _ = require('underscore');
    
    // For Backbone's purposes, jQuery, Zepto, or Ender owns the `$` variable.
    var $ = root.jQuery || root.Zepto || root.ender;
    
    // Set the JavaScript library that will be used for DOM manipulation and
    // Ajax calls (a.k.a. the `$` variable). By default Backbone will use: jQuery,
    // Zepto, or Ender; but the `setDomLibrary()` method lets you inject an
    // alternate JavaScript library (or a mock library for testing your views
    // outside of a browser).
    Backbone.setDomLibrary = function(lib) {
      $ = lib;
    };
    
    // Runs Backbone.js in *noConflict* mode, returning the `Backbone` variable
    // to its previous owner. Returns a reference to this Backbone object.
    Backbone.noConflict = function() {
      root.Backbone = previousBackbone;
      return this;
    };
    
    // Turn on `emulateHTTP` to support legacy HTTP servers. Setting this option
    // will fake `"PUT"` and `"DELETE"` requests via the `_method` parameter and
    // set a `X-Http-Method-Override` header.
    Backbone.emulateHTTP = false;
    
    // Turn on `emulateJSON` to support legacy servers that can't deal with direct
    // `application/json` requests ... will encode the body as
    // `application/x-www-form-urlencoded` instead and will send the model in a
    // form param named `model`.
    Backbone.emulateJSON = false;
    
    // Backbone.Events
    // -----------------
    
    // Regular expression used to split event strings
    var eventSplitter = /\s+/;
    
    // A module that can be mixed in to *any object* in order to provide it with
    // custom events. You may bind with `on` or remove with `off` callback functions
    // to an event; trigger`-ing an event fires all callbacks in succession.
    //
    //     var object = {};
    //     _.extend(object, Backbone.Events);
    //     object.on('expand', function(){ alert('expanded'); });
    //     object.trigger('expand');
    //
    var Events = Backbone.Events = {
    
      // Bind one or more space separated events, `events`, to a `callback`
      // function. Passing `"all"` will bind the callback to all events fired.
      on: function(events, callback, context) {
    
        var calls, event, node, tail, list;
        if (!callback) return this;
        events = events.split(eventSplitter);
        calls = this._callbacks || (this._callbacks = {});
    
        // Create an immutable callback list, allowing traversal during
        // modification.  The tail is an empty object that will always be used
        // as the next node.
        while (event = events.shift()) {
          list = calls[event];
          node = list ? list.tail : {};
          node.next = tail = {};
          node.context = context;
          node.callback = callback;
          calls[event] = {tail: tail, next: list ? list.next : node};
        }
    
        return this;
      },
    
      // Remove one or many callbacks. If `context` is null, removes all callbacks
      // with that function. If `callback` is null, removes all callbacks for the
      // event. If `events` is null, removes all bound callbacks for all events.
      off: function(events, callback, context) {
        var event, calls, node, tail, cb, ctx;
    
        // No events, or removing *all* events.
        if (!(calls = this._callbacks)) return;
        if (!(events || callback || context)) {
          delete this._callbacks;
          return this;
        }
    
        // Loop through the listed events and contexts, splicing them out of the
        // linked list of callbacks if appropriate.
        events = events ? events.split(eventSplitter) : _.keys(calls);
        while (event = events.shift()) {
          node = calls[event];
          delete calls[event];
          if (!node || !(callback || context)) continue;
          // Create a new list, omitting the indicated callbacks.
          tail = node.tail;
          while ((node = node.next) !== tail) {
            cb = node.callback;
            ctx = node.context;
            if ((callback && cb !== callback) || (context && ctx !== context)) {
              this.on(event, cb, ctx);
            }
          }
        }
    
        return this;
      },
    
      // Trigger one or many events, firing all bound callbacks. Callbacks are
      // passed the same arguments as `trigger` is, apart from the event name
      // (unless you're listening on `"all"`, which will cause your callback to
      // receive the true name of the event as the first argument).
      trigger: function(events) {
        var event, node, calls, tail, args, all, rest;
        if (!(calls = this._callbacks)) return this;
        all = calls.all;
        events = events.split(eventSplitter);
        rest = slice.call(arguments, 1);
    
        // For each event, walk through the linked list of callbacks twice,
        // first to trigger the event, then to trigger any `"all"` callbacks.
        while (event = events.shift()) {
          if (node = calls[event]) {
            tail = node.tail;
            while ((node = node.next) !== tail) {
              node.callback.apply(node.context || this, rest);
            }
          }
          if (node = all) {
            tail = node.tail;
            args = [event].concat(rest);
            while ((node = node.next) !== tail) {
              node.callback.apply(node.context || this, args);
            }
          }
        }
    
        return this;
      }
    
    };
    
    // Aliases for backwards compatibility.
    Events.bind   = Events.on;
    Events.unbind = Events.off;
    
    // Backbone.Model
    // --------------
    
    // Create a new model, with defined attributes. A client id (`cid`)
    // is automatically generated and assigned for you.
    var Model = Backbone.Model = function(attributes, options) {
      var defaults;
      attributes || (attributes = {});
      if (options && options.parse) attributes = this.parse(attributes);
      if (defaults = getValue(this, 'defaults')) {
        attributes = _.extend({}, defaults, attributes);
      }
      if (options && options.collection) this.collection = options.collection;
      this.attributes = {};
      this._escapedAttributes = {};
      this.cid = _.uniqueId('c');
      this.changed = {};
      this._silent = {};
      this._pending = {};
      this.set(attributes, {silent: true});
      // Reset change tracking.
      this.changed = {};
      this._silent = {};
      this._pending = {};
      this._previousAttributes = _.clone(this.attributes);
      this.initialize.apply(this, arguments);
    };
    
    // Attach all inheritable methods to the Model prototype.
    _.extend(Model.prototype, Events, {
    
      // A hash of attributes whose current and previous value differ.
      changed: null,
    
      // A hash of attributes that have silently changed since the last time
      // `change` was called.  Will become pending attributes on the next call.
      _silent: null,
    
      // A hash of attributes that have changed since the last `'change'` event
      // began.
      _pending: null,
    
      // The default name for the JSON `id` attribute is `"id"`. MongoDB and
      // CouchDB users may want to set this to `"_id"`.
      idAttribute: 'id',
    
      // Initialize is an empty function by default. Override it with your own
      // initialization logic.
      initialize: function(){},
    
      // Return a copy of the model's `attributes` object.
      toJSON: function(options) {
        return _.clone(this.attributes);
      },
    
      // Get the value of an attribute.
      get: function(attr) {
        return this.attributes[attr];
      },
    
      // Get the HTML-escaped value of an attribute.
      escape: function(attr) {
        var html;
        if (html = this._escapedAttributes[attr]) return html;
        var val = this.get(attr);
        return this._escapedAttributes[attr] = _.escape(val == null ? '' : '' + val);
      },
    
      // Returns `true` if the attribute contains a value that is not null
      // or undefined.
      has: function(attr) {
        return this.get(attr) != null;
      },
    
      // Set a hash of model attributes on the object, firing `"change"` unless
      // you choose to silence it.
      set: function(key, value, options) {
        var attrs, attr, val;
    
        // Handle both
        if (_.isObject(key) || key == null) {
          attrs = key;
          options = value;
        } else {
          attrs = {};
          attrs[key] = value;
        }
    
        // Extract attributes and options.
        options || (options = {});
        if (!attrs) return this;
        if (attrs instanceof Model) attrs = attrs.attributes;
        if (options.unset) for (attr in attrs) attrs[attr] = void 0;
    
        // Run validation.
        if (!this._validate(attrs, options)) return false;
    
        // Check for changes of `id`.
        if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];
    
        var changes = options.changes = {};
        var now = this.attributes;
        var escaped = this._escapedAttributes;
        var prev = this._previousAttributes || {};
    
        // For each `set` attribute...
        for (attr in attrs) {
          val = attrs[attr];
    
          // If the new and current value differ, record the change.
          if (!_.isEqual(now[attr], val) || (options.unset && _.has(now, attr))) {
            delete escaped[attr];
            (options.silent ? this._silent : changes)[attr] = true;
          }
    
          // Update or delete the current value.
          options.unset ? delete now[attr] : now[attr] = val;
    
          // If the new and previous value differ, record the change.  If not,
          // then remove changes for this attribute.
          if (!_.isEqual(prev[attr], val) || (_.has(now, attr) != _.has(prev, attr))) {
            this.changed[attr] = val;
            if (!options.silent) this._pending[attr] = true;
          } else {
            delete this.changed[attr];
            delete this._pending[attr];
          }
        }
    
        // Fire the `"change"` events.
        if (!options.silent) this.change(options);
        return this;
      },
    
      // Remove an attribute from the model, firing `"change"` unless you choose
      // to silence it. `unset` is a noop if the attribute doesn't exist.
      unset: function(attr, options) {
        (options || (options = {})).unset = true;
        return this.set(attr, null, options);
      },
    
      // Clear all attributes on the model, firing `"change"` unless you choose
      // to silence it.
      clear: function(options) {
        (options || (options = {})).unset = true;
        return this.set(_.clone(this.attributes), options);
      },
    
      // Fetch the model from the server. If the server's representation of the
      // model differs from its current attributes, they will be overriden,
      // triggering a `"change"` event.
      fetch: function(options) {
        options = options ? _.clone(options) : {};
        var model = this;
        var success = options.success;
        options.success = function(resp, status, xhr) {
          if (!model.set(model.parse(resp, xhr), options)) return false;
          if (success) success(model, resp);
        };
        options.error = Backbone.wrapError(options.error, model, options);
        return (this.sync || Backbone.sync).call(this, 'read', this, options);
      },
    
      // Set a hash of model attributes, and sync the model to the server.
      // If the server returns an attributes hash that differs, the model's
      // state will be `set` again.
      save: function(key, value, options) {
        var attrs, current;
    
        // Handle both `("key", value)` and `({key: value})` -style calls.
        if (_.isObject(key) || key == null) {
          attrs = key;
          options = value;
        } else {
          attrs = {};
          attrs[key] = value;
        }
        options = options ? _.clone(options) : {};
    
        // If we're "wait"-ing to set changed attributes, validate early.
        if (options.wait) {
          if (!this._validate(attrs, options)) return false;
          current = _.clone(this.attributes);
        }
    
        // Regular saves `set` attributes before persisting to the server.
        var silentOptions = _.extend({}, options, {silent: true});
        if (attrs && !this.set(attrs, options.wait ? silentOptions : options)) {
          return false;
        }
    
        // After a successful server-side save, the client is (optionally)
        // updated with the server-side state.
        var model = this;
        var success = options.success;
        options.success = function(resp, status, xhr) {
          var serverAttrs = model.parse(resp, xhr);
          if (options.wait) {
            delete options.wait;
            serverAttrs = _.extend(attrs || {}, serverAttrs);
          }
          if (!model.set(serverAttrs, options)) return false;
          if (success) {
            success(model, resp);
          } else {
            model.trigger('sync', model, resp, options);
          }
        };
    
        // Finish configuring and sending the Ajax request.
        options.error = Backbone.wrapError(options.error, model, options);
        var method = this.isNew() ? 'create' : 'update';
        var xhr = (this.sync || Backbone.sync).call(this, method, this, options);
        if (options.wait) this.set(current, silentOptions);
        return xhr;
      },
    
      // Destroy this model on the server if it was already persisted.
      // Optimistically removes the model from its collection, if it has one.
      // If `wait: true` is passed, waits for the server to respond before removal.
      destroy: function(options) {
        options = options ? _.clone(options) : {};
        var model = this;
        var success = options.success;
    
        var triggerDestroy = function() {
          model.trigger('destroy', model, model.collection, options);
        };
    
        if (this.isNew()) {
          triggerDestroy();
          return false;
        }
    
        options.success = function(resp) {
          if (options.wait) triggerDestroy();
          if (success) {
            success(model, resp);
          } else {
            model.trigger('sync', model, resp, options);
          }
        };
    
        options.error = Backbone.wrapError(options.error, model, options);
        var xhr = (this.sync || Backbone.sync).call(this, 'delete', this, options);
        if (!options.wait) triggerDestroy();
        return xhr;
      },
    
      // Default URL for the model's representation on the server -- if you're
      // using Backbone's restful methods, override this to change the endpoint
      // that will be called.
      url: function() {
        var base = getValue(this, 'urlRoot') || getValue(this.collection, 'url') || urlError();
        if (this.isNew()) return base;
        return base + (base.charAt(base.length - 1) == '/' ? '' : '/') + encodeURIComponent(this.id);
      },
    
      // **parse** converts a response into the hash of attributes to be `set` on
      // the model. The default implementation is just to pass the response along.
      parse: function(resp, xhr) {
        return resp;
      },
    
      // Create a new model with identical attributes to this one.
      clone: function() {
        return new this.constructor(this.attributes);
      },
    
      // A model is new if it has never been saved to the server, and lacks an id.
      isNew: function() {
        return this.id == null;
      },
    
      // Call this method to manually fire a `"change"` event for this model and
      // a `"change:attribute"` event for each changed attribute.
      // Calling this will cause all objects observing the model to update.
      change: function(options) {
        options || (options = {});
        var changing = this._changing;
        this._changing = true;
    
        // Silent changes become pending changes.
        for (var attr in this._silent) this._pending[attr] = true;
    
        // Silent changes are triggered.
        var changes = _.extend({}, options.changes, this._silent);
        this._silent = {};
        for (var attr in changes) {
          this.trigger('change:' + attr, this, this.get(attr), options);
        }
        if (changing) return this;
    
        // Continue firing `"change"` events while there are pending changes.
        while (!_.isEmpty(this._pending)) {
          this._pending = {};
          this.trigger('change', this, options);
          // Pending and silent changes still remain.
          for (var attr in this.changed) {
            if (this._pending[attr] || this._silent[attr]) continue;
            delete this.changed[attr];
          }
          this._previousAttributes = _.clone(this.attributes);
        }
    
        this._changing = false;
        return this;
      },
    
      // Determine if the model has changed since the last `"change"` event.
      // If you specify an attribute name, determine if that attribute has changed.
      hasChanged: function(attr) {
        if (!arguments.length) return !_.isEmpty(this.changed);
        return _.has(this.changed, attr);
      },
    
      // Return an object containing all the attributes that have changed, or
      // false if there are no changed attributes. Useful for determining what
      // parts of a view need to be updated and/or what attributes need to be
      // persisted to the server. Unset attributes will be set to undefined.
      // You can also pass an attributes object to diff against the model,
      // determining if there *would be* a change.
      changedAttributes: function(diff) {
        if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
        var val, changed = false, old = this._previousAttributes;
        for (var attr in diff) {
          if (_.isEqual(old[attr], (val = diff[attr]))) continue;
          (changed || (changed = {}))[attr] = val;
        }
        return changed;
      },
    
      // Get the previous value of an attribute, recorded at the time the last
      // `"change"` event was fired.
      previous: function(attr) {
        if (!arguments.length || !this._previousAttributes) return null;
        return this._previousAttributes[attr];
      },
    
      // Get all of the attributes of the model at the time of the previous
      // `"change"` event.
      previousAttributes: function() {
        return _.clone(this._previousAttributes);
      },
    
      // Check if the model is currently in a valid state. It's only possible to
      // get into an *invalid* state if you're using silent changes.
      isValid: function() {
        return !this.validate(this.attributes);
      },
    
      // Run validation against the next complete set of model attributes,
      // returning `true` if all is well. If a specific `error` callback has
      // been passed, call that instead of firing the general `"error"` event.
      _validate: function(attrs, options) {
        if (options.silent || !this.validate) return true;
        attrs = _.extend({}, this.attributes, attrs);
        var error = this.validate(attrs, options);
        if (!error) return true;
        if (options && options.error) {
          options.error(this, error, options);
        } else {
          this.trigger('error', this, error, options);
        }
        return false;
      }
    
    });
    
    // Backbone.Collection
    // -------------------
    
    // Provides a standard collection class for our sets of models, ordered
    // or unordered. If a `comparator` is specified, the Collection will maintain
    // its models in sort order, as they're added and removed.
    var Collection = Backbone.Collection = function(models, options) {
      options || (options = {});
      if (options.model) this.model = options.model;
      if (options.comparator) this.comparator = options.comparator;
      this._reset();
      this.initialize.apply(this, arguments);
      if (models) this.reset(models, {silent: true, parse: options.parse});
    };
    
    // Define the Collection's inheritable methods.
    _.extend(Collection.prototype, Events, {
    
      // The default model for a collection is just a **Backbone.Model**.
      // This should be overridden in most cases.
      model: Model,
    
      // Initialize is an empty function by default. Override it with your own
      // initialization logic.
      initialize: function(){},
    
      // The JSON representation of a Collection is an array of the
      // models' attributes.
      toJSON: function(options) {
        return this.map(function(model){ return model.toJSON(options); });
      },
    
      // Add a model, or list of models to the set. Pass **silent** to avoid
      // firing the `add` event for every new model.
      add: function(models, options) {
        var i, index, length, model, cid, id, cids = {}, ids = {}, dups = [];
        options || (options = {});
        models = _.isArray(models) ? models.slice() : [models];
    
        // Begin by turning bare objects into model references, and preventing
        // invalid models or duplicate models from being added.
        for (i = 0, length = models.length; i < length; i++) {
          if (!(model = models[i] = this._prepareModel(models[i], options))) {
            throw new Error("Can't add an invalid model to a collection");
          }
          cid = model.cid;
          id = model.id;
          if (cids[cid] || this._byCid[cid] || ((id != null) && (ids[id] || this._byId[id]))) {
            dups.push(i);
            continue;
          }
          cids[cid] = ids[id] = model;
        }
    
        // Remove duplicates.
        i = dups.length;
        while (i--) {
          models.splice(dups[i], 1);
        }
    
        // Listen to added models' events, and index models for lookup by
        // `id` and by `cid`.
        for (i = 0, length = models.length; i < length; i++) {
          (model = models[i]).on('all', this._onModelEvent, this);
          this._byCid[model.cid] = model;
          if (model.id != null) this._byId[model.id] = model;
        }
    
        // Insert models into the collection, re-sorting if needed, and triggering
        // `add` events unless silenced.
        this.length += length;
        index = options.at != null ? options.at : this.models.length;
        splice.apply(this.models, [index, 0].concat(models));
        if (this.comparator) this.sort({silent: true});
        if (options.silent) return this;
        for (i = 0, length = this.models.length; i < length; i++) {
          if (!cids[(model = this.models[i]).cid]) continue;
          options.index = i;
          model.trigger('add', model, this, options);
        }
        return this;
      },
    
      // Remove a model, or a list of models from the set. Pass silent to avoid
      // firing the `remove` event for every model removed.
      remove: function(models, options) {
        var i, l, index, model;
        options || (options = {});
        models = _.isArray(models) ? models.slice() : [models];
        for (i = 0, l = models.length; i < l; i++) {
          model = this.getByCid(models[i]) || this.get(models[i]);
          if (!model) continue;
          delete this._byId[model.id];
          delete this._byCid[model.cid];
          index = this.indexOf(model);
          this.models.splice(index, 1);
          this.length--;
          if (!options.silent) {
            options.index = index;
            model.trigger('remove', model, this, options);
          }
          this._removeReference(model);
        }
        return this;
      },
    
      // Add a model to the end of the collection.
      push: function(model, options) {
        model = this._prepareModel(model, options);
        this.add(model, options);
        return model;
      },
    
      // Remove a model from the end of the collection.
      pop: function(options) {
        var model = this.at(this.length - 1);
        this.remove(model, options);
        return model;
      },
    
      // Add a model to the beginning of the collection.
      unshift: function(model, options) {
        model = this._prepareModel(model, options);
        this.add(model, _.extend({at: 0}, options));
        return model;
      },
    
      // Remove a model from the beginning of the collection.
      shift: function(options) {
        var model = this.at(0);
        this.remove(model, options);
        return model;
      },
    
      // Get a model from the set by id.
      get: function(id) {
        if (id == null) return void 0;
        return this._byId[id.id != null ? id.id : id];
      },
    
      // Get a model from the set by client id.
      getByCid: function(cid) {
        return cid && this._byCid[cid.cid || cid];
      },
    
      // Get the model at the given index.
      at: function(index) {
        return this.models[index];
      },
    
      // Return models with matching attributes. Useful for simple cases of `filter`.
      where: function(attrs) {
        if (_.isEmpty(attrs)) return [];
        return this.filter(function(model) {
          for (var key in attrs) {
            if (attrs[key] !== model.get(key)) return false;
          }
          return true;
        });
      },
    
      // Force the collection to re-sort itself. You don't need to call this under
      // normal circumstances, as the set will maintain sort order as each item
      // is added.
      sort: function(options) {
        options || (options = {});
        if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
        var boundComparator = _.bind(this.comparator, this);
        if (this.comparator.length == 1) {
          this.models = this.sortBy(boundComparator);
        } else {
          this.models.sort(boundComparator);
        }
        if (!options.silent) this.trigger('reset', this, options);
        return this;
      },
    
      // Pluck an attribute from each model in the collection.
      pluck: function(attr) {
        return _.map(this.models, function(model){ return model.get(attr); });
      },
    
      // When you have more items than you want to add or remove individually,
      // you can reset the entire set with a new list of models, without firing
      // any `add` or `remove` events. Fires `reset` when finished.
      reset: function(models, options) {
        models  || (models = []);
        options || (options = {});
        for (var i = 0, l = this.models.length; i < l; i++) {
          this._removeReference(this.models[i]);
        }
        this._reset();
        this.add(models, _.extend({silent: true}, options));
        if (!options.silent) this.trigger('reset', this, options);
        return this;
      },
    
      // Fetch the default set of models for this collection, resetting the
      // collection when they arrive. If `add: true` is passed, appends the
      // models to the collection instead of resetting.
      fetch: function(options) {
        options = options ? _.clone(options) : {};
        if (options.parse === undefined) options.parse = true;
        var collection = this;
        var success = options.success;
        options.success = function(resp, status, xhr) {
          collection[options.add ? 'add' : 'reset'](collection.parse(resp, xhr), options);
          if (success) success(collection, resp);
        };
        options.error = Backbone.wrapError(options.error, collection, options);
        return (this.sync || Backbone.sync).call(this, 'read', this, options);
      },
    
      // Create a new instance of a model in this collection. Add the model to the
      // collection immediately, unless `wait: true` is passed, in which case we
      // wait for the server to agree.
      create: function(model, options) {
        var coll = this;
        options = options ? _.clone(options) : {};
        model = this._prepareModel(model, options);
        if (!model) return false;
        if (!options.wait) coll.add(model, options);
        var success = options.success;
        options.success = function(nextModel, resp, xhr) {
          if (options.wait) coll.add(nextModel, options);
          if (success) {
            success(nextModel, resp);
          } else {
            nextModel.trigger('sync', model, resp, options);
          }
        };
        model.save(null, options);
        return model;
      },
    
      // **parse** converts a response into a list of models to be added to the
      // collection. The default implementation is just to pass it through.
      parse: function(resp, xhr) {
        return resp;
      },
    
      // Proxy to _'s chain. Can't be proxied the same way the rest of the
      // underscore methods are proxied because it relies on the underscore
      // constructor.
      chain: function () {
        return _(this.models).chain();
      },
    
      // Reset all internal state. Called when the collection is reset.
      _reset: function(options) {
        this.length = 0;
        this.models = [];
        this._byId  = {};
        this._byCid = {};
      },
    
      // Prepare a model or hash of attributes to be added to this collection.
      _prepareModel: function(model, options) {
        options || (options = {});
        if (!(model instanceof Model)) {
          var attrs = model;
          options.collection = this;
          model = new this.model(attrs, options);
          if (!model._validate(model.attributes, options)) model = false;
        } else if (!model.collection) {
          model.collection = this;
        }
        return model;
      },
    
      // Internal method to remove a model's ties to a collection.
      _removeReference: function(model) {
        if (this == model.collection) {
          delete model.collection;
        }
        model.off('all', this._onModelEvent, this);
      },
    
      // Internal method called every time a model in the set fires an event.
      // Sets need to update their indexes when models change ids. All other
      // events simply proxy through. "add" and "remove" events that originate
      // in other collections are ignored.
      _onModelEvent: function(event, model, collection, options) {
        if ((event == 'add' || event == 'remove') && collection != this) return;
        if (event == 'destroy') {
          this.remove(model, options);
        }
        if (model && event === 'change:' + model.idAttribute) {
          delete this._byId[model.previous(model.idAttribute)];
          this._byId[model.id] = model;
        }
        this.trigger.apply(this, arguments);
      }
    
    });
    
    // Underscore methods that we want to implement on the Collection.
    var methods = ['forEach', 'each', 'map', 'reduce', 'reduceRight', 'find',
      'detect', 'filter', 'select', 'reject', 'every', 'all', 'some', 'any',
      'include', 'contains', 'invoke', 'max', 'min', 'sortBy', 'sortedIndex',
      'toArray', 'size', 'first', 'initial', 'rest', 'last', 'without', 'indexOf',
      'shuffle', 'lastIndexOf', 'isEmpty', 'groupBy'];
    
    // Mix in each Underscore method as a proxy to `Collection#models`.
    _.each(methods, function(method) {
      Collection.prototype[method] = function() {
        return _[method].apply(_, [this.models].concat(_.toArray(arguments)));
      };
    });
    
    // Backbone.Router
    // -------------------
    
    // Routers map faux-URLs to actions, and fire events when routes are
    // matched. Creating a new one sets its `routes` hash, if not set statically.
    var Router = Backbone.Router = function(options) {
      options || (options = {});
      if (options.routes) this.routes = options.routes;
      this._bindRoutes();
      this.initialize.apply(this, arguments);
    };
    
    // Cached regular expressions for matching named param parts and splatted
    // parts of route strings.
    var namedParam    = /:\w+/g;
    var splatParam    = /\*\w+/g;
    var escapeRegExp  = /[-[\]{}()+?.,\\^$|#\s]/g;
    
    // Set up all inheritable **Backbone.Router** properties and methods.
    _.extend(Router.prototype, Events, {
    
      // Initialize is an empty function by default. Override it with your own
      // initialization logic.
      initialize: function(){},
    
      // Manually bind a single named route to a callback. For example:
      //
      //     this.route('search/:query/p:num', 'search', function(query, num) {
      //       ...
      //     });
      //
      route: function(route, name, callback) {
        Backbone.history || (Backbone.history = new History);
        if (!_.isRegExp(route)) route = this._routeToRegExp(route);
        if (!callback) callback = this[name];
        Backbone.history.route(route, _.bind(function(fragment) {
          var args = this._extractParameters(route, fragment);
          callback && callback.apply(this, args);
          this.trigger.apply(this, ['route:' + name].concat(args));
          Backbone.history.trigger('route', this, name, args);
        }, this));
        return this;
      },
    
      // Simple proxy to `Backbone.history` to save a fragment into the history.
      navigate: function(fragment, options) {
        Backbone.history.navigate(fragment, options);
      },
    
      // Bind all defined routes to `Backbone.history`. We have to reverse the
      // order of the routes here to support behavior where the most general
      // routes can be defined at the bottom of the route map.
      _bindRoutes: function() {
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
      _routeToRegExp: function(route) {
        route = route.replace(escapeRegExp, '\\$&')
                     .replace(namedParam, '([^\/]+)')
                     .replace(splatParam, '(.*?)');
        return new RegExp('^' + route + '$');
      },
    
      // Given a route, and a URL fragment that it matches, return the array of
      // extracted parameters.
      _extractParameters: function(route, fragment) {
        return route.exec(fragment).slice(1);
      }
    
    });
    
    // Backbone.History
    // ----------------
    
    // Handles cross-browser history management, based on URL fragments. If the
    // browser does not support `onhashchange`, falls back to polling.
    var History = Backbone.History = function() {
      this.handlers = [];
      _.bindAll(this, 'checkUrl');
    };
    
    // Cached regex for cleaning leading hashes and slashes .
    var routeStripper = /^[#\/]/;
    
    // Cached regex for detecting MSIE.
    var isExplorer = /msie [\w.]+/;
    
    // Has the history handling already been started?
    History.started = false;
    
    // Set up all inheritable **Backbone.History** properties and methods.
    _.extend(History.prototype, Events, {
    
      // The default interval to poll for hash changes, if necessary, is
      // twenty times a second.
      interval: 50,
    
      // Gets the true hash value. Cannot use location.hash directly due to bug
      // in Firefox where location.hash will always be decoded.
      getHash: function(windowOverride) {
        var loc = windowOverride ? windowOverride.location : window.location;
        var match = loc.href.match(/#(.*)$/);
        return match ? match[1] : '';
      },
    
      // Get the cross-browser normalized URL fragment, either from the URL,
      // the hash, or the override.
      getFragment: function(fragment, forcePushState) {
        if (fragment == null) {
          if (this._hasPushState || forcePushState) {
            fragment = window.location.pathname;
            var search = window.location.search;
            if (search) fragment += search;
          } else {
            fragment = this.getHash();
          }
        }
        if (!fragment.indexOf(this.options.root)) fragment = fragment.substr(this.options.root.length);
        return fragment.replace(routeStripper, '');
      },
    
      // Start the hash change handling, returning `true` if the current URL matches
      // an existing route, and `false` otherwise.
      start: function(options) {
        if (History.started) throw new Error("Backbone.history has already been started");
        History.started = true;
    
        // Figure out the initial configuration. Do we need an iframe?
        // Is pushState desired ... is it available?
        this.options          = _.extend({}, {root: '/'}, this.options, options);
        this._wantsHashChange = this.options.hashChange !== false;
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
        } else if (this._wantsHashChange && ('onhashchange' in window) && !oldIE) {
          $(window).bind('hashchange', this.checkUrl);
        } else if (this._wantsHashChange) {
          this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
        }
    
        // Determine if we need to change the base url, for a pushState link
        // opened by a non-pushState browser.
        this.fragment = fragment;
        var loc = window.location;
        var atRoot  = loc.pathname == this.options.root;
    
        // If we've started off with a route from a `pushState`-enabled browser,
        // but we're currently in a browser that doesn't support it...
        if (this._wantsHashChange && this._wantsPushState && !this._hasPushState && !atRoot) {
          this.fragment = this.getFragment(null, true);
          window.location.replace(this.options.root + '#' + this.fragment);
          // Return immediately as browser will do redirect to new url
          return true;
    
        // Or if we've started out with a hash-based route, but we're currently
        // in a browser where it could be `pushState`-based instead...
        } else if (this._wantsPushState && this._hasPushState && atRoot && loc.hash) {
          this.fragment = this.getHash().replace(routeStripper, '');
          window.history.replaceState({}, document.title, loc.protocol + '//' + loc.host + this.options.root + this.fragment);
        }
    
        if (!this.options.silent) {
          return this.loadUrl();
        }
      },
    
      // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
      // but possibly useful for unit testing Routers.
      stop: function() {
        $(window).unbind('popstate', this.checkUrl).unbind('hashchange', this.checkUrl);
        clearInterval(this._checkUrlInterval);
        History.started = false;
      },
    
      // Add a route to be tested when the fragment changes. Routes added later
      // may override previous routes.
      route: function(route, callback) {
        this.handlers.unshift({route: route, callback: callback});
      },
    
      // Checks the current URL to see if it has changed, and if it has,
      // calls `loadUrl`, normalizing across the hidden iframe.
      checkUrl: function(e) {
        var current = this.getFragment();
        if (current == this.fragment && this.iframe) current = this.getFragment(this.getHash(this.iframe));
        if (current == this.fragment) return false;
        if (this.iframe) this.navigate(current);
        this.loadUrl() || this.loadUrl(this.getHash());
      },
    
      // Attempt to load the current URL fragment. If a route succeeds with a
      // match, returns `true`. If no defined routes matches the fragment,
      // returns `false`.
      loadUrl: function(fragmentOverride) {
        var fragment = this.fragment = this.getFragment(fragmentOverride);
        var matched = _.any(this.handlers, function(handler) {
          if (handler.route.test(fragment)) {
            handler.callback(fragment);
            return true;
          }
        });
        return matched;
      },
    
      // Save a fragment into the hash history, or replace the URL state if the
      // 'replace' option is passed. You are responsible for properly URL-encoding
      // the fragment in advance.
      //
      // The options object can contain `trigger: true` if you wish to have the
      // route callback be fired (not usually desirable), or `replace: true`, if
      // you wish to modify the current URL without adding an entry to the history.
      navigate: function(fragment, options) {
        if (!History.started) return false;
        if (!options || options === true) options = {trigger: options};
        var frag = (fragment || '').replace(routeStripper, '');
        if (this.fragment == frag) return;
    
        // If pushState is available, we use it to set the fragment as a real URL.
        if (this._hasPushState) {
          if (frag.indexOf(this.options.root) != 0) frag = this.options.root + frag;
          this.fragment = frag;
          window.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, frag);
    
        // If hash changes haven't been explicitly disabled, update the hash
        // fragment to store history.
        } else if (this._wantsHashChange) {
          this.fragment = frag;
          this._updateHash(window.location, frag, options.replace);
          if (this.iframe && (frag != this.getFragment(this.getHash(this.iframe)))) {
            // Opening and closing the iframe tricks IE7 and earlier to push a history entry on hash-tag change.
            // When replace is true, we don't want this.
            if(!options.replace) this.iframe.document.open().close();
            this._updateHash(this.iframe.location, frag, options.replace);
          }
    
        // If you've told us that you explicitly don't want fallback hashchange-
        // based history, then `navigate` becomes a page refresh.
        } else {
          window.location.assign(this.options.root + fragment);
        }
        if (options.trigger) this.loadUrl(fragment);
      },
    
      // Update the hash location, either replacing the current entry, or adding
      // a new one to the browser history.
      _updateHash: function(location, fragment, replace) {
        if (replace) {
          location.replace(location.toString().replace(/(javascript:|#).*$/, '') + '#' + fragment);
        } else {
          location.hash = fragment;
        }
      }
    });
    
    // Backbone.View
    // -------------
    
    // Creating a Backbone.View creates its initial element outside of the DOM,
    // if an existing element is not provided...
    var View = Backbone.View = function(options) {
      this.cid = _.uniqueId('view');
      this._configure(options || {});
      this._ensureElement();
      this.initialize.apply(this, arguments);
      this.delegateEvents();
    };
    
    // Cached regex to split keys for `delegate`.
    var delegateEventSplitter = /^(\S+)\s*(.*)$/;
    
    // List of view options to be merged as properties.
    var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName'];
    
    // Set up all inheritable **Backbone.View** properties and methods.
    _.extend(View.prototype, Events, {
    
      // The default `tagName` of a View's element is `"div"`.
      tagName: 'div',
    
      // jQuery delegate for element lookup, scoped to DOM elements within the
      // current view. This should be prefered to global lookups where possible.
      $: function(selector) {
        return this.$el.find(selector);
      },
    
      // Initialize is an empty function by default. Override it with your own
      // initialization logic.
      initialize: function(){},
    
      // **render** is the core function that your view should override, in order
      // to populate its element (`this.el`), with the appropriate HTML. The
      // convention is for **render** to always return `this`.
      render: function() {
        return this;
      },
    
      // Remove this view from the DOM. Note that the view isn't present in the
      // DOM by default, so calling this method may be a no-op.
      remove: function() {
        this.$el.remove();
        return this;
      },
    
      // For small amounts of DOM Elements, where a full-blown template isn't
      // needed, use **make** to manufacture elements, one at a time.
      //
      //     var el = this.make('li', {'class': 'row'}, this.model.escape('title'));
      //
      make: function(tagName, attributes, content) {
        var el = document.createElement(tagName);
        if (attributes) $(el).attr(attributes);
        if (content != null) $(el).html(content);
        return el;
      },
    
      // Change the view's element (`this.el` property), including event
      // re-delegation.
      setElement: function(element, delegate) {
        if (this.$el) this.undelegateEvents();
        this.$el = (element instanceof $) ? element : $(element);
        this.el = this.$el[0];
        if (delegate !== false) this.delegateEvents();
        return this;
      },
    
      // Set callbacks, where `this.events` is a hash of
      //
      // *{"event selector": "callback"}*
      //
      //     {
      //       'mousedown .title':  'edit',
      //       'click .button':     'save'
      //       'click .open':       function(e) { ... }
      //     }
      //
      // pairs. Callbacks will be bound to the view, with `this` set properly.
      // Uses event delegation for efficiency.
      // Omitting the selector binds the event to `this.el`.
      // This only works for delegate-able events: not `focus`, `blur`, and
      // not `change`, `submit`, and `reset` in Internet Explorer.
      delegateEvents: function(events) {
        if (!(events || (events = getValue(this, 'events')))) return;
        this.undelegateEvents();
        for (var key in events) {
          var method = events[key];
          if (!_.isFunction(method)) method = this[events[key]];
          if (!method) throw new Error('Method "' + events[key] + '" does not exist');
          var match = key.match(delegateEventSplitter);
          var eventName = match[1], selector = match[2];
          method = _.bind(method, this);
          eventName += '.delegateEvents' + this.cid;
          if (selector === '') {
            this.$el.bind(eventName, method);
          } else {
            this.$el.delegate(selector, eventName, method);
          }
        }
      },
    
      // Clears all callbacks previously bound to the view with `delegateEvents`.
      // You usually don't need to use this, but may wish to if you have multiple
      // Backbone views attached to the same DOM element.
      undelegateEvents: function() {
        this.$el.unbind('.delegateEvents' + this.cid);
      },
    
      // Performs the initial configuration of a View with a set of options.
      // Keys with special meaning *(model, collection, id, className)*, are
      // attached directly to the view.
      _configure: function(options) {
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
      // an element from the `id`, `className` and `tagName` properties.
      _ensureElement: function() {
        if (!this.el) {
          var attrs = getValue(this, 'attributes') || {};
          if (this.id) attrs.id = this.id;
          if (this.className) attrs['class'] = this.className;
          this.setElement(this.make(this.tagName, attrs), false);
        } else {
          this.setElement(this.el, false);
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
    Model.extend = Collection.extend = Router.extend = View.extend = extend;
    
    // Backbone.sync
    // -------------
    
    // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
    var methodMap = {
      'create': 'POST',
      'update': 'PUT',
      'delete': 'DELETE',
      'read':   'GET'
    };
    
    // Override this function to change the manner in which Backbone persists
    // models to the server. You will be passed the type of request, and the
    // model in question. By default, makes a RESTful Ajax request
    // to the model's `url()`. Some possible customizations could be:
    //
    // * Use `setTimeout` to batch rapid-fire updates into a single request.
    // * Send up the models as XML instead of JSON.
    // * Persist models via WebSockets instead of Ajax.
    //
    // Turn on `Backbone.emulateHTTP` in order to send `PUT` and `DELETE` requests
    // as `POST`, with a `_method` parameter containing the true HTTP method,
    // as well as all requests with the body as `application/x-www-form-urlencoded`
    // instead of `application/json` with the model in a param named `model`.
    // Useful when interfacing with server-side languages like **PHP** that make
    // it difficult to read the body of `PUT` requests.
    Backbone.sync = function(method, model, options) {
      var type = methodMap[method];
    
      // Default options, unless specified.
      options || (options = {});
    
      // Default JSON-request options.
      var params = {type: type, dataType: 'json'};
    
      // Ensure that we have a URL.
      if (!options.url) {
        params.url = getValue(model, 'url') || urlError();
      }
    
      // Ensure that we have the appropriate request data.
      if (!options.data && model && (method == 'create' || method == 'update')) {
        params.contentType = 'application/json';
        params.data = JSON.stringify(model.toJSON());
      }
    
      // For older servers, emulate JSON by encoding the request into an HTML-form.
      if (Backbone.emulateJSON) {
        params.contentType = 'application/x-www-form-urlencoded';
        params.data = params.data ? {model: params.data} : {};
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
    
      // Make the request, allowing the user to override any Ajax options.
      return $.ajax(_.extend(params, options));
    };
    
    // Wrap an optional error callback with a fallback error event.
    Backbone.wrapError = function(onError, originalModel, options) {
      return function(model, resp) {
        resp = model === originalModel ? resp : model;
        if (onError) {
          onError(originalModel, resp, options);
        } else {
          originalModel.trigger('error', originalModel, resp, options);
        }
      };
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
      // by us to simply call the parent's constructor.
      if (protoProps && protoProps.hasOwnProperty('constructor')) {
        child = protoProps.constructor;
      } else {
        child = function(){ parent.apply(this, arguments); };
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
    
    // Helper function to get a value from a Backbone object as a property
    // or as a function.
    var getValue = function(object, prop) {
      if (!(object && object[prop])) return null;
      return _.isFunction(object[prop]) ? object[prop]() : object[prop];
    };
    
    // Throw an error when a URL is needed, and none is supplied.
    var urlError = function() {
      throw new Error('A "url" property or function must be specified');
    };
    
    return Backbone;
  };
  
  // Export for browserify
  if (module == null) { module = {}; };
  module.exports = create(this);
    
}(this);
});

require.define("/node_modules/underscore/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"underscore.js"}
});

require.define("/node_modules/underscore/underscore.js", function (require, module, exports, __dirname, __filename) {
//     Underscore.js 1.3.3
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
  _.VERSION = '1.3.3';

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
    return !!result;
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
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.max.apply(Math, obj);
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
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.min.apply(Math, obj);
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
      rand = Math.floor(Math.random() * (index + 1));
      shuffled[index] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, val, context) {
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria, b = right.criteria;
      if (a === void 0) return 1;
      if (b === void 0) return -1;
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
  _.toArray = function(obj) {
    if (!obj)                                     return [];
    if (_.isArray(obj))                           return slice.call(obj);
    if (_.isArguments(obj))                       return slice.call(obj);
    if (obj.toArray && _.isFunction(obj.toArray)) return obj.toArray();
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return _.isArray(obj) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
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
    var results = [];
    // The `isSorted` flag is irrelevant if the array only contains two elements.
    if (array.length < 3) isSorted = true;
    _.reduce(initial, function (memo, value, index) {
      if (isSorted ? _.last(memo) !== value || !memo.length : !_.include(memo, value)) {
        memo.push(value);
        results.push(array[index]);
      }
      return memo;
    }, []);
    return results;
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
    var rest = _.flatten(slice.call(arguments, 1), true);
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
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, throttling, more, result;
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
        result = func.apply(context, args);
      }
      whenDone();
      throttling = true;
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      if (immediate && !timeout) func.apply(context, args);
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

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var result = {};
    each(_.flatten(slice.call(arguments, 1)), function(key) {
      if (key in obj) result[key] = obj[key];
    });
    return result;
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
    if (obj == null) return true;
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

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return _.isNumber(obj) && isFinite(obj);
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

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
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

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    '\\': '\\',
    "'": "'",
    'r': '\r',
    'n': '\n',
    't': '\t',
    'u2028': '\u2028',
    'u2029': '\u2029'
  };

  for (var p in escapes) escapes[escapes[p]] = p;
  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;
  var unescaper = /\\(\\|'|r|n|t|u2028|u2029)/g;

  // Within an interpolation, evaluation, or escaping, remove HTML escaping
  // that had been previously added.
  var unescape = function(code) {
    return code.replace(unescaper, function(match, escape) {
      return escapes[escape];
    });
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    settings = _.defaults(settings || {}, _.templateSettings);

    // Compile the template source, taking care to escape characters that
    // cannot be included in a string literal and then unescape them in code
    // blocks.
    var source = "__p+='" + text
      .replace(escaper, function(match) {
        return '\\' + escapes[match];
      })
      .replace(settings.escape || noMatch, function(match, code) {
        return "'+\n_.escape(" + unescape(code) + ")+\n'";
      })
      .replace(settings.interpolate || noMatch, function(match, code) {
        return "'+\n(" + unescape(code) + ")+\n'";
      })
      .replace(settings.evaluate || noMatch, function(match, code) {
        return "';\n" + unescape(code) + "\n;__p+='";
      }) + "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __p='';" +
      "var print=function(){__p+=Array.prototype.join.call(arguments, '')};\n" +
      source + "return __p;\n";

    var render = new Function(settings.variable || 'obj', '_', source);
    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for build time
    // precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' +
      source + '}';

    return template;
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

require.define("/node_modules/chai/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"./index"}
});

require.define("/node_modules/chai/index.js", function (require, module, exports, __dirname, __filename) {
module.exports = (process && process.env && process.env.CHAI_COV)
  ? require('./lib-cov/chai')
  : require('./lib/chai');

});

require.define("/node_modules/chai/lib-cov/chai.js", function (require, module, exports, __dirname, __filename) {
/* automatically generated by JSCoverage - do not edit */
if (typeof _$jscoverage === 'undefined') _$jscoverage = {};
if (! _$jscoverage['chai.js']) {
  _$jscoverage['chai.js'] = [];
  _$jscoverage['chai.js'][7] = 0;
  _$jscoverage['chai.js'][8] = 0;
  _$jscoverage['chai.js'][10] = 0;
  _$jscoverage['chai.js'][12] = 0;
  _$jscoverage['chai.js'][13] = 0;
  _$jscoverage['chai.js'][15] = 0;
  _$jscoverage['chai.js'][17] = 0;
  _$jscoverage['chai.js'][18] = 0;
  _$jscoverage['chai.js'][19] = 0;
  _$jscoverage['chai.js'][20] = 0;
  _$jscoverage['chai.js'][23] = 0;
  _$jscoverage['chai.js'][26] = 0;
  _$jscoverage['chai.js'][27] = 0;
  _$jscoverage['chai.js'][29] = 0;
  _$jscoverage['chai.js'][30] = 0;
  _$jscoverage['chai.js'][32] = 0;
  _$jscoverage['chai.js'][33] = 0;
}
_$jscoverage['chai.js'][7]++;
var used = [];
_$jscoverage['chai.js'][8]++;
var exports = module.exports = {};
_$jscoverage['chai.js'][10]++;
exports.version = "0.5.2";
_$jscoverage['chai.js'][12]++;
exports.Assertion = require("./assertion");
_$jscoverage['chai.js'][13]++;
exports.AssertionError = require("./error");
_$jscoverage['chai.js'][15]++;
exports.inspect = require("./utils/inspect");
_$jscoverage['chai.js'][17]++;
exports.use = (function (fn) {
  _$jscoverage['chai.js'][18]++;
  if (! ~ used.indexOf(fn)) {
    _$jscoverage['chai.js'][19]++;
    fn(this);
    _$jscoverage['chai.js'][20]++;
    used.push(fn);
  }
  _$jscoverage['chai.js'][23]++;
  return this;
});
_$jscoverage['chai.js'][26]++;
var expect = require("./interface/expect");
_$jscoverage['chai.js'][27]++;
exports.use(expect);
_$jscoverage['chai.js'][29]++;
var should = require("./interface/should");
_$jscoverage['chai.js'][30]++;
exports.use(should);
_$jscoverage['chai.js'][32]++;
var assert = require("./interface/assert");
_$jscoverage['chai.js'][33]++;
exports.use(assert);
_$jscoverage['chai.js'].source = ["/*!"," * chai"," * Copyright(c) 2011-2012 Jake Luer &lt;jake@alogicalparadox.com&gt;"," * MIT Licensed"," */","","var used = [];","var exports = module.exports = {};","","exports.version = '0.5.2';","","exports.Assertion = require('./assertion');","exports.AssertionError = require('./error');","","exports.inspect = require('./utils/inspect');","","exports.use = function (fn) {","  if (!~used.indexOf(fn)) {","    fn(this);","    used.push(fn);","  }","","  return this;","};","","var expect = require('./interface/expect');","exports.use(expect);","","var should = require('./interface/should');","exports.use(should);","","var assert = require('./interface/assert');","exports.use(assert);"];

});

require.define("/node_modules/chai/lib-cov/assertion.js", function (require, module, exports, __dirname, __filename) {
/* automatically generated by JSCoverage - do not edit */
if (typeof _$jscoverage === 'undefined') _$jscoverage = {};
if (! _$jscoverage['assertion.js']) {
  _$jscoverage['assertion.js'] = [];
  _$jscoverage['assertion.js'][48] = 0;
  _$jscoverage['assertion.js'][57] = 0;
  _$jscoverage['assertion.js'][68] = 0;
  _$jscoverage['assertion.js'][69] = 0;
  _$jscoverage['assertion.js'][70] = 0;
  _$jscoverage['assertion.js'][71] = 0;
  _$jscoverage['assertion.js'][87] = 0;
  _$jscoverage['assertion.js'][103] = 0;
  _$jscoverage['assertion.js'][104] = 0;
  _$jscoverage['assertion.js'][105] = 0;
  _$jscoverage['assertion.js'][108] = 0;
  _$jscoverage['assertion.js'][109] = 0;
  _$jscoverage['assertion.js'][127] = 0;
  _$jscoverage['assertion.js'][129] = 0;
  _$jscoverage['assertion.js'][143] = 0;
  _$jscoverage['assertion.js'][145] = 0;
  _$jscoverage['assertion.js'][159] = 0;
  _$jscoverage['assertion.js'][161] = 0;
  _$jscoverage['assertion.js'][176] = 0;
  _$jscoverage['assertion.js'][178] = 0;
  _$jscoverage['assertion.js'][179] = 0;
  _$jscoverage['assertion.js'][193] = 0;
  _$jscoverage['assertion.js'][195] = 0;
  _$jscoverage['assertion.js'][208] = 0;
  _$jscoverage['assertion.js'][210] = 0;
  _$jscoverage['assertion.js'][224] = 0;
  _$jscoverage['assertion.js'][226] = 0;
  _$jscoverage['assertion.js'][240] = 0;
  _$jscoverage['assertion.js'][242] = 0;
  _$jscoverage['assertion.js'][256] = 0;
  _$jscoverage['assertion.js'][258] = 0;
  _$jscoverage['assertion.js'][272] = 0;
  _$jscoverage['assertion.js'][274] = 0;
  _$jscoverage['assertion.js'][275] = 0;
  _$jscoverage['assertion.js'][294] = 0;
  _$jscoverage['assertion.js'][296] = 0;
  _$jscoverage['assertion.js'][301] = 0;
  _$jscoverage['assertion.js'][315] = 0;
  _$jscoverage['assertion.js'][317] = 0;
  _$jscoverage['assertion.js'][324] = 0;
  _$jscoverage['assertion.js'][338] = 0;
  _$jscoverage['assertion.js'][340] = 0;
  _$jscoverage['assertion.js'][347] = 0;
  _$jscoverage['assertion.js'][366] = 0;
  _$jscoverage['assertion.js'][368] = 0;
  _$jscoverage['assertion.js'][374] = 0;
  _$jscoverage['assertion.js'][390] = 0;
  _$jscoverage['assertion.js'][392] = 0;
  _$jscoverage['assertion.js'][394] = 0;
  _$jscoverage['assertion.js'][395] = 0;
  _$jscoverage['assertion.js'][396] = 0;
  _$jscoverage['assertion.js'][397] = 0;
  _$jscoverage['assertion.js'][400] = 0;
  _$jscoverage['assertion.js'][405] = 0;
  _$jscoverage['assertion.js'][423] = 0;
  _$jscoverage['assertion.js'][425] = 0;
  _$jscoverage['assertion.js'][433] = 0;
  _$jscoverage['assertion.js'][450] = 0;
  _$jscoverage['assertion.js'][451] = 0;
  _$jscoverage['assertion.js'][457] = 0;
  _$jscoverage['assertion.js'][472] = 0;
  _$jscoverage['assertion.js'][473] = 0;
  _$jscoverage['assertion.js'][479] = 0;
  _$jscoverage['assertion.js'][494] = 0;
  _$jscoverage['assertion.js'][495] = 0;
  _$jscoverage['assertion.js'][500] = 0;
  _$jscoverage['assertion.js'][515] = 0;
  _$jscoverage['assertion.js'][516] = 0;
  _$jscoverage['assertion.js'][521] = 0;
  _$jscoverage['assertion.js'][537] = 0;
  _$jscoverage['assertion.js'][538] = 0;
  _$jscoverage['assertion.js'][540] = 0;
  _$jscoverage['assertion.js'][545] = 0;
  _$jscoverage['assertion.js'][560] = 0;
  _$jscoverage['assertion.js'][561] = 0;
  _$jscoverage['assertion.js'][563] = 0;
  _$jscoverage['assertion.js'][571] = 0;
  _$jscoverage['assertion.js'][590] = 0;
  _$jscoverage['assertion.js'][591] = 0;
  _$jscoverage['assertion.js'][592] = 0;
  _$jscoverage['assertion.js'][597] = 0;
  _$jscoverage['assertion.js'][617] = 0;
  _$jscoverage['assertion.js'][618] = 0;
  _$jscoverage['assertion.js'][619] = 0;
  _$jscoverage['assertion.js'][620] = 0;
  _$jscoverage['assertion.js'][623] = 0;
  _$jscoverage['assertion.js'][629] = 0;
  _$jscoverage['assertion.js'][630] = 0;
  _$jscoverage['assertion.js'][640] = 0;
  _$jscoverage['assertion.js'][641] = 0;
  _$jscoverage['assertion.js'][657] = 0;
  _$jscoverage['assertion.js'][658] = 0;
  _$jscoverage['assertion.js'][662] = 0;
  _$jscoverage['assertion.js'][679] = 0;
  _$jscoverage['assertion.js'][680] = 0;
  _$jscoverage['assertion.js'][681] = 0;
  _$jscoverage['assertion.js'][683] = 0;
  _$jscoverage['assertion.js'][691] = 0;
  _$jscoverage['assertion.js'][706] = 0;
  _$jscoverage['assertion.js'][707] = 0;
  _$jscoverage['assertion.js'][712] = 0;
  _$jscoverage['assertion.js'][727] = 0;
  _$jscoverage['assertion.js'][728] = 0;
  _$jscoverage['assertion.js'][733] = 0;
  _$jscoverage['assertion.js'][748] = 0;
  _$jscoverage['assertion.js'][749] = 0;
  _$jscoverage['assertion.js'][751] = 0;
  _$jscoverage['assertion.js'][756] = 0;
  _$jscoverage['assertion.js'][770] = 0;
  _$jscoverage['assertion.js'][772] = 0;
  _$jscoverage['assertion.js'][773] = 0;
  _$jscoverage['assertion.js'][792] = 0;
  _$jscoverage['assertion.js'][793] = 0;
  _$jscoverage['assertion.js'][796] = 0;
  _$jscoverage['assertion.js'][800] = 0;
  _$jscoverage['assertion.js'][802] = 0;
  _$jscoverage['assertion.js'][806] = 0;
  _$jscoverage['assertion.js'][807] = 0;
  _$jscoverage['assertion.js'][811] = 0;
  _$jscoverage['assertion.js'][812] = 0;
  _$jscoverage['assertion.js'][816] = 0;
  _$jscoverage['assertion.js'][817] = 0;
  _$jscoverage['assertion.js'][818] = 0;
  _$jscoverage['assertion.js'][820] = 0;
  _$jscoverage['assertion.js'][821] = 0;
  _$jscoverage['assertion.js'][823] = 0;
  _$jscoverage['assertion.js'][827] = 0;
  _$jscoverage['assertion.js'][830] = 0;
  _$jscoverage['assertion.js'][833] = 0;
  _$jscoverage['assertion.js'][841] = 0;
  _$jscoverage['assertion.js'][871] = 0;
  _$jscoverage['assertion.js'][872] = 0;
  _$jscoverage['assertion.js'][874] = 0;
  _$jscoverage['assertion.js'][876] = 0;
  _$jscoverage['assertion.js'][877] = 0;
  _$jscoverage['assertion.js'][878] = 0;
  _$jscoverage['assertion.js'][879] = 0;
  _$jscoverage['assertion.js'][880] = 0;
  _$jscoverage['assertion.js'][881] = 0;
  _$jscoverage['assertion.js'][884] = 0;
  _$jscoverage['assertion.js'][885] = 0;
  _$jscoverage['assertion.js'][888] = 0;
  _$jscoverage['assertion.js'][889] = 0;
  _$jscoverage['assertion.js'][893] = 0;
  _$jscoverage['assertion.js'][896] = 0;
  _$jscoverage['assertion.js'][897] = 0;
  _$jscoverage['assertion.js'][902] = 0;
  _$jscoverage['assertion.js'][903] = 0;
  _$jscoverage['assertion.js'][904] = 0;
  _$jscoverage['assertion.js'][909] = 0;
  _$jscoverage['assertion.js'][911] = 0;
  _$jscoverage['assertion.js'][915] = 0;
  _$jscoverage['assertion.js'][917] = 0;
  _$jscoverage['assertion.js'][922] = 0;
  _$jscoverage['assertion.js'][938] = 0;
  _$jscoverage['assertion.js'][939] = 0;
  _$jscoverage['assertion.js'][943] = 0;
  _$jscoverage['assertion.js'][951] = 0;
  _$jscoverage['assertion.js'][966] = 0;
  _$jscoverage['assertion.js'][967] = 0;
  _$jscoverage['assertion.js'][975] = 0;
  _$jscoverage['assertion.js'][991] = 0;
  _$jscoverage['assertion.js'][992] = 0;
  _$jscoverage['assertion.js'][997] = 0;
  _$jscoverage['assertion.js'][1004] = 0;
  _$jscoverage['assertion.js'][1005] = 0;
  _$jscoverage['assertion.js'][1006] = 0;
}
_$jscoverage['assertion.js'][48]++;
var AssertionError = require("./error"), eql = require("./utils/eql"), toString = Object.prototype.toString, inspect = require("./utils/inspect");
_$jscoverage['assertion.js'][57]++;
module.exports = Assertion;
_$jscoverage['assertion.js'][68]++;
function Assertion(obj, msg, stack) {
  _$jscoverage['assertion.js'][69]++;
  this.ssfi = stack || arguments.callee;
  _$jscoverage['assertion.js'][70]++;
  this.obj = obj;
  _$jscoverage['assertion.js'][71]++;
  this.msg = msg;
}
_$jscoverage['assertion.js'][87]++;
Assertion.includeStack = false;
_$jscoverage['assertion.js'][103]++;
Assertion.prototype.assert = (function (expr, msg, negateMsg, expected, actual) {
  _$jscoverage['assertion.js'][104]++;
  actual = actual || this.obj;
  _$jscoverage['assertion.js'][105]++;
  var msg = (this.negate? negateMsg: msg), ok = this.negate? ! expr: expr;
  _$jscoverage['assertion.js'][108]++;
  if (! ok) {
    _$jscoverage['assertion.js'][109]++;
    throw new AssertionError({message: this.msg? this.msg + ": " + msg: msg, actual: actual, expected: expected, stackStartFunction: Assertion.includeStack? this.assert: this.ssfi});
  }
});
_$jscoverage['assertion.js'][127]++;
Object.defineProperty(Assertion.prototype, "inspect", {get: (function () {
  _$jscoverage['assertion.js'][129]++;
  return inspect(this.obj);
}), configurable: true});
_$jscoverage['assertion.js'][143]++;
Object.defineProperty(Assertion.prototype, "to", {get: (function () {
  _$jscoverage['assertion.js'][145]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][159]++;
Object.defineProperty(Assertion.prototype, "be", {get: (function () {
  _$jscoverage['assertion.js'][161]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][176]++;
Object.defineProperty(Assertion.prototype, "been", {get: (function () {
  _$jscoverage['assertion.js'][178]++;
  this.tense = "past";
  _$jscoverage['assertion.js'][179]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][193]++;
Object.defineProperty(Assertion.prototype, "an", {get: (function () {
  _$jscoverage['assertion.js'][195]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][208]++;
Object.defineProperty(Assertion.prototype, "is", {get: (function () {
  _$jscoverage['assertion.js'][210]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][224]++;
Object.defineProperty(Assertion.prototype, "and", {get: (function () {
  _$jscoverage['assertion.js'][226]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][240]++;
Object.defineProperty(Assertion.prototype, "have", {get: (function () {
  _$jscoverage['assertion.js'][242]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][256]++;
Object.defineProperty(Assertion.prototype, "with", {get: (function () {
  _$jscoverage['assertion.js'][258]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][272]++;
Object.defineProperty(Assertion.prototype, "not", {get: (function () {
  _$jscoverage['assertion.js'][274]++;
  this.negate = true;
  _$jscoverage['assertion.js'][275]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][294]++;
Object.defineProperty(Assertion.prototype, "ok", {get: (function () {
  _$jscoverage['assertion.js'][296]++;
  this.assert(this.obj, "expected " + this.inspect + " to be truthy", "expected " + this.inspect + " to be falsy");
  _$jscoverage['assertion.js'][301]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][315]++;
Object.defineProperty(Assertion.prototype, "true", {get: (function () {
  _$jscoverage['assertion.js'][317]++;
  this.assert(true === this.obj, "expected " + this.inspect + " to be true", "expected " + this.inspect + " to be false", this.negate? false: true);
  _$jscoverage['assertion.js'][324]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][338]++;
Object.defineProperty(Assertion.prototype, "false", {get: (function () {
  _$jscoverage['assertion.js'][340]++;
  this.assert(false === this.obj, "expected " + this.inspect + " to be false", "expected " + this.inspect + " to be true", this.negate? true: false);
  _$jscoverage['assertion.js'][347]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][366]++;
Object.defineProperty(Assertion.prototype, "exist", {get: (function () {
  _$jscoverage['assertion.js'][368]++;
  this.assert(null != this.obj, "expected " + this.inspect + " to exist", "expected " + this.inspect + " to not exist");
  _$jscoverage['assertion.js'][374]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][390]++;
Object.defineProperty(Assertion.prototype, "empty", {get: (function () {
  _$jscoverage['assertion.js'][392]++;
  var expected = this.obj;
  _$jscoverage['assertion.js'][394]++;
  if (Array.isArray(this.obj)) {
    _$jscoverage['assertion.js'][395]++;
    expected = this.obj.length;
  }
  else {
    _$jscoverage['assertion.js'][396]++;
    if (typeof this.obj === "object") {
      _$jscoverage['assertion.js'][397]++;
      expected = Object.keys(this.obj).length;
    }
  }
  _$jscoverage['assertion.js'][400]++;
  this.assert(! expected, "expected " + this.inspect + " to be empty", "expected " + this.inspect + " not to be empty");
  _$jscoverage['assertion.js'][405]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][423]++;
Object.defineProperty(Assertion.prototype, "arguments", {get: (function () {
  _$jscoverage['assertion.js'][425]++;
  this.assert("[object Arguments]" == Object.prototype.toString.call(this.obj), "expected " + this.inspect + " to be arguments", "expected " + this.inspect + " to not be arguments", "[object Arguments]", Object.prototype.toString.call(this.obj));
  _$jscoverage['assertion.js'][433]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][450]++;
Assertion.prototype.equal = (function (val) {
  _$jscoverage['assertion.js'][451]++;
  this.assert(val === this.obj, "expected " + this.inspect + " to equal " + inspect(val), "expected " + this.inspect + " to not equal " + inspect(val), val);
  _$jscoverage['assertion.js'][457]++;
  return this;
});
_$jscoverage['assertion.js'][472]++;
Assertion.prototype.eql = (function (obj) {
  _$jscoverage['assertion.js'][473]++;
  this.assert(eql(obj, this.obj), "expected " + this.inspect + " to equal " + inspect(obj), "expected " + this.inspect + " to not equal " + inspect(obj), obj);
  _$jscoverage['assertion.js'][479]++;
  return this;
});
_$jscoverage['assertion.js'][494]++;
Assertion.prototype.above = (function (val) {
  _$jscoverage['assertion.js'][495]++;
  this.assert(this.obj > val, "expected " + this.inspect + " to be above " + val, "expected " + this.inspect + " to be below " + val);
  _$jscoverage['assertion.js'][500]++;
  return this;
});
_$jscoverage['assertion.js'][515]++;
Assertion.prototype.below = (function (val) {
  _$jscoverage['assertion.js'][516]++;
  this.assert(this.obj < val, "expected " + this.inspect + " to be below " + val, "expected " + this.inspect + " to be above " + val);
  _$jscoverage['assertion.js'][521]++;
  return this;
});
_$jscoverage['assertion.js'][537]++;
Assertion.prototype.within = (function (start, finish) {
  _$jscoverage['assertion.js'][538]++;
  var range = start + ".." + finish;
  _$jscoverage['assertion.js'][540]++;
  this.assert(this.obj >= start && this.obj <= finish, "expected " + this.inspect + " to be within " + range, "expected " + this.inspect + " to not be within " + range);
  _$jscoverage['assertion.js'][545]++;
  return this;
});
_$jscoverage['assertion.js'][560]++;
Assertion.prototype.a = (function (type) {
  _$jscoverage['assertion.js'][561]++;
  var klass = type.charAt(0).toUpperCase() + type.slice(1);
  _$jscoverage['assertion.js'][563]++;
  this.assert("[object " + klass + "]" === toString.call(this.obj), "expected " + this.inspect + " to be a " + type, "expected " + this.inspect + " not to be a " + type, "[object " + klass + "]", toString.call(this.obj));
  _$jscoverage['assertion.js'][571]++;
  return this;
});
_$jscoverage['assertion.js'][590]++;
Assertion.prototype["instanceof"] = (function (constructor) {
  _$jscoverage['assertion.js'][591]++;
  var name = constructor.name;
  _$jscoverage['assertion.js'][592]++;
  this.assert(this.obj instanceof constructor, "expected " + this.inspect + " to be an instance of " + name, "expected " + this.inspect + " to not be an instance of " + name);
  _$jscoverage['assertion.js'][597]++;
  return this;
});
_$jscoverage['assertion.js'][617]++;
Assertion.prototype.property = (function (name, val) {
  _$jscoverage['assertion.js'][618]++;
  if (this.negate && undefined !== val) {
    _$jscoverage['assertion.js'][619]++;
    if (undefined === this.obj[name]) {
      _$jscoverage['assertion.js'][620]++;
      throw new Error(this.inspect + " has no property " + inspect(name));
    }
  }
  else {
    _$jscoverage['assertion.js'][623]++;
    this.assert(undefined !== this.obj[name], "expected " + this.inspect + " to have a property " + inspect(name), "expected " + this.inspect + " to not have property " + inspect(name));
  }
  _$jscoverage['assertion.js'][629]++;
  if (undefined !== val) {
    _$jscoverage['assertion.js'][630]++;
    this.assert(val === this.obj[name], "expected " + this.inspect + " to have a property " + inspect(name) + " of " + inspect(val) + ", but got " + inspect(this.obj[name]), "expected " + this.inspect + " to not have a property " + inspect(name) + " of " + inspect(val), val, this.obj[val]);
  }
  _$jscoverage['assertion.js'][640]++;
  this.obj = this.obj[name];
  _$jscoverage['assertion.js'][641]++;
  return this;
});
_$jscoverage['assertion.js'][657]++;
Assertion.prototype.ownProperty = (function (name) {
  _$jscoverage['assertion.js'][658]++;
  this.assert(this.obj.hasOwnProperty(name), "expected " + this.inspect + " to have own property " + inspect(name), "expected " + this.inspect + " to not have own property " + inspect(name));
  _$jscoverage['assertion.js'][662]++;
  return this;
});
_$jscoverage['assertion.js'][679]++;
Assertion.prototype.length = (function (n) {
  _$jscoverage['assertion.js'][680]++;
  new Assertion(this.obj).to.have.property("length");
  _$jscoverage['assertion.js'][681]++;
  var len = this.obj.length;
  _$jscoverage['assertion.js'][683]++;
  this.assert(len == n, "expected " + this.inspect + " to have a length of " + n + " but got " + len, "expected " + this.inspect + " to not have a length of " + len, n, len);
  _$jscoverage['assertion.js'][691]++;
  return this;
});
_$jscoverage['assertion.js'][706]++;
Assertion.prototype.match = (function (re) {
  _$jscoverage['assertion.js'][707]++;
  this.assert(re.exec(this.obj), "expected " + this.inspect + " to match " + re, "expected " + this.inspect + " not to match " + re);
  _$jscoverage['assertion.js'][712]++;
  return this;
});
_$jscoverage['assertion.js'][727]++;
Assertion.prototype.include = (function (obj) {
  _$jscoverage['assertion.js'][728]++;
  this.assert(~ this.obj.indexOf(obj), "expected " + this.inspect + " to include " + inspect(obj), "expected " + this.inspect + " to not include " + inspect(obj));
  _$jscoverage['assertion.js'][733]++;
  return this;
});
_$jscoverage['assertion.js'][748]++;
Assertion.prototype.string = (function (str) {
  _$jscoverage['assertion.js'][749]++;
  new Assertion(this.obj).is.a("string");
  _$jscoverage['assertion.js'][751]++;
  this.assert(~ this.obj.indexOf(str), "expected " + this.inspect + " to contain " + inspect(str), "expected " + this.inspect + " to not contain " + inspect(str));
  _$jscoverage['assertion.js'][756]++;
  return this;
});
_$jscoverage['assertion.js'][770]++;
Object.defineProperty(Assertion.prototype, "contain", {get: (function () {
  _$jscoverage['assertion.js'][772]++;
  this.contains = true;
  _$jscoverage['assertion.js'][773]++;
  return this;
}), configurable: true});
_$jscoverage['assertion.js'][792]++;
Assertion.prototype.keys = (function (keys) {
  _$jscoverage['assertion.js'][793]++;
  var str, ok = true;
  _$jscoverage['assertion.js'][796]++;
  keys = keys instanceof Array? keys: Array.prototype.slice.call(arguments);
  _$jscoverage['assertion.js'][800]++;
  if (! keys.length) {
    _$jscoverage['assertion.js'][800]++;
    throw new Error("keys required");
  }
  _$jscoverage['assertion.js'][802]++;
  var actual = Object.keys(this.obj), len = keys.length;
  _$jscoverage['assertion.js'][806]++;
  ok = keys.every((function (key) {
  _$jscoverage['assertion.js'][807]++;
  return ~ actual.indexOf(key);
}));
  _$jscoverage['assertion.js'][811]++;
  if (! this.negate && ! this.contains) {
    _$jscoverage['assertion.js'][812]++;
    ok = ok && keys.length == actual.length;
  }
  _$jscoverage['assertion.js'][816]++;
  if (len > 1) {
    _$jscoverage['assertion.js'][817]++;
    keys = keys.map((function (key) {
  _$jscoverage['assertion.js'][818]++;
  return inspect(key);
}));
    _$jscoverage['assertion.js'][820]++;
    var last = keys.pop();
    _$jscoverage['assertion.js'][821]++;
    str = keys.join(", ") + ", and " + last;
  }
  else {
    _$jscoverage['assertion.js'][823]++;
    str = inspect(keys[0]);
  }
  _$jscoverage['assertion.js'][827]++;
  str = (len > 1? "keys ": "key ") + str;
  _$jscoverage['assertion.js'][830]++;
  str = (this.contains? "contain ": "have ") + str;
  _$jscoverage['assertion.js'][833]++;
  this.assert(ok, "expected " + this.inspect + " to " + str, "expected " + this.inspect + " to not " + str, keys, Object.keys(this.obj));
  _$jscoverage['assertion.js'][841]++;
  return this;
});
_$jscoverage['assertion.js'][871]++;
Assertion.prototype["throw"] = (function (constructor, msg) {
  _$jscoverage['assertion.js'][872]++;
  new Assertion(this.obj).is.a("function");
  _$jscoverage['assertion.js'][874]++;
  var thrown = false;
  _$jscoverage['assertion.js'][876]++;
  if (arguments.length === 0) {
    _$jscoverage['assertion.js'][877]++;
    msg = null;
    _$jscoverage['assertion.js'][878]++;
    constructor = null;
  }
  else {
    _$jscoverage['assertion.js'][879]++;
    if (constructor && (constructor instanceof RegExp || "string" === typeof constructor)) {
      _$jscoverage['assertion.js'][880]++;
      msg = constructor;
      _$jscoverage['assertion.js'][881]++;
      constructor = null;
    }
  }
  _$jscoverage['assertion.js'][884]++;
  try {
    _$jscoverage['assertion.js'][885]++;
    this.obj();
  }
  catch (err) {
    _$jscoverage['assertion.js'][888]++;
    if (constructor && "function" === typeof constructor) {
      _$jscoverage['assertion.js'][889]++;
      this.assert(err instanceof constructor && err.name == constructor.name, "expected " + this.inspect + " to throw " + constructor.name + " but a " + err.name + " was thrown", "expected " + this.inspect + " to not throw " + constructor.name);
      _$jscoverage['assertion.js'][893]++;
      if (! msg) {
        _$jscoverage['assertion.js'][893]++;
        return this;
      }
    }
    _$jscoverage['assertion.js'][896]++;
    if (err.message && msg && msg instanceof RegExp) {
      _$jscoverage['assertion.js'][897]++;
      this.assert(msg.exec(err.message), "expected " + this.inspect + " to throw error matching " + msg + " but got " + inspect(err.message), "expected " + this.inspect + " to throw error not matching " + msg);
      _$jscoverage['assertion.js'][902]++;
      return this;
    }
    else {
      _$jscoverage['assertion.js'][903]++;
      if (err.message && msg && "string" === typeof msg) {
        _$jscoverage['assertion.js'][904]++;
        this.assert(~ err.message.indexOf(msg), "expected " + this.inspect + " to throw error including " + inspect(msg) + " but got " + inspect(err.message), "expected " + this.inspect + " to throw error not including " + inspect(msg));
        _$jscoverage['assertion.js'][909]++;
        return this;
      }
      else {
        _$jscoverage['assertion.js'][911]++;
        thrown = true;
      }
    }
  }
  _$jscoverage['assertion.js'][915]++;
  var name = (constructor? constructor.name: "an error");
  _$jscoverage['assertion.js'][917]++;
  this.assert(thrown === true, "expected " + this.inspect + " to throw " + name, "expected " + this.inspect + " to not throw " + name);
  _$jscoverage['assertion.js'][922]++;
  return this;
});
_$jscoverage['assertion.js'][938]++;
Assertion.prototype.respondTo = (function (method) {
  _$jscoverage['assertion.js'][939]++;
  var context = ("function" === typeof this.obj)? this.obj.prototype[method]: this.obj[method];
  _$jscoverage['assertion.js'][943]++;
  this.assert("function" === typeof context, "expected " + this.inspect + " to respond to " + inspect(method), "expected " + this.inspect + " to not respond to " + inspect(method), "function", typeof context);
  _$jscoverage['assertion.js'][951]++;
  return this;
});
_$jscoverage['assertion.js'][966]++;
Assertion.prototype.satisfy = (function (matcher) {
  _$jscoverage['assertion.js'][967]++;
  this.assert(matcher(this.obj), "expected " + this.inspect + " to satisfy " + inspect(matcher), "expected " + this.inspect + " to not satisfy" + inspect(matcher), this.negate? false: true, matcher(this.obj));
  _$jscoverage['assertion.js'][975]++;
  return this;
});
_$jscoverage['assertion.js'][991]++;
Assertion.prototype.closeTo = (function (expected, delta) {
  _$jscoverage['assertion.js'][992]++;
  this.assert((this.obj - delta === expected) || (this.obj + delta === expected), "expected " + this.inspect + " to be close to " + expected + " +/- " + delta, "expected " + this.inspect + " not to be close to " + expected + " +/- " + delta);
  _$jscoverage['assertion.js'][997]++;
  return this;
});
_$jscoverage['assertion.js'][1004]++;
(function alias(name, as) {
  _$jscoverage['assertion.js'][1005]++;
  Assertion.prototype[as] = Assertion.prototype[name];
  _$jscoverage['assertion.js'][1006]++;
  return alias;
})("length", "lengthOf")("keys", "key")("ownProperty", "haveOwnProperty")("above", "greaterThan")("below", "lessThan")("throw", "throws")("throw", "Throw")("instanceof", "instanceOf");
_$jscoverage['assertion.js'].source = ["/*!"," * chai"," * Copyright(c) 2011 Jake Luer &lt;jake@alogicalparadox.com&gt;"," * MIT Licensed"," *"," * Primarily a refactor of: should.js"," * https://github.com/visionmedia/should.js"," * Copyright(c) 2011 TJ Holowaychuk &lt;tj@vision-media.ca&gt;"," * MIT Licensed"," */","","/**"," * ### BDD Style Introduction"," *"," * The BDD style is exposed through `expect` or `should` interfaces. In both"," * scenarios, you chain together natural language assertions."," *"," *      // expect"," *      var expect = require('chai').expect;"," *      expect(foo).to.equal('bar');"," *"," *      // should"," *      var should = require('chai').should();"," *      foo.should.equal('bar');"," *"," * #### Differences"," *"," * The `expect` interface provides a function as a starting point for chaining"," * your language assertions. It works on node.js and in all browsers."," *"," * The `should` interface extends `Object.prototype` to provide a single getter as"," * the starting point for your language assertions. It works on node.js and in"," * all browsers except Internet Explorer."," *"," * #### Configuration"," *"," * By default, Chai does not show stack traces upon an AssertionError. This can"," * be changed by modifying the `includeStack` parameter for chai.Assertion. For example:"," *"," *      var chai = require('chai');"," *      chai.Assertion.includeStack = true; // defaults to false"," */","","/*!"," * Module dependencies."," */","","var AssertionError = require('./error')","  , eql = require('./utils/eql')","  , toString = Object.prototype.toString","  , inspect = require('./utils/inspect');","","/*!"," * Module export."," */","","module.exports = Assertion;","","","/*!"," * # Assertion Constructor"," *"," * Creates object for chaining."," *"," * @api private"," */","","function Assertion (obj, msg, stack) {","  this.ssfi = stack || arguments.callee;","  this.obj = obj;","  this.msg = msg;","}","","/*!","  * ## Assertion.includeStack","  * , toString = Object.prototype.toString","  *","  * User configurable property, influences whether stack trace","  * is included in Assertion error message. Default of false","  * suppresses stack trace in the error message","  *","  *     Assertion.includeStack = true;  // enable stack on error","  *","  * @api public","  */","","Assertion.includeStack = false;","","/*!"," * # .assert(expression, message, negateMessage, expected, actual)"," *"," * Executes an expression and check expectations. Throws AssertionError for reporting if test doesn't pass."," *"," * @name assert"," * @param {Philosophical} expression to be tested"," * @param {String} message to display if fails"," * @param {String} negatedMessage to display if negated expression fails"," * @param {*} expected value (remember to check for negation)"," * @param {*} actual (optional) will default to `this.obj`"," * @api private"," */","","Assertion.prototype.assert = function (expr, msg, negateMsg, expected, actual) {","  actual = actual || this.obj;","  var msg = (this.negate ? negateMsg : msg)","    , ok = this.negate ? !expr : expr;","","  if (!ok) {","    throw new AssertionError({","        message: this.msg ? this.msg + ': ' + msg : msg // include custom message if available","      , actual: actual","      , expected: expected","      , stackStartFunction: (Assertion.includeStack) ? this.assert : this.ssfi","    });","  }","};","","/*!"," * # inspect"," *"," * Returns the current object stringified."," *"," * @name inspect"," * @api private"," */","","Object.defineProperty(Assertion.prototype, 'inspect',","  { get: function () {","      return inspect(this.obj);","    }","  , configurable: true","});","","/**"," * # to"," *"," * Language chain."," *"," * @name to"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'to',","  { get: function () {","      return this;","    }","  , configurable: true","});","","/**"," * # be"," *"," * Language chain."," *"," * @name be"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'be',","  { get: function () {","      return this;","    }","  , configurable: true","});","","/**"," * # been"," *"," * Language chain. Also tests `tense` to past for addon"," * modules that use the tense feature."," *"," * @name been"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'been',","  { get: function () {","      this.tense = 'past';","      return this;","    }","  , configurable: true","});","","/**"," * # an"," *"," * Language chain."," *"," * @name an"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'an',","  { get: function () {","      return this;","    }","  , configurable: true","});","/**"," * # is"," *"," * Language chain."," *"," * @name is"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'is',","  { get: function () {","      return this;","    }","  , configurable: true","});","","/**"," * # and"," *"," * Language chain."," *"," * @name and"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'and',","  { get: function () {","      return this;","    }","  , configurable: true","});","","/**"," * # have"," *"," * Language chain."," *"," * @name have"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'have',","  { get: function () {","      return this;","    }","  , configurable: true","});","","/**"," * # with"," *"," * Language chain."," *"," * @name with"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'with',","  { get: function () {","      return this;","    }","  , configurable: true","});","","/**"," * # .not"," *"," * Negates any of assertions following in the chain."," *"," * @name not"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'not',","  { get: function () {","      this.negate = true;","      return this;","    }","  , configurable: true","});","","/**"," * # .ok"," *"," * Assert object truthiness."," *"," *      expect('everthing').to.be.ok;"," *      expect(false).to.not.be.ok;"," *      expect(undefined).to.not.be.ok;"," *      expect(null).to.not.be.ok;"," *"," * @name ok"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'ok',","  { get: function () {","      this.assert(","          this.obj","        , 'expected ' + this.inspect + ' to be truthy'","        , 'expected ' + this.inspect + ' to be falsy');","","      return this;","    }","  , configurable: true","});","","/**"," * # .true"," *"," * Assert object is true"," *"," * @name true"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'true',","  { get: function () {","      this.assert(","          true === this.obj","        , 'expected ' + this.inspect + ' to be true'","        , 'expected ' + this.inspect + ' to be false'","        , this.negate ? false : true","      );","","      return this;","    }","  , configurable: true","});","","/**"," * # .false"," *"," * Assert object is false"," *"," * @name false"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'false',","  { get: function () {","      this.assert(","          false === this.obj","        , 'expected ' + this.inspect + ' to be false'","        , 'expected ' + this.inspect + ' to be true'","        , this.negate ? true : false","      );","","      return this;","    }","  , configurable: true","});","","/**"," * # .exist"," *"," * Assert object exists (null)."," *"," *      var foo = 'hi'"," *        , bar;"," *      expect(foo).to.exist;"," *      expect(bar).to.not.exist;"," *"," * @name exist"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'exist',","  { get: function () {","      this.assert(","          null != this.obj","        , 'expected ' + this.inspect + ' to exist'","        , 'expected ' + this.inspect + ' to not exist'","      );","","      return this;","    }","  , configurable: true","});","","/**"," * # .empty"," *"," * Assert object's length to be 0."," *"," *      expect([]).to.be.empty;"," *"," * @name empty"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'empty',","  { get: function () {","      var expected = this.obj;","","      if (Array.isArray(this.obj)) {","        expected = this.obj.length;","      } else if (typeof this.obj === 'object') {","        expected = Object.keys(this.obj).length;","      }","","      this.assert(","          !expected","        , 'expected ' + this.inspect + ' to be empty'","        , 'expected ' + this.inspect + ' not to be empty');","","      return this;","    }","  , configurable: true","});","","/**"," * # .arguments"," *"," * Assert object is an instanceof arguments."," *"," *      function test () {"," *        expect(arguments).to.be.arguments;"," *      }"," *"," * @name arguments"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'arguments',","  { get: function () {","      this.assert(","          '[object Arguments]' == Object.prototype.toString.call(this.obj)","        , 'expected ' + this.inspect + ' to be arguments'","        , 'expected ' + this.inspect + ' to not be arguments'","        , '[object Arguments]'","        , Object.prototype.toString.call(this.obj)","      );","","      return this;","    }","  , configurable: true","});","","/**"," * # .equal(value)"," *"," * Assert strict equality."," *"," *      expect('hello').to.equal('hello');"," *"," * @name equal"," * @param {*} value"," * @api public"," */","","Assertion.prototype.equal = function (val) {","  this.assert(","      val === this.obj","    , 'expected ' + this.inspect + ' to equal ' + inspect(val)","    , 'expected ' + this.inspect + ' to not equal ' + inspect(val)","    , val );","","  return this;","};","","/**"," * # .eql(value)"," *"," * Assert deep equality."," *"," *      expect({ foo: 'bar' }).to.eql({ foo: 'bar' });"," *"," * @name eql"," * @param {*} value"," * @api public"," */","","Assertion.prototype.eql = function (obj) {","  this.assert(","      eql(obj, this.obj)","    , 'expected ' + this.inspect + ' to equal ' + inspect(obj)","    , 'expected ' + this.inspect + ' to not equal ' + inspect(obj)","    , obj );","","  return this;","};","","/**"," * # .above(value)"," *"," * Assert greater than `value`."," *"," *      expect(10).to.be.above(5);"," *"," * @name above"," * @param {Number} value"," * @api public"," */","","Assertion.prototype.above = function (val) {","  this.assert(","      this.obj &gt; val","    , 'expected ' + this.inspect + ' to be above ' + val","    , 'expected ' + this.inspect + ' to be below ' + val);","","  return this;","};","","/**"," * # .below(value)"," *"," * Assert less than `value`."," *"," *      expect(5).to.be.below(10);"," *"," * @name below"," * @param {Number} value"," * @api public"," */","","Assertion.prototype.below = function (val) {","  this.assert(","      this.obj &lt; val","    , 'expected ' + this.inspect + ' to be below ' + val","    , 'expected ' + this.inspect + ' to be above ' + val);","","  return this;","};","","/**"," * # .within(start, finish)"," *"," * Assert that a number is within a range."," *"," *      expect(7).to.be.within(5,10);"," *"," * @name within"," * @param {Number} start lowerbound inclusive"," * @param {Number} finish upperbound inclusive"," * @api public"," */","","Assertion.prototype.within = function (start, finish) {","  var range = start + '..' + finish;","","  this.assert(","      this.obj &gt;= start &amp;&amp; this.obj &lt;= finish","    , 'expected ' + this.inspect + ' to be within ' + range","    , 'expected ' + this.inspect + ' to not be within ' + range);","","  return this;","};","","/**"," * # .a(type)"," *"," * Assert typeof."," *"," *      expect('test').to.be.a('string');"," *"," * @name a"," * @param {String} type"," * @api public"," */","","Assertion.prototype.a = function (type) {","  var klass = type.charAt(0).toUpperCase() + type.slice(1);","","  this.assert(","      '[object ' + klass + ']' === toString.call(this.obj)","    , 'expected ' + this.inspect + ' to be a ' + type","    , 'expected ' + this.inspect + ' not to be a ' + type","    , '[object ' + klass + ']'","    , toString.call(this.obj)","  );","","  return this;","};","","/**"," * # .instanceof(constructor)"," *"," * Assert instanceof."," *"," *      var Tea = function (name) { this.name = name; }"," *        , Chai = new Tea('chai');"," *"," *      expect(Chai).to.be.an.instanceOf(Tea);"," *"," * @name instanceof"," * @param {Constructor}"," * @alias instanceOf"," * @api public"," */","","Assertion.prototype.instanceof = function (constructor) {","  var name = constructor.name;","  this.assert(","      this.obj instanceof constructor","    , 'expected ' + this.inspect + ' to be an instance of ' + name","    , 'expected ' + this.inspect + ' to not be an instance of ' + name);","","  return this;","};","","/**"," * # .property(name, [value])"," *"," * Assert that property of `name` exists, optionally with `value`."," *"," *      var obj = { foo: 'bar' }"," *      expect(obj).to.have.property('foo');"," *      expect(obj).to.have.property('foo', 'bar');"," *      expect(obj).to.have.property('foo').to.be.a('string');"," *"," * @name property"," * @param {String} name"," * @param {*} value (optional)"," * @returns value of property for chaining"," * @api public"," */","","Assertion.prototype.property = function (name, val) {","  if (this.negate &amp;&amp; undefined !== val) {","    if (undefined === this.obj[name]) {","      throw new Error(this.inspect + ' has no property ' + inspect(name));","    }","  } else {","    this.assert(","        undefined !== this.obj[name]","      , 'expected ' + this.inspect + ' to have a property ' + inspect(name)","      , 'expected ' + this.inspect + ' to not have property ' + inspect(name));","  }","","  if (undefined !== val) {","    this.assert(","        val === this.obj[name]","      , 'expected ' + this.inspect + ' to have a property ' + inspect(name) + ' of ' +","          inspect(val) + ', but got ' + inspect(this.obj[name])","      , 'expected ' + this.inspect + ' to not have a property ' + inspect(name) + ' of ' +  inspect(val)","      , val","      , this.obj[val]","    );","  }","","  this.obj = this.obj[name];","  return this;","};","","/**"," * # .ownProperty(name)"," *"," * Assert that has own property by `name`."," *"," *      expect('test').to.have.ownProperty('length');"," *"," * @name ownProperty"," * @alias haveOwnProperty"," * @param {String} name"," * @api public"," */","","Assertion.prototype.ownProperty = function (name) {","  this.assert(","      this.obj.hasOwnProperty(name)","    , 'expected ' + this.inspect + ' to have own property ' + inspect(name)","    , 'expected ' + this.inspect + ' to not have own property ' + inspect(name));","  return this;","};","","/**"," * # .length(val)"," *"," * Assert that object has expected length."," *"," *      expect([1,2,3]).to.have.length(3);"," *      expect('foobar').to.have.length(6);"," *"," * @name length"," * @alias lengthOf"," * @param {Number} length"," * @api public"," */","","Assertion.prototype.length = function (n) {","  new Assertion(this.obj).to.have.property('length');","  var len = this.obj.length;","","  this.assert(","      len == n","    , 'expected ' + this.inspect + ' to have a length of ' + n + ' but got ' + len","    , 'expected ' + this.inspect + ' to not have a length of ' + len","    , n","    , len","  );","","  return this;","};","","/**"," * # .match(regexp)"," *"," * Assert that matches regular expression."," *"," *      expect('foobar').to.match(/^foo/);"," *"," * @name match"," * @param {RegExp} RegularExpression"," * @api public"," */","","Assertion.prototype.match = function (re) {","  this.assert(","      re.exec(this.obj)","    , 'expected ' + this.inspect + ' to match ' + re","    , 'expected ' + this.inspect + ' not to match ' + re);","","  return this;","};","","/**"," * # .include(obj)"," *"," * Assert the inclusion of an object in an Array or substring in string."," *"," *      expect([1,2,3]).to.include(2);"," *"," * @name include"," * @param {Object|String|Number} obj"," * @api public"," */","","Assertion.prototype.include = function (obj) {","  this.assert(","      ~this.obj.indexOf(obj)","    , 'expected ' + this.inspect + ' to include ' + inspect(obj)","    , 'expected ' + this.inspect + ' to not include ' + inspect(obj));","","  return this;","};","","/**"," * # .string(string)"," *"," * Assert inclusion of string in string."," *"," *      expect('foobar').to.have.string('bar');"," *"," * @name string"," * @param {String} string"," * @api public"," */","","Assertion.prototype.string = function (str) {","  new Assertion(this.obj).is.a('string');","","  this.assert(","      ~this.obj.indexOf(str)","    , 'expected ' + this.inspect + ' to contain ' + inspect(str)","    , 'expected ' + this.inspect + ' to not contain ' + inspect(str));","","  return this;","};","","","","/**"," * # contain"," *"," * Toggles the `contain` flag for the `keys` assertion."," *"," * @name contain"," * @api public"," */","","Object.defineProperty(Assertion.prototype, 'contain',","  { get: function () {","      this.contains = true;","      return this;","    },","    configurable: true","});","","/**"," * # .keys(key1, [key2], [...])"," *"," * Assert exact keys or the inclusing of keys using the `contain` modifier."," *"," *      expect({ foo: 1, bar: 2 }).to.have.keys(['foo', 'bar']);"," *      expect({ foo: 1, bar: 2, baz: 3 }).to.contain.keys('foo', 'bar');"," *"," * @name keys"," * @alias key"," * @param {String|Array} Keys"," * @api public"," */","","Assertion.prototype.keys = function(keys) {","  var str","    , ok = true;","","  keys = keys instanceof Array","    ? keys","    : Array.prototype.slice.call(arguments);","","  if (!keys.length) throw new Error('keys required');","","  var actual = Object.keys(this.obj)","    , len = keys.length;","","  // Inclusion","  ok = keys.every(function(key){","    return ~actual.indexOf(key);","  });","","  // Strict","  if (!this.negate &amp;&amp; !this.contains) {","    ok = ok &amp;&amp; keys.length == actual.length;","  }","","  // Key string","  if (len &gt; 1) {","    keys = keys.map(function(key){","      return inspect(key);","    });","    var last = keys.pop();","    str = keys.join(', ') + ', and ' + last;","  } else {","    str = inspect(keys[0]);","  }","","  // Form","  str = (len &gt; 1 ? 'keys ' : 'key ') + str;","","  // Have / include","  str = (this.contains ? 'contain ' : 'have ') + str;","","  // Assertion","  this.assert(","      ok","    , 'expected ' + this.inspect + ' to ' + str","    , 'expected ' + this.inspect + ' to not ' + str","    , keys","    , Object.keys(this.obj)","  );","","  return this;","}","","/**"," * # .throw(constructor)"," *"," * Assert that a function will throw a specific type of error or that error"," * thrown will match a RegExp or include a string."," *"," *      var fn = function () { throw new ReferenceError('This is a bad function.'); }"," *      expect(fn).to.throw(ReferenceError);"," *      expect(fn).to.throw(/bad function/);"," *      expect(fn).to.not.throw('good function');"," *      expect(fn).to.throw(ReferenceError, /bad function/);"," *"," * Please note that when a throw expectation is negated, it will check each"," * parameter independently, starting with Error constructor type. The appropriate way"," * to check for the existence of a type of error but for a message that does not match"," * is to use `and`."," *"," *      expect(fn).to.throw(ReferenceError).and.not.throw(/good function/);"," *"," * @name throw"," * @alias throws"," * @alias Throw"," * @param {ErrorConstructor} constructor"," * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error#Error_types"," * @api public"," */","","Assertion.prototype.throw = function (constructor, msg) {","  new Assertion(this.obj).is.a('function');","","  var thrown = false;","","  if (arguments.length === 0) {","    msg = null;","    constructor = null;","  } else if (constructor &amp;&amp; (constructor instanceof RegExp || 'string' === typeof constructor)) {","    msg = constructor;","    constructor = null;","  }","","  try {","    this.obj();","  } catch (err) {","    // first, check constructor","    if (constructor &amp;&amp; 'function' === typeof constructor) {","      this.assert(","          err instanceof constructor &amp;&amp; err.name == constructor.name","        , 'expected ' + this.inspect + ' to throw ' + constructor.name + ' but a ' + err.name + ' was thrown'","        , 'expected ' + this.inspect + ' to not throw ' + constructor.name );","      if (!msg) return this;","    }","    // next, check message","    if (err.message &amp;&amp; msg &amp;&amp; msg instanceof RegExp) {","      this.assert(","          msg.exec(err.message)","        , 'expected ' + this.inspect + ' to throw error matching ' + msg + ' but got ' + inspect(err.message)","        , 'expected ' + this.inspect + ' to throw error not matching ' + msg","      );","      return this;","    } else if (err.message &amp;&amp; msg &amp;&amp; 'string' === typeof msg) {","      this.assert(","          ~err.message.indexOf(msg)","        , 'expected ' + this.inspect + ' to throw error including ' + inspect(msg) + ' but got ' + inspect(err.message)","        , 'expected ' + this.inspect + ' to throw error not including ' + inspect(msg)","      );","      return this;","    } else {","      thrown = true;","    }","  }","","  var name = (constructor ? constructor.name : 'an error');","","  this.assert(","      thrown === true","    , 'expected ' + this.inspect + ' to throw ' + name","    , 'expected ' + this.inspect + ' to not throw ' + name);","","  return this;","};","","/**"," * # .respondTo(method)"," *"," * Assert that object/class will respond to a method."," *"," *      expect(Klass).to.respondTo('bar');"," *      expect(obj).to.respondTo('bar');"," *"," * @name respondTo"," * @param {String} method"," * @api public"," */","","Assertion.prototype.respondTo = function (method) {","  var context = ('function' === typeof this.obj)","    ? this.obj.prototype[method]","    : this.obj[method];","","  this.assert(","      'function' === typeof context","    , 'expected ' + this.inspect + ' to respond to ' + inspect(method)","    , 'expected ' + this.inspect + ' to not respond to ' + inspect(method)","    , 'function'","    , typeof context","  );","","  return this;","};","","/**"," * # .satisfy(method)"," *"," * Assert that passes a truth test."," *"," *      expect(1).to.satisfy(function(num) { return num &gt; 0; });"," *"," * @name satisfy"," * @param {Function} matcher"," * @api public"," */","","Assertion.prototype.satisfy = function (matcher) {","  this.assert(","      matcher(this.obj)","    , 'expected ' + this.inspect + ' to satisfy ' + inspect(matcher)","    , 'expected ' + this.inspect + ' to not satisfy' + inspect(matcher)","    , this.negate ? false : true","    , matcher(this.obj)","  );","","  return this;","};","","/**"," * # .closeTo(expected, delta)"," *"," * Assert that actual is equal to +/- delta."," *"," *      expect(1.5).to.be.closeTo(1, 0.5);"," *"," * @name closeTo"," * @param {Number} expected"," * @param {Number} delta"," * @api public"," */","","Assertion.prototype.closeTo = function (expected, delta) {","  this.assert(","      (this.obj - delta === expected) || (this.obj + delta === expected)","    , 'expected ' + this.inspect + ' to be close to ' + expected + ' +/- ' + delta","    , 'expected ' + this.inspect + ' not to be close to ' + expected + ' +/- ' + delta);","","  return this;","};","","/*!"," * Aliases."," */","","(function alias(name, as){","  Assertion.prototype[as] = Assertion.prototype[name];","  return alias;","})","('length', 'lengthOf')","('keys', 'key')","('ownProperty', 'haveOwnProperty')","('above', 'greaterThan')","('below', 'lessThan')","('throw', 'throws')","('throw', 'Throw') // for troublesome browsers","('instanceof', 'instanceOf');"];

});

require.define("/node_modules/chai/lib-cov/error.js", function (require, module, exports, __dirname, __filename) {
/* automatically generated by JSCoverage - do not edit */
if (typeof _$jscoverage === 'undefined') _$jscoverage = {};
if (! _$jscoverage['error.js']) {
  _$jscoverage['error.js'] = [];
  _$jscoverage['error.js'][7] = 0;
  _$jscoverage['error.js'][9] = 0;
  _$jscoverage['error.js'][15] = 0;
  _$jscoverage['error.js'][16] = 0;
  _$jscoverage['error.js'][17] = 0;
  _$jscoverage['error.js'][18] = 0;
  _$jscoverage['error.js'][19] = 0;
  _$jscoverage['error.js'][20] = 0;
  _$jscoverage['error.js'][21] = 0;
  _$jscoverage['error.js'][22] = 0;
  _$jscoverage['error.js'][24] = 0;
  _$jscoverage['error.js'][25] = 0;
  _$jscoverage['error.js'][29] = 0;
  _$jscoverage['error.js'][31] = 0;
  _$jscoverage['error.js'][32] = 0;
}
_$jscoverage['error.js'][7]++;
var fail = require("./chai").fail;
_$jscoverage['error.js'][9]++;
module.exports = AssertionError;
_$jscoverage['error.js'][15]++;
function AssertionError(options) {
  _$jscoverage['error.js'][16]++;
  options = options || {};
  _$jscoverage['error.js'][17]++;
  this.name = "AssertionError";
  _$jscoverage['error.js'][18]++;
  this.message = options.message;
  _$jscoverage['error.js'][19]++;
  this.actual = options.actual;
  _$jscoverage['error.js'][20]++;
  this.expected = options.expected;
  _$jscoverage['error.js'][21]++;
  this.operator = options.operator;
  _$jscoverage['error.js'][22]++;
  var stackStartFunction = options.stackStartFunction || fail;
  _$jscoverage['error.js'][24]++;
  if (Error.captureStackTrace) {
    _$jscoverage['error.js'][25]++;
    Error.captureStackTrace(this, stackStartFunction);
  }
}
_$jscoverage['error.js'][29]++;
AssertionError.prototype.__proto__ = Error.prototype;
_$jscoverage['error.js'][31]++;
AssertionError.prototype.toString = (function () {
  _$jscoverage['error.js'][32]++;
  return this.message;
});
_$jscoverage['error.js'].source = ["/*!"," * chai"," * Copyright(c) 2011 Jake Luer &lt;jake@alogicalparadox.com&gt;"," * MIT Licensed"," */","","var fail = require('./chai').fail;","","module.exports = AssertionError;","","/*!"," * Inspired by node.js assert module"," * https://github.com/joyent/node/blob/f8c335d0caf47f16d31413f89aa28eda3878e3aa/lib/assert.js"," */","function AssertionError (options) {","  options = options || {};","  this.name = 'AssertionError';","  this.message = options.message;","  this.actual = options.actual;","  this.expected = options.expected;","  this.operator = options.operator;","  var stackStartFunction = options.stackStartFunction || fail;","","  if (Error.captureStackTrace) {","    Error.captureStackTrace(this, stackStartFunction);","  }","}","","AssertionError.prototype.__proto__ = Error.prototype;","","AssertionError.prototype.toString = function() {","  return this.message;","};"];

});

require.define("/node_modules/chai/lib-cov/utils/eql.js", function (require, module, exports, __dirname, __filename) {
/* automatically generated by JSCoverage - do not edit */
if (typeof _$jscoverage === 'undefined') _$jscoverage = {};
if (! _$jscoverage['utils/eql.js']) {
  _$jscoverage['utils/eql.js'] = [];
  _$jscoverage['utils/eql.js'][5] = 0;
  _$jscoverage['utils/eql.js'][8] = 0;
  _$jscoverage['utils/eql.js'][9] = 0;
  _$jscoverage['utils/eql.js'][11] = 0;
  _$jscoverage['utils/eql.js'][16] = 0;
  _$jscoverage['utils/eql.js'][18] = 0;
  _$jscoverage['utils/eql.js'][19] = 0;
  _$jscoverage['utils/eql.js'][21] = 0;
  _$jscoverage['utils/eql.js'][22] = 0;
  _$jscoverage['utils/eql.js'][24] = 0;
  _$jscoverage['utils/eql.js'][25] = 0;
  _$jscoverage['utils/eql.js'][28] = 0;
  _$jscoverage['utils/eql.js'][32] = 0;
  _$jscoverage['utils/eql.js'][33] = 0;
  _$jscoverage['utils/eql.js'][37] = 0;
  _$jscoverage['utils/eql.js'][38] = 0;
  _$jscoverage['utils/eql.js'][47] = 0;
  _$jscoverage['utils/eql.js'][51] = 0;
  _$jscoverage['utils/eql.js'][52] = 0;
  _$jscoverage['utils/eql.js'][55] = 0;
  _$jscoverage['utils/eql.js'][56] = 0;
  _$jscoverage['utils/eql.js'][59] = 0;
  _$jscoverage['utils/eql.js'][60] = 0;
  _$jscoverage['utils/eql.js'][61] = 0;
  _$jscoverage['utils/eql.js'][63] = 0;
  _$jscoverage['utils/eql.js'][66] = 0;
  _$jscoverage['utils/eql.js'][67] = 0;
  _$jscoverage['utils/eql.js'][68] = 0;
  _$jscoverage['utils/eql.js'][70] = 0;
  _$jscoverage['utils/eql.js'][71] = 0;
  _$jscoverage['utils/eql.js'][72] = 0;
  _$jscoverage['utils/eql.js'][74] = 0;
  _$jscoverage['utils/eql.js'][75] = 0;
  _$jscoverage['utils/eql.js'][79] = 0;
  _$jscoverage['utils/eql.js'][83] = 0;
  _$jscoverage['utils/eql.js'][84] = 0;
  _$jscoverage['utils/eql.js'][86] = 0;
  _$jscoverage['utils/eql.js'][87] = 0;
  _$jscoverage['utils/eql.js'][89] = 0;
  _$jscoverage['utils/eql.js'][90] = 0;
  _$jscoverage['utils/eql.js'][91] = 0;
  _$jscoverage['utils/eql.js'][95] = 0;
  _$jscoverage['utils/eql.js'][96] = 0;
  _$jscoverage['utils/eql.js'][97] = 0;
  _$jscoverage['utils/eql.js'][99] = 0;
}
_$jscoverage['utils/eql.js'][5]++;
module.exports = _deepEqual;
_$jscoverage['utils/eql.js'][8]++;
if (! Buffer) {
  _$jscoverage['utils/eql.js'][9]++;
  var Buffer = {isBuffer: (function () {
  _$jscoverage['utils/eql.js'][11]++;
  return false;
})};
}
_$jscoverage['utils/eql.js'][16]++;
function _deepEqual(actual, expected) {
  _$jscoverage['utils/eql.js'][18]++;
  if (actual === expected) {
    _$jscoverage['utils/eql.js'][19]++;
    return true;
  }
  else {
    _$jscoverage['utils/eql.js'][21]++;
    if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
      _$jscoverage['utils/eql.js'][22]++;
      if (actual.length != expected.length) {
        _$jscoverage['utils/eql.js'][22]++;
        return false;
      }
      _$jscoverage['utils/eql.js'][24]++;
      for (var i = 0; i < actual.length; i++) {
        _$jscoverage['utils/eql.js'][25]++;
        if (actual[i] !== expected[i]) {
          _$jscoverage['utils/eql.js'][25]++;
          return false;
        }
}
      _$jscoverage['utils/eql.js'][28]++;
      return true;
    }
    else {
      _$jscoverage['utils/eql.js'][32]++;
      if (actual instanceof Date && expected instanceof Date) {
        _$jscoverage['utils/eql.js'][33]++;
        return actual.getTime() === expected.getTime();
      }
      else {
        _$jscoverage['utils/eql.js'][37]++;
        if (typeof actual != "object" && typeof expected != "object") {
          _$jscoverage['utils/eql.js'][38]++;
          return actual === expected;
        }
        else {
          _$jscoverage['utils/eql.js'][47]++;
          return objEquiv(actual, expected);
        }
      }
    }
  }
}
_$jscoverage['utils/eql.js'][51]++;
function isUndefinedOrNull(value) {
  _$jscoverage['utils/eql.js'][52]++;
  return value === null || value === undefined;
}
_$jscoverage['utils/eql.js'][55]++;
function isArguments(object) {
  _$jscoverage['utils/eql.js'][56]++;
  return Object.prototype.toString.call(object) == "[object Arguments]";
}
_$jscoverage['utils/eql.js'][59]++;
function objEquiv(a, b) {
  _$jscoverage['utils/eql.js'][60]++;
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b)) {
    _$jscoverage['utils/eql.js'][61]++;
    return false;
  }
  _$jscoverage['utils/eql.js'][63]++;
  if (a.prototype !== b.prototype) {
    _$jscoverage['utils/eql.js'][63]++;
    return false;
  }
  _$jscoverage['utils/eql.js'][66]++;
  if (isArguments(a)) {
    _$jscoverage['utils/eql.js'][67]++;
    if (! isArguments(b)) {
      _$jscoverage['utils/eql.js'][68]++;
      return false;
    }
    _$jscoverage['utils/eql.js'][70]++;
    a = pSlice.call(a);
    _$jscoverage['utils/eql.js'][71]++;
    b = pSlice.call(b);
    _$jscoverage['utils/eql.js'][72]++;
    return _deepEqual(a, b);
  }
  _$jscoverage['utils/eql.js'][74]++;
  try {
    _$jscoverage['utils/eql.js'][75]++;
    var ka = Object.keys(a), kb = Object.keys(b), key, i;
  }
  catch (e) {
    _$jscoverage['utils/eql.js'][79]++;
    return false;
  }
  _$jscoverage['utils/eql.js'][83]++;
  if (ka.length != kb.length) {
    _$jscoverage['utils/eql.js'][84]++;
    return false;
  }
  _$jscoverage['utils/eql.js'][86]++;
  ka.sort();
  _$jscoverage['utils/eql.js'][87]++;
  kb.sort();
  _$jscoverage['utils/eql.js'][89]++;
  for (i = ka.length - 1; i >= 0; i--) {
    _$jscoverage['utils/eql.js'][90]++;
    if (ka[i] != kb[i]) {
      _$jscoverage['utils/eql.js'][91]++;
      return false;
    }
}
  _$jscoverage['utils/eql.js'][95]++;
  for (i = ka.length - 1; i >= 0; i--) {
    _$jscoverage['utils/eql.js'][96]++;
    key = ka[i];
    _$jscoverage['utils/eql.js'][97]++;
    if (! _deepEqual(a[key], b[key])) {
      _$jscoverage['utils/eql.js'][97]++;
      return false;
    }
}
  _$jscoverage['utils/eql.js'][99]++;
  return true;
}
_$jscoverage['utils/eql.js'].source = ["// This is directly from Node.js assert","// https://github.com/joyent/node/blob/f8c335d0caf47f16d31413f89aa28eda3878e3aa/lib/assert.js","","","module.exports = _deepEqual;","","// For browser implementation","if (!Buffer) {","  var Buffer = {","    isBuffer: function () {","      return false;","    }","  };","}","","function _deepEqual(actual, expected) {","  // 7.1. All identical values are equivalent, as determined by ===.","  if (actual === expected) {","    return true;","","  } else if (Buffer.isBuffer(actual) &amp;&amp; Buffer.isBuffer(expected)) {","    if (actual.length != expected.length) return false;","","    for (var i = 0; i &lt; actual.length; i++) {","      if (actual[i] !== expected[i]) return false;","    }","","    return true;","","  // 7.2. If the expected value is a Date object, the actual value is","  // equivalent if it is also a Date object that refers to the same time.","  } else if (actual instanceof Date &amp;&amp; expected instanceof Date) {","    return actual.getTime() === expected.getTime();","","  // 7.3. Other pairs that do not both pass typeof value == 'object',","  // equivalence is determined by ==.","  } else if (typeof actual != 'object' &amp;&amp; typeof expected != 'object') {","    return actual === expected;","","  // 7.4. For all other Object pairs, including Array objects, equivalence is","  // determined by having the same number of owned properties (as verified","  // with Object.prototype.hasOwnProperty.call), the same set of keys","  // (although not necessarily the same order), equivalent values for every","  // corresponding key, and an identical 'prototype' property. Note: this","  // accounts for both named and indexed properties on Arrays.","  } else {","    return objEquiv(actual, expected);","  }","}","","function isUndefinedOrNull(value) {","  return value === null || value === undefined;","}","","function isArguments(object) {","  return Object.prototype.toString.call(object) == '[object Arguments]';","}","","function objEquiv(a, b) {","  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))","    return false;","  // an identical 'prototype' property.","  if (a.prototype !== b.prototype) return false;","  //~~~I've managed to break Object.keys through screwy arguments passing.","  //   Converting to array solves the problem.","  if (isArguments(a)) {","    if (!isArguments(b)) {","      return false;","    }","    a = pSlice.call(a);","    b = pSlice.call(b);","    return _deepEqual(a, b);","  }","  try {","    var ka = Object.keys(a),","        kb = Object.keys(b),","        key, i;","  } catch (e) {//happens when one is a string literal and the other isn't","    return false;","  }","  // having the same number of owned properties (keys incorporates","  // hasOwnProperty)","  if (ka.length != kb.length)","    return false;","  //the same set of keys (although not necessarily the same order),","  ka.sort();","  kb.sort();","  //~~~cheap key test","  for (i = ka.length - 1; i &gt;= 0; i--) {","    if (ka[i] != kb[i])","      return false;","  }","  //equivalent values for every corresponding key, and","  //~~~possibly expensive deep test","  for (i = ka.length - 1; i &gt;= 0; i--) {","    key = ka[i];","    if (!_deepEqual(a[key], b[key])) return false;","  }","  return true;","}"];

});

require.define("/node_modules/chai/lib-cov/utils/inspect.js", function (require, module, exports, __dirname, __filename) {
/* automatically generated by JSCoverage - do not edit */
if (typeof _$jscoverage === 'undefined') _$jscoverage = {};
if (! _$jscoverage['utils/inspect.js']) {
  _$jscoverage['utils/inspect.js'] = [];
  _$jscoverage['utils/inspect.js'][4] = 0;
  _$jscoverage['utils/inspect.js'][17] = 0;
  _$jscoverage['utils/inspect.js'][18] = 0;
  _$jscoverage['utils/inspect.js'][21] = 0;
  _$jscoverage['utils/inspect.js'][23] = 0;
  _$jscoverage['utils/inspect.js'][26] = 0;
  _$jscoverage['utils/inspect.js'][29] = 0;
  _$jscoverage['utils/inspect.js'][34] = 0;
  _$jscoverage['utils/inspect.js'][38] = 0;
  _$jscoverage['utils/inspect.js'][39] = 0;
  _$jscoverage['utils/inspect.js'][40] = 0;
  _$jscoverage['utils/inspect.js'][44] = 0;
  _$jscoverage['utils/inspect.js'][45] = 0;
  _$jscoverage['utils/inspect.js'][48] = 0;
  _$jscoverage['utils/inspect.js'][49] = 0;
  _$jscoverage['utils/inspect.js'][50] = 0;
  _$jscoverage['utils/inspect.js'][51] = 0;
  _$jscoverage['utils/inspect.js'][53] = 0;
  _$jscoverage['utils/inspect.js'][54] = 0;
  _$jscoverage['utils/inspect.js'][56] = 0;
  _$jscoverage['utils/inspect.js'][57] = 0;
  _$jscoverage['utils/inspect.js'][59] = 0;
  _$jscoverage['utils/inspect.js'][60] = 0;
  _$jscoverage['utils/inspect.js'][64] = 0;
  _$jscoverage['utils/inspect.js'][67] = 0;
  _$jscoverage['utils/inspect.js'][68] = 0;
  _$jscoverage['utils/inspect.js'][69] = 0;
  _$jscoverage['utils/inspect.js'][73] = 0;
  _$jscoverage['utils/inspect.js'][74] = 0;
  _$jscoverage['utils/inspect.js'][75] = 0;
  _$jscoverage['utils/inspect.js'][79] = 0;
  _$jscoverage['utils/inspect.js'][80] = 0;
  _$jscoverage['utils/inspect.js'][84] = 0;
  _$jscoverage['utils/inspect.js'][85] = 0;
  _$jscoverage['utils/inspect.js'][89] = 0;
  _$jscoverage['utils/inspect.js'][90] = 0;
  _$jscoverage['utils/inspect.js'][93] = 0;
  _$jscoverage['utils/inspect.js'][94] = 0;
  _$jscoverage['utils/inspect.js'][97] = 0;
  _$jscoverage['utils/inspect.js'][98] = 0;
  _$jscoverage['utils/inspect.js'][99] = 0;
  _$jscoverage['utils/inspect.js'][101] = 0;
  _$jscoverage['utils/inspect.js'][105] = 0;
  _$jscoverage['utils/inspect.js'][107] = 0;
  _$jscoverage['utils/inspect.js'][108] = 0;
  _$jscoverage['utils/inspect.js'][109] = 0;
  _$jscoverage['utils/inspect.js'][111] = 0;
  _$jscoverage['utils/inspect.js'][112] = 0;
  _$jscoverage['utils/inspect.js'][116] = 0;
  _$jscoverage['utils/inspect.js'][118] = 0;
  _$jscoverage['utils/inspect.js'][122] = 0;
  _$jscoverage['utils/inspect.js'][123] = 0;
  _$jscoverage['utils/inspect.js'][125] = 0;
  _$jscoverage['utils/inspect.js'][128] = 0;
  _$jscoverage['utils/inspect.js'][131] = 0;
  _$jscoverage['utils/inspect.js'][134] = 0;
  _$jscoverage['utils/inspect.js'][137] = 0;
  _$jscoverage['utils/inspect.js'][140] = 0;
  _$jscoverage['utils/inspect.js'][141] = 0;
  _$jscoverage['utils/inspect.js'][146] = 0;
  _$jscoverage['utils/inspect.js'][147] = 0;
  _$jscoverage['utils/inspect.js'][151] = 0;
  _$jscoverage['utils/inspect.js'][152] = 0;
  _$jscoverage['utils/inspect.js'][153] = 0;
  _$jscoverage['utils/inspect.js'][154] = 0;
  _$jscoverage['utils/inspect.js'][155] = 0;
  _$jscoverage['utils/inspect.js'][158] = 0;
  _$jscoverage['utils/inspect.js'][161] = 0;
  _$jscoverage['utils/inspect.js'][162] = 0;
  _$jscoverage['utils/inspect.js'][163] = 0;
  _$jscoverage['utils/inspect.js'][167] = 0;
  _$jscoverage['utils/inspect.js'][171] = 0;
  _$jscoverage['utils/inspect.js'][172] = 0;
  _$jscoverage['utils/inspect.js'][173] = 0;
  _$jscoverage['utils/inspect.js'][174] = 0;
  _$jscoverage['utils/inspect.js'][175] = 0;
  _$jscoverage['utils/inspect.js'][176] = 0;
  _$jscoverage['utils/inspect.js'][178] = 0;
  _$jscoverage['utils/inspect.js'][181] = 0;
  _$jscoverage['utils/inspect.js'][182] = 0;
  _$jscoverage['utils/inspect.js'][186] = 0;
  _$jscoverage['utils/inspect.js'][187] = 0;
  _$jscoverage['utils/inspect.js'][189] = 0;
  _$jscoverage['utils/inspect.js'][190] = 0;
  _$jscoverage['utils/inspect.js'][191] = 0;
  _$jscoverage['utils/inspect.js'][192] = 0;
  _$jscoverage['utils/inspect.js'][194] = 0;
  _$jscoverage['utils/inspect.js'][196] = 0;
  _$jscoverage['utils/inspect.js'][197] = 0;
  _$jscoverage['utils/inspect.js'][198] = 0;
  _$jscoverage['utils/inspect.js'][199] = 0;
  _$jscoverage['utils/inspect.js'][202] = 0;
  _$jscoverage['utils/inspect.js'][203] = 0;
  _$jscoverage['utils/inspect.js'][208] = 0;
  _$jscoverage['utils/inspect.js'][211] = 0;
  _$jscoverage['utils/inspect.js'][212] = 0;
  _$jscoverage['utils/inspect.js'][213] = 0;
  _$jscoverage['utils/inspect.js'][215] = 0;
  _$jscoverage['utils/inspect.js'][216] = 0;
  _$jscoverage['utils/inspect.js'][217] = 0;
  _$jscoverage['utils/inspect.js'][218] = 0;
  _$jscoverage['utils/inspect.js'][220] = 0;
  _$jscoverage['utils/inspect.js'][223] = 0;
  _$jscoverage['utils/inspect.js'][227] = 0;
  _$jscoverage['utils/inspect.js'][231] = 0;
  _$jscoverage['utils/inspect.js'][232] = 0;
  _$jscoverage['utils/inspect.js'][233] = 0;
  _$jscoverage['utils/inspect.js'][234] = 0;
  _$jscoverage['utils/inspect.js'][235] = 0;
  _$jscoverage['utils/inspect.js'][236] = 0;
  _$jscoverage['utils/inspect.js'][239] = 0;
  _$jscoverage['utils/inspect.js'][240] = 0;
  _$jscoverage['utils/inspect.js'][248] = 0;
  _$jscoverage['utils/inspect.js'][251] = 0;
  _$jscoverage['utils/inspect.js'][252] = 0;
  _$jscoverage['utils/inspect.js'][256] = 0;
  _$jscoverage['utils/inspect.js'][257] = 0;
  _$jscoverage['utils/inspect.js'][260] = 0;
  _$jscoverage['utils/inspect.js'][261] = 0;
  _$jscoverage['utils/inspect.js'][264] = 0;
  _$jscoverage['utils/inspect.js'][265] = 0;
  _$jscoverage['utils/inspect.js'][268] = 0;
  _$jscoverage['utils/inspect.js'][269] = 0;
}
_$jscoverage['utils/inspect.js'][4]++;
module.exports = inspect;
_$jscoverage['utils/inspect.js'][17]++;
function inspect(obj, showHidden, depth, colors) {
  _$jscoverage['utils/inspect.js'][18]++;
  var ctx = {showHidden: showHidden, seen: [], stylize: (function (str) {
  _$jscoverage['utils/inspect.js'][21]++;
  return str;
})};
  _$jscoverage['utils/inspect.js'][23]++;
  return formatValue(ctx, obj, (typeof depth === "undefined"? 2: depth));
}
_$jscoverage['utils/inspect.js'][26]++;
function formatValue(ctx, value, recurseTimes) {
  _$jscoverage['utils/inspect.js'][29]++;
  if (value && typeof value.inspect === "function" && value.inspect !== exports.inspect && ! (value.constructor && value.constructor.prototype === value)) {
    _$jscoverage['utils/inspect.js'][34]++;
    return value.inspect(recurseTimes);
  }
  _$jscoverage['utils/inspect.js'][38]++;
  var primitive = formatPrimitive(ctx, value);
  _$jscoverage['utils/inspect.js'][39]++;
  if (primitive) {
    _$jscoverage['utils/inspect.js'][40]++;
    return primitive;
  }
  _$jscoverage['utils/inspect.js'][44]++;
  var visibleKeys = Object.keys(value);
  _$jscoverage['utils/inspect.js'][45]++;
  var keys = ctx.showHidden? Object.getOwnPropertyNames(value): visibleKeys;
  _$jscoverage['utils/inspect.js'][48]++;
  if (keys.length === 0) {
    _$jscoverage['utils/inspect.js'][49]++;
    if (typeof value === "function") {
      _$jscoverage['utils/inspect.js'][50]++;
      var name = value.name? ": " + value.name: "";
      _$jscoverage['utils/inspect.js'][51]++;
      return ctx.stylize("[Function" + name + "]", "special");
    }
    _$jscoverage['utils/inspect.js'][53]++;
    if (isRegExp(value)) {
      _$jscoverage['utils/inspect.js'][54]++;
      return ctx.stylize(RegExp.prototype.toString.call(value), "regexp");
    }
    _$jscoverage['utils/inspect.js'][56]++;
    if (isDate(value)) {
      _$jscoverage['utils/inspect.js'][57]++;
      return ctx.stylize(Date.prototype.toUTCString.call(value), "date");
    }
    _$jscoverage['utils/inspect.js'][59]++;
    if (isError(value)) {
      _$jscoverage['utils/inspect.js'][60]++;
      return formatError(value);
    }
  }
  _$jscoverage['utils/inspect.js'][64]++;
  var base = "", array = false, braces = ["{", "}"];
  _$jscoverage['utils/inspect.js'][67]++;
  if (isArray(value)) {
    _$jscoverage['utils/inspect.js'][68]++;
    array = true;
    _$jscoverage['utils/inspect.js'][69]++;
    braces = ["[", "]"];
  }
  _$jscoverage['utils/inspect.js'][73]++;
  if (typeof value === "function") {
    _$jscoverage['utils/inspect.js'][74]++;
    var n = value.name? ": " + value.name: "";
    _$jscoverage['utils/inspect.js'][75]++;
    base = " [Function" + n + "]";
  }
  _$jscoverage['utils/inspect.js'][79]++;
  if (isRegExp(value)) {
    _$jscoverage['utils/inspect.js'][80]++;
    base = " " + RegExp.prototype.toString.call(value);
  }
  _$jscoverage['utils/inspect.js'][84]++;
  if (isDate(value)) {
    _$jscoverage['utils/inspect.js'][85]++;
    base = " " + Date.prototype.toUTCString.call(value);
  }
  _$jscoverage['utils/inspect.js'][89]++;
  if (isError(value)) {
    _$jscoverage['utils/inspect.js'][90]++;
    base = " " + formatError(value);
  }
  _$jscoverage['utils/inspect.js'][93]++;
  if (keys.length === 0 && (! array || value.length == 0)) {
    _$jscoverage['utils/inspect.js'][94]++;
    return braces[0] + base + braces[1];
  }
  _$jscoverage['utils/inspect.js'][97]++;
  if (recurseTimes < 0) {
    _$jscoverage['utils/inspect.js'][98]++;
    if (isRegExp(value)) {
      _$jscoverage['utils/inspect.js'][99]++;
      return ctx.stylize(RegExp.prototype.toString.call(value), "regexp");
    }
    else {
      _$jscoverage['utils/inspect.js'][101]++;
      return ctx.stylize("[Object]", "special");
    }
  }
  _$jscoverage['utils/inspect.js'][105]++;
  ctx.seen.push(value);
  _$jscoverage['utils/inspect.js'][107]++;
  var output;
  _$jscoverage['utils/inspect.js'][108]++;
  if (array) {
    _$jscoverage['utils/inspect.js'][109]++;
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  }
  else {
    _$jscoverage['utils/inspect.js'][111]++;
    output = keys.map((function (key) {
  _$jscoverage['utils/inspect.js'][112]++;
  return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
}));
  }
  _$jscoverage['utils/inspect.js'][116]++;
  ctx.seen.pop();
  _$jscoverage['utils/inspect.js'][118]++;
  return reduceToSingleString(output, base, braces);
}
_$jscoverage['utils/inspect.js'][122]++;
function formatPrimitive(ctx, value) {
  _$jscoverage['utils/inspect.js'][123]++;
  switch (typeof value) {
  case "undefined":
    _$jscoverage['utils/inspect.js'][125]++;
    return ctx.stylize("undefined", "undefined");
  case "string":
    _$jscoverage['utils/inspect.js'][128]++;
    var simple = "'" + JSON.stringify(value).replace(/^"|"$/g, "").replace(/'/g, "\\'").replace(/\\"/g, "\"") + "'";
    _$jscoverage['utils/inspect.js'][131]++;
    return ctx.stylize(simple, "string");
  case "number":
    _$jscoverage['utils/inspect.js'][134]++;
    return ctx.stylize("" + value, "number");
  case "boolean":
    _$jscoverage['utils/inspect.js'][137]++;
    return ctx.stylize("" + value, "boolean");
  }
  _$jscoverage['utils/inspect.js'][140]++;
  if (value === null) {
    _$jscoverage['utils/inspect.js'][141]++;
    return ctx.stylize("null", "null");
  }
}
_$jscoverage['utils/inspect.js'][146]++;
function formatError(value) {
  _$jscoverage['utils/inspect.js'][147]++;
  return "[" + Error.prototype.toString.call(value) + "]";
}
_$jscoverage['utils/inspect.js'][151]++;
function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  _$jscoverage['utils/inspect.js'][152]++;
  var output = [];
  _$jscoverage['utils/inspect.js'][153]++;
  for (var i = 0, l = value.length; i < l; ++i) {
    _$jscoverage['utils/inspect.js'][154]++;
    if (Object.prototype.hasOwnProperty.call(value, String(i))) {
      _$jscoverage['utils/inspect.js'][155]++;
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, String(i), true));
    }
    else {
      _$jscoverage['utils/inspect.js'][158]++;
      output.push("");
    }
}
  _$jscoverage['utils/inspect.js'][161]++;
  keys.forEach((function (key) {
  _$jscoverage['utils/inspect.js'][162]++;
  if (! key.match(/^\d+$/)) {
    _$jscoverage['utils/inspect.js'][163]++;
    output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, key, true));
  }
}));
  _$jscoverage['utils/inspect.js'][167]++;
  return output;
}
_$jscoverage['utils/inspect.js'][171]++;
function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  _$jscoverage['utils/inspect.js'][172]++;
  var name, str;
  _$jscoverage['utils/inspect.js'][173]++;
  if (value.__lookupGetter__) {
    _$jscoverage['utils/inspect.js'][174]++;
    if (value.__lookupGetter__(key)) {
      _$jscoverage['utils/inspect.js'][175]++;
      if (value.__lookupSetter__(key)) {
        _$jscoverage['utils/inspect.js'][176]++;
        str = ctx.stylize("[Getter/Setter]", "special");
      }
      else {
        _$jscoverage['utils/inspect.js'][178]++;
        str = ctx.stylize("[Getter]", "special");
      }
    }
    else {
      _$jscoverage['utils/inspect.js'][181]++;
      if (value.__lookupSetter__(key)) {
        _$jscoverage['utils/inspect.js'][182]++;
        str = ctx.stylize("[Setter]", "special");
      }
    }
  }
  _$jscoverage['utils/inspect.js'][186]++;
  if (visibleKeys.indexOf(key) < 0) {
    _$jscoverage['utils/inspect.js'][187]++;
    name = "[" + key + "]";
  }
  _$jscoverage['utils/inspect.js'][189]++;
  if (! str) {
    _$jscoverage['utils/inspect.js'][190]++;
    if (ctx.seen.indexOf(value[key]) < 0) {
      _$jscoverage['utils/inspect.js'][191]++;
      if (recurseTimes === null) {
        _$jscoverage['utils/inspect.js'][192]++;
        str = formatValue(ctx, value[key], null);
      }
      else {
        _$jscoverage['utils/inspect.js'][194]++;
        str = formatValue(ctx, value[key], recurseTimes - 1);
      }
      _$jscoverage['utils/inspect.js'][196]++;
      if (str.indexOf("\n") > -1) {
        _$jscoverage['utils/inspect.js'][197]++;
        if (array) {
          _$jscoverage['utils/inspect.js'][198]++;
          str = str.split("\n").map((function (line) {
  _$jscoverage['utils/inspect.js'][199]++;
  return "  " + line;
})).join("\n").substr(2);
        }
        else {
          _$jscoverage['utils/inspect.js'][202]++;
          str = "\n" + str.split("\n").map((function (line) {
  _$jscoverage['utils/inspect.js'][203]++;
  return "   " + line;
})).join("\n");
        }
      }
    }
    else {
      _$jscoverage['utils/inspect.js'][208]++;
      str = ctx.stylize("[Circular]", "special");
    }
  }
  _$jscoverage['utils/inspect.js'][211]++;
  if (typeof name === "undefined") {
    _$jscoverage['utils/inspect.js'][212]++;
    if (array && key.match(/^\d+$/)) {
      _$jscoverage['utils/inspect.js'][213]++;
      return str;
    }
    _$jscoverage['utils/inspect.js'][215]++;
    name = JSON.stringify("" + key);
    _$jscoverage['utils/inspect.js'][216]++;
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      _$jscoverage['utils/inspect.js'][217]++;
      name = name.substr(1, name.length - 2);
      _$jscoverage['utils/inspect.js'][218]++;
      name = ctx.stylize(name, "name");
    }
    else {
      _$jscoverage['utils/inspect.js'][220]++;
      name = name.replace(/'/g, "\\'").replace(/\\"/g, "\"").replace(/(^"|"$)/g, "'");
      _$jscoverage['utils/inspect.js'][223]++;
      name = ctx.stylize(name, "string");
    }
  }
  _$jscoverage['utils/inspect.js'][227]++;
  return name + ": " + str;
}
_$jscoverage['utils/inspect.js'][231]++;
function reduceToSingleString(output, base, braces) {
  _$jscoverage['utils/inspect.js'][232]++;
  var numLinesEst = 0;
  _$jscoverage['utils/inspect.js'][233]++;
  var length = output.reduce((function (prev, cur) {
  _$jscoverage['utils/inspect.js'][234]++;
  numLinesEst++;
  _$jscoverage['utils/inspect.js'][235]++;
  if (cur.indexOf("\n") >= 0) {
    _$jscoverage['utils/inspect.js'][235]++;
    numLinesEst++;
  }
  _$jscoverage['utils/inspect.js'][236]++;
  return prev + cur.length + 1;
}), 0);
  _$jscoverage['utils/inspect.js'][239]++;
  if (length > 60) {
    _$jscoverage['utils/inspect.js'][240]++;
    return braces[0] + (base === ""? "": base + "\n ") + " " + output.join(",\n  ") + " " + braces[1];
  }
  _$jscoverage['utils/inspect.js'][248]++;
  return braces[0] + base + " " + output.join(", ") + " " + braces[1];
}
_$jscoverage['utils/inspect.js'][251]++;
function isArray(ar) {
  _$jscoverage['utils/inspect.js'][252]++;
  return Array.isArray(ar) || (typeof ar === "object" && objectToString(ar) === "[object Array]");
}
_$jscoverage['utils/inspect.js'][256]++;
function isRegExp(re) {
  _$jscoverage['utils/inspect.js'][257]++;
  return typeof re === "object" && objectToString(re) === "[object RegExp]";
}
_$jscoverage['utils/inspect.js'][260]++;
function isDate(d) {
  _$jscoverage['utils/inspect.js'][261]++;
  return typeof d === "object" && objectToString(d) === "[object Date]";
}
_$jscoverage['utils/inspect.js'][264]++;
function isError(e) {
  _$jscoverage['utils/inspect.js'][265]++;
  return typeof e === "object" && objectToString(e) === "[object Error]";
}
_$jscoverage['utils/inspect.js'][268]++;
function objectToString(o) {
  _$jscoverage['utils/inspect.js'][269]++;
  return Object.prototype.toString.call(o);
}
_$jscoverage['utils/inspect.js'].source = ["// This is (almost) directly from Node.js utils","// https://github.com/joyent/node/blob/f8c335d0caf47f16d31413f89aa28eda3878e3aa/lib/util.js","","module.exports = inspect;","","/**"," * Echos the value of a value. Trys to print the value out"," * in the best way possible given the different types."," *"," * @param {Object} obj The object to print out."," * @param {Boolean} showHidden Flag that shows hidden (not enumerable)"," *    properties of objects."," * @param {Number} depth Depth in which to descend in object. Default is 2."," * @param {Boolean} colors Flag to turn on ANSI escape codes to color the"," *    output. Default is false (no coloring)."," */","function inspect(obj, showHidden, depth, colors) {","  var ctx = {","    showHidden: showHidden,","    seen: [],","    stylize: function (str) { return str; }","  };","  return formatValue(ctx, obj, (typeof depth === 'undefined' ? 2 : depth));","}","","function formatValue(ctx, value, recurseTimes) {","  // Provide a hook for user-specified inspect functions.","  // Check that value is an object with an inspect function on it","  if (value &amp;&amp; typeof value.inspect === 'function' &amp;&amp;","      // Filter out the util module, it's inspect function is special","      value.inspect !== exports.inspect &amp;&amp;","      // Also filter out any prototype objects using the circular check.","      !(value.constructor &amp;&amp; value.constructor.prototype === value)) {","    return value.inspect(recurseTimes);","  }","","  // Primitive types cannot have properties","  var primitive = formatPrimitive(ctx, value);","  if (primitive) {","    return primitive;","  }","","  // Look up the keys of the object.","  var visibleKeys = Object.keys(value);","  var keys = ctx.showHidden ? Object.getOwnPropertyNames(value) : visibleKeys;","","  // Some type of object without properties can be shortcutted.","  if (keys.length === 0) {","    if (typeof value === 'function') {","      var name = value.name ? ': ' + value.name : '';","      return ctx.stylize('[Function' + name + ']', 'special');","    }","    if (isRegExp(value)) {","      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');","    }","    if (isDate(value)) {","      return ctx.stylize(Date.prototype.toUTCString.call(value), 'date');","    }","    if (isError(value)) {","      return formatError(value);","    }","  }","","  var base = '', array = false, braces = ['{', '}'];","","  // Make Array say that they are Array","  if (isArray(value)) {","    array = true;","    braces = ['[', ']'];","  }","","  // Make functions say that they are functions","  if (typeof value === 'function') {","    var n = value.name ? ': ' + value.name : '';","    base = ' [Function' + n + ']';","  }","","  // Make RegExps say that they are RegExps","  if (isRegExp(value)) {","    base = ' ' + RegExp.prototype.toString.call(value);","  }","","  // Make dates with properties first say the date","  if (isDate(value)) {","    base = ' ' + Date.prototype.toUTCString.call(value);","  }","","  // Make error with message first say the error","  if (isError(value)) {","    base = ' ' + formatError(value);","  }","","  if (keys.length === 0 &amp;&amp; (!array || value.length == 0)) {","    return braces[0] + base + braces[1];","  }","","  if (recurseTimes &lt; 0) {","    if (isRegExp(value)) {","      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');","    } else {","      return ctx.stylize('[Object]', 'special');","    }","  }","","  ctx.seen.push(value);","","  var output;","  if (array) {","    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);","  } else {","    output = keys.map(function(key) {","      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);","    });","  }","","  ctx.seen.pop();","","  return reduceToSingleString(output, base, braces);","}","","","function formatPrimitive(ctx, value) {","  switch (typeof value) {","    case 'undefined':","      return ctx.stylize('undefined', 'undefined');","","    case 'string':","      var simple = '\\'' + JSON.stringify(value).replace(/^\"|\"$/g, '')","                                               .replace(/'/g, \"\\\\'\")","                                               .replace(/\\\\\"/g, '\"') + '\\'';","      return ctx.stylize(simple, 'string');","","    case 'number':","      return ctx.stylize('' + value, 'number');","","    case 'boolean':","      return ctx.stylize('' + value, 'boolean');","  }","  // For some reason typeof null is \"object\", so special case here.","  if (value === null) {","    return ctx.stylize('null', 'null');","  }","}","","","function formatError(value) {","  return '[' + Error.prototype.toString.call(value) + ']';","}","","","function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {","  var output = [];","  for (var i = 0, l = value.length; i &lt; l; ++i) {","    if (Object.prototype.hasOwnProperty.call(value, String(i))) {","      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,","          String(i), true));","    } else {","      output.push('');","    }","  }","  keys.forEach(function(key) {","    if (!key.match(/^\\d+$/)) {","      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,","          key, true));","    }","  });","  return output;","}","","","function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {","  var name, str;","  if (value.__lookupGetter__) {","    if (value.__lookupGetter__(key)) {","      if (value.__lookupSetter__(key)) {","        str = ctx.stylize('[Getter/Setter]', 'special');","      } else {","        str = ctx.stylize('[Getter]', 'special');","      }","    } else {","      if (value.__lookupSetter__(key)) {","        str = ctx.stylize('[Setter]', 'special');","      }","    }","  }","  if (visibleKeys.indexOf(key) &lt; 0) {","    name = '[' + key + ']';","  }","  if (!str) {","    if (ctx.seen.indexOf(value[key]) &lt; 0) {","      if (recurseTimes === null) {","        str = formatValue(ctx, value[key], null);","      } else {","        str = formatValue(ctx, value[key], recurseTimes - 1);","      }","      if (str.indexOf('\\n') &gt; -1) {","        if (array) {","          str = str.split('\\n').map(function(line) {","            return '  ' + line;","          }).join('\\n').substr(2);","        } else {","          str = '\\n' + str.split('\\n').map(function(line) {","            return '   ' + line;","          }).join('\\n');","        }","      }","    } else {","      str = ctx.stylize('[Circular]', 'special');","    }","  }","  if (typeof name === 'undefined') {","    if (array &amp;&amp; key.match(/^\\d+$/)) {","      return str;","    }","    name = JSON.stringify('' + key);","    if (name.match(/^\"([a-zA-Z_][a-zA-Z_0-9]*)\"$/)) {","      name = name.substr(1, name.length - 2);","      name = ctx.stylize(name, 'name');","    } else {","      name = name.replace(/'/g, \"\\\\'\")","                 .replace(/\\\\\"/g, '\"')","                 .replace(/(^\"|\"$)/g, \"'\");","      name = ctx.stylize(name, 'string');","    }","  }","","  return name + ': ' + str;","}","","","function reduceToSingleString(output, base, braces) {","  var numLinesEst = 0;","  var length = output.reduce(function(prev, cur) {","    numLinesEst++;","    if (cur.indexOf('\\n') &gt;= 0) numLinesEst++;","    return prev + cur.length + 1;","  }, 0);","","  if (length &gt; 60) {","    return braces[0] +","           (base === '' ? '' : base + '\\n ') +","           ' ' +","           output.join(',\\n  ') +","           ' ' +","           braces[1];","  }","","  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];","}","","function isArray(ar) {","  return Array.isArray(ar) ||","         (typeof ar === 'object' &amp;&amp; objectToString(ar) === '[object Array]');","}","","function isRegExp(re) {","  return typeof re === 'object' &amp;&amp; objectToString(re) === '[object RegExp]';","}","","function isDate(d) {","  return typeof d === 'object' &amp;&amp; objectToString(d) === '[object Date]';","}","","function isError(e) {","  return typeof e === 'object' &amp;&amp; objectToString(e) === '[object Error]';","}","","function objectToString(o) {","  return Object.prototype.toString.call(o);","}"];

});

require.define("/node_modules/chai/lib-cov/interface/expect.js", function (require, module, exports, __dirname, __filename) {
/* automatically generated by JSCoverage - do not edit */
if (typeof _$jscoverage === 'undefined') _$jscoverage = {};
if (! _$jscoverage['interface/expect.js']) {
  _$jscoverage['interface/expect.js'] = [];
  _$jscoverage['interface/expect.js'][7] = 0;
  _$jscoverage['interface/expect.js'][8] = 0;
  _$jscoverage['interface/expect.js'][9] = 0;
}
_$jscoverage['interface/expect.js'][7]++;
module.exports = (function (chai) {
  _$jscoverage['interface/expect.js'][8]++;
  chai.expect = (function (val, message) {
  _$jscoverage['interface/expect.js'][9]++;
  return new chai.Assertion(val, message);
});
});
_$jscoverage['interface/expect.js'].source = ["/*!"," * chai"," * Copyright(c) 2011 Jake Luer &lt;jake@alogicalparadox.com&gt;"," * MIT Licensed"," */","","module.exports = function (chai) {","  chai.expect = function (val, message) {","    return new chai.Assertion(val, message);","  };","};",""];

});

require.define("/node_modules/chai/lib-cov/interface/should.js", function (require, module, exports, __dirname, __filename) {
/* automatically generated by JSCoverage - do not edit */
if (typeof _$jscoverage === 'undefined') _$jscoverage = {};
if (! _$jscoverage['interface/should.js']) {
  _$jscoverage['interface/should.js'] = [];
  _$jscoverage['interface/should.js'][7] = 0;
  _$jscoverage['interface/should.js'][8] = 0;
  _$jscoverage['interface/should.js'][10] = 0;
  _$jscoverage['interface/should.js'][12] = 0;
  _$jscoverage['interface/should.js'][15] = 0;
  _$jscoverage['interface/should.js'][16] = 0;
  _$jscoverage['interface/should.js'][17] = 0;
  _$jscoverage['interface/should.js'][18] = 0;
  _$jscoverage['interface/should.js'][20] = 0;
  _$jscoverage['interface/should.js'][25] = 0;
  _$jscoverage['interface/should.js'][27] = 0;
  _$jscoverage['interface/should.js'][28] = 0;
  _$jscoverage['interface/should.js'][31] = 0;
  _$jscoverage['interface/should.js'][32] = 0;
  _$jscoverage['interface/should.js'][35] = 0;
  _$jscoverage['interface/should.js'][36] = 0;
  _$jscoverage['interface/should.js'][40] = 0;
  _$jscoverage['interface/should.js'][42] = 0;
  _$jscoverage['interface/should.js'][43] = 0;
  _$jscoverage['interface/should.js'][46] = 0;
  _$jscoverage['interface/should.js'][47] = 0;
  _$jscoverage['interface/should.js'][50] = 0;
  _$jscoverage['interface/should.js'][51] = 0;
  _$jscoverage['interface/should.js'][54] = 0;
}
_$jscoverage['interface/should.js'][7]++;
module.exports = (function (chai) {
  _$jscoverage['interface/should.js'][8]++;
  var Assertion = chai.Assertion;
  _$jscoverage['interface/should.js'][10]++;
  chai.should = (function () {
  _$jscoverage['interface/should.js'][12]++;
  Object.defineProperty(Object.prototype, "should", {set: (function () {
}), get: (function () {
  _$jscoverage['interface/should.js'][15]++;
  if (this instanceof String || this instanceof Number) {
    _$jscoverage['interface/should.js'][16]++;
    return new Assertion(this.constructor(this));
  }
  else {
    _$jscoverage['interface/should.js'][17]++;
    if (this instanceof Boolean) {
      _$jscoverage['interface/should.js'][18]++;
      return new Assertion(this == true);
    }
  }
  _$jscoverage['interface/should.js'][20]++;
  return new Assertion(this);
}), configurable: true});
  _$jscoverage['interface/should.js'][25]++;
  var should = {};
  _$jscoverage['interface/should.js'][27]++;
  should.equal = (function (val1, val2) {
  _$jscoverage['interface/should.js'][28]++;
  new Assertion(val1).to.equal(val2);
});
  _$jscoverage['interface/should.js'][31]++;
  should["throw"] = (function (fn, errt, errs) {
  _$jscoverage['interface/should.js'][32]++;
  new Assertion(fn).to["throw"](errt, errs);
});
  _$jscoverage['interface/should.js'][35]++;
  should.exist = (function (val) {
  _$jscoverage['interface/should.js'][36]++;
  new Assertion(val).to.exist;
});
  _$jscoverage['interface/should.js'][40]++;
  should.not = {};
  _$jscoverage['interface/should.js'][42]++;
  should.not.equal = (function (val1, val2) {
  _$jscoverage['interface/should.js'][43]++;
  new Assertion(val1).to.not.equal(val2);
});
  _$jscoverage['interface/should.js'][46]++;
  should.not["throw"] = (function (fn, errt, errs) {
  _$jscoverage['interface/should.js'][47]++;
  new Assertion(fn).to.not["throw"](errt, errs);
});
  _$jscoverage['interface/should.js'][50]++;
  should.not.exist = (function (val) {
  _$jscoverage['interface/should.js'][51]++;
  new Assertion(val).to.not.exist;
});
  _$jscoverage['interface/should.js'][54]++;
  return should;
});
});
_$jscoverage['interface/should.js'].source = ["/*!"," * chai"," * Copyright(c) 2011 Jake Luer &lt;jake@alogicalparadox.com&gt;"," * MIT Licensed"," */","","module.exports = function (chai) {","  var Assertion = chai.Assertion;","","  chai.should = function () {","    // modify Object.prototype to have `should`","    Object.defineProperty(Object.prototype, 'should', {","      set: function(){},","      get: function(){","        if (this instanceof String || this instanceof Number) {","          return new Assertion(this.constructor(this));","        } else if (this instanceof Boolean) {","          return new Assertion(this == true);","        }","        return new Assertion(this);","      },","      configurable: true","    });","","    var should = {};","","    should.equal = function (val1, val2) {","      new Assertion(val1).to.equal(val2);","    };","","    should.throw = function (fn, errt, errs) {","      new Assertion(fn).to.throw(errt, errs);","    };","","    should.exist = function (val) {","      new Assertion(val).to.exist;","    }","","    // negation","    should.not = {}","","    should.not.equal = function (val1, val2) {","      new Assertion(val1).to.not.equal(val2);","    };","","    should.not.throw = function (fn, errt, errs) {","      new Assertion(fn).to.not.throw(errt, errs);","    };","","    should.not.exist = function (val) {","      new Assertion(val).to.not.exist;","    }","","    return should;","  };","};"];

});

require.define("/node_modules/chai/lib-cov/interface/assert.js", function (require, module, exports, __dirname, __filename) {
/* automatically generated by JSCoverage - do not edit */
if (typeof _$jscoverage === 'undefined') _$jscoverage = {};
if (! _$jscoverage['interface/assert.js']) {
  _$jscoverage['interface/assert.js'] = [];
  _$jscoverage['interface/assert.js'][31] = 0;
  _$jscoverage['interface/assert.js'][35] = 0;
  _$jscoverage['interface/assert.js'][42] = 0;
  _$jscoverage['interface/assert.js'][57] = 0;
  _$jscoverage['interface/assert.js'][58] = 0;
  _$jscoverage['interface/assert.js'][81] = 0;
  _$jscoverage['interface/assert.js'][82] = 0;
  _$jscoverage['interface/assert.js'][99] = 0;
  _$jscoverage['interface/assert.js'][100] = 0;
  _$jscoverage['interface/assert.js'][102] = 0;
  _$jscoverage['interface/assert.js'][122] = 0;
  _$jscoverage['interface/assert.js'][123] = 0;
  _$jscoverage['interface/assert.js'][125] = 0;
  _$jscoverage['interface/assert.js'][145] = 0;
  _$jscoverage['interface/assert.js'][146] = 0;
  _$jscoverage['interface/assert.js'][163] = 0;
  _$jscoverage['interface/assert.js'][164] = 0;
  _$jscoverage['interface/assert.js'][181] = 0;
  _$jscoverage['interface/assert.js'][182] = 0;
  _$jscoverage['interface/assert.js'][199] = 0;
  _$jscoverage['interface/assert.js'][200] = 0;
  _$jscoverage['interface/assert.js'][217] = 0;
  _$jscoverage['interface/assert.js'][218] = 0;
  _$jscoverage['interface/assert.js'][235] = 0;
  _$jscoverage['interface/assert.js'][236] = 0;
  _$jscoverage['interface/assert.js'][252] = 0;
  _$jscoverage['interface/assert.js'][253] = 0;
  _$jscoverage['interface/assert.js'][270] = 0;
  _$jscoverage['interface/assert.js'][271] = 0;
  _$jscoverage['interface/assert.js'][287] = 0;
  _$jscoverage['interface/assert.js'][288] = 0;
  _$jscoverage['interface/assert.js'][305] = 0;
  _$jscoverage['interface/assert.js'][306] = 0;
  _$jscoverage['interface/assert.js'][323] = 0;
  _$jscoverage['interface/assert.js'][324] = 0;
  _$jscoverage['interface/assert.js'][341] = 0;
  _$jscoverage['interface/assert.js'][342] = 0;
  _$jscoverage['interface/assert.js'][359] = 0;
  _$jscoverage['interface/assert.js'][360] = 0;
  _$jscoverage['interface/assert.js'][377] = 0;
  _$jscoverage['interface/assert.js'][378] = 0;
  _$jscoverage['interface/assert.js'][395] = 0;
  _$jscoverage['interface/assert.js'][396] = 0;
  _$jscoverage['interface/assert.js'][416] = 0;
  _$jscoverage['interface/assert.js'][417] = 0;
  _$jscoverage['interface/assert.js'][434] = 0;
  _$jscoverage['interface/assert.js'][435] = 0;
  _$jscoverage['interface/assert.js'][455] = 0;
  _$jscoverage['interface/assert.js'][456] = 0;
  _$jscoverage['interface/assert.js'][475] = 0;
  _$jscoverage['interface/assert.js'][476] = 0;
  _$jscoverage['interface/assert.js'][478] = 0;
  _$jscoverage['interface/assert.js'][479] = 0;
  _$jscoverage['interface/assert.js'][480] = 0;
  _$jscoverage['interface/assert.js'][481] = 0;
  _$jscoverage['interface/assert.js'][499] = 0;
  _$jscoverage['interface/assert.js'][500] = 0;
  _$jscoverage['interface/assert.js'][518] = 0;
  _$jscoverage['interface/assert.js'][519] = 0;
  _$jscoverage['interface/assert.js'][539] = 0;
  _$jscoverage['interface/assert.js'][540] = 0;
  _$jscoverage['interface/assert.js'][541] = 0;
  _$jscoverage['interface/assert.js'][542] = 0;
  _$jscoverage['interface/assert.js'][545] = 0;
  _$jscoverage['interface/assert.js'][565] = 0;
  _$jscoverage['interface/assert.js'][566] = 0;
  _$jscoverage['interface/assert.js'][567] = 0;
  _$jscoverage['interface/assert.js'][568] = 0;
  _$jscoverage['interface/assert.js'][571] = 0;
  _$jscoverage['interface/assert.js'][590] = 0;
  _$jscoverage['interface/assert.js'][591] = 0;
  _$jscoverage['interface/assert.js'][592] = 0;
  _$jscoverage['interface/assert.js'][594] = 0;
  _$jscoverage['interface/assert.js'][595] = 0;
  _$jscoverage['interface/assert.js'][605] = 0;
  _$jscoverage['interface/assert.js'][606] = 0;
  _$jscoverage['interface/assert.js'][613] = 0;
  _$jscoverage['interface/assert.js'][614] = 0;
  _$jscoverage['interface/assert.js'][615] = 0;
}
_$jscoverage['interface/assert.js'][31]++;
module.exports = (function (chai) {
  _$jscoverage['interface/assert.js'][35]++;
  var Assertion = chai.Assertion, inspect = chai.inspect;
  _$jscoverage['interface/assert.js'][42]++;
  var assert = chai.assert = {};
  _$jscoverage['interface/assert.js'][57]++;
  assert.fail = (function (actual, expected, message, operator) {
  _$jscoverage['interface/assert.js'][58]++;
  throw new chai.AssertionError({actual: actual, expected: expected, message: message, operator: operator, stackStartFunction: assert.fail});
});
  _$jscoverage['interface/assert.js'][81]++;
  assert.ok = (function (val, msg) {
  _$jscoverage['interface/assert.js'][82]++;
  new Assertion(val, msg).is.ok;
});
  _$jscoverage['interface/assert.js'][99]++;
  assert.equal = (function (act, exp, msg) {
  _$jscoverage['interface/assert.js'][100]++;
  var test = new Assertion(act, msg);
  _$jscoverage['interface/assert.js'][102]++;
  test.assert(exp == test.obj, "expected " + test.inspect + " to equal " + inspect(exp), "expected " + test.inspect + " to not equal " + inspect(exp));
});
  _$jscoverage['interface/assert.js'][122]++;
  assert.notEqual = (function (act, exp, msg) {
  _$jscoverage['interface/assert.js'][123]++;
  var test = new Assertion(act, msg);
  _$jscoverage['interface/assert.js'][125]++;
  test.assert(exp != test.obj, "expected " + test.inspect + " to equal " + inspect(exp), "expected " + test.inspect + " to not equal " + inspect(exp));
});
  _$jscoverage['interface/assert.js'][145]++;
  assert.strictEqual = (function (act, exp, msg) {
  _$jscoverage['interface/assert.js'][146]++;
  new Assertion(act, msg).to.equal(exp);
});
  _$jscoverage['interface/assert.js'][163]++;
  assert.notStrictEqual = (function (act, exp, msg) {
  _$jscoverage['interface/assert.js'][164]++;
  new Assertion(act, msg).to.not.equal(exp);
});
  _$jscoverage['interface/assert.js'][181]++;
  assert.deepEqual = (function (act, exp, msg) {
  _$jscoverage['interface/assert.js'][182]++;
  new Assertion(act, msg).to.eql(exp);
});
  _$jscoverage['interface/assert.js'][199]++;
  assert.notDeepEqual = (function (act, exp, msg) {
  _$jscoverage['interface/assert.js'][200]++;
  new Assertion(act, msg).to.not.eql(exp);
});
  _$jscoverage['interface/assert.js'][217]++;
  assert.isTrue = (function (val, msg) {
  _$jscoverage['interface/assert.js'][218]++;
  new Assertion(val, msg).is["true"];
});
  _$jscoverage['interface/assert.js'][235]++;
  assert.isFalse = (function (val, msg) {
  _$jscoverage['interface/assert.js'][236]++;
  new Assertion(val, msg).is["false"];
});
  _$jscoverage['interface/assert.js'][252]++;
  assert.isNull = (function (val, msg) {
  _$jscoverage['interface/assert.js'][253]++;
  new Assertion(val, msg).to.equal(null);
});
  _$jscoverage['interface/assert.js'][270]++;
  assert.isNotNull = (function (val, msg) {
  _$jscoverage['interface/assert.js'][271]++;
  new Assertion(val, msg).to.not.equal(null);
});
  _$jscoverage['interface/assert.js'][287]++;
  assert.isUndefined = (function (val, msg) {
  _$jscoverage['interface/assert.js'][288]++;
  new Assertion(val, msg).to.equal(undefined);
});
  _$jscoverage['interface/assert.js'][305]++;
  assert.isDefined = (function (val, msg) {
  _$jscoverage['interface/assert.js'][306]++;
  new Assertion(val, msg).to.not.equal(undefined);
});
  _$jscoverage['interface/assert.js'][323]++;
  assert.isFunction = (function (val, msg) {
  _$jscoverage['interface/assert.js'][324]++;
  new Assertion(val, msg).to.be.a("function");
});
  _$jscoverage['interface/assert.js'][341]++;
  assert.isObject = (function (val, msg) {
  _$jscoverage['interface/assert.js'][342]++;
  new Assertion(val, msg).to.be.a("object");
});
  _$jscoverage['interface/assert.js'][359]++;
  assert.isArray = (function (val, msg) {
  _$jscoverage['interface/assert.js'][360]++;
  new Assertion(val, msg).to.be["instanceof"](Array);
});
  _$jscoverage['interface/assert.js'][377]++;
  assert.isString = (function (val, msg) {
  _$jscoverage['interface/assert.js'][378]++;
  new Assertion(val, msg).to.be.a("string");
});
  _$jscoverage['interface/assert.js'][395]++;
  assert.isNumber = (function (val, msg) {
  _$jscoverage['interface/assert.js'][396]++;
  new Assertion(val, msg).to.be.a("number");
});
  _$jscoverage['interface/assert.js'][416]++;
  assert.isBoolean = (function (val, msg) {
  _$jscoverage['interface/assert.js'][417]++;
  new Assertion(val, msg).to.be.a("boolean");
});
  _$jscoverage['interface/assert.js'][434]++;
  assert.typeOf = (function (val, type, msg) {
  _$jscoverage['interface/assert.js'][435]++;
  new Assertion(val, msg).to.be.a(type);
});
  _$jscoverage['interface/assert.js'][455]++;
  assert.instanceOf = (function (val, type, msg) {
  _$jscoverage['interface/assert.js'][456]++;
  new Assertion(val, msg).to.be["instanceof"](type);
});
  _$jscoverage['interface/assert.js'][475]++;
  assert.include = (function (exp, inc, msg) {
  _$jscoverage['interface/assert.js'][476]++;
  var obj = new Assertion(exp, msg);
  _$jscoverage['interface/assert.js'][478]++;
  if (Array.isArray(exp)) {
    _$jscoverage['interface/assert.js'][479]++;
    obj.to.include(inc);
  }
  else {
    _$jscoverage['interface/assert.js'][480]++;
    if ("string" === typeof exp) {
      _$jscoverage['interface/assert.js'][481]++;
      obj.to.contain.string(inc);
    }
  }
});
  _$jscoverage['interface/assert.js'][499]++;
  assert.match = (function (exp, re, msg) {
  _$jscoverage['interface/assert.js'][500]++;
  new Assertion(exp, msg).to.match(re);
});
  _$jscoverage['interface/assert.js'][518]++;
  assert.length = (function (exp, len, msg) {
  _$jscoverage['interface/assert.js'][519]++;
  new Assertion(exp, msg).to.have.length(len);
});
  _$jscoverage['interface/assert.js'][539]++;
  assert["throws"] = (function (fn, type, msg) {
  _$jscoverage['interface/assert.js'][540]++;
  if ("string" === typeof type) {
    _$jscoverage['interface/assert.js'][541]++;
    msg = type;
    _$jscoverage['interface/assert.js'][542]++;
    type = null;
  }
  _$jscoverage['interface/assert.js'][545]++;
  new Assertion(fn, msg).to["throw"](type);
});
  _$jscoverage['interface/assert.js'][565]++;
  assert.doesNotThrow = (function (fn, type, msg) {
  _$jscoverage['interface/assert.js'][566]++;
  if ("string" === typeof type) {
    _$jscoverage['interface/assert.js'][567]++;
    msg = type;
    _$jscoverage['interface/assert.js'][568]++;
    type = null;
  }
  _$jscoverage['interface/assert.js'][571]++;
  new Assertion(fn, msg).to.not["throw"](type);
});
  _$jscoverage['interface/assert.js'][590]++;
  assert.operator = (function (val, operator, val2, msg) {
  _$jscoverage['interface/assert.js'][591]++;
  if (! ~ ["==", "===", ">", ">=", "<", "<=", "!=", "!=="].indexOf(operator)) {
    _$jscoverage['interface/assert.js'][592]++;
    throw new Error("Invalid operator \"" + operator + "\"");
  }
  _$jscoverage['interface/assert.js'][594]++;
  var test = new Assertion(eval(val + operator + val2), msg);
  _$jscoverage['interface/assert.js'][595]++;
  test.assert(true === test.obj, "expected " + inspect(val) + " to be " + operator + " " + inspect(val2), "expected " + inspect(val) + " to not be " + operator + " " + inspect(val2));
});
  _$jscoverage['interface/assert.js'][605]++;
  assert.ifError = (function (val, msg) {
  _$jscoverage['interface/assert.js'][606]++;
  new Assertion(val, msg).to.not.be.ok;
});
  _$jscoverage['interface/assert.js'][613]++;
  (function alias(name, as) {
  _$jscoverage['interface/assert.js'][614]++;
  assert[as] = assert[name];
  _$jscoverage['interface/assert.js'][615]++;
  return alias;
})("length", "lengthOf")("throws", "throw");
});
_$jscoverage['interface/assert.js'].source = ["/*!"," * chai"," * Copyright(c) 2011 Jake Luer &lt;jake@alogicalparadox.com&gt;"," * MIT Licensed"," */","","/**"," * ### TDD Style Introduction"," *"," * The TDD style is exposed through `assert` interfaces. This provides"," * the classic assert.`test` notation, similiar to that packaged with"," * node.js. This assert module, however, provides several additional"," * tests and is browser compatible."," *"," *      // assert"," *      var assert = require('chai').assert;"," *        , foo = 'bar';"," *"," *      assert.typeOf(foo, 'string');"," *      assert.equal(foo, 'bar');"," *"," * #### Configuration"," *"," * By default, Chai does not show stack traces upon an AssertionError. This can"," * be changed by modifying the `includeStack` parameter for chai.Assertion. For example:"," *"," *      var chai = require('chai');"," *      chai.Assertion.includeStack = true; // defaults to false"," */","","module.exports = function (chai) {","  /*!","   * Chai dependencies.","   */","  var Assertion = chai.Assertion","    , inspect = chai.inspect;","","  /*!","   * Module export.","   */","","  var assert = chai.assert = {};","","  /**","   * # .fail(actual, expect, msg, operator)","   *","   * Throw a failure. Node.js compatible.","   *","   * @name fail","   * @param {*} actual value","   * @param {*} expected value","   * @param {String} message","   * @param {String} operator","   * @api public","   */","","  assert.fail = function (actual, expected, message, operator) {","    throw new chai.AssertionError({","        actual: actual","      , expected: expected","      , message: message","      , operator: operator","      , stackStartFunction: assert.fail","    });","  }","","  /**","   * # .ok(object, [message])","   *","   * Assert object is truthy.","   *","   *      assert.ok('everthing', 'everything is ok');","   *      assert.ok(false, 'this will fail');","   *","   * @name ok","   * @param {*} object to test","   * @param {String} message","   * @api public","   */","","  assert.ok = function (val, msg) {","    new Assertion(val, msg).is.ok;","  };","","  /**","   * # .equal(actual, expected, [message])","   *","   * Assert strict equality.","   *","   *      assert.equal(3, 3, 'these numbers are equal');","   *","   * @name equal","   * @param {*} actual","   * @param {*} expected","   * @param {String} message","   * @api public","   */","","  assert.equal = function (act, exp, msg) {","    var test = new Assertion(act, msg);","","    test.assert(","        exp == test.obj","      , 'expected ' + test.inspect + ' to equal ' + inspect(exp)","      , 'expected ' + test.inspect + ' to not equal ' + inspect(exp));","  };","","  /**","   * # .notEqual(actual, expected, [message])","   *","   * Assert not equal.","   *","   *      assert.notEqual(3, 4, 'these numbers are not equal');","   *","   * @name notEqual","   * @param {*} actual","   * @param {*} expected","   * @param {String} message","   * @api public","   */","","  assert.notEqual = function (act, exp, msg) {","    var test = new Assertion(act, msg);","","    test.assert(","        exp != test.obj","      , 'expected ' + test.inspect + ' to equal ' + inspect(exp)","      , 'expected ' + test.inspect + ' to not equal ' + inspect(exp));","  };","","  /**","   * # .strictEqual(actual, expected, [message])","   *","   * Assert strict equality.","   *","   *      assert.strictEqual(true, true, 'these booleans are strictly equal');","   *","   * @name strictEqual","   * @param {*} actual","   * @param {*} expected","   * @param {String} message","   * @api public","   */","","  assert.strictEqual = function (act, exp, msg) {","    new Assertion(act, msg).to.equal(exp);","  };","","  /**","   * # .notStrictEqual(actual, expected, [message])","   *","   * Assert strict equality.","   *","   *      assert.notStrictEqual(1, true, 'these booleans are not strictly equal');","   *","   * @name notStrictEqual","   * @param {*} actual","   * @param {*} expected","   * @param {String} message","   * @api public","   */","","  assert.notStrictEqual = function (act, exp, msg) {","    new Assertion(act, msg).to.not.equal(exp);","  };","","  /**","   * # .deepEqual(actual, expected, [message])","   *","   * Assert not deep equality.","   *","   *      assert.deepEqual({ tea: 'green' }, { tea: 'green' });","   *","   * @name deepEqual","   * @param {*} actual","   * @param {*} expected","   * @param {String} message","   * @api public","   */","","  assert.deepEqual = function (act, exp, msg) {","    new Assertion(act, msg).to.eql(exp);","  };","","  /**","   * # .notDeepEqual(actual, expected, [message])","   *","   * Assert not deep equality.","   *","   *      assert.notDeepEqual({ tea: 'green' }, { tea: 'jasmine' });","   *","   * @name notDeepEqual","   * @param {*} actual","   * @param {*} expected","   * @param {String} message","   * @api public","   */","","  assert.notDeepEqual = function (act, exp, msg) {","    new Assertion(act, msg).to.not.eql(exp);","  };","","  /**","   * # .isTrue(value, [message])","   *","   * Assert `value` is true.","   *","   *      var tea_served = true;","   *      assert.isTrue(tea_served, 'the tea has been served');","   *","   * @name isTrue","   * @param {Boolean} value","   * @param {String} message","   * @api public","   */","","  assert.isTrue = function (val, msg) {","    new Assertion(val, msg).is.true;","  };","","  /**","   * # .isFalse(value, [message])","   *","   * Assert `value` is false.","   *","   *      var tea_served = false;","   *      assert.isFalse(tea_served, 'no tea yet? hmm...');","   *","   * @name isFalse","   * @param {Boolean} value","   * @param {String} message","   * @api public","   */","","  assert.isFalse = function (val, msg) {","    new Assertion(val, msg).is.false;","  };","","  /**","   * # .isNull(value, [message])","   *","   * Assert `value` is null.","   *","   *      assert.isNull(err, 'no errors');","   *","   * @name isNull","   * @param {*} value","   * @param {String} message","   * @api public","   */","","  assert.isNull = function (val, msg) {","    new Assertion(val, msg).to.equal(null);","  };","","  /**","   * # .isNotNull(value, [message])","   *","   * Assert `value` is not null.","   *","   *      var tea = 'tasty chai';","   *      assert.isNotNull(tea, 'great, time for tea!');","   *","   * @name isNotNull","   * @param {*} value","   * @param {String} message","   * @api public","   */","","  assert.isNotNull = function (val, msg) {","    new Assertion(val, msg).to.not.equal(null);","  };","","  /**","   * # .isUndefined(value, [message])","   *","   * Assert `value` is undefined.","   *","   *      assert.isUndefined(tea, 'no tea defined');","   *","   * @name isUndefined","   * @param {*} value","   * @param {String} message","   * @api public","   */","","  assert.isUndefined = function (val, msg) {","    new Assertion(val, msg).to.equal(undefined);","  };","","  /**","   * # .isDefined(value, [message])","   *","   * Assert `value` is not undefined.","   *","   *      var tea = 'cup of chai';","   *      assert.isDefined(tea, 'no tea defined');","   *","   * @name isUndefined","   * @param {*} value","   * @param {String} message","   * @api public","   */","","  assert.isDefined = function (val, msg) {","    new Assertion(val, msg).to.not.equal(undefined);","  };","","  /**","   * # .isFunction(value, [message])","   *","   * Assert `value` is a function.","   *","   *      var serve_tea = function () { return 'cup of tea'; };","   *      assert.isFunction(serve_tea, 'great, we can have tea now');","   *","   * @name isFunction","   * @param {Function} value","   * @param {String} message","   * @api public","   */","","  assert.isFunction = function (val, msg) {","    new Assertion(val, msg).to.be.a('function');","  };","","  /**","   * # .isObject(value, [message])","   *","   * Assert `value` is an object.","   *","   *      var selection = { name: 'Chai', serve: 'with spices' };","   *      assert.isObject(selection, 'tea selection is an object');","   *","   * @name isObject","   * @param {Object} value","   * @param {String} message","   * @api public","   */","","  assert.isObject = function (val, msg) {","    new Assertion(val, msg).to.be.a('object');","  };","","  /**","   * # .isArray(value, [message])","   *","   * Assert `value` is an instance of Array.","   *","   *      var menu = [ 'green', 'chai', 'oolong' ];","   *      assert.isArray(menu, 'what kind of tea do we want?');","   *","   * @name isArray","   * @param {*} value","   * @param {String} message","   * @api public","   */","","  assert.isArray = function (val, msg) {","    new Assertion(val, msg).to.be.instanceof(Array);","  };","","  /**","   * # .isString(value, [message])","   *","   * Assert `value` is a string.","   *","   *      var teaorder = 'chai';","   *      assert.isString(tea_order, 'order placed');","   *","   * @name isString","   * @param {String} value","   * @param {String} message","   * @api public","   */","","  assert.isString = function (val, msg) {","    new Assertion(val, msg).to.be.a('string');","  };","","  /**","   * # .isNumber(value, [message])","   *","   * Assert `value` is a number","   *","   *      var cups = 2;","   *      assert.isNumber(cups, 'how many cups');","   *","   * @name isNumber","   * @param {Number} value","   * @param {String} message","   * @api public","   */","","  assert.isNumber = function (val, msg) {","    new Assertion(val, msg).to.be.a('number');","  };","","  /**","   * # .isBoolean(value, [message])","   *","   * Assert `value` is a boolean","   *","   *      var teaready = true","   *        , teaserved = false;","   *","   *      assert.isBoolean(tea_ready, 'is the tea ready');","   *      assert.isBoolean(tea_served, 'has tea been served');","   *","   * @name isBoolean","   * @param {*} value","   * @param {String} message","   * @api public","   */","","  assert.isBoolean = function (val, msg) {","    new Assertion(val, msg).to.be.a('boolean');","  };","","  /**","   * # .typeOf(value, name, [message])","   *","   * Assert typeof `value` is `name`.","   *","   *      assert.typeOf('tea', 'string', 'we have a string');","   *","   * @name typeOf","   * @param {*} value","   * @param {String} typeof name","   * @param {String} message","   * @api public","   */","","  assert.typeOf = function (val, type, msg) {","    new Assertion(val, msg).to.be.a(type);","  };","","  /**","   * # .instanceOf(object, constructor, [message])","   *","   * Assert `value` is instanceof `constructor`.","   *","   *      var Tea = function (name) { this.name = name; }","   *        , Chai = new Tea('chai');","   *","   *      assert.instanceOf(Chai, Tea, 'chai is an instance of tea');","   *","   * @name instanceOf","   * @param {Object} object","   * @param {Constructor} constructor","   * @param {String} message","   * @api public","   */","","  assert.instanceOf = function (val, type, msg) {","    new Assertion(val, msg).to.be.instanceof(type);","  };","","  /**","   * # .include(value, includes, [message])","   *","   * Assert the inclusion of an object in another. Works","   * for strings and arrays.","   *","   *      assert.include('foobar', 'bar', 'foobar contains string `var`);","   *      assert.include([ 1, 2, 3], 3, 'array contains value);","   *","   * @name include","   * @param {Array|String} value","   * @param {*} includes","   * @param {String} message","   * @api public","   */","","  assert.include = function (exp, inc, msg) {","    var obj = new Assertion(exp, msg);","","    if (Array.isArray(exp)) {","      obj.to.include(inc);","    } else if ('string' === typeof exp) {","      obj.to.contain.string(inc);","    }","  };","","  /**","   * # .match(value, regex, [message])","   *","   * Assert that `value` matches regular expression.","   *","   *      assert.match('foobar', /^foo/, 'Regexp matches');","   *","   * @name match","   * @param {*} value","   * @param {RegExp} RegularExpression","   * @param {String} message","   * @api public","   */","","  assert.match = function (exp, re, msg) {","    new Assertion(exp, msg).to.match(re);","  };","","  /**","   * # .length(value, constructor, [message])","   *","   * Assert that object has expected length.","   *","   *      assert.length([1,2,3], 3, 'Array has length of 3');","   *      assert.length('foobar', 5, 'String has length of 6');","   *","   * @name length","   * @param {*} value","   * @param {Number} length","   * @param {String} message","   * @api public","   */","","  assert.length = function (exp, len, msg) {","    new Assertion(exp, msg).to.have.length(len);","  };","","  /**","   * # .throws(function, [constructor/regexp], [message])","   *","   * Assert that a function will throw a specific","   * type of error.","   *","   *      assert.throw(fn, ReferenceError, 'function throw reference error');","   *","   * @name throws","   * @alias throw","   * @param {Function} function to test","   * @param {ErrorConstructor} constructor","   * @param {String} message","   * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error#Error_types","   * @api public","   */","","  assert.throws = function (fn, type, msg) {","    if ('string' === typeof type) {","      msg = type;","      type = null;","    }","","    new Assertion(fn, msg).to.throw(type);","  };","","  /**","   * # .doesNotThrow(function, [constructor/regexp], [message])","   *","   * Assert that a function will throw a specific","   * type of error.","   *","   *      var fn = function (err) { if (err) throw Error(err) };","   *      assert.doesNotThrow(fn, Error, 'function throw reference error');","   *","   * @name doesNotThrow","   * @param {Function} function to test","   * @param {ErrorConstructor} constructor","   * @param {String} message","   * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error#Error_types","   * @api public","   */","","  assert.doesNotThrow = function (fn, type, msg) {","    if ('string' === typeof type) {","      msg = type;","      type = null;","    }","","    new Assertion(fn, msg).to.not.throw(type);","  };","","  /**","   * # .operator(val, operator, val2, [message])","   *","   * Compare two values using operator.","   *","   *      assert.operator(1, '&lt;', 2, 'everything is ok');","   *      assert.operator(1, '&gt;', 2, 'this will fail');","   *","   * @name operator","   * @param {*} object to test","   * @param {String} operator","   * @param {*} second object","   * @param {String} message","   * @api public","   */","","  assert.operator = function (val, operator, val2, msg) {","    if (!~['==', '===', '&gt;', '&gt;=', '&lt;', '&lt;=', '!=', '!=='].indexOf(operator)) {","      throw new Error('Invalid operator \"' + operator + '\"');","    }","    var test = new Assertion(eval(val + operator + val2), msg);","    test.assert(","        true === test.obj","      , 'expected ' + inspect(val) + ' to be ' + operator + ' ' + inspect(val2)","      , 'expected ' + inspect(val) + ' to not be ' + operator + ' ' + inspect(val2) );","  };","","  /*!","   * Undocumented / untested","   */","","  assert.ifError = function (val, msg) {","    new Assertion(val, msg).to.not.be.ok;","  };","","  /*!","   * Aliases.","   */","","  (function alias(name, as){","    assert[as] = assert[name];","    return alias;","  })","  ('length', 'lengthOf')","  ('throws', 'throw');","};"];

});

require.define("/node_modules/chai/lib/chai.js", function (require, module, exports, __dirname, __filename) {
/*!
 * chai
 * Copyright(c) 2011-2012 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

var used = [];
var exports = module.exports = {};

exports.version = '0.5.2';

exports.Assertion = require('./assertion');
exports.AssertionError = require('./error');

exports.inspect = require('./utils/inspect');

exports.use = function (fn) {
  if (!~used.indexOf(fn)) {
    fn(this);
    used.push(fn);
  }

  return this;
};

var expect = require('./interface/expect');
exports.use(expect);

var should = require('./interface/should');
exports.use(should);

var assert = require('./interface/assert');
exports.use(assert);

});

require.define("/node_modules/chai/lib/assertion.js", function (require, module, exports, __dirname, __filename) {
/*!
 * chai
 * Copyright(c) 2011 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 *
 * Primarily a refactor of: should.js
 * https://github.com/visionmedia/should.js
 * Copyright(c) 2011 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * ### BDD Style Introduction
 *
 * The BDD style is exposed through `expect` or `should` interfaces. In both
 * scenarios, you chain together natural language assertions.
 *
 *      // expect
 *      var expect = require('chai').expect;
 *      expect(foo).to.equal('bar');
 *
 *      // should
 *      var should = require('chai').should();
 *      foo.should.equal('bar');
 *
 * #### Differences
 *
 * The `expect` interface provides a function as a starting point for chaining
 * your language assertions. It works on node.js and in all browsers.
 *
 * The `should` interface extends `Object.prototype` to provide a single getter as
 * the starting point for your language assertions. It works on node.js and in
 * all browsers except Internet Explorer.
 *
 * #### Configuration
 *
 * By default, Chai does not show stack traces upon an AssertionError. This can
 * be changed by modifying the `includeStack` parameter for chai.Assertion. For example:
 *
 *      var chai = require('chai');
 *      chai.Assertion.includeStack = true; // defaults to false
 */

/*!
 * Module dependencies.
 */

var AssertionError = require('./error')
  , eql = require('./utils/eql')
  , toString = Object.prototype.toString
  , inspect = require('./utils/inspect');

/*!
 * Module export.
 */

module.exports = Assertion;


/*!
 * # Assertion Constructor
 *
 * Creates object for chaining.
 *
 * @api private
 */

function Assertion (obj, msg, stack) {
  this.ssfi = stack || arguments.callee;
  this.obj = obj;
  this.msg = msg;
}

/*!
  * ## Assertion.includeStack
  * , toString = Object.prototype.toString
  *
  * User configurable property, influences whether stack trace
  * is included in Assertion error message. Default of false
  * suppresses stack trace in the error message
  *
  *     Assertion.includeStack = true;  // enable stack on error
  *
  * @api public
  */

Assertion.includeStack = false;

/*!
 * # .assert(expression, message, negateMessage, expected, actual)
 *
 * Executes an expression and check expectations. Throws AssertionError for reporting if test doesn't pass.
 *
 * @name assert
 * @param {Philosophical} expression to be tested
 * @param {String} message to display if fails
 * @param {String} negatedMessage to display if negated expression fails
 * @param {*} expected value (remember to check for negation)
 * @param {*} actual (optional) will default to `this.obj`
 * @api private
 */

Assertion.prototype.assert = function (expr, msg, negateMsg, expected, actual) {
  actual = actual || this.obj;
  var msg = (this.negate ? negateMsg : msg)
    , ok = this.negate ? !expr : expr;

  if (!ok) {
    throw new AssertionError({
        message: this.msg ? this.msg + ': ' + msg : msg // include custom message if available
      , actual: actual
      , expected: expected
      , stackStartFunction: (Assertion.includeStack) ? this.assert : this.ssfi
    });
  }
};

/*!
 * # inspect
 *
 * Returns the current object stringified.
 *
 * @name inspect
 * @api private
 */

Object.defineProperty(Assertion.prototype, 'inspect',
  { get: function () {
      return inspect(this.obj);
    }
  , configurable: true
});

/**
 * # to
 *
 * Language chain.
 *
 * @name to
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'to',
  { get: function () {
      return this;
    }
  , configurable: true
});

/**
 * # be
 *
 * Language chain.
 *
 * @name be
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'be',
  { get: function () {
      return this;
    }
  , configurable: true
});

/**
 * # been
 *
 * Language chain. Also tests `tense` to past for addon
 * modules that use the tense feature.
 *
 * @name been
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'been',
  { get: function () {
      this.tense = 'past';
      return this;
    }
  , configurable: true
});

/**
 * # an
 *
 * Language chain.
 *
 * @name an
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'an',
  { get: function () {
      return this;
    }
  , configurable: true
});
/**
 * # is
 *
 * Language chain.
 *
 * @name is
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'is',
  { get: function () {
      return this;
    }
  , configurable: true
});

/**
 * # and
 *
 * Language chain.
 *
 * @name and
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'and',
  { get: function () {
      return this;
    }
  , configurable: true
});

/**
 * # have
 *
 * Language chain.
 *
 * @name have
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'have',
  { get: function () {
      return this;
    }
  , configurable: true
});

/**
 * # with
 *
 * Language chain.
 *
 * @name with
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'with',
  { get: function () {
      return this;
    }
  , configurable: true
});

/**
 * # .not
 *
 * Negates any of assertions following in the chain.
 *
 * @name not
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'not',
  { get: function () {
      this.negate = true;
      return this;
    }
  , configurable: true
});

/**
 * # .ok
 *
 * Assert object truthiness.
 *
 *      expect('everthing').to.be.ok;
 *      expect(false).to.not.be.ok;
 *      expect(undefined).to.not.be.ok;
 *      expect(null).to.not.be.ok;
 *
 * @name ok
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'ok',
  { get: function () {
      this.assert(
          this.obj
        , 'expected ' + this.inspect + ' to be truthy'
        , 'expected ' + this.inspect + ' to be falsy');

      return this;
    }
  , configurable: true
});

/**
 * # .true
 *
 * Assert object is true
 *
 * @name true
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'true',
  { get: function () {
      this.assert(
          true === this.obj
        , 'expected ' + this.inspect + ' to be true'
        , 'expected ' + this.inspect + ' to be false'
        , this.negate ? false : true
      );

      return this;
    }
  , configurable: true
});

/**
 * # .false
 *
 * Assert object is false
 *
 * @name false
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'false',
  { get: function () {
      this.assert(
          false === this.obj
        , 'expected ' + this.inspect + ' to be false'
        , 'expected ' + this.inspect + ' to be true'
        , this.negate ? true : false
      );

      return this;
    }
  , configurable: true
});

/**
 * # .exist
 *
 * Assert object exists (null).
 *
 *      var foo = 'hi'
 *        , bar;
 *      expect(foo).to.exist;
 *      expect(bar).to.not.exist;
 *
 * @name exist
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'exist',
  { get: function () {
      this.assert(
          null != this.obj
        , 'expected ' + this.inspect + ' to exist'
        , 'expected ' + this.inspect + ' to not exist'
      );

      return this;
    }
  , configurable: true
});

/**
 * # .empty
 *
 * Assert object's length to be 0.
 *
 *      expect([]).to.be.empty;
 *
 * @name empty
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'empty',
  { get: function () {
      var expected = this.obj;

      if (Array.isArray(this.obj)) {
        expected = this.obj.length;
      } else if (typeof this.obj === 'object') {
        expected = Object.keys(this.obj).length;
      }

      this.assert(
          !expected
        , 'expected ' + this.inspect + ' to be empty'
        , 'expected ' + this.inspect + ' not to be empty');

      return this;
    }
  , configurable: true
});

/**
 * # .arguments
 *
 * Assert object is an instanceof arguments.
 *
 *      function test () {
 *        expect(arguments).to.be.arguments;
 *      }
 *
 * @name arguments
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'arguments',
  { get: function () {
      this.assert(
          '[object Arguments]' == Object.prototype.toString.call(this.obj)
        , 'expected ' + this.inspect + ' to be arguments'
        , 'expected ' + this.inspect + ' to not be arguments'
        , '[object Arguments]'
        , Object.prototype.toString.call(this.obj)
      );

      return this;
    }
  , configurable: true
});

/**
 * # .equal(value)
 *
 * Assert strict equality.
 *
 *      expect('hello').to.equal('hello');
 *
 * @name equal
 * @param {*} value
 * @api public
 */

Assertion.prototype.equal = function (val) {
  this.assert(
      val === this.obj
    , 'expected ' + this.inspect + ' to equal ' + inspect(val)
    , 'expected ' + this.inspect + ' to not equal ' + inspect(val)
    , val );

  return this;
};

/**
 * # .eql(value)
 *
 * Assert deep equality.
 *
 *      expect({ foo: 'bar' }).to.eql({ foo: 'bar' });
 *
 * @name eql
 * @param {*} value
 * @api public
 */

Assertion.prototype.eql = function (obj) {
  this.assert(
      eql(obj, this.obj)
    , 'expected ' + this.inspect + ' to equal ' + inspect(obj)
    , 'expected ' + this.inspect + ' to not equal ' + inspect(obj)
    , obj );

  return this;
};

/**
 * # .above(value)
 *
 * Assert greater than `value`.
 *
 *      expect(10).to.be.above(5);
 *
 * @name above
 * @param {Number} value
 * @api public
 */

Assertion.prototype.above = function (val) {
  this.assert(
      this.obj > val
    , 'expected ' + this.inspect + ' to be above ' + val
    , 'expected ' + this.inspect + ' to be below ' + val);

  return this;
};

/**
 * # .below(value)
 *
 * Assert less than `value`.
 *
 *      expect(5).to.be.below(10);
 *
 * @name below
 * @param {Number} value
 * @api public
 */

Assertion.prototype.below = function (val) {
  this.assert(
      this.obj < val
    , 'expected ' + this.inspect + ' to be below ' + val
    , 'expected ' + this.inspect + ' to be above ' + val);

  return this;
};

/**
 * # .within(start, finish)
 *
 * Assert that a number is within a range.
 *
 *      expect(7).to.be.within(5,10);
 *
 * @name within
 * @param {Number} start lowerbound inclusive
 * @param {Number} finish upperbound inclusive
 * @api public
 */

Assertion.prototype.within = function (start, finish) {
  var range = start + '..' + finish;

  this.assert(
      this.obj >= start && this.obj <= finish
    , 'expected ' + this.inspect + ' to be within ' + range
    , 'expected ' + this.inspect + ' to not be within ' + range);

  return this;
};

/**
 * # .a(type)
 *
 * Assert typeof.
 *
 *      expect('test').to.be.a('string');
 *
 * @name a
 * @param {String} type
 * @api public
 */

Assertion.prototype.a = function (type) {
  var klass = type.charAt(0).toUpperCase() + type.slice(1);

  this.assert(
      '[object ' + klass + ']' === toString.call(this.obj)
    , 'expected ' + this.inspect + ' to be a ' + type
    , 'expected ' + this.inspect + ' not to be a ' + type
    , '[object ' + klass + ']'
    , toString.call(this.obj)
  );

  return this;
};

/**
 * # .instanceof(constructor)
 *
 * Assert instanceof.
 *
 *      var Tea = function (name) { this.name = name; }
 *        , Chai = new Tea('chai');
 *
 *      expect(Chai).to.be.an.instanceOf(Tea);
 *
 * @name instanceof
 * @param {Constructor}
 * @alias instanceOf
 * @api public
 */

Assertion.prototype.instanceof = function (constructor) {
  var name = constructor.name;
  this.assert(
      this.obj instanceof constructor
    , 'expected ' + this.inspect + ' to be an instance of ' + name
    , 'expected ' + this.inspect + ' to not be an instance of ' + name);

  return this;
};

/**
 * # .property(name, [value])
 *
 * Assert that property of `name` exists, optionally with `value`.
 *
 *      var obj = { foo: 'bar' }
 *      expect(obj).to.have.property('foo');
 *      expect(obj).to.have.property('foo', 'bar');
 *      expect(obj).to.have.property('foo').to.be.a('string');
 *
 * @name property
 * @param {String} name
 * @param {*} value (optional)
 * @returns value of property for chaining
 * @api public
 */

Assertion.prototype.property = function (name, val) {
  if (this.negate && undefined !== val) {
    if (undefined === this.obj[name]) {
      throw new Error(this.inspect + ' has no property ' + inspect(name));
    }
  } else {
    this.assert(
        undefined !== this.obj[name]
      , 'expected ' + this.inspect + ' to have a property ' + inspect(name)
      , 'expected ' + this.inspect + ' to not have property ' + inspect(name));
  }

  if (undefined !== val) {
    this.assert(
        val === this.obj[name]
      , 'expected ' + this.inspect + ' to have a property ' + inspect(name) + ' of ' +
          inspect(val) + ', but got ' + inspect(this.obj[name])
      , 'expected ' + this.inspect + ' to not have a property ' + inspect(name) + ' of ' +  inspect(val)
      , val
      , this.obj[val]
    );
  }

  this.obj = this.obj[name];
  return this;
};

/**
 * # .ownProperty(name)
 *
 * Assert that has own property by `name`.
 *
 *      expect('test').to.have.ownProperty('length');
 *
 * @name ownProperty
 * @alias haveOwnProperty
 * @param {String} name
 * @api public
 */

Assertion.prototype.ownProperty = function (name) {
  this.assert(
      this.obj.hasOwnProperty(name)
    , 'expected ' + this.inspect + ' to have own property ' + inspect(name)
    , 'expected ' + this.inspect + ' to not have own property ' + inspect(name));
  return this;
};

/**
 * # .length(val)
 *
 * Assert that object has expected length.
 *
 *      expect([1,2,3]).to.have.length(3);
 *      expect('foobar').to.have.length(6);
 *
 * @name length
 * @alias lengthOf
 * @param {Number} length
 * @api public
 */

Assertion.prototype.length = function (n) {
  new Assertion(this.obj).to.have.property('length');
  var len = this.obj.length;

  this.assert(
      len == n
    , 'expected ' + this.inspect + ' to have a length of ' + n + ' but got ' + len
    , 'expected ' + this.inspect + ' to not have a length of ' + len
    , n
    , len
  );

  return this;
};

/**
 * # .match(regexp)
 *
 * Assert that matches regular expression.
 *
 *      expect('foobar').to.match(/^foo/);
 *
 * @name match
 * @param {RegExp} RegularExpression
 * @api public
 */

Assertion.prototype.match = function (re) {
  this.assert(
      re.exec(this.obj)
    , 'expected ' + this.inspect + ' to match ' + re
    , 'expected ' + this.inspect + ' not to match ' + re);

  return this;
};

/**
 * # .include(obj)
 *
 * Assert the inclusion of an object in an Array or substring in string.
 *
 *      expect([1,2,3]).to.include(2);
 *
 * @name include
 * @param {Object|String|Number} obj
 * @api public
 */

Assertion.prototype.include = function (obj) {
  this.assert(
      ~this.obj.indexOf(obj)
    , 'expected ' + this.inspect + ' to include ' + inspect(obj)
    , 'expected ' + this.inspect + ' to not include ' + inspect(obj));

  return this;
};

/**
 * # .string(string)
 *
 * Assert inclusion of string in string.
 *
 *      expect('foobar').to.have.string('bar');
 *
 * @name string
 * @param {String} string
 * @api public
 */

Assertion.prototype.string = function (str) {
  new Assertion(this.obj).is.a('string');

  this.assert(
      ~this.obj.indexOf(str)
    , 'expected ' + this.inspect + ' to contain ' + inspect(str)
    , 'expected ' + this.inspect + ' to not contain ' + inspect(str));

  return this;
};



/**
 * # contain
 *
 * Toggles the `contain` flag for the `keys` assertion.
 *
 * @name contain
 * @api public
 */

Object.defineProperty(Assertion.prototype, 'contain',
  { get: function () {
      this.contains = true;
      return this;
    },
    configurable: true
});

/**
 * # .keys(key1, [key2], [...])
 *
 * Assert exact keys or the inclusing of keys using the `contain` modifier.
 *
 *      expect({ foo: 1, bar: 2 }).to.have.keys(['foo', 'bar']);
 *      expect({ foo: 1, bar: 2, baz: 3 }).to.contain.keys('foo', 'bar');
 *
 * @name keys
 * @alias key
 * @param {String|Array} Keys
 * @api public
 */

Assertion.prototype.keys = function(keys) {
  var str
    , ok = true;

  keys = keys instanceof Array
    ? keys
    : Array.prototype.slice.call(arguments);

  if (!keys.length) throw new Error('keys required');

  var actual = Object.keys(this.obj)
    , len = keys.length;

  // Inclusion
  ok = keys.every(function(key){
    return ~actual.indexOf(key);
  });

  // Strict
  if (!this.negate && !this.contains) {
    ok = ok && keys.length == actual.length;
  }

  // Key string
  if (len > 1) {
    keys = keys.map(function(key){
      return inspect(key);
    });
    var last = keys.pop();
    str = keys.join(', ') + ', and ' + last;
  } else {
    str = inspect(keys[0]);
  }

  // Form
  str = (len > 1 ? 'keys ' : 'key ') + str;

  // Have / include
  str = (this.contains ? 'contain ' : 'have ') + str;

  // Assertion
  this.assert(
      ok
    , 'expected ' + this.inspect + ' to ' + str
    , 'expected ' + this.inspect + ' to not ' + str
    , keys
    , Object.keys(this.obj)
  );

  return this;
}

/**
 * # .throw(constructor)
 *
 * Assert that a function will throw a specific type of error or that error
 * thrown will match a RegExp or include a string.
 *
 *      var fn = function () { throw new ReferenceError('This is a bad function.'); }
 *      expect(fn).to.throw(ReferenceError);
 *      expect(fn).to.throw(/bad function/);
 *      expect(fn).to.not.throw('good function');
 *      expect(fn).to.throw(ReferenceError, /bad function/);
 *
 * Please note that when a throw expectation is negated, it will check each
 * parameter independently, starting with Error constructor type. The appropriate way
 * to check for the existence of a type of error but for a message that does not match
 * is to use `and`.
 *
 *      expect(fn).to.throw(ReferenceError).and.not.throw(/good function/);
 *
 * @name throw
 * @alias throws
 * @alias Throw
 * @param {ErrorConstructor} constructor
 * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error#Error_types
 * @api public
 */

Assertion.prototype.throw = function (constructor, msg) {
  new Assertion(this.obj).is.a('function');

  var thrown = false;

  if (arguments.length === 0) {
    msg = null;
    constructor = null;
  } else if (constructor && (constructor instanceof RegExp || 'string' === typeof constructor)) {
    msg = constructor;
    constructor = null;
  }

  try {
    this.obj();
  } catch (err) {
    // first, check constructor
    if (constructor && 'function' === typeof constructor) {
      this.assert(
          err instanceof constructor && err.name == constructor.name
        , 'expected ' + this.inspect + ' to throw ' + constructor.name + ' but a ' + err.name + ' was thrown'
        , 'expected ' + this.inspect + ' to not throw ' + constructor.name );
      if (!msg) return this;
    }
    // next, check message
    if (err.message && msg && msg instanceof RegExp) {
      this.assert(
          msg.exec(err.message)
        , 'expected ' + this.inspect + ' to throw error matching ' + msg + ' but got ' + inspect(err.message)
        , 'expected ' + this.inspect + ' to throw error not matching ' + msg
      );
      return this;
    } else if (err.message && msg && 'string' === typeof msg) {
      this.assert(
          ~err.message.indexOf(msg)
        , 'expected ' + this.inspect + ' to throw error including ' + inspect(msg) + ' but got ' + inspect(err.message)
        , 'expected ' + this.inspect + ' to throw error not including ' + inspect(msg)
      );
      return this;
    } else {
      thrown = true;
    }
  }

  var name = (constructor ? constructor.name : 'an error');

  this.assert(
      thrown === true
    , 'expected ' + this.inspect + ' to throw ' + name
    , 'expected ' + this.inspect + ' to not throw ' + name);

  return this;
};

/**
 * # .respondTo(method)
 *
 * Assert that object/class will respond to a method.
 *
 *      expect(Klass).to.respondTo('bar');
 *      expect(obj).to.respondTo('bar');
 *
 * @name respondTo
 * @param {String} method
 * @api public
 */

Assertion.prototype.respondTo = function (method) {
  var context = ('function' === typeof this.obj)
    ? this.obj.prototype[method]
    : this.obj[method];

  this.assert(
      'function' === typeof context
    , 'expected ' + this.inspect + ' to respond to ' + inspect(method)
    , 'expected ' + this.inspect + ' to not respond to ' + inspect(method)
    , 'function'
    , typeof context
  );

  return this;
};

/**
 * # .satisfy(method)
 *
 * Assert that passes a truth test.
 *
 *      expect(1).to.satisfy(function(num) { return num > 0; });
 *
 * @name satisfy
 * @param {Function} matcher
 * @api public
 */

Assertion.prototype.satisfy = function (matcher) {
  this.assert(
      matcher(this.obj)
    , 'expected ' + this.inspect + ' to satisfy ' + inspect(matcher)
    , 'expected ' + this.inspect + ' to not satisfy' + inspect(matcher)
    , this.negate ? false : true
    , matcher(this.obj)
  );

  return this;
};

/**
 * # .closeTo(expected, delta)
 *
 * Assert that actual is equal to +/- delta.
 *
 *      expect(1.5).to.be.closeTo(1, 0.5);
 *
 * @name closeTo
 * @param {Number} expected
 * @param {Number} delta
 * @api public
 */

Assertion.prototype.closeTo = function (expected, delta) {
  this.assert(
      (this.obj - delta === expected) || (this.obj + delta === expected)
    , 'expected ' + this.inspect + ' to be close to ' + expected + ' +/- ' + delta
    , 'expected ' + this.inspect + ' not to be close to ' + expected + ' +/- ' + delta);

  return this;
};

/*!
 * Aliases.
 */

(function alias(name, as){
  Assertion.prototype[as] = Assertion.prototype[name];
  return alias;
})
('length', 'lengthOf')
('keys', 'key')
('ownProperty', 'haveOwnProperty')
('above', 'greaterThan')
('below', 'lessThan')
('throw', 'throws')
('throw', 'Throw') // for troublesome browsers
('instanceof', 'instanceOf');

});

require.define("/node_modules/chai/lib/error.js", function (require, module, exports, __dirname, __filename) {
/*!
 * chai
 * Copyright(c) 2011 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

var fail = require('./chai').fail;

module.exports = AssertionError;

/*!
 * Inspired by node.js assert module
 * https://github.com/joyent/node/blob/f8c335d0caf47f16d31413f89aa28eda3878e3aa/lib/assert.js
 */
function AssertionError (options) {
  options = options || {};
  this.name = 'AssertionError';
  this.message = options.message;
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
}

AssertionError.prototype.__proto__ = Error.prototype;

AssertionError.prototype.toString = function() {
  return this.message;
};

});

require.define("/node_modules/chai/lib/utils/eql.js", function (require, module, exports, __dirname, __filename) {
// This is directly from Node.js assert
// https://github.com/joyent/node/blob/f8c335d0caf47f16d31413f89aa28eda3878e3aa/lib/assert.js


module.exports = _deepEqual;

// For browser implementation
if (!Buffer) {
  var Buffer = {
    isBuffer: function () {
      return false;
    }
  };
}

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual === expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = Object.keys(a),
        kb = Object.keys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}
});

require.define("/node_modules/chai/lib/utils/inspect.js", function (require, module, exports, __dirname, __filename) {
// This is (almost) directly from Node.js utils
// https://github.com/joyent/node/blob/f8c335d0caf47f16d31413f89aa28eda3878e3aa/lib/util.js

module.exports = inspect;

/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Boolean} showHidden Flag that shows hidden (not enumerable)
 *    properties of objects.
 * @param {Number} depth Depth in which to descend in object. Default is 2.
 * @param {Boolean} colors Flag to turn on ANSI escape codes to color the
 *    output. Default is false (no coloring).
 */
function inspect(obj, showHidden, depth, colors) {
  var ctx = {
    showHidden: showHidden,
    seen: [],
    stylize: function (str) { return str; }
  };
  return formatValue(ctx, obj, (typeof depth === 'undefined' ? 2 : depth));
}

function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (value && typeof value.inspect === 'function' &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    return value.inspect(recurseTimes);
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var visibleKeys = Object.keys(value);
  var keys = ctx.showHidden ? Object.getOwnPropertyNames(value) : visibleKeys;

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (typeof value === 'function') {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toUTCString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (typeof value === 'function') {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  switch (typeof value) {
    case 'undefined':
      return ctx.stylize('undefined', 'undefined');

    case 'string':
      var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                               .replace(/'/g, "\\'")
                                               .replace(/\\"/g, '"') + '\'';
      return ctx.stylize(simple, 'string');

    case 'number':
      return ctx.stylize('' + value, 'number');

    case 'boolean':
      return ctx.stylize('' + value, 'boolean');
  }
  // For some reason typeof null is "object", so special case here.
  if (value === null) {
    return ctx.stylize('null', 'null');
  }
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (Object.prototype.hasOwnProperty.call(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str;
  if (value.__lookupGetter__) {
    if (value.__lookupGetter__(key)) {
      if (value.__lookupSetter__(key)) {
        str = ctx.stylize('[Getter/Setter]', 'special');
      } else {
        str = ctx.stylize('[Getter]', 'special');
      }
    } else {
      if (value.__lookupSetter__(key)) {
        str = ctx.stylize('[Setter]', 'special');
      }
    }
  }
  if (visibleKeys.indexOf(key) < 0) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(value[key]) < 0) {
      if (recurseTimes === null) {
        str = formatValue(ctx, value[key], null);
      } else {
        str = formatValue(ctx, value[key], recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (typeof name === 'undefined') {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}

function isArray(ar) {
  return Array.isArray(ar) ||
         (typeof ar === 'object' && objectToString(ar) === '[object Array]');
}

function isRegExp(re) {
  return typeof re === 'object' && objectToString(re) === '[object RegExp]';
}

function isDate(d) {
  return typeof d === 'object' && objectToString(d) === '[object Date]';
}

function isError(e) {
  return typeof e === 'object' && objectToString(e) === '[object Error]';
}

function objectToString(o) {
  return Object.prototype.toString.call(o);
}
});

require.define("/node_modules/chai/lib/interface/expect.js", function (require, module, exports, __dirname, __filename) {
/*!
 * chai
 * Copyright(c) 2011 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

module.exports = function (chai) {
  chai.expect = function (val, message) {
    return new chai.Assertion(val, message);
  };
};


});

require.define("/node_modules/chai/lib/interface/should.js", function (require, module, exports, __dirname, __filename) {
/*!
 * chai
 * Copyright(c) 2011 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

module.exports = function (chai) {
  var Assertion = chai.Assertion;

  chai.should = function () {
    // modify Object.prototype to have `should`
    Object.defineProperty(Object.prototype, 'should', {
      set: function(){},
      get: function(){
        if (this instanceof String || this instanceof Number) {
          return new Assertion(this.constructor(this));
        } else if (this instanceof Boolean) {
          return new Assertion(this == true);
        }
        return new Assertion(this);
      },
      configurable: true
    });

    var should = {};

    should.equal = function (val1, val2) {
      new Assertion(val1).to.equal(val2);
    };

    should.throw = function (fn, errt, errs) {
      new Assertion(fn).to.throw(errt, errs);
    };

    should.exist = function (val) {
      new Assertion(val).to.exist;
    }

    // negation
    should.not = {}

    should.not.equal = function (val1, val2) {
      new Assertion(val1).to.not.equal(val2);
    };

    should.not.throw = function (fn, errt, errs) {
      new Assertion(fn).to.not.throw(errt, errs);
    };

    should.not.exist = function (val) {
      new Assertion(val).to.not.exist;
    }

    return should;
  };
};

});

require.define("/node_modules/chai/lib/interface/assert.js", function (require, module, exports, __dirname, __filename) {
/*!
 * chai
 * Copyright(c) 2011 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * ### TDD Style Introduction
 *
 * The TDD style is exposed through `assert` interfaces. This provides
 * the classic assert.`test` notation, similiar to that packaged with
 * node.js. This assert module, however, provides several additional
 * tests and is browser compatible.
 *
 *      // assert
 *      var assert = require('chai').assert;
 *        , foo = 'bar';
 *
 *      assert.typeOf(foo, 'string');
 *      assert.equal(foo, 'bar');
 *
 * #### Configuration
 *
 * By default, Chai does not show stack traces upon an AssertionError. This can
 * be changed by modifying the `includeStack` parameter for chai.Assertion. For example:
 *
 *      var chai = require('chai');
 *      chai.Assertion.includeStack = true; // defaults to false
 */

module.exports = function (chai) {
  /*!
   * Chai dependencies.
   */
  var Assertion = chai.Assertion
    , inspect = chai.inspect;

  /*!
   * Module export.
   */

  var assert = chai.assert = {};

  /**
   * # .fail(actual, expect, msg, operator)
   *
   * Throw a failure. Node.js compatible.
   *
   * @name fail
   * @param {*} actual value
   * @param {*} expected value
   * @param {String} message
   * @param {String} operator
   * @api public
   */

  assert.fail = function (actual, expected, message, operator) {
    throw new chai.AssertionError({
        actual: actual
      , expected: expected
      , message: message
      , operator: operator
      , stackStartFunction: assert.fail
    });
  }

  /**
   * # .ok(object, [message])
   *
   * Assert object is truthy.
   *
   *      assert.ok('everthing', 'everything is ok');
   *      assert.ok(false, 'this will fail');
   *
   * @name ok
   * @param {*} object to test
   * @param {String} message
   * @api public
   */

  assert.ok = function (val, msg) {
    new Assertion(val, msg).is.ok;
  };

  /**
   * # .equal(actual, expected, [message])
   *
   * Assert strict equality.
   *
   *      assert.equal(3, 3, 'these numbers are equal');
   *
   * @name equal
   * @param {*} actual
   * @param {*} expected
   * @param {String} message
   * @api public
   */

  assert.equal = function (act, exp, msg) {
    var test = new Assertion(act, msg);

    test.assert(
        exp == test.obj
      , 'expected ' + test.inspect + ' to equal ' + inspect(exp)
      , 'expected ' + test.inspect + ' to not equal ' + inspect(exp));
  };

  /**
   * # .notEqual(actual, expected, [message])
   *
   * Assert not equal.
   *
   *      assert.notEqual(3, 4, 'these numbers are not equal');
   *
   * @name notEqual
   * @param {*} actual
   * @param {*} expected
   * @param {String} message
   * @api public
   */

  assert.notEqual = function (act, exp, msg) {
    var test = new Assertion(act, msg);

    test.assert(
        exp != test.obj
      , 'expected ' + test.inspect + ' to equal ' + inspect(exp)
      , 'expected ' + test.inspect + ' to not equal ' + inspect(exp));
  };

  /**
   * # .strictEqual(actual, expected, [message])
   *
   * Assert strict equality.
   *
   *      assert.strictEqual(true, true, 'these booleans are strictly equal');
   *
   * @name strictEqual
   * @param {*} actual
   * @param {*} expected
   * @param {String} message
   * @api public
   */

  assert.strictEqual = function (act, exp, msg) {
    new Assertion(act, msg).to.equal(exp);
  };

  /**
   * # .notStrictEqual(actual, expected, [message])
   *
   * Assert strict equality.
   *
   *      assert.notStrictEqual(1, true, 'these booleans are not strictly equal');
   *
   * @name notStrictEqual
   * @param {*} actual
   * @param {*} expected
   * @param {String} message
   * @api public
   */

  assert.notStrictEqual = function (act, exp, msg) {
    new Assertion(act, msg).to.not.equal(exp);
  };

  /**
   * # .deepEqual(actual, expected, [message])
   *
   * Assert not deep equality.
   *
   *      assert.deepEqual({ tea: 'green' }, { tea: 'green' });
   *
   * @name deepEqual
   * @param {*} actual
   * @param {*} expected
   * @param {String} message
   * @api public
   */

  assert.deepEqual = function (act, exp, msg) {
    new Assertion(act, msg).to.eql(exp);
  };

  /**
   * # .notDeepEqual(actual, expected, [message])
   *
   * Assert not deep equality.
   *
   *      assert.notDeepEqual({ tea: 'green' }, { tea: 'jasmine' });
   *
   * @name notDeepEqual
   * @param {*} actual
   * @param {*} expected
   * @param {String} message
   * @api public
   */

  assert.notDeepEqual = function (act, exp, msg) {
    new Assertion(act, msg).to.not.eql(exp);
  };

  /**
   * # .isTrue(value, [message])
   *
   * Assert `value` is true.
   *
   *      var tea_served = true;
   *      assert.isTrue(tea_served, 'the tea has been served');
   *
   * @name isTrue
   * @param {Boolean} value
   * @param {String} message
   * @api public
   */

  assert.isTrue = function (val, msg) {
    new Assertion(val, msg).is.true;
  };

  /**
   * # .isFalse(value, [message])
   *
   * Assert `value` is false.
   *
   *      var tea_served = false;
   *      assert.isFalse(tea_served, 'no tea yet? hmm...');
   *
   * @name isFalse
   * @param {Boolean} value
   * @param {String} message
   * @api public
   */

  assert.isFalse = function (val, msg) {
    new Assertion(val, msg).is.false;
  };

  /**
   * # .isNull(value, [message])
   *
   * Assert `value` is null.
   *
   *      assert.isNull(err, 'no errors');
   *
   * @name isNull
   * @param {*} value
   * @param {String} message
   * @api public
   */

  assert.isNull = function (val, msg) {
    new Assertion(val, msg).to.equal(null);
  };

  /**
   * # .isNotNull(value, [message])
   *
   * Assert `value` is not null.
   *
   *      var tea = 'tasty chai';
   *      assert.isNotNull(tea, 'great, time for tea!');
   *
   * @name isNotNull
   * @param {*} value
   * @param {String} message
   * @api public
   */

  assert.isNotNull = function (val, msg) {
    new Assertion(val, msg).to.not.equal(null);
  };

  /**
   * # .isUndefined(value, [message])
   *
   * Assert `value` is undefined.
   *
   *      assert.isUndefined(tea, 'no tea defined');
   *
   * @name isUndefined
   * @param {*} value
   * @param {String} message
   * @api public
   */

  assert.isUndefined = function (val, msg) {
    new Assertion(val, msg).to.equal(undefined);
  };

  /**
   * # .isDefined(value, [message])
   *
   * Assert `value` is not undefined.
   *
   *      var tea = 'cup of chai';
   *      assert.isDefined(tea, 'no tea defined');
   *
   * @name isUndefined
   * @param {*} value
   * @param {String} message
   * @api public
   */

  assert.isDefined = function (val, msg) {
    new Assertion(val, msg).to.not.equal(undefined);
  };

  /**
   * # .isFunction(value, [message])
   *
   * Assert `value` is a function.
   *
   *      var serve_tea = function () { return 'cup of tea'; };
   *      assert.isFunction(serve_tea, 'great, we can have tea now');
   *
   * @name isFunction
   * @param {Function} value
   * @param {String} message
   * @api public
   */

  assert.isFunction = function (val, msg) {
    new Assertion(val, msg).to.be.a('function');
  };

  /**
   * # .isObject(value, [message])
   *
   * Assert `value` is an object.
   *
   *      var selection = { name: 'Chai', serve: 'with spices' };
   *      assert.isObject(selection, 'tea selection is an object');
   *
   * @name isObject
   * @param {Object} value
   * @param {String} message
   * @api public
   */

  assert.isObject = function (val, msg) {
    new Assertion(val, msg).to.be.a('object');
  };

  /**
   * # .isArray(value, [message])
   *
   * Assert `value` is an instance of Array.
   *
   *      var menu = [ 'green', 'chai', 'oolong' ];
   *      assert.isArray(menu, 'what kind of tea do we want?');
   *
   * @name isArray
   * @param {*} value
   * @param {String} message
   * @api public
   */

  assert.isArray = function (val, msg) {
    new Assertion(val, msg).to.be.instanceof(Array);
  };

  /**
   * # .isString(value, [message])
   *
   * Assert `value` is a string.
   *
   *      var teaorder = 'chai';
   *      assert.isString(tea_order, 'order placed');
   *
   * @name isString
   * @param {String} value
   * @param {String} message
   * @api public
   */

  assert.isString = function (val, msg) {
    new Assertion(val, msg).to.be.a('string');
  };

  /**
   * # .isNumber(value, [message])
   *
   * Assert `value` is a number
   *
   *      var cups = 2;
   *      assert.isNumber(cups, 'how many cups');
   *
   * @name isNumber
   * @param {Number} value
   * @param {String} message
   * @api public
   */

  assert.isNumber = function (val, msg) {
    new Assertion(val, msg).to.be.a('number');
  };

  /**
   * # .isBoolean(value, [message])
   *
   * Assert `value` is a boolean
   *
   *      var teaready = true
   *        , teaserved = false;
   *
   *      assert.isBoolean(tea_ready, 'is the tea ready');
   *      assert.isBoolean(tea_served, 'has tea been served');
   *
   * @name isBoolean
   * @param {*} value
   * @param {String} message
   * @api public
   */

  assert.isBoolean = function (val, msg) {
    new Assertion(val, msg).to.be.a('boolean');
  };

  /**
   * # .typeOf(value, name, [message])
   *
   * Assert typeof `value` is `name`.
   *
   *      assert.typeOf('tea', 'string', 'we have a string');
   *
   * @name typeOf
   * @param {*} value
   * @param {String} typeof name
   * @param {String} message
   * @api public
   */

  assert.typeOf = function (val, type, msg) {
    new Assertion(val, msg).to.be.a(type);
  };

  /**
   * # .instanceOf(object, constructor, [message])
   *
   * Assert `value` is instanceof `constructor`.
   *
   *      var Tea = function (name) { this.name = name; }
   *        , Chai = new Tea('chai');
   *
   *      assert.instanceOf(Chai, Tea, 'chai is an instance of tea');
   *
   * @name instanceOf
   * @param {Object} object
   * @param {Constructor} constructor
   * @param {String} message
   * @api public
   */

  assert.instanceOf = function (val, type, msg) {
    new Assertion(val, msg).to.be.instanceof(type);
  };

  /**
   * # .include(value, includes, [message])
   *
   * Assert the inclusion of an object in another. Works
   * for strings and arrays.
   *
   *      assert.include('foobar', 'bar', 'foobar contains string `var`);
   *      assert.include([ 1, 2, 3], 3, 'array contains value);
   *
   * @name include
   * @param {Array|String} value
   * @param {*} includes
   * @param {String} message
   * @api public
   */

  assert.include = function (exp, inc, msg) {
    var obj = new Assertion(exp, msg);

    if (Array.isArray(exp)) {
      obj.to.include(inc);
    } else if ('string' === typeof exp) {
      obj.to.contain.string(inc);
    }
  };

  /**
   * # .match(value, regex, [message])
   *
   * Assert that `value` matches regular expression.
   *
   *      assert.match('foobar', /^foo/, 'Regexp matches');
   *
   * @name match
   * @param {*} value
   * @param {RegExp} RegularExpression
   * @param {String} message
   * @api public
   */

  assert.match = function (exp, re, msg) {
    new Assertion(exp, msg).to.match(re);
  };

  /**
   * # .length(value, constructor, [message])
   *
   * Assert that object has expected length.
   *
   *      assert.length([1,2,3], 3, 'Array has length of 3');
   *      assert.length('foobar', 5, 'String has length of 6');
   *
   * @name length
   * @param {*} value
   * @param {Number} length
   * @param {String} message
   * @api public
   */

  assert.length = function (exp, len, msg) {
    new Assertion(exp, msg).to.have.length(len);
  };

  /**
   * # .throws(function, [constructor/regexp], [message])
   *
   * Assert that a function will throw a specific
   * type of error.
   *
   *      assert.throw(fn, ReferenceError, 'function throw reference error');
   *
   * @name throws
   * @alias throw
   * @param {Function} function to test
   * @param {ErrorConstructor} constructor
   * @param {String} message
   * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error#Error_types
   * @api public
   */

  assert.throws = function (fn, type, msg) {
    if ('string' === typeof type) {
      msg = type;
      type = null;
    }

    new Assertion(fn, msg).to.throw(type);
  };

  /**
   * # .doesNotThrow(function, [constructor/regexp], [message])
   *
   * Assert that a function will throw a specific
   * type of error.
   *
   *      var fn = function (err) { if (err) throw Error(err) };
   *      assert.doesNotThrow(fn, Error, 'function throw reference error');
   *
   * @name doesNotThrow
   * @param {Function} function to test
   * @param {ErrorConstructor} constructor
   * @param {String} message
   * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error#Error_types
   * @api public
   */

  assert.doesNotThrow = function (fn, type, msg) {
    if ('string' === typeof type) {
      msg = type;
      type = null;
    }

    new Assertion(fn, msg).to.not.throw(type);
  };

  /**
   * # .operator(val, operator, val2, [message])
   *
   * Compare two values using operator.
   *
   *      assert.operator(1, '<', 2, 'everything is ok');
   *      assert.operator(1, '>', 2, 'this will fail');
   *
   * @name operator
   * @param {*} object to test
   * @param {String} operator
   * @param {*} second object
   * @param {String} message
   * @api public
   */

  assert.operator = function (val, operator, val2, msg) {
    if (!~['==', '===', '>', '>=', '<', '<=', '!=', '!=='].indexOf(operator)) {
      throw new Error('Invalid operator "' + operator + '"');
    }
    var test = new Assertion(eval(val + operator + val2), msg);
    test.assert(
        true === test.obj
      , 'expected ' + inspect(val) + ' to be ' + operator + ' ' + inspect(val2)
      , 'expected ' + inspect(val) + ' to not be ' + operator + ' ' + inspect(val2) );
  };

  /*!
   * Undocumented / untested
   */

  assert.ifError = function (val, msg) {
    new Assertion(val, msg).to.not.be.ok;
  };

  /*!
   * Aliases.
   */

  (function alias(name, as){
    assert[as] = assert[name];
    return alias;
  })
  ('length', 'lengthOf')
  ('throws', 'throw');
};

});

require.define("/tests/background.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var should = require('chai').should();
var Background = require('../background.js');

describe('Background', function(){
    describe('extractLargestImage', function() {
        it('should return null if there was none', function(done) {
            Background.extractLargestImage("This is a text sample with no image at all.", null, function(image) {
                done();
            })
        });
        
        it('should return an object with src, width and height if there was one', function(done) {
            var blob = '<p><a href="http://ffffound.com/image/0d9c9495fccbf85ec19ad087e3de1e255f83e518"><img src="http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg" alt="" border="0" width="480" height="480"></a></p><p>via <a href="http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg">http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg</a></p>';
            Background.extractLargestImage(blob, null, function(image) {
                image.should.equal("http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg");
                done();
            });
        });
        
        it('should return the largest one', function(done) {
            var blob = '<p><a href="http://ffffound.com/image/0d9c9495fccbf85ec19ad087e3de1e255f83e518"><img src="http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg" alt="" border="0" width="480" height="480"></a></p><p>via <a href="http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg">http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg</a></p>';
            Background.extractLargestImage(blob, null, function(image) {
                image.should.equal("http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg");
                done();
            });
        });

        it('should return the absolute url based on the base if the url of the image is relative', function(done) {
            var blob = '<table border="0" cellpadding="2" cellspacing="7" style="vertical-align:top;"><tr><td width="80" align="center" valign="top"><font style="font-size:85%;font-family:arial,sans-serif"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNFZlT7-WfGbQvBdlb3CTCuWWGc_kA&amp;url=http://www.theglobeandmail.com/news/world/powerful-storms-destroy-us-towns-kill-at-least-29/article2357253/"><img src="/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg?s=l" alt="" border="1" width="80" height="80" /><br /><font size="-2">Globe and Mail</font></a></font></td><td valign="top" class="j"><font style="font-size:85%;font-family:arial,sans-serif"><br /><div style="padding-top:0.8em;"><img alt="" height="1" width="1" /></div><div class="lh"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNGflW9pZurmRUryNrispwwpWtC5MQ&amp;url=http://www.washingtonpost.com/national/health-science/henryville-twister-caught-on-tape-140/2012/03/05/gIQAVUtTsR_video.html"><b>Henryville twister caught on tape (1:40)</b></a><br /><font size="-1"><b><font color="#6f6f6f">Washington Post</font></b></font><br /><font size="-1">Mar. 5, 2012 - Sam Lashley, a National Weather Service meteorologist, recorded video of the tornado that hit Henryville, Indiana on Friday. The overall death toll from Friday&#39;s weather is 39, including a toddler who was found in a field.</font><br /><font size="-1"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNHJQVT--fmHFLwxuz-O1s5k7Y-Oig&amp;url=http://www.chicagotribune.com/news/local/sns-ap-in--severeweather-indianasnow,0,6707049.story">Wet snow blankets tornado-ravaged S. Ind.; 2 to 4 inches reported in heavily <b>...</b></a><font size="-1" color="#6f6f6f"><nobr>Chicago Tribune</nobr></font></font><br /><font size="-1"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNFYA02T8-8vs5YPGdeFM_4M_8nVLQ&amp;url=http://articles.cnn.com/2012-03-04/us/us_severe-weather_1_tornado-victims-ef-4-alabama-town?_s%3DPM:US">Grief, resilience after storms rip through states, killing 39</a><font size="-1" color="#6f6f6f"><nobr>CNN</nobr></font></font><br /><font size="-1"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNFiX2lNXPTwm3lml8zFWPeDKhzc-A&amp;url=http://edition.cnn.com/2012/03/02/us/severe-weather/?hpt%3Dus_c1">28 dead as &#39;enormous outbreak&#39; of tornadoes tears through US</a><font size="-1" color="#6f6f6f"><nobr>CNN International</nobr></font></font><br /><font size="-1" class="p"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNHBXbNnSdIY95atQihXvVJKYbnEqA&amp;url=http://usnews.msnbc.msn.com/_news/2012/03/05/10580677-snowy-weather-adds-to-tornado-survivors-misery"><nobr>msnbc.com</nobr></a>&nbsp;-<a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNEfbNBdF-vjSqb-sV6J0xZK9PGEew&amp;url=http://www.wvnstv.com/story/17079238/search-for-tornado-survivors-continues-in-midwest-and-south"><nobr>WVNS-TV</nobr></a>&nbsp;-<a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNGn3eTSmJJRBrgnmNJrtwyT003uDw&amp;url=http://www.google.com/hostednews/ap/article/ALeqM5gyz7FSxCAbrAylfyaGNAAsDjKBhA?docId%3D02bc49f9c2284618aab33afeb2e4eec1"><nobr>The Associated Press</nobr></a><link rel="syndication-source" href="www.ap.org/02bc49f9c2284618aab33afeb2e4eec1" /></font><br /><font class="p" size="-1"><a class="p" href="http://news.google.com/news/more?pz=1&amp;ned=us&amp;topic=h&amp;num=3&amp;ncl=dNSd1trbK_xkJwMSQJ-gwNagUq1EM"><nobr><b>all 5,372 news articles&nbsp;&raquo;</b></nobr></a></font></div></font></td></tr></table>';
            Background.extractLargestImage(blob, "http://img.ffffound.com/hello/world", function(image) {
                image.should.equal("http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg?s=l");
                done();
            });
        });
    });
});


});

require.define("/background.js", function (require, module, exports, __dirname, __filename) {
var Url = require('url');
var QueryString = require('querystring');
var $ = jQuery = require('jquery');
var Msgboy          = require('./msgboy.js').Msgboy;
var Plugins         = require('./plugins.js').Plugins;
var Inbox           = require('./models/inbox.js').Inbox;
var Message         = require('./models/message.js').Message;
var MessageTrigger  = require('./models/triggered-messages.js').MessageTrigger;
var Subscriptions   = require('./models/subscription.js').Subscriptions;
var Subscription    = require('./models/subscription.js').Subscription;
var Strophe         = require('./strophejs/core.js').Strophe
var SuperfeedrPlugin= require('./strophejs/strophe.superfeedr.js').SuperfeedrPlugin
Strophe.addConnectionPlugin('superfeedr', SuperfeedrPlugin);

var Blogger = require('./plugins/blogger.js').Blogger;
new Blogger(Plugins);
var Bookmarks = require('./plugins/bookmarks.js').Bookmarks;
new Bookmarks(Plugins);
var Disqus = require('./plugins/disqus.js').Disqus;
new Disqus(Plugins);
var Generic = require('./plugins/generic.js').Generic;
new Generic(Plugins);
var GoogleReader = require('./plugins/google-reader.js').GoogleReader;
new GoogleReader(Plugins);
var History = require('./plugins/history.js').History;
new History(Plugins);
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

var currentNotification = null;
var messageStack = [];
var reconnectDelay = 1;
var reconnectionTimeout = null;
var xmppConnection = new Strophe.Connection({
    protocol: new Strophe.Websocket('ws://ws.msgboy.com')
});

// Handles XMPP Connections
var onConnect = function (status) {
    var msg = '';
    if (status === Strophe.Status.CONNECTING) {
        msg = 'Msgboy is connecting.';
    } else if (status === Strophe.Status.CONNFAIL) {
        msg = 'Msgboy failed to connect.';
        reconnectDelay = 1;
        reconnect();
    } else if (status === Strophe.Status.AUTHFAIL) {
        // This should never happen since we register with Msgboy for an account.
    } else if (status === Strophe.Status.DISCONNECTING) {
        msg = 'Msgboy is disconnecting.'; // We may want to time this out.
    } else if (status === Strophe.Status.DISCONNECTED) {
        reconnect();
        msg = 'Msgboy is disconnected. Reconnect in ' + Math.pow(reconnectDelay, 2) + ' seconds.';
    } else if (status === Strophe.Status.CONNECTED) {
        msg = 'Msgboy is connected.';
        reconnectDelay = 1;
        xmppConnection.send($pres().tree()); // Send presence!
        Msgboy.trigger('connected');
    }
    Msgboy.log.debug(msg);
};
exports.onConnect = onConnect;

// Reconnects the Msgboy
var reconnect = function () {
    reconnectDelay = Math.min(reconnectDelay + 1, 10); // We max at one attempt every minute.
    if (!reconnectionTimeout) {
        reconnectionTimeout = setTimeout(function () {
            reconnectionTimeout = null;
            xmppConnection.reset();
            connect();
        }, Math.pow(reconnectDelay, 2) * 1000);
    }
};
exports.reconnect = reconnect;

// Connects the XMPP Client
// It also includes a timeout that tries to reconnect when we could not connect in less than 1 minute.
var connect = function () {
    xmppConnection.rawInput = function (data) {
        Msgboy.log.debug('Received', data);
    };
    xmppConnection.rawOutput = function (data) {
        Msgboy.log.debug('Sent', data);
    };
    var password = Msgboy.inbox.attributes.password;
    var jid = Msgboy.inbox.attributes.jid + "@msgboy.com/" + Msgboy.infos.version;
    xmppConnection.connect(jid, password, onConnect);
};
exports.connect = connect;

// Shows a popup notification
var notify = function (message, popup) {
    // Open a notification window if needed!
    if ((!currentNotification || !currentNotification.ready) && popup) {
        if(!currentNotification) {
            // there is no window.
            currentNotification = window.webkitNotifications.createHTMLNotification(chrome.extension.getURL('/views/html/notification.html'));
            currentNotification.ready = false;
            currentNotification.onclose = function () {
                currentNotification = null;
            };
        }
        currentNotification.show();
        messageStack.push(message);
    }
    else {
        chrome.extension.sendRequest({
            signature: "notify",
            params: message
        }, function (response) {
            // Nothing to do.
        });
    }
};
exports.notify = notify;

// Subscribes to a feed.
var subscribe = function (url, force, callback) {
    // First, let's check if we have a subscription for this.
    var subscription = new Subscription({id: url});

    subscription.fetchOrCreate(function () {
        // Looks like there is a subscription.
        if ((subscription.needsRefresh() && subscription.attributes.state === "unsubscribed") || force) {
            subscription.setState("subscribing");
            subscription.bind("subscribing", function () {
                Msgboy.log.debug("subscribing to", url);
                xmppConnection.superfeedr.subscribe(url, function (result, feed) {
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
exports.subscribe = subscribe;

// Unsubscribes from a feed.
var unsubscribe = function (url, callback) {
    var subscription = new Subscription({id: url});
    subscription.fetchOrCreate(function () {
        subscription.setState("unsubscribing");
        subscription.bind("unsubscribing", function () {
            Msgboy.log.debug("unsubscribing from", url);
            xmppConnection.superfeedr.unsubscribe(url, function (result) {
                Msgboy.log.debug("unsubscribed", url);
                subscription.setState("unsubscribed");
            });
        });
        subscription.bind("unsubscribed", function () {
            callback(true);
        });
    });
};
exports.unsubscribe = unsubscribe;

// Makes sure there is no 'pending' susbcriptions.
var resumeSubscriptions = function () {
    var subscriptions = new Subscriptions();
    subscriptions.bind("add", function (subs) {
        Msgboy.log.debug("subscribing to", subs.id);
        xmppConnection.superfeedr.subscribe(subs.id, function (result, feed) {
            Msgboy.log.debug("subscribed to", subs.id);
            subs.setState("subscribed");
        });
    });
    subscriptions.pending();
    setTimeout(function () {
        resumeSubscriptions(); // Let's retry in 10 minutes.
    }, 1000 * 60 * 10);
};
exports.resumeSubscriptions = resumeSubscriptions;

// Gets the size of an image based on src
var imgSize = function(src, mainLink, callback) {
    var height = 0, width = 0, img = null;
    var done = null, timeout = null, loadImg = null;
    var parsed = Url.parse(src);
    var here = Url.parse(window.location.toString());
    var base = Url.parse(mainLink);
    
    done = function(s, height, width) {
        img = null;
        clearTimeout(timeout);
        callback(s, height, width);
    }
    
    timeout = setTimeout(function() {
        done(src, 0, 0);
    }, 3000); // We allow for 3 seconds to extract the image.
    
    loadImg = function(s) {
        img = new Image();
        img.onload = function() {
            done(s, img.height, img.width);
        }
        img.src = s;
    }
    
    if(typeof parsed.host === "undefined" || (parsed.host === here.host && parsed.protocol === here.protocol)) {
        if(typeof base.host === "undefined") {
            done(src, 0, 0);
        } 
        else {
            var abs = Url.resolve(base, parsed.path);
            loadImg(abs);
        }
    } 
    else {
        loadImg(src);
    }
}
exports.imgSize = imgSize;

// Extracts the largest image of an HTML content
var extractLargestImage = function(blob, mainLink, callback) {
    var container = document.createElement("div");
    var largestImg = null;
    var largestImgSize = null;
    var content = null;
    var imgLoaded = null;
    var images = [];
    var done = function() {
        container.innerHTML = "";
        imgLoaded = null;
        images.length = 0;
        callback(largestImg);
    } 

    container.innerHTML = blob;
    images = container.getElementsByTagName("img");

    if(images.length > 0) {
        // Let's try to extract the image for this message.
        imgLoaded = _.after(images.length, function() {
            done();
        });

        _.each(images, function(image) {
            if(typeof image.src === "undefined" || image.src === "") {
                imgLoaded();
            }
            else {
                imgSize(image.src, mainLink || "", function(src, height, width) {
                    if((!largestImgSize || largestImgSize < height * width) && 
                    !(height === 250 && width === 300) && 
                    !(height < 100  || width < 100) &&
                    !src.match('/doubleclick.net/')) {
                        largestImgSize = height * width;
                        largestImg = src;
                    }
                    imgLoaded();
                });
            }
        });
    }
    else {
        // No image!
        done();
    }
}
exports.extractLargestImage = extractLargestImage;

// Rewrites URL and adds tacking code. This will be useful for publishers who use Google Analytics to measure their traffic.
var rewriteOutboundUrl = function(url) {
    var parsed = Url.parse(url);
    parsed.href = parsed.search = ""; // Deletes the href and search, which are to be re-composed with the new qs.
    var qs = QueryString.parse(parsed.query);
    qs.utm_source = 'msgboy'; // Source is Msgboy
    qs.utm_medium = 'feed'; // Medium is feed
    qs.utm_campaign = qs.utm_campaign || 'msgboy'; // Campaign is persisted or msgboy
    parsed.query = qs; // Re-assign the query
    return Url.format(parsed);
}
exports.rewriteOutboundUrl = rewriteOutboundUrl;

SuperfeedrPlugin.onNotificationReceived = function (notification) {
    Msgboy.log.debug("Notification received from " + notification.source.url);
    if(notification.payload) {
        var msg = notification.payload;
        msg.source = notification.source;
        msg.feed = notification.source.url;

        var message = new Message(msg);

        extractLargestImage(message.get('text'), message.get('mainLink'), function(largestImg) {
            var attributes = {};

            if(largestImg) {
                attributes.image = largestImg;
            }

            message.calculateRelevance(function (_relevance) {
                attributes.relevance = _relevance;
                message.create(attributes, {
                    success: function() {
                        Msgboy.log.debug("Saved message", msg.id);
                        Msgboy.inbox.trigger("messages:added", message);
                    }.bind(this),
                    error: function(error) {
                        Msgboy.log.debug("Could not save message", JSON.stringify(msg), error);
                    }.bind(this)
                }); 
            }.bind(this));
        }.bind(this));
    }
    else {
        // Notification with no payload. Not good. We should unsubscribe as it's useless!
        unsubscribe(notification.source.url, function (result) {
            Msgboy.log.debug("Unsubscribed from ", notification.source.url);
        });
    }
}

Msgboy.bind("loaded", function () {
    MessageTrigger.observe(Msgboy); // Getting ready for incoming messages
    
    Msgboy.inbox = new Inbox();
    
    // When a new message was added to the inbox
    Msgboy.inbox.bind("messages:added", function (message) {
        notify(message.toJSON(), message.attributes.relevance > Msgboy.inbox.attributes.options.relevance);
    });

    // When the inbox is ready
    Msgboy.inbox.bind("ready", function () {
        Msgboy.trigger("inbox:ready");
        Msgboy.log.debug("Inbox ready");
        connect(Msgboy.inbox);
        // Let's check here if the Msgboy pin is set to true. If so, let's keep it there :)
        if(Msgboy.inbox.attributes.options.pinMsgboy) {
            chrome.tabs.getAllInWindow(undefined, function(tabs) {
                for (var i = 0, tab; tab = tabs[i]; i++) {
                    if (tab.url && tab.url.match(new RegExp("chrome-extension://" + chrome.i18n.getMessage("@@extension_id") + ""))) {
                        // Fine, the tab is opened. No need to do much more.
                        return;
                    }
                }
                chrome.tabs.create({
                    url: chrome.extension.getURL('/views/html/dashboard.html'),
                    selected: true,
                    pinned: true
                });

            });
        }
    });

    // When the inbox is new.
    Msgboy.inbox.bind("new", function () {
        Msgboy.log.debug("New Inbox");
        Msgboy.trigger("inbox:new"); // Let's indicate all msgboy susbcribers that it's the case!
        
        Msgboy.bind("connected", function(){
            // And import all plugins.
            Plugins.importSubscriptions(function (subs) {
                subscribe(subs.url, false, function () {
                    // Cool. Not much to do.
                });
            }, 
            function(plugin, subscriptionsCount) {
                // Called when done with one plugin
                Msgboy.trigger("plugin:" + plugin.name + ":imported"); // Let's indicate all msgboy susbcribers that it's the case!
                Msgboy.log.info("Done with", plugin.name, "and subscribed to", subscriptionsCount);
            },
            function(subscriptionsCount) {
                // Called when done with all plugins
                Msgboy.trigger("plugins:imported", subscriptionsCount); // Let's indicate all msgboy susbcribers that it's the case!
                Msgboy.log.info("Done with all plugins and subscribed to", subscriptionsCount);
            });
        });
    });
    
    // When there is no such inbox there.
    Msgboy.inbox.bind("error", function (error) {
        // Ok, no such inbox... So we need to create an account!
        window.open("http://msgboy.com/session/new?ext=" + chrome.i18n.getMessage("@@extension_id"));
    });
    
    // Triggered when connected
    Msgboy.bind("connected", function() {
        // When a new notification was received from XMPP line.
        resumeSubscriptions(); // Let's check the subscriptions and make sure there is nothing to be performed.
    });

    // Chrome specific. We want to turn any Chrome API callback into a DOM event. It will greatly improve portability.
    chrome.extension.onRequest.addListener(function (_request, _sender, _sendResponse) {
        Msgboy.trigger(_request.signature, _request.params, _sendResponse);
    });

    // Chrome specific. Listens to external requests from other extensions!
    chrome.extension.onRequestExternal.addListener(function (_request, _sender, _sendResponse) {
        // For now, we only allow the Msgboy Button Extension, but later we'll open that up.
        if(_sender.id === "conpgobjdgiggknoomfoemablbgkecga") {
            Msgboy.trigger(_request.signature, _request.params, _sendResponse);
        }
    });
    
    Msgboy.bind('register', function (params, _sendResponse) {
        Msgboy.log.debug("request", "register", params.username);
        Msgboy.inbox.bind("new", function() {
            _sendResponse({
                value: true
            });
        });
        Msgboy.inbox.setup(params.username, params.token);
    });

    Msgboy.bind('subscribe', function (params, _sendResponse) {
        Msgboy.log.debug("request", "subscribe", params.url);
        subscribe(params.url, params.force || false, function (result) {
            _sendResponse({
                value: result
            });
        });
    });

    Msgboy.bind('unsubscribe', function (params, _sendResponse) {
        Msgboy.log.debug("request", "unsubscribe", params.url);
        unsubscribe(params.url, function (result) {
            _sendResponse({
                value: result
            });
        });
    });

    Msgboy.bind('notify', function (params, _sendResponse) {
        Msgboy.log.debug("request", "notify", params);
        notify(params, true);
        // Nothing to do.
    });

    Msgboy.bind('notificationReady', function (params, _sendResponse) {
        Msgboy.log.debug("request", "notificationReady");
        currentNotification.ready = true;
        // We should then start sending all notifications.
        while (messageStack.length > 0) {
            chrome.extension.sendRequest({
                signature:"notify",
                params: messageStack.pop()
            }, function (response) {
                // Nothing to do.
            });
        }
    });

    Msgboy.bind('tab', function (params, _sendResponse) {
        Msgboy.log.debug("request", "tab", params.url);
        var active_window = null;
        params.url = rewriteOutboundUrl(params.url); // Rewritting the url to add msgboy tracking codes.
        chrome.windows.getAll({}, function (windows) {
            windows = _.select(windows, function (win) {
                return win.type ==="normal" && win.focused;
            }, this);
            // If no window is focused and"normal"
            if (windows.length === 0) {
                window.open(params.url); // Can't use Chrome's API as it's buggy :(
            }
            else {
                // Just open an extra tab.
                options = params;
                options.windowId = windows[0].id;
                chrome.tabs.create(options);
            }
        });
    });

    // When reloading the inbox is needed (after a change in settings eg)
    Msgboy.bind('reload', function (params, _sendResponse) {
        Msgboy.log.debug("request", "reload");
        Msgboy.inbox.fetch();
    });

    // When reloading the inbox is needed (after a change in settings eg)
    Msgboy.bind('resetRusbcriptions', function (params, _sendResponse) {
        Msgboy.log.debug("request", "resetRusbcriptions");
        Plugins.importSubscriptions(function (subs) {
            subscribe(subs.url, false, function () {
                // Cool. Not much to do.
            });
        }, 
        function(plugin, subscriptionsCount) {
            // Called when done with one plugin
            Msgboy.log.info("Done with", plugin.name, "and subscribed to", subscriptionsCount);
        },
        function(subscriptionsCount) {
            // Called when done with all plugins
            Msgboy.log.info("Done with all plugins and subscribed to", subscriptionsCount);
        });
    });
    
    // Plugins management for those who use the Chrome API to subscribe in background.
    for(var j = 0; j < Plugins.all.length; j++) {
        var plugin = Plugins.all[j];
        if (typeof (plugin.subscribeInBackground) != "undefined") {
            plugin.subscribeInBackground(function (feed) {
                Msgboy.trigger('subscribe', {url: feed.href}, function() {
                    // Nothing.
                });
            });
        }
    }
    
    // Let's go.
    Msgboy.inbox.fetchAndPrepare();
 });


});

require.define("url", function (require, module, exports, __dirname, __filename) {
var punycode = { encode : function (s) { return s } };

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]+$/,
    // RFC 2396: characters reserved for delimiting URLs.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],
    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '~', '[', ']', '`'].concat(delims),
    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''],
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#']
      .concat(unwise).concat(autoEscape),
    nonAuthChars = ['/', '@', '?', '#'].concat(delims),
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-zA-Z0-9][a-z0-9A-Z_-]{0,62}$/,
    hostnamePartStart = /^([a-zA-Z0-9][a-z0-9A-Z_-]{0,62})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always have a path component.
    pathedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && typeof(url) === 'object' && url.href) return url;

  if (typeof url !== 'string') {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var out = {},
      rest = url;

  // cut off any delimiters.
  // This is to support parse stuff like "<http://foo.com>"
  for (var i = 0, l = rest.length; i < l; i++) {
    if (delims.indexOf(rest.charAt(i)) === -1) break;
  }
  if (i !== 0) rest = rest.substr(i);


  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    out.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      out.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    // don't enforce full RFC correctness, just be unstupid about it.

    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the first @ sign, unless some non-auth character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    var atSign = rest.indexOf('@');
    if (atSign !== -1) {
      // there *may be* an auth
      var hasAuth = true;
      for (var i = 0, l = nonAuthChars.length; i < l; i++) {
        var index = rest.indexOf(nonAuthChars[i]);
        if (index !== -1 && index < atSign) {
          // not a valid auth.  Something like http://foo.com/bar@baz/
          hasAuth = false;
          break;
        }
      }
      if (hasAuth) {
        // pluck off the auth portion.
        out.auth = rest.substr(0, atSign);
        rest = rest.substr(atSign + 1);
      }
    }

    var firstNonHost = -1;
    for (var i = 0, l = nonHostChars.length; i < l; i++) {
      var index = rest.indexOf(nonHostChars[i]);
      if (index !== -1 &&
          (firstNonHost < 0 || index < firstNonHost)) firstNonHost = index;
    }

    if (firstNonHost !== -1) {
      out.host = rest.substr(0, firstNonHost);
      rest = rest.substr(firstNonHost);
    } else {
      out.host = rest;
      rest = '';
    }

    // pull out port.
    var p = parseHost(out.host);
    var keys = Object.keys(p);
    for (var i = 0, l = keys.length; i < l; i++) {
      var key = keys[i];
      out[key] = p[key];
    }

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    out.hostname = out.hostname || '';

    // validate a little.
    if (out.hostname.length > hostnameMaxLen) {
      out.hostname = '';
    } else {
      var hostparts = out.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            out.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    // hostnames are always lower case.
    out.hostname = out.hostname.toLowerCase();

    // IDNA Support: Returns a puny coded representation of "domain".
    // It only converts the part of the domain name that
    // has non ASCII characters. I.e. it dosent matter if
    // you call it with a domain that already is in ASCII.
    var domainArray = out.hostname.split('.');
    var newOut = [];
    for (var i = 0; i < domainArray.length; ++i) {
      var s = domainArray[i];
      newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
          'xn--' + punycode.encode(s) : s);
    }
    out.hostname = newOut.join('.');

    out.host = (out.hostname || '') +
        ((out.port) ? ':' + out.port : '');
    out.href += out.host;
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }

    // Now make sure that delims never appear in a url.
    var chop = rest.length;
    for (var i = 0, l = delims.length; i < l; i++) {
      var c = rest.indexOf(delims[i]);
      if (c !== -1) {
        chop = Math.min(c, chop);
      }
    }
    rest = rest.substr(0, chop);
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    out.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    out.search = rest.substr(qm);
    out.query = rest.substr(qm + 1);
    if (parseQueryString) {
      out.query = querystring.parse(out.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    out.search = '';
    out.query = {};
  }
  if (rest) out.pathname = rest;
  if (slashedProtocol[proto] &&
      out.hostname && !out.pathname) {
    out.pathname = '/';
  }

  //to support http.request
  if (out.pathname || out.search) {
    out.path = (out.pathname ? out.pathname : '') +
               (out.search ? out.search : '');
  }

  // finally, reconstruct the href based on what has been validated.
  out.href = urlFormat(out);
  return out;
}

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof(obj) === 'string') obj = urlParse(obj);

  var auth = obj.auth || '';
  if (auth) {
    auth = auth.split('@').join('%40');
    for (var i = 0, l = nonAuthChars.length; i < l; i++) {
      var nAC = nonAuthChars[i];
      auth = auth.split(nAC).join(encodeURIComponent(nAC));
    }
    auth += '@';
  }

  var protocol = obj.protocol || '',
      host = (obj.host !== undefined) ? auth + obj.host :
          obj.hostname !== undefined ? (
              auth + obj.hostname +
              (obj.port ? ':' + obj.port : '')
          ) :
          false,
      pathname = obj.pathname || '',
      query = obj.query &&
              ((typeof obj.query === 'object' &&
                Object.keys(obj.query).length) ?
                 querystring.stringify(obj.query) :
                 '') || '',
      search = obj.search || (query && ('?' + query)) || '',
      hash = obj.hash || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (obj.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  return protocol + host + pathname + search + hash;
}

function urlResolve(source, relative) {
  return urlFormat(urlResolveObject(source, relative));
}

function urlResolveObject(source, relative) {
  if (!source) return relative;

  source = urlParse(urlFormat(source), false, true);
  relative = urlParse(urlFormat(relative), false, true);

  // hash is always overridden, no matter what.
  source.hash = relative.hash;

  if (relative.href === '') {
    source.href = urlFormat(source);
    return source;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    relative.protocol = source.protocol;
    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[relative.protocol] &&
        relative.hostname && !relative.pathname) {
      relative.path = relative.pathname = '/';
    }
    relative.href = urlFormat(relative);
    return relative;
  }

  if (relative.protocol && relative.protocol !== source.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      relative.href = urlFormat(relative);
      return relative;
    }
    source.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      relative.pathname = relPath.join('/');
    }
    source.pathname = relative.pathname;
    source.search = relative.search;
    source.query = relative.query;
    source.host = relative.host || '';
    source.auth = relative.auth;
    source.hostname = relative.hostname || relative.host;
    source.port = relative.port;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.slashes = source.slashes || relative.slashes;
    source.href = urlFormat(source);
    return source;
  }

  var isSourceAbs = (source.pathname && source.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host !== undefined ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (source.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = source.pathname && source.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = source.protocol &&
          !slashedProtocol[source.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // source.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {

    delete source.hostname;
    delete source.port;
    if (source.host) {
      if (srcPath[0] === '') srcPath[0] = source.host;
      else srcPath.unshift(source.host);
    }
    delete source.host;
    if (relative.protocol) {
      delete relative.hostname;
      delete relative.port;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      delete relative.host;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    source.host = (relative.host || relative.host === '') ?
                      relative.host : source.host;
    source.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : source.hostname;
    source.search = relative.search;
    source.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    source.search = relative.search;
    source.query = relative.query;
  } else if ('search' in relative) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      source.hostname = source.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = source.host && source.host.indexOf('@') > 0 ?
                       source.host.split('@') : false;
      if (authInHost) {
        source.auth = authInHost.shift();
        source.host = source.hostname = authInHost.shift();
      }
    }
    source.search = relative.search;
    source.query = relative.query;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.href = urlFormat(source);
    return source;
  }
  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    delete source.pathname;
    //to support http.request
    if (!source.search) {
      source.path = '/' + source.search;
    } else {
      delete source.path;
    }
    source.href = urlFormat(source);
    return source;
  }
  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (source.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    source.hostname = source.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = source.host && source.host.indexOf('@') > 0 ?
                     source.host.split('@') : false;
    if (authInHost) {
      source.auth = authInHost.shift();
      source.host = source.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (source.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  source.pathname = srcPath.join('/');
  //to support request.http
  if (source.pathname !== undefined || source.search !== undefined) {
    source.path = (source.pathname ? source.pathname : '') +
                  (source.search ? source.search : '');
  }
  source.auth = relative.auth || source.auth;
  source.slashes = source.slashes || relative.slashes;
  source.href = urlFormat(source);
  return source;
}

function parseHost(host) {
  var out = {};
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    out.port = port.substr(1);
    host = host.substr(0, host.length - port.length);
  }
  if (host) out.hostname = host;
  return out;
}

});

require.define("querystring", function (require, module, exports, __dirname, __filename) {
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.toString.call(xs) === '[object Array]'
    }
;

/*!
 * querystring
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Library version.
 */

exports.version = '0.3.1';

/**
 * Object#toString() ref for stringify().
 */

var toString = Object.prototype.toString;

/**
 * Cache non-integer test regexp.
 */

var notint = /[^0-9]/;

/**
 * Parse the given query `str`, returning an object.
 *
 * @param {String} str
 * @return {Object}
 * @api public
 */

exports.parse = function(str){
  if (null == str || '' == str) return {};

  function promote(parent, key) {
    if (parent[key].length == 0) return parent[key] = {};
    var t = {};
    for (var i in parent[key]) t[i] = parent[key][i];
    parent[key] = t;
    return t;
  }

  return String(str)
    .split('&')
    .reduce(function(ret, pair){
      try{ 
        pair = decodeURIComponent(pair.replace(/\+/g, ' '));
      } catch(e) {
        // ignore
      }

      var eql = pair.indexOf('=')
        , brace = lastBraceInKey(pair)
        , key = pair.substr(0, brace || eql)
        , val = pair.substr(brace || eql, pair.length)
        , val = val.substr(val.indexOf('=') + 1, val.length)
        , parent = ret;

      // ?foo
      if ('' == key) key = pair, val = '';

      // nested
      if (~key.indexOf(']')) {
        var parts = key.split('[')
          , len = parts.length
          , last = len - 1;

        function parse(parts, parent, key) {
          var part = parts.shift();

          // end
          if (!part) {
            if (isArray(parent[key])) {
              parent[key].push(val);
            } else if ('object' == typeof parent[key]) {
              parent[key] = val;
            } else if ('undefined' == typeof parent[key]) {
              parent[key] = val;
            } else {
              parent[key] = [parent[key], val];
            }
          // array
          } else {
            obj = parent[key] = parent[key] || [];
            if (']' == part) {
              if (isArray(obj)) {
                if ('' != val) obj.push(val);
              } else if ('object' == typeof obj) {
                obj[Object.keys(obj).length] = val;
              } else {
                obj = parent[key] = [parent[key], val];
              }
            // prop
            } else if (~part.indexOf(']')) {
              part = part.substr(0, part.length - 1);
              if(notint.test(part) && isArray(obj)) obj = promote(parent, key);
              parse(parts, obj, part);
            // key
            } else {
              if(notint.test(part) && isArray(obj)) obj = promote(parent, key);
              parse(parts, obj, part);
            }
          }
        }

        parse(parts, parent, 'base');
      // optimize
      } else {
        if (notint.test(key) && isArray(parent.base)) {
          var t = {};
          for(var k in parent.base) t[k] = parent.base[k];
          parent.base = t;
        }
        set(parent.base, key, val);
      }

      return ret;
    }, {base: {}}).base;
};

/**
 * Turn the given `obj` into a query string
 *
 * @param {Object} obj
 * @return {String}
 * @api public
 */

var stringify = exports.stringify = function(obj, prefix) {
  if (isArray(obj)) {
    return stringifyArray(obj, prefix);
  } else if ('[object Object]' == toString.call(obj)) {
    return stringifyObject(obj, prefix);
  } else if ('string' == typeof obj) {
    return stringifyString(obj, prefix);
  } else {
    return prefix;
  }
};

/**
 * Stringify the given `str`.
 *
 * @param {String} str
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyString(str, prefix) {
  if (!prefix) throw new TypeError('stringify expects an object');
  return prefix + '=' + encodeURIComponent(str);
}

/**
 * Stringify the given `arr`.
 *
 * @param {Array} arr
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyArray(arr, prefix) {
  var ret = [];
  if (!prefix) throw new TypeError('stringify expects an object');
  for (var i = 0; i < arr.length; i++) {
    ret.push(stringify(arr[i], prefix + '[]'));
  }
  return ret.join('&');
}

/**
 * Stringify the given `obj`.
 *
 * @param {Object} obj
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyObject(obj, prefix) {
  var ret = []
    , keys = Object.keys(obj)
    , key;
  for (var i = 0, len = keys.length; i < len; ++i) {
    key = keys[i];
    ret.push(stringify(obj[key], prefix
      ? prefix + '[' + encodeURIComponent(key) + ']'
      : encodeURIComponent(key)));
  }
  return ret.join('&');
}

/**
 * Set `obj`'s `key` to `val` respecting
 * the weird and wonderful syntax of a qs,
 * where "foo=bar&foo=baz" becomes an array.
 *
 * @param {Object} obj
 * @param {String} key
 * @param {String} val
 * @api private
 */

function set(obj, key, val) {
  var v = obj[key];
  if (undefined === v) {
    obj[key] = val;
  } else if (isArray(v)) {
    v.push(val);
  } else {
    obj[key] = [v, val];
  }
}

/**
 * Locate last brace in `str` within the key.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function lastBraceInKey(str) {
  var len = str.length
    , brace
    , c;
  for (var i = 0; i < len; ++i) {
    c = str[i];
    if (']' == c) brace = false;
    if ('[' == c) brace = true;
    if ('=' == c && !brace) return i;
  }
}

});

require.define("/msgboy.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var $ = jQuery = require('jquery');
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

require.define("/models/inbox.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Message = require('./message.js').Message;

var Inbox = Backbone.Model.extend({
    storeName: "inbox",
    database: msgboyDatabase,
    defaults: {
        id: "1",
        options: {
            relevance: 1.0,
            pinMsgboy: false
        }
    },
    initialize: function () {
    },

    setup: function (username, token) {
        this.save({
            epoch: new Date().getTime(),
            jid: username,
            password: token
        }, {
            success: function () {
                this.trigger("ready", this);
                this.trigger("new", this);
            }.bind(this),
            error: function () {
                this.trigger('error');
            }.bind(this)
        });
    },

    // Fetches and prepares the inbox if needed.
    fetchAndPrepare: function () {
        this.fetch({
            success: function () {
                if (typeof(this.get('jid')) !== 'undefined' && this.get('jid') !== "" && typeof(this.get('password')) !== 'undefined' && this.get('password') !== "") {
                    this.trigger("ready", this);
                } else {
                    this.trigger('error', 'Not Found');
                }
            }.bind(this),
            error: function () {
                this.trigger('error', 'Not Found');
            }.bind(this)
        });
    }
});

exports.Inbox = Inbox;
});

require.define("/node_modules/backbone-indexeddb/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"backbone-indexeddb.js"}
});

require.define("/node_modules/backbone-indexeddb/backbone-indexeddb.js", function (require, module, exports, __dirname, __filename) {
(function () { /*global _: false, Backbone: false */
    // Generate four random hex digits.
    function S4() {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    }

    // Generate a pseudo-GUID by concatenating random hexadecimal.
    function guid() {
        return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
    }

    if(typeof exports !== 'undefined'){
        _ = require('underscore');
        Backbone = require('backbone');
    }
    
    
     // Naming is a mess!
     var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB ;
     var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction; // No prefix in moz
     var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange ; // No prefix in moz

     /* Horrible Hack to prevent ' Expected an identifier and instead saw 'continue' (a reserved word).'*/
     if (window.indexedDB) {
         indexedDB.prototype._continue =  indexedDB.prototype.continue;
     } else if (window.webkitIDBRequest) {
         webkitIDBRequest.prototype._continue = webkitIDBRequest.prototype.continue;
     }

     window.indexedDB = indexedDB;
     window.IDBCursor = window.IDBCursor || window.webkitIDBCursor ||  window.mozIDBCursor ||  window.msIDBCursor ;
    

    // Driver object
    // That's the interesting part.
    // There is a driver for each schema provided. The schema is a te combination of name (for the database), a version as well as migrations to reach that 
    // version of the database.
    function Driver(schema, ready) {
        this.schema         = schema;
        this.ready          = ready;
        this.error          = null;
        this.transactions   = []; // Used to list all transactions and keep track of active ones.
        this.db             = null;
        this.supportOnUpgradeNeeded = false;
        var lastMigrationPathVersion = _.last(this.schema.migrations).version;
        debugLog("opening database " + this.schema.id + " in version #" + lastMigrationPathVersion);
        this.dbRequest      = indexedDB.open(this.schema.id,lastMigrationPathVersion); //schema version need to be an unsigned long

        this.launchMigrationPath = function(dbVersion) {
            var clonedMigrations = _.clone(schema.migrations);
            this.migrate(clonedMigrations, dbVersion, {
                success: function () {
                    this.ready();
                }.bind(this),
                error: function () {
                    this.error = "Database not up to date. " + dbVersion + " expected was " + lastMigrationPathVersion;
                }.bind(this)
            });
        };

        this.dbRequest.onblocked = function(event){
            debugLog("blocked");
        }

        this.dbRequest.onsuccess = function (e) {
            this.db = e.target.result; // Attach the connection ot the queue.

            if(!this.supportOnUpgradeNeeded)
            {
                var currentIntDBVersion = (parseInt(this.db.version) ||  0); // we need convert beacuse chrome store in integer and ie10 DP4+ in int;

                if (currentIntDBVersion === lastMigrationPathVersion) { //if support new event onupgradeneeded will trigger the ready function
                    // No migration to perform!
                    this.ready();
                } else if (currentIntDBVersion < lastMigrationPathVersion ) {
                    // We need to migrate up to the current migration defined in the database
                    this.launchMigrationPath(currentIntDBVersion);
                } else {
                    // Looks like the IndexedDB is at a higher version than the current driver schema.
                    this.error = "Database version is greater than current code " + currentIntDBVersion + " expected was " + lastMigrationPathVersion;
                }
            };
        }.bind(this);



        this.dbRequest.onerror = function (e) {
            // Failed to open the database
            this.error = "Couldn't not connect to the database"
        }.bind(this);

        this.dbRequest.onabort = function (e) {
            // Failed to open the database
            this.error = "Connection to the database aborted"
        }.bind(this);



        this.dbRequest.onupgradeneeded = function(iDBVersionChangeEvent){
            this.db =iDBVersionChangeEvent.target.transaction.db;

            this.supportOnUpgradeNeeded = true;

            debugLog("onupgradeneeded = " + iDBVersionChangeEvent.oldVersion + " => " + iDBVersionChangeEvent.newVersion);
            this.launchMigrationPath(iDBVersionChangeEvent.oldVersion);


        }.bind(this);
    }

    function debugLog(str) {
        if (typeof window !== "undefined" && typeof window.console !== "undefined" && typeof window.console.log !== "undefined") {
            window.console.log(str);
        }
        else if(console.log !== "undefined") {
            console.log(str)
        }
    }

    // Driver Prototype
    Driver.prototype = {

        // Tracks transactions. Mostly for debugging purposes. TO-IMPROVE
        _track_transaction: function(transaction) {
            this.transactions.push(transaction);
            function removeIt() {
                var idx = this.transactions.indexOf(transaction);
                if (idx !== -1) {this.transactions.splice(idx); }
            };
            transaction.oncomplete = removeIt.bind(this);
            transaction.onabort = removeIt.bind(this);
            transaction.onerror = removeIt.bind(this);
        },

        // Performs all the migrations to reach the right version of the database.
        migrate: function (migrations, version, options) {
            debugLog("Starting migrations from " + version);
            this._migrate_next(migrations, version, options);
        },

        // Performs the next migrations. This method is private and should probably not be called.
        _migrate_next: function (migrations, version, options) {
            debugLog("_migrate_next begin version from #" + version);
            var that = this;
            var migration = migrations.shift();
            if (migration) {
                if (!version || version < migration.version) {
                    // We need to apply this migration-
                    if (typeof migration.before == "undefined") {
                        migration.before = function (next) {
                            next();
                        };
                    }
                    if (typeof migration.after == "undefined") {
                        migration.after = function (next) {
                            next();
                        };
                    }
                    // First, let's run the before script
                    debugLog("_migrate_next begin before version #" + migration.version);
                    migration.before(function () {
                        debugLog("_migrate_next done before version #" + migration.version);

                        var continueMigration = function (e) {
                            debugLog("_migrate_next continueMigration version #" + migration.version);

                            var transaction = this.dbRequest.transaction || versionRequest.result;
                            debugLog("_migrate_next begin migrate version #" + migration.version);

                            migration.migrate(transaction, function () {
                                debugLog("_migrate_next done migrate version #" + migration.version);
                                // Migration successfully appliedn let's go to the next one!
                                debugLog("_migrate_next begin after version #" + migration.version);
                                migration.after(function () {
                                    debugLog("_migrate_next done after version #" + migration.version);
                                    debugLog("Migrated to " + migration.version);

                                    //last modification occurred, need finish
                                    if(migrations.length ==0) {
                                        /*if(this.supportOnUpgradeNeeded){
                                            debugLog("Done migrating");
                                            // No more migration
                                            options.success();
                                        }
                                        else{*/
                                            debugLog("_migrate_next setting transaction.oncomplete to finish  version #" + migration.version);
                                            transaction.oncomplete = function() {
                                                debugLog("_migrate_next done transaction.oncomplete version #" + migration.version);

                                                debugLog("Done migrating");
                                                // No more migration
                                                options.success();
                                            }
                                        //}
                                    }
                                    else
                                    {
                                        debugLog("_migrate_next setting transaction.oncomplete to recursive _migrate_next  version #" + migration.version);
                                        transaction.oncomplete = function() {
                                           debugLog("_migrate_next end from version #" + version + " to " + migration.version);
                                           that._migrate_next(migrations, version, options);
                                       }
                                    }

                                }.bind(this));
                            }.bind(this));
                        }.bind(this);

                        if(!this.supportOnUpgradeNeeded){
                            debugLog("_migrate_next begin setVersion version #" + migration.version);
                            var versionRequest = this.db.setVersion(migration.version);
                            versionRequest.onsuccess = continueMigration;
                            versionRequest.onerror = options.error;
                        }
                        else {
                            continueMigration();
                        }

                    }.bind(this));
                } else {
                    // No need to apply this migration
                    debugLog("Skipping migration " + migration.version);
                    this._migrate_next(migrations, version, options);
                }
            }
        },

        // This is the main method, called by the ExecutionQueue when the driver is ready (database open and migration performed)
        execute: function (storeName, method, object, options) {
            debugLog("execute : " + method +  " on " + storeName + " for " + object.id);
            switch (method) {
            case "create":
                this.create(storeName, object, options);
                break;
            case "read":
                if (object.id || object.cid) {
                    this.read(storeName, object, options); // It's a model
                } else {
                    this.query(storeName, object, options); // It's a collection
                }
                break;
            case "update":
                this.update(storeName, object, options); // We may want to check that this is not a collection. TOFIX
                break;
            case "delete":
                this.delete(storeName, object, options); // We may want to check that this is not a collection. TOFIX
                break;
            default:
                // Hum what?
            }
        },

        // Writes the json to the storeName in db. It is a create operations, which means it will fail if the key already exists
        // options are just success and error callbacks.
        create: function (storeName, object, options) {
            var writeTransaction = this.db.transaction([storeName], IDBTransaction.READ_WRITE);
            //this._track_transaction(writeTransaction);
            var store = writeTransaction.objectStore(storeName);
            var json = object.toJSON();

            if (!json.id) json.id = guid();

            var writeRequest = store.add(json, json.id);

            writeRequest.onerror = function (e) {
                options.error(e);
            };
            writeRequest.onsuccess = function (e) {
                options.success(json);
            };
        },
        
        // Writes the json to the storeName in db. It is an update operation, which means it will overwrite the value if the key already exist
        // options are just success and error callbacks.
        update: function (storeName, object, options) {
            var writeTransaction = this.db.transaction([storeName], IDBTransaction.READ_WRITE);
            //this._track_transaction(writeTransaction);
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
        read: function (storeName, object, options) {
            var readTransaction = this.db.transaction([storeName], IDBTransaction.READ_ONLY);
            this._track_transaction(readTransaction);

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
        delete: function (storeName, object, options) {
            var deleteTransaction = this.db.transaction([storeName], IDBTransaction.READ_WRITE);
            //this._track_transaction(deleteTransaction);

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
        query: function (storeName, collection, options) {
            var elements = [];
            var skipped = 0, processed = 0;
            var queryTransaction = this.db.transaction([storeName], IDBTransaction.READ_ONLY);
            //this._track_transaction(queryTransaction);

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
                                readCursor = index.openCursor(bounds, window.IDBCursor.PREV);
                            } else {
                                // We want ASC order
                                readCursor = index.openCursor(bounds, window.IDBCursor.NEXT);
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
                        readCursor = store.openCursor(bounds, window.IDBCursor.PREV);
                    } else {
                        readCursor = store.openCursor(bounds, window.IDBCursor.NEXT);
                    }
                } else {
                    readCursor = store.openCursor();
                }
            }

            if (typeof (readCursor) == "undefined" || !readCursor) {
                options.error("No Cursor");
            } else {
                readCursor.onerror = function(e){
                    options.error("readCursor error", e);
                };
                // Setup a handler for the cursor’s `success` event:
                readCursor.onsuccess = function (e) {
                    var cursor = e.target.result;
                    if (!cursor || (options.limit && processed >= options.limit)) {
                        // If there is no cursor, or if we're done adding stuff.
                        if (options.addIndividually || options.clear) {
                            // nothing!
                            // We need to indicate that we're done. But, how?
                            collection.trigger("reset");
                        } else {
                            options.success(elements); // We're done. No more elements.
                        }
                    }
                    else {
                        if (options.offset && options.offset > skipped) {
                            skipped++;
                            cursor.continue(); /* We need to Moving the cursor forward */
                        } else {
                            // This time, it looks like it's good!
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
                            processed++;
                            cursor.continue();
                        }
                    }
                };
            }
        },
        close :function(){
            if(this.db){
                this.db.close();
            }
        }
    };

    // ExecutionQueue object
    // The execution queue is an abstraction to buffer up requests to the database.
    // It holds a "driver". When the driver is ready, it just fires up the queue and executes in sync.
    function ExecutionQueue(schema) {
        this.driver     = new Driver(schema, this.ready.bind(this));
        this.started    = false;
        this.stack      = [];
        this.version    = _.last(schema.migrations).version;
    }

    // ExecutionQueue Prototype
    ExecutionQueue.prototype = {
        // Called when the driver is ready
        // It just loops over the elements in the queue and executes them.
        ready: function () {
            this.started = true;
            _.each(this.stack, function (message) {
                this.execute(message);
            }.bind(this));
        },

        // Executes a given command on the driver. If not started, just stacks up one more element.
        execute: function (message) {
            if (this.started) {
                this.driver.execute(message[1].storeName, message[0], message[1], message[2]); // Upon messages, we execute the query
            } else {
                this.stack.push(message);
            }
        },

        close : function(){
            this.driver.close();
        }
    };

    // Method used by Backbone for sync of data with data store. It was initially designed to work with "server side" APIs, This wrapper makes 
    // it work with the local indexedDB stuff. It uses the schema attribute provided by the object.
    // The wrapper keeps an active Executuon Queue for each "schema", and executes querues agains it, based on the object type (collection or
    // single model), but also the method... etc.
    // Keeps track of the connections
    var Databases = {};

    function sync(method, object, options) {

        if(method=="closeall"){
            _.each(Databases,function(database){
                database.close();
            });

            return;
        }

        var schema = object.database;
        if (Databases[schema.id]) {
            if(Databases[schema.id].version != _.last(schema.migrations).version){
                Databases[schema.id].close();
                delete Databases[schema.id];
            }
        }

        var next = function(){
        };

        if (!Databases[schema.id]) {
            Databases[schema.id] = new ExecutionQueue(schema,next);
        }
        Databases[schema.id].execute([method, object, options]);
    };

    if(typeof exports == 'undefined'){
        Backbone.ajaxSync = Backbone.sync;
        Backbone.sync = sync;
    }
    else {
        exports.sync = sync;
        exports.debugLog = debugLog;
    }

    //window.addEventListener("unload",function(){Backbone.sync("closeall")})
})();
});

require.define("/models/database.js", function (require, module, exports, __dirname, __filename) {
var msgboyDatabase = {
    id: "msgboy-database",
    description: "The database for the msgboy",
    migrations: [{
        version: 1,
        migrate: function (transaction, next) {
            transaction.db.createObjectStore("messages");
            transaction.db.createObjectStore("inbox");
            next();
        }
    }, {
        version: 2,
        migrate: function (transaction, next) {
            var store = transaction.objectStore("messages");
            store.createIndex("createdAtIndex", "createdAt", {
                unique: false
            });
            next();
        }
    }, {
        version: 3,
        migrate: function (transaction, next) {
            var store = transaction.db.createObjectStore("feeds");
            store.createIndex("urlIndex", "url", {
                unique: false
            });
            next();
        }
    }, {
        version: 4,
        migrate: function (transaction, next) {
            var store = transaction.objectStore("messages");
            store.createIndex("sourceLinkIndex", "sourceLink", {
                unique: false
            });
            store.createIndex("hostIndex", "sourceHost", {
                unique: false
            });
            next();
        }
    }, {
        version: 5,
        migrate: function (transaction, next) {
            var store = transaction.objectStore("messages");
            store.createIndex("stateIndex", "state", {
                unique: false
            });
            next();
        }
    }, {
        version: 6,
        migrate: function (transaction, next) {
            var store = transaction.objectStore("messages");
            store.createIndex("feedIndex", "feed", {
                unique: false
            });
            next();
        }
    }, {
        version: 7,
        migrate: function (transaction, next) {
            var subscriptions = transaction.db.createObjectStore("subscriptions");
            subscriptions.createIndex("stateIndex", "state", {unique: false});
            subscriptions.createIndex("subscribedAtIndex", "subscribedAt", {unique: false});
            subscriptions.createIndex("unsubscribedAtIndex", "unsubscribedAt", {unique: false});
            next();
        }
    }]
};

exports.msgboyDatabase = msgboyDatabase
});

require.define("/models/message.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var UrlParser = require('url');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Archive = require('./archive.js').Archive;

var Message = Backbone.Model.extend({
    storeName: "messages",
    database: msgboyDatabase,
    defaults: {
        "url":          "",
        "title":        null,
        "atomId":       null,
        "summary":      null,
        "content":      null,
        "links":        {},
        "createdAt":    0,
        "source":       {},
        "sourceHost":   "",
        "sourceLink":   "",
        "state":        "new",
        "feed":         "",
        "relevance":    0.6
    },
    /* Creates a message (uses save but makes sure we do not overide an existing message.) 
       It also deletes some attributes that we will not use in the msgboy to make it lighter
    */
    create: function(attributes, options) {
        delete this.attributes.summary;
        delete this.attributes.content;
        delete this.attributes.text;
        delete this.attributes.updated;
        delete this.attributes.published;
        this.isNew = function() {
            return true;
        }
        this.save(attributes, options);
    },
    /* Initializes the messages */
    initialize: function (params) {
        if(typeof params === "undefined") {
            params = {}; // Default params
        }
        // Setting up the source attributes
        if (params.source && params.source.links) {
            if(params.source.links.alternate) {
                if(params.source.links.alternate["text/html"] && params.source.links.alternate["text/html"][0]) {
                    params.sourceLink = params.sourceLink || params.source.links.alternate["text/html"][0].href;
                    params.sourceHost = params.sourceHost || UrlParser.parse(params.sourceLink).hostname;
                }
                else {
                    params.sourceLink = params.sourceLink || ""; // Dang. What is it?
                    params.sourceHost = params.sourceHost || "";
                }
            }
            else {
                params.sourceLink = params.sourceLink || ""; // Dang. What is it?
                params.sourceHost = params.sourceHost || "";
            }
        }
        else {
            params.sourceLink = params.sourceLink || ""; // Dang. What is it?
            params.sourceHost = params.sourceHost || "";
        }
        
        // Setting up the createdAt
        if (!params.createdAt) {
            params.createdAt = new Date().getTime();
        }
        
        
        // Setting up the mainLink
        if (params.links && params.links.alternate) {
            if (params.links.alternate["text/html"] && params.links.alternate["text/html"][0]) {
                params.mainLink = params.links.alternate["text/html"][0].href;
            }
            else {
                // Hum, let's see what other types we have!
                params.mainLink = "";
            }
        }
        else {
            params.mainLink = "";
        }
        
        // Setting up the text, as the longest between the summary and the content.
        if (params.content) {
            if (params.summary && params.summary.length > params.content.length) {
                params.text =  params.summary;
            }
            else {
                params.text =  params.content;
            }
        }
        else if (params.summary) {
            params.text =  params.summary;
        }
        else {
            params.text = "";
        }
        
        // Setting up the params
        this.set(params);
        
        this.related = new Backbone.Collection(); // create container for similar messages
        this.related.comparator = function(message) {
            return -message.get('createdAt');
        }
        return this;
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
                if (brothers.length >= 3 && (!states["up-ed"] || states["up-ed"] < 0.05) && (states["down-ed"] > 0.5 || counts["down-ed"] >= 5)) {
                    this.trigger('unsubscribe');
                }
            }.bind(this));
        }.bind(this));
    },
    /* Skip the message */
    skip: function () {
        this.setState("skipped");
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
            return brother.attributes.createdAt;
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
    faviconUrl: function () {
        return "http://g.etfv.co/" + this.get('sourceLink') + "?defaulticon=lightpng";
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


});

require.define("/models/archive.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;

var Archive = Backbone.Collection.extend({
    storeName: "messages",
    database: msgboyDatabase,

    initialize: function () {
        this.model = require('./message.js').Message; // This avoids recursion in requires
    },
    comparator: function (message) {
        return - (message.get('createdAt'));
    },
    next: function (number, condition) {
        var options = {
            conditions: condition,
            limit: number,
            addIndividually: true
        };
        this.fetch(options);
    },
    forFeed: function (_feed) {
        this.fetch({conditions: {feed: _feed}});
    }
});

exports.Archive = Archive;
});

require.define("/models/triggered-messages.js", function (require, module, exports, __dirname, __filename) {
var Message = require('./message.js').Message;

var Msgboy = null;

var saveMessage = function(message, cb) {
    var msg = new Message(message);
    msg.create({}, {
        success: function () {
            Msgboy.log.debug("Saved message " + msg.id);
            if(typeof cb !== "undefined") {
                cb(msg);
            }
        }.bind(this),
        error: function (object, error) {
            // Message was not saved... probably a dupe
            Msgboy.log.debug("Could not save message " + JSON.stringify(msg.toJSON()));
            Msgboy.log.debug(error);
        }.bind(this)
    });
}

var MessageTrigger = {
    observe: function(msgboy) {
        Msgboy = msgboy;
        
        // Template
        // Msgboy.bind('inbox:new', function() {
        //     saveMessage();
        // });
        
        Msgboy.bind('down-ed', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:first-downvote",
                "title": "This was your first downvote",
                "ungroup": true,
                "summary": 'Click this box to learn more about what happens when you down-vote!',
                "image": '',
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/HMQu9Q',
                            "rel": "alternate",
                            "title": "Down-voting",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime(),
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "alternate": "http://msgboy.com/",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 1.0,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            }, function(message) {
                Msgboy.inbox.trigger("messages:added", message);
            });
        });

        Msgboy.bind('plugins:imported', function(count) {
            saveMessage({
                "id": "tag:msgboy.com,2012:plugins",
                "title": "We successfuly found " + count + " site for you!",
                "ungroup": true,
                "summary": 'When looking at your <em>browsing habits</em>, we found ' + count + ' sites you seem to care about.',
                "image": '',
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/HiC1pI',
                            "rel": "alternate",
                            "title": "Msgboy plugins",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime(),
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "alternate": "http://msgboy.com/",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            }, function(message) {
                Msgboy.inbox.trigger("messages:added", message);
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:welcome",
                "title": "Welcome to msgboy! He will show you the web you care about.",
                "ungroup": true,
                "summary": 'Welcome to msgboy! It will show you the web you care about.',
                "image": '/views/images/msgboy-help-screen-1.png',
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GM8UEd',
                            "rel": "alternate",
                            "title": "Welcome to Msgboy",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime(),
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "alternate": "http://msgboy.com/",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 1.0,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:bookmark-and-visit",
                "title": "Bookmark or come back to sites you love.",
                "ungroup": true,
                "image": "/views/images/msgboy-help-screen-2.png",
                "summary": "Bookmark sites you love. The msgboy will show you messages when they update",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GH1qqp',
                            "rel": "alternate",
                            "title": "Bookmark or come back to sites you love.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 1000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "alternate": "http://msgboy.com/",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:real-time",
                "title": "Newly posted stories appear in realtime.",
                "ungroup": true,
                "summary": "Newly posted stories appear in realtime, so you're always aware the first to know",
                "image": "/views/images/msgboy-help-screen-3.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GGed9c',
                            "rel": "alternate",
                            "title": "Newly posted stories appear in realtime.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 2000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:train",
                "title": "Train msgboy to give you what you want.",
                "ungroup": true,
                "summary": "The msgboy gets better when you use it more. Vote stuff up and down",
                "image": "/views/images/msgboy-help-screen-5.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GPqQRH',
                            "rel": "alternate",
                            "title": "Train msgboy to give you what you want.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 3000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:vote-up",
                "title": "Click '+' for more like this.",
                "ungroup": true,
                "summary": "Vote stories up if you want more like them",
                "image": "/views/images/msgboy-help-screen-6.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GFvG6L',
                            "rel": "alternate",
                            "title": "Click '+' for more like this.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 4000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.8,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:vote-down",
                "title": "Click '-' if you're not interested.",
                "ungroup": true,
                "summary": "Vote stories down if you want less stories like that. The msgboy will also unsubscribe from those unwanted sources",
                "image": "/views/images/msgboy-help-screen-7.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GM9e5U',
                            "rel": "alternate",
                            "title": "Click '-' if you're not interested.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 5000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:notifications",
                "title": "Follow and rate stories with notifications.",
                "ungroup": true,
                "summary": "Get notifications... so that even if you are now looking at the msgboy, you know about stuff!",
                "image": "/views/images/msgboy-help-screen-8.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GHdxzD',
                            "rel": "alternate",
                            "title": "Follow and rate stories with notifications.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 6000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:use-settings",
                "title": "You can throttle notifications in settings.",
                "ungroup": true,
                "summary": "But don't forget that the msgboy is here to help, so he can also STFU!",
                "image": "/views/images/msgboy-help-screen-9.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GH1AhF',
                            "rel": "alternate",
                            "title": "You can throttle notifications in settings.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 7000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:your-data-protected",
                "title": "Your data is safe and protected.",
                "ungroup": true,
                "summary": "The msgboy runs locally. All your browsing data stays local.",
                "image": "",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GGyPSx',
                            "rel": "alternate",
                            "title": "Your data is safe and protected.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 7000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
    }
}

exports.MessageTrigger = MessageTrigger;
});

require.define("/models/subscription.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;

var Subscription = Backbone.Model.extend({
    storeName: "subscriptions",
    database: msgboyDatabase,
    defaults: {
        subscribedAt: 0,
        unsubscribedAt: 0,
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
                this.save({}, {
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
        if (this.attributes.subscribedAt < new Date().getTime() - 1000 * 60 * 60 * 24 * 7 && this.attributes.unsubscribedAt < new Date().getTime() - 1000 * 60 * 60 * 24 * 31) {
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
            this.save({state: _state, subscribedAt: new Date().getTime()}, {
                success: function () {
                    this.trigger(_state);
                }.bind(this)
            });
            break;
        case "unsubscribed":
            this.save({state: _state, unsubscribedAt: new Date().getTime()}, {
                success: function () {
                    this.trigger(_state);
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
    }
});

var Blacklist = [
    /.*wikipedia\.org\/.*/
];

exports.Subscription = Subscription;
exports.Subscriptions = Subscriptions;

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

	this.max_stanzas_per_second = 1; // Traffic shaper at 10 stanzas per second, max.

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

require.define("/strophejs/strophe.superfeedr.js", function (require, module, exports, __dirname, __filename) {
var $ = jQuery      = require('jquery');

var SuperfeedrPlugin = {

    _connection: null,
    _firehoser: 'firehoser.superfeedr.com',
	_handler: null,

    //The plugin must have the init function.
    init: function (conn) {
        this._connection = conn;
        Strophe.addNamespace('PUBSUB', "http://jabber.org/protocol/pubsub");
    },

    // Subscribes to a feed
    subscribe: function (feed, callback) {
        var stanza_id = this._connection.getUniqueId("subscribenode");
        var sub = $iq({
            from: this._connection.jid,
            to: this._firehoser,
            type: 'set',
            id: stanza_id
        });
        sub.c('pubsub', {
            xmlns: Strophe.NS.PUBSUB
        }).c('subscribe', {
            jid: Strophe.getBareJidFromJid(this._connection.jid),
            node: feed
        });
        this._connection.addHandler(function (response) {
            callback(response.getAttribute("type") == "result", {title: Strophe.getText(response.getElementsByTagName("title")[0])});
            return false;
        }, null, 'iq', null, stanza_id, null);
        this._connection.send(sub.tree());
    },

    // Unsubscribes from a feed
    unsubscribe: function (feed, callback) {
        var stanza_id = this._connection.getUniqueId("unsubscribenode");
        var sub = $iq({
            from: this._connection.jid,
            to: this._firehoser,
            type: 'set',
            id: stanza_id
        });
        sub.c('pubsub', {
            xmlns: Strophe.NS.PUBSUB
        }).c('unsubscribe', {
            jid: Strophe.getBareJidFromJid(this._connection.jid),
            node: feed
        });
        this._connection.addHandler(function (response) {
            callback(response.getAttribute("type") == "result");
            return false;
        }, null, 'iq', null, stanza_id, null);
        this._connection.send(sub.tree());
    },

    // List subscribed feeds
    list: function (page, callback) {
        var stanza_id = this._connection.getUniqueId("listnode");
        var sub = $iq({
            from: this._connection.jid,
            to: this._firehoser,
            type: 'get',
            id: stanza_id
        });
        sub.c('pubsub', {
            xmlns: Strophe.NS.PUBSUB
        }).c('subscriptions', {
            jid: Strophe.getBareJidFromJid(this._connection.jid),
            'xmlns:superfeedr': "http://superfeedr.com/xmpp-pubsub-ext",
            'superfeedr:page': page
        });
        this._connection.addHandler(function (response) {
            var subscriptions = response.getElementsByTagName("subscription");
            var result = []
            for (i = 0; i < subscriptions.length; i++) {
                result.push(subscriptions[i].getAttribute("node"));
            }
            callback(result);
            return false; // Unregisters
        }, null, 'iq', null, stanza_id, null);
        this._connection.send(sub.tree());
    },

    // called when connection status is changed
	// we set up the handler. If it was previously set, we just unset it, and delete it.
    statusChanged: function (status) {
        if (this._handler) {
            this._connection.deleteHandler(this._handler);
            this._handler = null;
        }
        this._handler = this._connection.addHandler(this.notificationReceived.bind(this), null, 'message', null, null, null);
    },

    notificationReceived: function (msg) {
        if (msg.getAttribute('from') == "firehoser.superfeedr.com") {
            var entries = msg.getElementsByTagName("entry");
            var status = msg.getElementsByTagName("status")[0];
            var source = {
                title: Strophe.getText(status.getElementsByTagName("title")[0]),
                url: status.getAttribute("feed"),
                links: this.atomLinksToJson(status.getElementsByTagName("link"))
            }
            if(entries.length === 0) {
                this.onNotificationReceived({payload: null, source: source});
            }
            for (i = 0; i < entries.length; i++) {
                this.onNotificationReceived({payload: this.convertAtomToJson(entries[i]), source: source});
            }
        }
        return true; // We must return true to keep the handler active!
    },

    atomLinksToJson: function (atom_links) {
        var links = {};
        for (j = 0; j < atom_links.length; j++) {
	        var link = atom_links[j];
	        l = {
	            href: link.getAttribute("href"),
	            rel: link.getAttribute("rel"),
	            title: link.getAttribute("title"),
	            type: link.getAttribute("type")
	        };
	        links[link.getAttribute("rel")] = (links[link.getAttribute("rel")] ? links[link.getAttribute("rel")] : {});
	        links[link.getAttribute("rel")][link.getAttribute("type")] = (links[link.getAttribute("rel")][link.getAttribute("type")] ? links[link.getAttribute("rel")][link.getAttribute("type")] : []);
	        links[link.getAttribute("rel")][link.getAttribute("type")].push(l);
	    }
	    return links;
    },

	convertAtomToJson: function (atom) {
	    var atom_links = atom.getElementsByTagName("link");
	    var links = this.atomLinksToJson(atom_links);
	    return {
	        id: window.btoa(Strophe.getText(atom.getElementsByTagName("id")[0])),
	        atomId: Strophe.getText(atom.getElementsByTagName("id")[0]),
	        published: Strophe.getText(atom.getElementsByTagName("published")[0]),
	        updated: Strophe.getText(atom.getElementsByTagName("updated")[0]),
	        title: Strophe.getText(atom.getElementsByTagName("title")[0]),
	        summary: Strophe.getText(atom.getElementsByTagName("summary")[0]),
	        content: Strophe.getText(atom.getElementsByTagName("content")[0]),
	        links: links,
	    };
	},
	
	onNotificationReceived: function(notification) {
	    // This method should be overwritten!
	},
}

exports.SuperfeedrPlugin = SuperfeedrPlugin;



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

require.define("/plugins/bookmarks.js", function (require, module, exports, __dirname, __filename) {
var Feediscovery = require('../feediscovery.js').Feediscovery;

var Bookmarks = function (Plugins) {
    // Let's register
    Plugins.register(this);

    this.name = 'Browser Bookmarks';

    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return true;
    };

    this.hijack = function (doc, follow, unfollow) {
        // Hum. What?
    };

    this.listSubscriptions = function (callback, done) {
        var seen = [];
        var totalFeeds = 0;
        chrome.bookmarks.getRecent(1000,
            function (bookmarks) {
                if (bookmarks.length === 0) {
                    done(totalFeeds);
                }
                else {

                    var processNext = function(bookmarks) {
                        var bookmark = bookmarks.pop();
                        if(bookmark) {
                            Feediscovery.get(bookmark.url, function (links) {
                                for(var j = 0; j < links.length; j++) {
                                    var link = links[j];
                                    totalFeeds++;
                                    if (seen.indexOf(link.href) === -1) {
                                        callback({title: link.title || "", url: link.href})
                                        seen.push(link.href);
                                    }
                                }
                                processNext(bookmarks);
                            });
                        } else {
                            done(totalFeeds);
                        }
                    };
                    processNext(bookmarks);
                }
            }.bind(this)
        );
    };

    this.subscribeInBackground = function (callback) {
        chrome.bookmarks.onCreated.addListener(function (id, bookmark) {
            Feediscovery.get(bookmark.url, function (links) {
                _.each(links, function (link) {
                    callback(link);
                });
            });
        }.bind(this));
    };
};

exports.Bookmarks = Bookmarks;
});

require.define("/feediscovery.js", function (require, module, exports, __dirname, __filename) {
// Feediscovery module. The only API that needs to be used is the Feediscovery.get
Feediscovery = {};
Feediscovery.stack = [];
Feediscovery.running = false;

Feediscovery.get = function (_url, _callback) {
    // Let's first do some verifications on the url to avoid wasting resources.
    if(_url.match(/chrome-extension:/)) {
        // No feediscovery lookup for chrome extensions.
        _callback([]);
    }
    else {
        Feediscovery.stack.push([_url, _callback]);
        if(!Feediscovery.running) {
            Feediscovery.running = true;
            Feediscovery.run();
        }
    }
    
};
Feediscovery.run = function () {
    var next = Feediscovery.stack.shift();
    if (next) {
        var client = new XMLHttpRequest(); 
        client.onreadystatechange = function() {
            if(this.readyState == this.DONE) {
                next[1](JSON.parse(client.responseText));
                Feediscovery.run();
            }
        };
        client.open("GET", "http://feediscovery.appspot.com/?url=" + encodeURI(next[0]) , true); // Open up the connection
        client.send( null ); // Send the request
    } else {
        setTimeout(function () {
            Feediscovery.run();
        }, 1000);
    }
};

exports.Feediscovery = Feediscovery;

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

require.define("/plugins/history.js", function (require, module, exports, __dirname, __filename) {
var Feediscovery = require('../feediscovery.js').Feediscovery;
var Maths = require("../maths.js").Maths;

var History = function (Plugins) {
    // Let's register
    Plugins.register(this);
    
    this.name = 'Browsing History';
    this.visitsToBePopular = 3;
    this.deviation = 1;
    this.elapsed = 1000 * 60 * 60 * 3;
    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return true;
    };
    this.hijack = function (doc, follow, unfollow) {
        // Hum. Nothing to do as we can't use the chrome.* apis from content scripts
    };
    this.listSubscriptions = function (callback, done) {
        var seen = [];
        var totalFeeds = 0;

        chrome.history.search({
            'text': '',
            // Return every history item....
            'startTime': ((new Date()).getTime() - 1000 * 60 * 60 * 24 * 15),
            // that was accessed less than 15 days ago, up to 10000 pages.
            'maxResults': 10000
        }, function (historyItems) {
            if (historyItems.length === 0) {
                done(0);
            }
            
            // Synchrounous 
            var processNext = function(items) {
                var item = items.pop();
                if(item) {
                    if (item.visitCount > this.visitsToBePopular) {
                        this.visitsRegularly(item.url, function (result) {
                            if (result) {
                                Feediscovery.get(item.url, function (links) {
                                    for(var i = 0; i < links.length; i++) {
                                        var link = links[i];
                                        if (seen.indexOf(link.href) === -1) {
                                            totalFeeds++;
                                            callback({title: link.title || "", url: link.href});
                                            seen.push(link.href);
                                        }
                                    }
                                    processNext(items);
                                });
                            }
                            else {
                                processNext(items); // Not visited regularly.
                            }
                        });
                    }
                    else {
                        processNext(items); // Not visited often enough
                    }
                }
                else {
                    done(totalFeeds);
                }
            }.bind(this);
            // Let's go.
            processNext(historyItems);
        }.bind(this));
    };
    this.visitsRegularly = function (url, callback) {
        chrome.history.getVisits({url: url}, function (visits) {
            var visitTimes = new Array();
            for(var j = 0; j < visits.length; j++) {
                visitTimes.push(visits[j].visitTime);
            }
            visitTimes = visitTimes.slice(-10);
            var diffs = [];
            for (var i = 0; i < visitTimes.length - 1; i++) {
                diffs[i] =  visitTimes[i + 1] - visitTimes[i];
            }
            
            // Check the regularity and if it is regular + within a certain timeframe, then, we validate.
            if (Maths.normalizedDeviation(diffs) < this.deviation && (visitTimes.slice(-1)[0] -  visitTimes[0] > this.elapsed)) {
                callback(true);
            }
            else {
                callback(false);
            }
        }.bind(this));
    };
    this.subscribeInBackground = function (callback) {
        chrome.history.onVisited.addListener(function (historyItem) {
            if (historyItem.visitCount > this.visitsToBePopular) {
                this.visitsRegularly(historyItem.url, function (result) {
                    Feediscovery.get(historyItem.url, function (links) {
                        for(var i = 0; i < links.length; i++) {
                            callback(links[i]);
                        }
                    });
                });
            }
        }.bind(this));
    };
};

exports.History = History;
});

require.define("/maths.js", function (require, module, exports, __dirname, __filename) {
// Helpers for maths

Maths = {};
Maths.normalizedDeviation = function (array) {
    return Maths.deviation(array) / Maths.average(array);
};
Maths.deviation = function (array) {
    var avg = Maths.average(array);
    var count = array.length;
    var i = count - 1;
    var v = 0;
    while (i >= 0) {
        v += Math.pow((array[i] - avg), 2);
        i = i - 1;
    }
    return Math.sqrt(v / count);
};
Maths.average = function (array) {
    var count = array.length;
    var i = count - 1;
    var sum = 0;
    while (i >= 0) {
        sum += array[i];
        i = i - 1;
    }
    return sum / count;
};


exports.Maths = Maths;

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

require.define("/tests/models/subscription.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var msgboyDatabase = require('../../models/database.js').msgboyDatabase;
var Subscription = require('../../models/subscription.js').Subscription;
var Subscriptions = require('../../models/subscription.js').Subscriptions;

describe('Subscription', function(){
    before(function() {
        msgboyDatabase = _.clone(msgboyDatabase);
        msgboyDatabase.id = msgboyDatabase.id + "-test";
        indexedDB.deleteDatabase(msgboyDatabase.id);
        Subscription = Subscription.extend({ database: msgboyDatabase});
        Subscriptions = Subscriptions.extend({ database: msgboyDatabase});
    });

    beforeEach(function() {
    });
    
    describe('fetchOrCreate', function() {
        it('should create a subscription that does not exist', function(complete) {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
            s.fetchOrCreate(function() {
                s.id.should.equal("http://blog.superfeedr.com/atom.xml");
                complete();
            });
        });
        it('should fetch a subscription that exists', function(complete) {
            var s = new Subscription({id: "https://github.com/superfeedr.atom"});
            s.fetchOrCreate(function() {
                var t = new Subscription({id: "https://github.com/superfeedr.atom"});
                t.fetchOrCreate(function() {
                    t.id.should.equal("https://github.com/superfeedr.atom");
                    complete();
                });
            });
        });
        
    });

    describe('needsRefresh', function() {
        it('should return true if the subscription is older than a week and unsubscription is older than a month and if the feed is not in the blacklist', function() {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml", subscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 7 - 1, unsubscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 31 - 1});
            s.needsRefresh().should.equal(true);
        });
        it('should return false if the subscription is earlier than a week', function() {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml", subscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 7 + 1});
            s.needsRefresh().should.equal(false);
        });
        it('should return false if unsubscription is earlier than a month', function() {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml", unsubscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 31 + 1});
            s.needsRefresh().should.equal(false);
        });
        it('should return false if the feed is in the blacklist', function() {
            var s = new Subscription({id: "http://en.wikipedia.org/w/index.php?title=Special:RecentChanges&feed=atom", subscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 7 - 1, unsubscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 31 - 1});
            s.needsRefresh().should.equal(false);
        });
    });

    describe('setState', function() {
        it('should set the state', function(complete) {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
            s.bind('change', function() {
                s.get('state').should.equal("subscribing");
                complete();
            })
            s.setState("subscribing");
        });
        it('should trigger the state', function(complete) {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
            s.bind('unsubscribing', function() {
                complete();
            })
            s.setState("unsubscribing");
        });
        
        describe('when setting the state to subscribed', function() {
            it('should set the subscribedAt', function(complete) {
                var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
                s.bind('subscribed', function() {
                    s.get('subscribedAt').should.be.above(new Date().getTime() - 1000);
                    s.get('subscribedAt').should.be.below(new Date().getTime() + 1000);
                    complete();
                })
                s.setState("subscribed");
            });
        });
        describe('when setting the state to unsubscribed', function() {
            it('should set the unsubscribedAt', function(complete) {
                var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
                s.bind('unsubscribed', function() {
                    s.get('unsubscribedAt').should.be.above(new Date().getTime() - 1000);
                    s.get('unsubscribedAt').should.be.below(new Date().getTime() + 1000);
                    complete();
                })
                s.setState("unsubscribed");
            });
        })
        
    });
});

describe('Subscriptions', function(){
    before(function() {
        // We need to save a couple fixture messages!
    });

    beforeEach(function() {
    });

    describe('pending', function(complete) {
        it('should yield all subscriptions whose state is "subscrbing"', function(complete) {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
            s.bind('subscribing', function() {
                var t = new Subscription({id: "https://github.com/superfeedr.atom"});
                t.bind('subscribed', function() {
                    var u = new Subscription({id: "http://push-pub.appspot.com/feed"});
                    u.bind('subscribed', function() {
                        var v = new Subscription({id: "http://github.com/julien.atom"});
                        v.bind('subscribing', function() {
                            var pendingSubscriptions = new Subscriptions();
                            pendingSubscriptions.bind('reset',function(subscritions) {
                                pendingSubscriptions.pluck('id').should.eql([ 'http://blog.superfeedr.com/atom.xml',
                                  'http://github.com/julien.atom' ]);
                                complete();
                            });
                            pendingSubscriptions.pending();
                        });
                        v.setState("subscribing");
                    });
                    u.setState("subscribed");
                });
                t.setState("subscribed");
            });
            s.setState("subscribing");
            var subscription =  new Subscriptions();
        });
    });

});


});

require.define("/tests/models/archive.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var msgboyDatabase = require('../../models/database.js').msgboyDatabase;
var Message = require('../../models/message.js').Message;
var Archive = require('../../models/archive.js').Archive;
var should = require('chai').should();

describe('Archive', function(){
    before(function(done) {
        // We need to use a distinct database and clean it up before performing the tests
        msgboyDatabase = _.clone(msgboyDatabase);
        msgboyDatabase.id = msgboyDatabase.id + "-test";
        indexedDB.deleteDatabase(msgboyDatabase.id);
        Message = Message.extend({ database: msgboyDatabase});
        Archive = Archive.extend({ database: msgboyDatabase});
        var m1 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/dummy.xml', title: 'First Message', createdAt: new Date().getTime() - 5});
        m1.bind('change', function() {
            var m2 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/real.xml',title: 'Second Message', createdAt: new Date().getTime() - 4});
            m2.bind('change', function() {
                var m3 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/dummy.xml',title: 'Third Message', createdAt: new Date().getTime() - 3});
                m3.bind('change', function() {
                    var m4 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/dummy.xml',title: 'Fourth Message', createdAt: new Date().getTime() - 2});
                    m4.bind('change', function() {
                        var m5 = new Message({sourceHost: 'tumblr.com', feed: 'http://superfedr.com/real.xml',title: 'Message from Tumblr', createdAt: new Date().getTime() - 1});
                        m5.bind('change', function() {
                            done();
                        });
                        m5.save();
                    });
                    m4.save();
                });
                m3.save();
            });
            m2.save();
        });
        m1.save();
    });

    beforeEach(function() {
    });

    describe('comparator', function() {
        it('should sort all the messages by createdAt', function(done) {
            var archive =  new Archive();
            var twelveHourAgoMessage = new Message({title: "Twelve Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 12});
            var twentyFourHourAgoMessage = new Message({title: "Twenty-Four Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 24});
            var sixHourAgoMessage = new Message({title: "Six Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 6});
            var eighteenHourAgoMessage = new Message({title: "Eighteen Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 18});
            var threeHourAgoMessage = new Message({title: "Three Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 3});
            var NineHourAgoMessage = new Message({title: "Nine Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 9});
            archive.add(twelveHourAgoMessage);
            archive.add(twentyFourHourAgoMessage);
            archive.add(threeHourAgoMessage);
            archive.add(NineHourAgoMessage);
            archive.add(eighteenHourAgoMessage);
            archive.add(sixHourAgoMessage);
            var prev = null;
            archive.each(function(m) {
                if(prev) {
                    m.get('createdAt').should.be.below(prev.get('createdAt'));
                }
                prev = m;
            });
            done();
        });
    })

    describe('next', function() {
        it('should add messages one by one', function(done) {
            var archive =  new Archive();
            archive.model = Message;
            var count = 0;
            var limit = 3;
            archive.bind('add', function(message) {
                count += 1;
                if(count === limit) {
                    done();
                }
            })
            archive.next(limit);
        });

        it('should stick to the conditions on messages added', function(done) {
            var archive =  new Archive();
            archive.model = Message;
            var count = 0;
            var limit = 3;
            archive.bind('add', function(message) {
                count += 1;
                if(count === limit) {
                    _.each(archive.pluck('sourceHost'), function(h) {
                        h.should.equal('superfeedr.com');
                    });
                    done();
                }
            })
            archive.next(limit, {sourceHost: "superfeedr.com"});
        });
    });

    describe('forFeed', function() {
        it('should return all the messages for a given feed when called with forFeed', function(done) {
            var archive =  new Archive();
            archive.model = Message;
            archive.bind('reset', function() {
                archive.length.should.equal(3);
                archive.at(0).get('title').should.equal("Fourth Message");
                archive.at(1).get('title').should.equal("Third Message");
                archive.at(2).get('title').should.equal("First Message");
                done();
            })
            archive.forFeed('http://superfedr.com/dummy.xml');
        });
    });

});


});

require.define("/tests/models/database.js", function (require, module, exports, __dirname, __filename) {
var msgboyDatabase = require('../../models/database.js').msgboyDatabase;
var should = require('chai').should();

describe('Database', function(){
    before(function() {
        // We need to use a distinct database and clean it up before performing the tests
        msgboyDatabase.id = msgboyDatabase.id + "-test";
        indexedDB.deleteDatabase(msgboyDatabase.id);
    });

    beforeEach(function() {
    });

    describe('shema', function() {
        it('should have the right id', function() {
            msgboyDatabase.id.should.equal("msgboy-database-test");
        });
        it('should have the right description', function() {
            msgboyDatabase.description.should.equal("The database for the msgboy");
        });
        it('should have 7 versions', function() {
            msgboyDatabase.migrations.should.have.length(7);
        });
    });
});


});

require.define("/tests/models/inbox.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var msgboyDatabase = require('../../models/database.js').msgboyDatabase;
var Inbox = require('../../models/inbox.js').Inbox;

describe('Inbox', function(){
    before(function() {
        msgboyDatabase = _.clone(msgboyDatabase);
        msgboyDatabase.id = msgboyDatabase.id + "-test";
        indexedDB.deleteDatabase(msgboyDatabase.id);
        Inbox = Inbox.extend({ database: msgboyDatabase});
    });

    beforeEach(function() {
    });

    describe('setup', function() {
        it('should trigger ready if the inbox was created', function(done) {
            var inbox =  new Inbox();
            inbox.bind('ready', function() {
                done();
            })
            inbox.setup("login", "token")
        });

        it('should trigger new if the inbox was not created', function(done) {
            var inbox =  new Inbox();
            inbox.bind('new', function() {
                done();
            })
            inbox.setup("login", "token")
        });
    });
    
    describe('fetchAndPrepare', function() {
        it('should trigger ready if the inbox was found with the right parameters', function(done) {
            var inbox =  new Inbox();
            inbox.bind('ready', function() {
                var jnbox =  new Inbox();
                jnbox.bind('ready', function() {
                    done();
                });
                jnbox.fetchAndPrepare();
            });
            inbox.setup("login", "token");
        });
        it('should trigger error if the jid is missing', function(done) {
            var inbox =  new Inbox();
            inbox.bind('ready', function() {
                var jnbox =  new Inbox();
                jnbox.bind('error', function() {
                    done();
                });
                jnbox.fetchAndPrepare();
            });
            inbox.setup("token");
        });
        it('should trigger ready if the inbox was not found', function(done) {
            var inbox =  new Inbox();
            inbox.bind('error', function() {
                done();
            })
            inbox.fetchAndPrepare();
        })
    })

});


});

require.define("/tests/models/message.js", function (require, module, exports, __dirname, __filename) {
var Message = require('../../models/message.js').Message;
var should = require('chai').should();

describe('Message', function(){
    before(function() {
        // We need to save a couple fixture messages!
    });
    
    beforeEach(function() {
    });
    
    describe('defaults', function() {
        it('should have a relevance of 0.6', function() {
            var message  = new Message();
            message.get('relevance').should.equal(0.6);
        });

        it('should have a state of new', function() {
            var message  = new Message();
            message.get('state').should.equal("new");
        });
    });
    
    describe('when initializing the message', function() {
        it('should set the value for sourceHost', function() {
            var message = new Message({source: {links: {alternate: {"text/html": [{href: "http://msgboy.com/an/entry"}]}}}})
            message.get('sourceHost').should.equal("msgboy.com");
        });
        it('should set the value for sourceLink', function() {
            var message = new Message({source: {links: {alternate: {"text/html": [{href: "http://msgboy.com/an/entry"}]}}}})
            message.get('sourceLink').should.equal("http://msgboy.com/an/entry");
        });
        it('should set the value for createdAt', function() {
            var message = new Message({})
            message.get('createdAt').should.be.above(new Date().getTime() - 10);
            message.get('createdAt').should.be.below(new Date().getTime() + 10);
        });
        it('should set the value for mainLink', function() {
            var message = new Message({links: {alternate: {"text/html": [{href: "http://msgboy.com/an/entry"}]}}});
            message.get('mainLink').should.equal("http://msgboy.com/an/entry");
        });
        it('should set the value for text to the summary if no content exists', function() {
            var _summary = "summary";
            var message = new Message({summary: _summary});
            message.get('text').should.equal(_summary);
        });
        it('should set the value for text to the content if no summary exists', function() {
            var _content = "content";
            var message = new Message({content: _content});
            message.get('text').should.equal(_content);
        });
        it('should set the value for text to the content if it s longer than the summary', function() {
            var _summary = "summary";
            var _content = "content is longer here";
            var message = new Message( {summary: _summary, content: _content});
            message.get('text').should.equal(_content);
        });
        it('should set the value for text to the summary if it s longer than the content', function() {
            var _summary = "summary is longer here";
            var _content = "content";
            var message = new Message( {summary: _summary, content: _content});
            message.get('text').should.equal(_summary);
        });
    });
    
    describe('when voting up', function() {
        it('should set the state to up-ed', function() {
            var message  = new Message();
            message.voteUp();
            message.get('state').should.equal('up-ed');
        });
    });
    
    describe('when voting down', function() {
        it('should set the state to down-ed', function() {
            var message  = new Message();
            message.voteDown();
            message.get('state').should.equal('down-ed');
        });
    });
    
    describe('when skipping', function() {
        it('should set the state to skiped', function() {
            var message  = new Message();
            message.skip();
            message.get('state').should.equal('skipped');
        });
    });
    
    describe('when setting the state', function() {
        it('should set the state accordingly', function() {
            var message  = new Message();
            message.setState("up-ed");
            message.get('state').should.equal('up-ed');
        });
        it('should trigger the state event', function(done) {
            var message  = new Message();
            message.bind('up-ed', function() {
                done();
            });
            message.setState("up-ed");
        });
        it('should call the callback if defined', function(done) {
            var message  = new Message();
            message.setState("up-ed", function(result) {
                result.should.equal(true);
                done();
            });
        });
        
        
    });
    
    describe('calculateRelevance', function() {
        
    });
    
    describe('when saving', function() {
        it('should not save duplicate messages (with the same id)', function(done) {
            var id = "a-unique-id";
            
            var runTest = function() {
                var message  = new Message();
                message.create({id: id}, {
                    success: function() {
                        var dupe = new Message();
                        dupe.create({id: id}, {
                            success: function() {
                                // This should not happen!
                                throw new Error('We were able to save the dupe!');
                            },
                            error: function() {
                                done();
                            }
                        });
                    }.bind(this),
                    error: function() {
                        throw new Error('We couldn\'t save the message');
                        // This should not happen!
                    }.bind(this)
                });
            };
            
            // First, we need to clean up any existing message.
            var clean = new Message({id: id});
            clean.fetch({
                success: function () {
                    // The message exists! Let's delete it.
                    clean.destroy({
                        success: function() {
                            runTest();
                        }.bind(this)
                    });
                }.bind(this),
                error: function () {
                    // The message does not exist.
                    runTest();
                }.bind(this)
                
            })
            
        });
        
        it('should yet allow for updates', function(done) {
            var id = "a-unique-id";
            var message  = new Message();
            message.save({id: id}, {
                success: function() {
                    message.save({title: "hello world"}, {
                        success: function() {
                            // This should not happen!
                            done();
                        },
                        error: function() {
                            throw new Error('We were not able to update the message.');
                        }
                    });
                }.bind(this),
                error: function() {
                    throw new Error('We couldn\'t save the message');
                    // This should not happen!
                }.bind(this)
            }); 
        })
        
        
    });
    
    describe('relevanceBasedOnBrothers', function() {
        
    });
});

});

require.define("/tests/feediscovery.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var should = require('chai').should();
var Plugins = require('../feediscovery.js').Plugins;


describe('Feediscovery', function(){
    before(function(ready) {
        ready();
    });
    
    beforeEach(function(ready) {
        ready();
    });
    
    describe('get', function() {
        
        it('should extract the right feed url', function(done) {
            Feediscovery.get('http://ma.tt/', function (links) {
                links[0].href.should.equal('http://ma.tt/feed/');
                links[0].rel.should.equal('alternate');
                links[0].title.should.equal('Matt Mullenweg &raquo; Feed');
                links[0].type.should.equal('application/rss+xml');
                links[1].href.should.equal('http://ma.tt/comments/feed/');
                links[1].rel.should.equal('alternate');
                links[1].title.should.equal('Matt Mullenweg &raquo; Comments Feed');
                links[1].type.should.equal('application/rss+xml');
                done();
            });
            
        })
        
    });
});
});

require.define("/tests/plugins.js", function (require, module, exports, __dirname, __filename) {
var _ = require('underscore');
var should = require('chai').should();
var Plugins = require('../plugins.js').Plugins;

describe('Plugins', function(){
    before(function(ready) {
        ready();
    });
    
    beforeEach(function(ready) {
        ready();
    });
    
    describe('importSubscriptions', function() {
        beforeEach(function(ready) {
            Plugins.all = [];
            Plugins.register({
                listSubscriptions: function(cb, done) {
                    cb({url: "url1", title: "title1"});
                    cb({url: 'url2', title: "title2"});
                    cb({url: 'url3', title: "title3"});
                    done(3)
                },
                name: "Stub 1"
            });
            Plugins.register({
                listSubscriptions: function(cb, done) {
                    cb({url: "url4", title: "title4"});
                    cb({url: 'url5', title: "title5"});
                    done(2)
                },
                name: "Stub 2"
            });
            ready();
        });
        it('should listSubscriptions for each plugin', function(done) {
            var subscriptionsUrls = []
            Plugins.importSubscriptions(function(sub) {
                subscriptionsUrls.push(sub.url)
            }, function() {
    
            }, function(count) {
                if(count === 5) {
                    subscriptionsUrls.should.include('url1');
                    subscriptionsUrls.should.include('url2');
                    subscriptionsUrls.should.include('url3');
                    subscriptionsUrls.should.include('url4');
                    subscriptionsUrls.should.include('url5');
                    done();
                }
            });
        });
    });
    
    
    require('./plugins/google-reader.js');
    require('./plugins/blogger.js');
    require('./plugins/bookmarks.js');
    require('./plugins/disqus.js');
    require('./plugins/generic.js');
    require('./plugins/history.js');
    require('./plugins/posterous.js');
    require('./plugins/statusnet.js');
    require('./plugins/tumblr.js');
    require('./plugins/typepad.js');
    require('./plugins/wordpress.js');
    
});
});

require.define("/tests/plugins/google-reader.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var GoogleReader = require('../../plugins/google-reader.js').GoogleReader;

describe('GoogleReader', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if we\'re on a Google Reader page', function() {
            var docStub = {
                location: {
                    host: "www.google.com"
                    ,pathname: "/reader/view/"
                }
            };
            var b = new GoogleReader(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });

    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new GoogleReader(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });

});

});

require.define("/tests/plugins/blogger.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Blogger = require('../../plugins/blogger.js').Blogger;


describe('Blogger', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the host is www.blogger.com and the pathname is /navbar.g', function() {
            var docStub = {
                location: {
                    host: "www.blogger.com"
                    , pathname: "/navbar.g"
                }
            };
            var b = new Blogger(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new Blogger(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });


});

});

require.define("/tests/plugins/bookmarks.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Bookmarks = require('../../plugins/bookmarks.js').Bookmarks;

describe('Bookmarks', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true', function() {
            var docStub = {};
            var b = new Bookmarks(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {
        
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new Bookmarks(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });
    
    describe('subscribeInBackground', function() {
        
    });

});

});

require.define("/tests/plugins/disqus.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Disqus = require('../../plugins/disqus.js').Disqus;

describe('Disqus', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the page has a disqus_thread', function() {
            var docStub = {
                getElementById: function(id) {
                    return id === "disqus_thread"
                }
            };
            var d = new Disqus(Plugins);
            d.onSubscriptionPage(docStub).should.be.true;
        });

    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var d = new Disqus(Plugins);
            d.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });

});

});

require.define("/tests/plugins/generic.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Generic = require('../../plugins/generic.js').Generic;

describe('Generic', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true', function() {
            var docStub = {};
            var b = new Generic(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {
        // Hum. How can we test that?
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            var d = new Generic(Plugins);
            d.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                true.should.be.false; // Generic plugin does not have a way to list subscriptions
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.equal(0);
                done();
            });
        });
    });

});

});

require.define("/tests/plugins/history.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var History = require('../../plugins/history.js').History;

describe('History', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true', function() {
            var docStub = {};
            var b = new History(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new History(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });
    
    describe('subscribeInBackground', function() {
        
    });

});

});

require.define("/tests/plugins/posterous.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Posterous = require('../../plugins/posterous.js').Posterous;

describe('Posterous', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the document as a pbar id', function() {
            var docStub = {
                getElementById: function(className) {
                    return className == "pbar";
                }
            };
            var b = new Posterous(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {
        
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new Posterous(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });

});

});

require.define("/tests/plugins/statusnet.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Statusnet = require('../../plugins/statusnet.js').Statusnet;

describe('Statusnet', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the location is at .*.status.net', function() {
            var docStub = {
                getElementById: function(el) {
                    return el === "showstream";
                }
            };
            var b = new Statusnet(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {
        
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new Statusnet(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });
});

});

require.define("/tests/plugins/tumblr.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Tumblr = require('../../plugins/tumblr.js').Tumblr;

describe('Tumblr', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the location is at www.tumblr.com and the pathname /dashboard/iframe', function() {
            var docStub = {
                location: {
                    host: "www.tumblr.com",
                    pathname: "/dashboard/iframe"
                }
            };
            var b = new Tumblr(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {
        
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new Tumblr(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });
});

});

require.define("/tests/plugins/typepad.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Typepad = require('../../plugins/typepad.js').Typepad;

describe('Typepad', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the location is at www.typepad.com and the pathname /services/toolbar', function() {
            var docStub = {
                location: {
                    host: "www.typepad.com",
                    pathname: "/services/toolbar"
                }
            };
            var b = new Typepad(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {
        
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new Typepad(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });

});

});

require.define("/tests/plugins/wordpress.js", function (require, module, exports, __dirname, __filename) {
var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Wordpress = require('../../plugins/wordpress.js').Wordpress;

describe('Wordpress', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the page has an element whose id is wpadminbar', function() {
            var docStub = {
                getElementById: function(id) {
                    return id === "wpadminbar";
                }
            }
            var w = new Wordpress(Plugins);
            w.onSubscriptionPage(docStub).should.equal(true);
        });
    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            var w = new Wordpress(Plugins);
            w.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });

});

});

require.alias("br-jquery", "/node_modules/jquery");

require.alias("backbone-browserify", "/node_modules/backbone");

require.define("/tests.js", function (require, module, exports, __dirname, __filename) {
    var should = require('chai').should;
require('./tests/background.js');
require('./tests/models/subscription.js');
require('./tests/models/archive.js');
require('./tests/models/database.js');
require('./tests/models/inbox.js');
require('./tests/models/message.js');
require('./tests/feediscovery.js');
require('./tests/plugins.js');
// require('./tests/views/.js');


});
require("/tests.js");
