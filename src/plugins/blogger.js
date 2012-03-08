// Blogger

Blogger = function (Plugins) {
    // Let's register
    Plugins.register(this);

    this.name = 'Blogger'; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function (doc) {
        return (doc.location.host === "www.blogger.com" && doc.location.pathname === '/navbar.g');
    };

    this.hijack = function (doc, follow, unfollow) {
        var followLink = doc.getElementById('b-follow-this');
        followLink.addEventListener("click", function() {
            var searchElement = doc.getElementById('searchthis');
            for(var i = 0; i < searchElement.attributes.length; i++ ) {
                var attribute = searchElement.attributes[i];
                if(attribute.name === "action") {
                    follow({
                        title: window.title,
                        url: attribute.nodeValue.replace("search", "feeds/posts/default")
                    }, function () {
                        // Done
                    });
                }
            }
        });
    };

    this.listSubscriptions = function (callback, done) {
        var subscriptionsCount = 0;
        Plugins.httpGet("http://www.blogger.com/manage-blogs-following.g", function (data) {
            var rex = /createSubscriptionInUi\(([\s\S]*?),[\s\S]*?,([\s\S]*?),[\s\S]*?,[\s\S]*?,[\s\S]*?,[\s\S]*?,[\s\S]*?\);/g;
            var match = rex.exec(data);
            while (match) {
                subscriptionsCount += 1;
                callback({
                    url: match[2].replace(/"/g, '').trim() + "feeds/posts/default",
                    title: match[1].replace(/"/g, '').trim()
                });
                match = rex.exec(data);
            }
            done(subscriptionsCount);
        }.bind(this));
    };
};

exports.Blogger = Blogger;
