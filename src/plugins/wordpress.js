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