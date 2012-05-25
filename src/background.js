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
var Strophe         = require('./strophejs/core.js').Strophe;
var SuperfeedrPlugin= require('./strophejs/strophe.superfeedr.js').SuperfeedrPlugin;
var Feediscovery    = require('./feediscovery.js').Feediscovery;
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
var subscribe = function (url, doDiscovery, force, callback) {
    // First, let's check if we need to perform discovery on that. 
    if(doDiscovery) {
        // Well let's do disco and then recurse!
        Feediscovery.get(url, function (links) {
            for(var i = 0; i < links.length; i++) {
                var link = links[i];
                subscribe(link.href, false, force, callback);
            }
        });
    }
    else {
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
    }
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
                message.set({image: largestImg});
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

Msgboy.bind("loaded:background", function () {
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
                subscribe(subs.url, subs.doDiscovery, false, function () {
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
        // We first need to look at params and see if the doDiscovery flag is set. If so, we first need to perform discovery
        subscribe(params.url, params.doDiscovery, params.force || false, function (result) {
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
            subscribe(subs.url, subs.doDiscovery, false, function () {
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
            plugin.subscribeInBackground(function (subscription) {
                Msgboy.trigger('subscribe', subscription, function() {
                    // Nothing.
                });
            });
        }
    }
    
    // Let's go.
    Msgboy.inbox.fetchAndPrepare();
 });

