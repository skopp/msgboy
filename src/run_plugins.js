// Ok. Here, we need to require all the plugins!
var Plugins         = require('./plugins.js').Plugins;
var browser         = require('./browsers.js').browser;
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
            browser.emit("subscribe", feed, done);
        }, function (feed, done) {
            // Unfollow?
            // We should first check whether the user is subscribed, and if he is, then, ask whether he wants to unsubscribe from here as well.
            done();
        });
    }
}
