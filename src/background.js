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
        Msgboy.log.debug("Inbox ready");
        Msgboy.connect(Msgboy.inbox);
    });

    // When the inbox is new.
    Msgboy.inbox.bind("new", function () {
        Msgboy.log.debug("New Inbox");
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
    
    Msgboy.inbox.bind("error", function (error) {
        console.log(error);
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
