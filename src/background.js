var Url             = require('url');
var QueryString     = require('querystring');
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
                  Msgboy.trigger("subscription:new");
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

// Makes sure there is no 'pending' susbcriptions.
var resumeSubscriptions = function () {
  // Great, we have subscriptions... Let's just check if some need to be resumed, because they're pending
  // Let's check the pending subscriptions.
  var pendingSubs = new Subscriptions();
  pendingSubs.bind("add", function (subs) {
    Msgboy.log.debug("subscribing to", subs.id);
    connection.subscribe(subs.id, function (result, feed) {
      Msgboy.log.debug("subscribed to", subs.id);
      subs.setState("subscribed");
    });
  });
  pendingSubs.pendingSubscriptions();

  var pendingUnsubs = new Subscriptions();
  pendingUnsubs.bind("add", function (subs) {
    Msgboy.log.debug("unsubscribing from", subs.id);
    connection.unsubscribe(subs.id, function (result, feed) {
      Msgboy.log.debug("unsubscribed from", subs.id);
      subs.setState("unsubscribed");
    });
  });
  pendingUnsubs.pendingUnsubscriptions();

  setTimeout(function () {
    resumeSubscriptions(); // Let's retry in 10 minutes.
  }, 1000 * 60 * 10);
};

// Rewrites URL and adds tacking code. This will be useful for publishers who use Google Analytics to measure their traffic.
var rewriteOutboundUrl = function(url) {
  var parsed = Url.parse(url);
  parsed.href = parsed.search = "";
  var qs = QueryString.parse(parsed.query);
  qs.utm_source = 'msgboy';
  qs.utm_medium = 'feed';
  qs.utm_campaign = qs.utm_campaign || 'msgboy';
  parsed.query = qs;
  return Url.format(parsed);
};

var askForSubscription = function(feed, source) {
  var m = {
    "id": "tag:msgboy.com,2012:suggest-subscribe-" + feed.href + "-" + new Date().getTime(),
    "ungroup": true,
    "content": null,
    "mainLink": "http://google.com",
    "createdAt": new Date().getTime(),
    "source": {
      "title": "Msgboy Tips",
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
    "sourceHost": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.5,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
  };
  if(typeof(source.title) !== 'undefined' && source.title && source.title !== "") {
    m.title = "Do you want to subscribe to " + feed.title + ' from ' + source.title + '?';
    m.mainLink = '/data/html/subscribe.html?url=' + encodeURI(feed.href) + '&title=' + encodeURI(feed.title + " from " + source.title);
  }
  else {
    m.title = "Do you want to subscribe to " + feed.title + '?';
    m.mainLink = '/data/html/subscribe.html?url=' + encodeURI(feed.href) + '&title=' + encodeURI(feed.title);
  }
  var msg = new Message(m);
  msg.create({}, {
    success: function () {
      Msgboy.log.debug("Saved message " + msg.id);
        notify(msg.toJSON(), true); // We want to show the popup anyway!
      }.bind(this),
      error: function (object, error) {
      }.bind(this)
    });
}

connection.on('ready', function() {
  resumeSubscriptions(); // Let's check the subscriptions and make sure there is nothing to be performed.
});

connection.on('resubscribe', function (notification) {
  Msgboy.log.debug("Server asks that we resubscribe.");
  var subscriptions = new Subscriptions();
  subscriptions.bind('reset', function() {
    subscriptions.each(function(subscription) {
      subscription.setState("subscribing");
      subscription.bind("subscribing", function () {
        Msgboy.log.debug("subscribing to", subscription.id);
        connection.subscribe(subscription.id, function (result, feed) {
          Msgboy.log.debug("subscribed to", subscription.id);
          subscription.setState("subscribed");
        });
      });
    });
  });
  subscriptions.fetch( {
    conditions: {state: "subscribed"},
  });
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
  browser.emit('status', status);
});

Msgboy.bind("loaded:background", function () {
  Msgboy.inbox = new Inbox();
  Msgboy.connection = connection;

  MessageTrigger.observe(Msgboy);

  Msgboy.inbox.bind("messages:added", function (message) {
    notify(message.toJSON(), message.attributes.relevance >= Msgboy.inbox.attributes.options.relevance);
  });

  Msgboy.inbox.bind("ready", function () {
    Msgboy.trigger("inbox:ready");
    Msgboy.log.debug("Inbox ready");
    connect(Msgboy.inbox);
    if(Msgboy.inbox.attributes.options.pinMsgboy) {
      browser.isDashboardOpen(function(open) {
        if(!open) {
          browser.openNewTab({
            url: browser.getUrl('/data/html/dashboard.html'),
            selected: true,
            pinned: true
          }, function(tab) {
          });
        }
      });
    }
  });

  Msgboy.inbox.bind("new", function () {
    Msgboy.log.debug("New Inbox");
    Msgboy.trigger("inbox:new");
  });

  Msgboy.inbox.bind("error", function (error) {
    window.open("http://stream.msgboy.com/session/new?ext=" + browser.msgboyId());
  });

  browser.listen(function (_request, _sender, _sendResponse) {
    Msgboy.trigger(_request.signature, _request.params, _sendResponse);
  });

  browser.externalListen(function (_request, _sender, _sendResponse) {
    Msgboy.trigger(_request.signature, _request.params, _sendResponse);
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

  Msgboy.bind('askSubscribe', function (params, _sendResponse) {
    Msgboy.log.debug("request", "askSubscribe", params.url);
    feediscovery.get(params.url, function (links) {
      links.forEach(function(l) {
        var subscription = new Subscription({id: l.href});
        subscription.fetchOrCreate(function() {
          if(subscription.get('state') === 'unsubscribed' && subscription.needsRefresh()) {
            subscription.setState('unsubscribed');
            askForSubscription(l, params);
          }
        });
      });
    });
  });

  Msgboy.bind('subscribe', function (params, _sendResponse) {
    Msgboy.log.debug("request", "subscribe", params.url);
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
  });

  Msgboy.bind('notificationReady', function (params, _sendResponse) {
    Msgboy.log.debug("request", "notificationReady");
    currentNotification.ready = true;
    while (messageStack.length > 0) {
      browser.emit("notify", messageStack.pop());
    }
  });

  Msgboy.bind('tab', function (params, _sendResponse) {
    Msgboy.log.debug("request", "tab", params.url);
    params.url = rewriteOutboundUrl(params.url);
    browser.openNewTab(params, function(tab) {
      // tab is open! We need to inject some JS in it so that messages can be voted up and down, as well as shared.
      // browser.inject(tab.id, '/lib/clicked.js', function() {
      //   console.log("Code executed")
      // });
    });
  });

  Msgboy.bind('reload', function (params, _sendResponse) {
    Msgboy.log.debug("request", "reload");
    Msgboy.inbox.fetch();
  });

  Msgboy.bind('feediscovery', function(params, _sendResponse) {
    Msgboy.log.debug("request", "feediscovery", params);
    feediscovery.get(params.url, function (links) {
      if(params.checkSubscription && links.length !== 0) {

        var done = _.after(links.length, function() {
          _sendResponse(links);
        }.bind(this));

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

  Msgboy.bind('ping', function(params, _sendResponse) {
    Msgboy.connection.ping(function(res) {
      _sendResponse(res);
    });
  });

  for(var j = 0; j < Plugins.all.length; j++) {
    var plugin = Plugins.all[j];
    if (typeof (plugin.subscribeInBackground) != "undefined") {
      plugin.subscribeInBackground(function (subscription) {
        Msgboy.trigger('askSubscribe', subscription);
      });
    }
  }

  Msgboy.inbox.fetchAndPrepare();

  // Loading the subtomeframe registration
  var parsedUri = Url.parse(window.location.href);
  parsedUri.pathname = '/data/html/subscribe.html';
  parsedUri.href= '';
  var iframe = document.createElement('iframe');
  var iframeUrl = Url.format({
    protocol: 'http',
    host: 'www.subtome.com',
    pathname: '/register.html',
    query: {
      name: 'Msgboy',
      url: Url.format(parsedUri) + '?url={url}'
    }
  });
  iframe.setAttribute('src', iframeUrl);
  document.getElementsByTagName('body')[0].appendChild(iframe);
});



