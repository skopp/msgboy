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


    this.importable = true;
    this.logurl = "http://wordpress.com/wp-admin/";

    this.listSubscriptions = function (callback, done) {
      var subscriptions = 0;
      Plugins.httpGet(this.logurl + 'admin-ajax.php?action=wpcom_load_template&template=reader%2Fedit-following.php', function(data) {
        var fragment = Plugins.buildFragmentDocument(data);
        var links = fragment.querySelectorAll(".blogurl");
        for(var i = 0; i < links.length; i++) {
            var link = links[i];
            callback({
                url: link.getAttribute("href") + "?feed=atom",
                alternate: link.getAttribute("href"),
                title: link.innerText
            });
            subscriptions += 1;
        }
        done(subscriptions);
      });
    };
};

exports.Wordpress = Wordpress;
