var $ = jQuery = require('jquery');

Generic = function () {
    this.name = 'Generic';

    this.onSubscriptionPage = function (doc) {
        return true;
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };

    this.hijack = function (follow, unfollow) {
        // Adds a listen event on all elements
        $(".msgboy-follow").click(function (element) {
            follow({
                title: $(element.currentTarget).attr("data-msgboy-title"),
                url: $(element.currentTarget).attr("data-msgboy-url")
            }, function () {
                // Done
            });
            return false;
        });
    };
};

exports.Generic = Generic;