var browser = require('../browsers.js').browser;

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

    this.processNext = function(bookmarks, callback, done, totalFeeds) {
        var bookmark = bookmarks.pop();
        if(bookmark) {
            callback({title: "", url: bookmark.url, doDiscovery: true});
            totalFeeds++;
            this.processNext(bookmarks, callback, done, totalFeeds);
        } else {
            done(totalFeeds);
        }
    };

    this.listSubscriptions = function (callback, done) {
        browser.getRecentBookmarks(1000,
            function (bookmarks) {
                if (bookmarks.length === 0) {
                    done(0);
                }
                else {
                    this.processNext(bookmarks, callback, done, 0);
                }
            }.bind(this)
        );
    };

    this.subscribeInBackground = function (callback) {
        browser.listenToNewBookmark(function (id, bookmark) {
            callback({url: bookmark.url, doDiscovery: true})
        }.bind(this));
    };
};

exports.Bookmarks = Bookmarks;