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
        this.listSubscriptionsPage(0, 0, callback, done);
    };

    this.listSubscriptionsPage = function (page, subscriptions, callback, done) {
        Plugins.httpGet("http://www.tumblr.com/following/" + page, function(data) {
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
            
            if (links.length >= 25) {
                this.listSubscriptionsPage(page + links.length, subscriptions, callback, done);
            } else {
                done(subscriptions);
            }
        }.bind(this));
    };
};

exports.Tumblr = Tumblr;