var Msgboy = require('./msgboy.js').Msgboy

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

var Blogger = require('./plugins/blogger.js').Blogger;
Plugins.register(new Blogger());

var Bookmarks = require('./plugins/bookmarks.js').Bookmarks;
Plugins.register(new Bookmarks());

var Digg = require('./plugins/digg.js').Digg;
Plugins.register(new Digg());

var Disqus = require('./plugins/disqus.js').Disqus;
Plugins.register(new Disqus());

var Generic = require('./plugins/generic.js').Generic;
Plugins.register(new Generic());

var GoogleReader = require('./plugins/google-reader.js').GoogleReader;
Plugins.register(new GoogleReader());

var History = require('./plugins/history.js').History;
Plugins.register(new History());

var Posterous = require('./plugins/posterous.js').Posterous;
Plugins.register(new Posterous());

var QuoraPeople = require('./plugins/quora-people.js').QuoraPeople;
Plugins.register(new QuoraPeople());

var QuoraTopics = require('./plugins/quora-topics.js').QuoraTopics;
Plugins.register(new QuoraTopics());

var Statusnet = require('./plugins/statusnet.js').Statusnet;
Plugins.register(new Statusnet());

var Tumblr = require('./plugins/tumblr.js').Tumblr;
Plugins.register(new Tumblr());

var Typepad = require('./plugins/typepad.js').Typepad;
Plugins.register(new Typepad());

var Wordpress = require('./plugins/wordpress.js').Wordpress;
Plugins.register(new Wordpress());

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
