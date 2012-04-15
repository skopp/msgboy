var Bookmarks = function (Plugins) {
    // Let's register
    Plugins.register(this);

    this.name = 'Browser Bookmarks';

    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return true;
    };

    this.hijack = function (doc, follow, unfollow) {
        // Hum. What?
    };

    this.listSubscriptions = function (callback, done) {
        var totalFeeds = 0;
        chrome.bookmarks.getRecent(1000,
            function (bookmarks) {
                if (bookmarks.length === 0) {
                    done(totalFeeds);
                }
                else {

                    var processNext = function(bookmarks) {
                        var bookmark = bookmarks.pop();
                        if(bookmark) {
                            callback({title: "", url: bookmark.url, doDiscovery: true});
                            totalFeeds++;
                        } else {
                            done(totalFeeds);
                        }
                    };
                    processNext(bookmarks);
                }
            }.bind(this)
        );
    };

    this.subscribeInBackground = function (callback) {
        chrome.bookmarks.onCreated.addListener(function (id, bookmark) {
            Feediscovery.get(bookmark.url, function (links) {
                _.each(links, function (link) {
                    callback(link);
                });
            });
        }.bind(this));
    };
};

exports.Bookmarks = Bookmarks;