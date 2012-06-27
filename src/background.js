var Url = require('url');
var QueryString = require('querystring');
var Msgboy          = require('./msgboy.js').Msgboy;
var Plugins         = require('./plugins.js').Plugins;
var Inbox           = require('./models/inbox.js').Inbox;
var Message         = require('./models/message.js').Message;
var MessageTrigger  = require('./models/triggered-messages.js').MessageTrigger;
var Subscriptions   = require('./models/subscription.js').Subscriptions;
var Subscription    = require('./models/subscription.js').Subscription;
var Feediscovery    = require('./feediscovery.js').Feediscovery;
var Connection      = require('./connection.js').Connection;
var browser         = require('./browsers.js').browser;
var imageExtractor  = require('./image-extractor.js').imageExtractor;

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
var connection = new Connection();
var endpoint = "http://stream.msgboy.com";
var imageExtractor = new imageExtractor();
var feediscovery = new Feediscovery();


// Connects the XMPP Client
// It also includes a timeout that tries to reconnect when we could not connect in less than 1 minute.
var connect = function () {
    var password = Msgboy.inbox.attributes.password;
    var jid = Msgboy.inbox.attributes.jid
    connection.connect(endpoint, jid, password);
};
exports.connect = connect;

// Shows a popup notification
var notify = function (message, popup) {
    // Open a notification window if needed!
    if ((!currentNotification || !currentNotification.ready) && popup) {
        if(!currentNotification) {
            // there is no window.
            currentNotification = window.webkitNotifications.createHTMLNotification(browser.getUrl('/data/html/notification.html'));
            currentNotification.ready = false;
            currentNotification.onclose = function () {
                currentNotification = null;
            };
        }
        currentNotification.show();
        messageStack.push(message);
    }
    else {
        browser.emit("notify", message);
    }
};
exports.notify = notify;

// Subscribes to a feed.
var subscribe = function (url, doDiscovery, force, callback) {
    // First, let's check if we need to perform discovery on that. 
    if(doDiscovery) {
        // Well let's do disco and then recurse!
        feediscovery.get(url, function (links) {
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
                    connection.subscribe(url, function (result, feed) {
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
            connection.unsubscribe(url, function (result) {
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
  // And let's check the regular subscriptions.
  var subscriptions = new Subscriptions();
  subscriptions.bind("reset", function (subs) {
    if(subs.length === 0) {
      // No subscriptions! Let's try to find some...
      Msgboy.trigger("resetSubscriptions");
      setTimeout(function () {
        resumeSubscriptions(); // Let's retry in 10 minutes.
        }, 1000 * 60 * 10);
      }
      else {
        // Great, we have subscriptions... Let's just check if some need to be resumed, because they're pending
        // Let's check the pending subscriptions.
        var pending = new Subscriptions();
        pending.bind("add", function (subs) {
          Msgboy.log.debug("subscribing to", subs.id);
          connection.subscribe(subs.id, function (result, feed) {
            Msgboy.log.debug("subscribed to", subs.id);
            subs.setState("subscribed");
          });
        });
        pending.pending();
        setTimeout(function () {
          resumeSubscriptions(); // Let's retry in 10 minutes.
          }, 1000 * 60 * 10);
        }
      });
      // Go fetch them now.
      subscriptions.fetch({
        conditions: {state: "subscribed"},
      });
    };

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

connection.on('ready', function() {
  resumeSubscriptions(); // Let's check the subscriptions and make sure there is nothing to be performed.
});

connection.on('notification', function (notification) {
    Msgboy.log.debug("Notification received " + notification.source.url);
    var message = new Message(notification);
    imageExtractor.extract(message.get('text'), message.get('mainLink'), function(largestImg) {
        var attributes = {};

        if(largestImg) {
            message.set({image: largestImg});
        }

        message.calculateRelevance(function (_relevance) {
            attributes.relevance = _relevance;
            message.create(attributes, {
                success: function() {
                    Msgboy.log.debug("Saved message", message.id);
                    Msgboy.inbox.trigger("messages:added", message);
                }.bind(this),
                error: function(error) {
                    Msgboy.log.debug("Could not save message", error);
                }.bind(this)
            }); 
        }.bind(this));
    }.bind(this));
});

connection.on('status', function(status) {
  browser.emit("status", status);
});

Msgboy.bind("loaded:background", function () {
    Msgboy.inbox = new Inbox();
    Msgboy.connection = connection;
    
    MessageTrigger.observe(Msgboy); // Getting ready for incoming messages
    
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
            browser.isDashboardOpen(function(open) {
                if(!open) {
                    browser.openNewTab({
                        url: browser.getUrl('/data/html/dashboard.html'),
                        selected: true,
                        pinned: true
                    }, function(tab) {
                        // Ok, the msgboy dashboard is open now.
                    });
                }
            });
        }
        
        // Check for migrations?
        if(typeof(Msgboy.inbox.attributes.version) === "undefined" || Msgboy.inbox.attributes.version < 100) {
          // Version 100 requires a switch from XMPP to PubSubHubbub based subscriptions
          var currentSubscriptions = new Subscriptions();

          currentSubscriptions.bind("reset", function (subs) {
            var total = subs.length;
            for(var i = 0; i < subs.length; i++ ) {
              subscribe(subs.models[i].id, false, true, function () {
                  total --;
                  if(total === 0) {
                    Msgboy.inbox.save({
                      version: 100
                    });
                  }
              });
            }
          });
          
          currentSubscriptions.fetch({
              conditions: {state: "subscribed"},
          });
        }
    });
    
    // When the inbox is new.
    Msgboy.inbox.bind("new", function () {
      Msgboy.log.debug("New Inbox");
      Msgboy.trigger("inbox:new"); // Let's indicate all msgboy susbcribers that it's the case!
    });
    
    // When there is no such inbox there.
    Msgboy.inbox.bind("error", function (error) {
        // Ok, no such inbox... So we need to create an account!
        window.open("http://msgboy.com/session/new?ext=" + browser.msgboyId());
    });
    
    // Chrome specific. We want to turn any Chrome API callback into a DOM event. It will greatly improve portability.
    browser.listen(function (_request, _sender, _sendResponse) {
        Msgboy.trigger(_request.signature, _request.params, _sendResponse);
    });

    // Chrome specific. Listens to external requests from other extensions!
    browser.externalListen(function (_request, _sender, _sendResponse) {
        Msgboy.trigger(_request.signature, _request.params, _sendResponse);
    });
    
    // Registers a new user
    Msgboy.bind('register', function (params, _sendResponse) {
        Msgboy.log.debug("request", "register", params.username);
        Msgboy.inbox.bind("new", function() {
            _sendResponse({
                value: true
            });
        });
        Msgboy.inbox.setup(params.username, params.token);
    });

    // Subscribe to a feed.
    Msgboy.bind('subscribe', function (params, _sendResponse) {
        Msgboy.log.debug("request", "subscribe", params.url);
        // We first need to look at params and see if the doDiscovery flag is set. If so, we first need to perform discovery
        subscribe(params.url, params.doDiscovery, params.force || false, function (result) {
            _sendResponse({
                value: result
            });
        });
    });

    // Unsubscribe from a feed.
    Msgboy.bind('unsubscribe', function (params, _sendResponse) {
        Msgboy.log.debug("request", "unsubscribe", params.url);
        unsubscribe(params.url, function (result) {
            _sendResponse({
                value: result
            });
        });
    });

    // Show a notification
    Msgboy.bind('notify', function (params, _sendResponse) {
        Msgboy.log.debug("request", "notify", params);
        notify(params, true);
        // Nothing to do.
    });

    // Notifications are ready to be displayed
    Msgboy.bind('notificationReady', function (params, _sendResponse) {
        Msgboy.log.debug("request", "notificationReady");
        currentNotification.ready = true;
        // We should then start sending all notifications.
        while (messageStack.length > 0) {
            browser.emit("notify", messageStack.pop());
        }
    });

    // Open a new tab.
    Msgboy.bind('tab', function (params, _sendResponse) {
        Msgboy.log.debug("request", "tab", params.url);
        params.url = rewriteOutboundUrl(params.url); // Rewritting the url to add msgboy tracking codes.
        browser.openNewTab(params, function(tab) {
            // tab is open! We need to inject some JS in it so that messages can be voted up and down, as well as shared.
            browser.inject(tab.id, '/lib/clicked.js', function() {
                console.log("Code executed")
            });
        });
    });

    // When reloading the inbox is needed (after a change in settings eg)
    Msgboy.bind('reload', function (params, _sendResponse) {
        Msgboy.log.debug("request", "reload");
        Msgboy.inbox.fetch();
    });

    // When reloading the inbox is needed (after a change in settings eg)
    Msgboy.bind('resetSubscriptions', function (params, _sendResponse) {
        Msgboy.log.debug("request", "resetSubscriptions");
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
    
    // When one of the clients asks for discovery on a feed.
    Msgboy.bind('feediscovery', function(params, _sendResponse) {
      Msgboy.log.debug("request", "feediscovery", params);
      feediscovery.get(params.url, function (links) {
        if(params.checkSubscription && links.length !== 0) {
          
          var done = _.after(links.length, function() {
            _sendResponse(links);
          }.bind(this));

          // For each Link, we need to check if there is a subscription
          _.each(links, function(l){
            var subscription = new Subscription({id: l.href});
            subscription.fetch({
              success: function() {
                if(subscription.get('state') === "subscribed") {
                  l.subscribed = true;
                  done();
                }
                else {
                  l.subscribed = false;
                  done();
                }
              },
              error: function() {
                l.subscribed = false;
                done();
              }
            });
          });
        }
        else {
          _sendResponse(links);
        }
      });
    });

    Msgboy.bind('checkConnection', function(params, _sendResponse) {
      _sendResponse(Msgboy.connection.state);
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

