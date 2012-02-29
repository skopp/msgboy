// Blogger
var $ = jQuery = require('jquery');

Blogger = function () {

    this.name = 'Blogger'; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function (doc) {
        return (doc.location.host === "www.blogger.com" && doc.location.pathname === '/navbar.g');
    };

    this.hijack = function (follow, unfollow) {
        $('a#b-follow-this').click(function (event) {
            follow({
                title: "",
                url: $("#searchthis").attr("action").replace("search", "feeds/posts/default")
            }, function () {
                // Done
            });
        });
    };

    this.listSubscriptions = function (callback, done) {
        var subscriptionsCount = 0;
        $.get("http://www.blogger.com/manage-blogs-following.g", function (data) {
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
