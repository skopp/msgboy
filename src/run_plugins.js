// Ok. Here, we need to require all the plugins!
var Plugins         = require('./plugins.js').Plugins;

// Runs all the plugins
for (var i = 0; i < Plugins.all.length; i++) {
    var plugin = Plugins.all[i];
    if (plugin.onSubscriptionPage(document)) { // Are we on the plugin's page?
        plugin.hijack(function (feed, done) {
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
