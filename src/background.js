var $ = jQuery      = require('jquery');
var Strophe         = require('./strophejs/core.js').Strophe
var SuperfeedrPlugin= require('./strophejs/strophe.superfeedr.js').SuperfeedrPlugin
Strophe.addConnectionPlugin('superfeedr',SuperfeedrPlugin);
var Msgboy          = require('./msgboy.js').Msgboy;
var Plugins         = require('./plugins.js').Plugins;
var Inbox           = require('./models/inbox.js').Inbox;
var Message         = require('./models/message.js').Message;
var WelcomeMessages = require('./models/message.js').WelcomeMessages;

Msgboy.bind("loaded", function () {
    Msgboy.inbox = new Inbox();
    
    Msgboy.connection = new Strophe.Connection({
        protocol: new Strophe.Websocket('ws://msgboy.com:5280')
    });
    
    // When a new message was added to the inbox
    Msgboy.inbox.bind("messages:added", function (message) {
        if (message.attributes.relevance >= Msgboy.inbox.attributes.options.relevance) {
            Msgboy.log.debug("Showing message : " + message.attributes.id + " (" + message.attributes.relevance + " >= " + Msgboy.inbox.attributes.options.relevance + ") ");
            Msgboy.notify(message.toJSON());
        } else {
            Msgboy.log.debug("Not showing message : " + message.attributes.id + " (" + message.attributes.relevance + " < " + Msgboy.inbox.attributes.options.relevance + ") ");
        }
    });

    // When the inbox is ready
    Msgboy.inbox.bind("ready", function () {
        Msgboy.log.debug("Inbox ready");
        Msgboy.connect(Msgboy.inbox);
    });

    // When the inbox is new.
    Msgboy.inbox.bind("new", function () {
        Msgboy.log.debug("New Inbox");
        // Add a couple boxes for the example!
        for(var i in WelcomeMessages) {
            var msg = new Message(WelcomeMessages[i]);
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
        
        Msgboy.bind("connected", function(){
            // And import all plugins.
            Plugins.importSubscriptions(function (subs) {
                Msgboy.subscribe(subs.url, function () {
                    // Cool. Not much to do.
                });
            });
        });
    });
    
    // When there is no such inbox there.
    Msgboy.inbox.bind("error", function (error) {
        // Ok, no such inbox... So we need to create an account!
        window.open("http://msgboy.com/session/new?ext=" + chrome.i18n.getMessage("@@extension_id"));
    });
    
    // Triggered when connected
    Msgboy.bind("connected", function(){
        Msgboy.resumeSubscriptions(); // Let's check the subscriptions and make sure there is nothing to be performed.
    });
    
    // When a new notification was received from XMPP line.
    $(document).bind('notification_received', function (ev, notification) {
        Msgboy.log.debug("Notification received from " + notification.source.url);
        var msg = Msgboy.connection.superfeedr.convertAtomToJson(notification.payload);
        msg.source = notification.source;
        msg.feed = notification.source.url;
        // Let's try to extract the image for this message.
        // We should extract the largest image from the content, if possible... then, attach it as msg.image. This way we won't have to look up for it later.
        
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

    Msgboy.bind('subscribe', function (params, _sendResponse) {
        Msgboy.log.debug("request", "subscribe", params.url);
        Msgboy.subscribe(params.url, params.force || false, function (result) {
            _sendResponse({
                value: result
            });
        });
    });

    Msgboy.bind('unsubscribe', function (params, _sendResponse) {
        Msgboy.log.debug("request", "unsubscribe", params.url);
        Msgboy.unsubscribe(params.url, function (result) {
            _sendResponse({
                value: result
            });
        });
    });

    Msgboy.bind('notify', function (params, _sendResponse) {
        Msgboy.log.debug("request", "notify", params);
        Msgboy.notify(params);
        // Nothing to do.
    });

    Msgboy.bind('notificationReady', function (params, _sendResponse) {
        Msgboy.log.debug("request", "notificationReady");
        Msgboy.currentNotification.ready = true;
        // We should then start sending all notifications.
        while (Msgboy.messageStack.length > 0) {
            chrome.extension.sendRequest({
                signature:"notify",
                params: Msgboy.messageStack.pop()
            }, function (response) {
                // Nothing to do.
            });
        }
    });

    Msgboy.bind('tab', function (params, _sendResponse) {
        Msgboy.log.debug("request", "tab", params.url);
        var active_window = null;
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

    Msgboy.bind('close', function (params, _sendResponse) {
        Msgboy.log.debug("request", "close");
        Msgboy.currentNotification = null;
        _sendResponse({
            value: true
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
            Msgboy.subscribe(subs.url, false, function () {
                // Cool. Not much to do.
            });
        });
    });

    // When reloading the inbox is needed (after a change in settings eg)
    Msgboy.bind('debug', function (params, _sendResponse) {
        Msgboy.log.debug("request", "debug", object);
    });
    
    // Plugins management for those who use the Chrome API to subscribe in background.
    $.each(Plugins.all, function (index, plugin) {
        if (typeof (plugin.subscribeInBackground) != "undefined") {
            plugin.subscribeInBackground(function (feed) {
                Msgboy.trigger('subscribe', {request: {params: {url: feed.href}}});
            });
        }
    });
    
    // Let's go.
    Msgboy.inbox.fetchAndPrepare();
});

// Main!
Msgboy.run();
