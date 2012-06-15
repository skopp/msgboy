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
      var subscriptions = 0;
      Plugins.httpGet('http://wordpress.com/wp-admin/admin-ajax.php?action=wpcom_load_template&template=subscriptions.manage.blogs', function(data) {
        var fragment = Plugins.buildFragmentDocument(JSON.parse(data).content);
        var links = fragment.querySelectorAll(".blogurl");
        for(var i = 0; i < links.length; i++) {
            var link = links[i];
            callback({
                url: link.getAttribute("href") + "?feed=atom",
                title: link.innerText
            });
            subscriptions += 1;
        }
        done(subscriptions);
        
      });
    };
};

exports.Wordpress = Wordpress;