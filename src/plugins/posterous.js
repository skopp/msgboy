var $ = jQuery = require('jquery');

Posterous = function () {

    this.name = 'Posterous';
    this.hijacked = false;

    this.onSubscriptionPage = function (doc) {
        return (doc.getElementById("pbar") !== null);
    };

    this.hijack = function (follow, unfollow) {
        $("a.pbar_login_form").click(function(evt) {
            follow({
                title: document.title,
                url: window.location.href + "/rss.xml"
            }, function () {
                // done
            });
        });
    };

    this.listSubscriptions = function (callback, done) {
        this.listSubscriptionsPage(1, 0, callback, done);
    };

    this.listSubscriptionsPage = function (page, count, callback, done) {
        var that = this;
        $.get("http://posterous.com/users/me/subscriptions?page=" + page, function (data) {
            content = $(data);
            links = content.find("#subscriptions td.image a");
            links.each(function (index, link) {
                callback({
                    url: $(link).attr("href") + "/rss.xml",
                    title: $(link).attr("title")
                });
                count += 1;
            });
            if (links.length > 0) {
                this.listSubscriptionsPage(page + 1, count, callback, done);
            } else {
                done(count);
            }
        }.bind(this));
    };
};

exports.Posterous = Posterous;