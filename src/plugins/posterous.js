
Posterous = function (Plugins) {
    // Let's register
    Plugins.register(this);


    this.name = 'Posterous';
    this.hijacked = false;

    this.onSubscriptionPage = function (doc) {
        return (doc.getElementById("pbar") !== null);
    };

    this.hijack = function (doc, follow, unfollow) {
        var found = false;
        var followElem = null;
        doc.addEventListener('DOMNodeInserted', function(evt) {
            followElem = doc.querySelectorAll("a.pbar_login_form")[0];
            if(followElem && !found) {
                found = true;
                followElem.addEventListener('click', function(event) {
                    var feedLink = Plugins.getFeedLinkInDocWith(doc, "application/rss+xml");
                    follow({
                        title: doc.title,
                        url: feedLink.getAttribute('href')
                    }, function() {
                        // Done!
                    });
                });
            }
        });
    };

    this.importable = true;
    this.logurl = "http://posterous.com/users/me/subscriptions";

    this.listSubscriptions = function (callback, done) {
        this.listSubscriptionsPage(1, 0, callback, done);
    };

    this.listSubscriptionsPage = function (page, count, callback, done) {
        var that = this;

        Plugins.httpGet(this.logurl + "?page=" + page, function(data) {
            // That was successful!
            var fragment = Plugins.buildFragmentDocument(data);
            var links = fragment.querySelectorAll("#subscriptions td.image a");
            for(var i = 0; i< links.length; i++) {
                var link = links[i];
                callback({
                    url: link.getAttribute("href") + "/rss.xml",
                    alternate: link.getAttribute("href"),
                    title: link.getAttribute("title")
                });
                count += 1;
            }
            if (links.length > 0) {
                this.listSubscriptionsPage(page + 1, count, callback, done);
            } else {
                done(count);
            }
        }.bind(this));
    };
};

exports.Posterous = Posterous;
