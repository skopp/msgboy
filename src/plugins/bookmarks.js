var Feediscovery = require('../feediscovery.js').Feediscovery;

var Bookmarks = function () {

    this.name = 'Browser Bookmarks';

    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return true;
    };

    this.hijack = function (follow, unfollow) {
        // Hum. What?
    };

    this.listSubscriptions = function (callback, done) {
        done();
        var seen = [];
        var total_feeds = 0;
        chrome.bookmarks.getRecent(1000,
            function (bookmarks) {
                var done_once = _.after(bookmarks.length, function () {
                    // We have processed all the bookmarks
                    done(total_feeds);
                });
                if (bookmarks.length === 0) {
                    done(total_feeds);
                }
                _.each(bookmarks, function (bookmark) {
                    Feediscovery.get(bookmark.url, function (links) {
                        var feeds = [];
                        _.each(links, function (link) {
                            total_feeds++;
                            if (seen.indexOf(link.href) === -1) {
                                feeds.push({title: link.title, url: link.href});
                                seen.push(link.href);
                            }
                        });
                        if (feeds.length > 0) {
                            callback(feeds);
                        }
                        done_once();
                    });
                });
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