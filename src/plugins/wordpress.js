var $ = jQuery = require('jquery');

var Wordpress = function () {

    this.name = 'Wordpress'; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function (doc) {
        return (doc.getElementById("wpadminbar"));
    };

    this.hijack = function (follow, unfollow) {
        $('#wp-admin-bar-follow').live('click', function (event) {
            follow({
                title: $('#wp-admin-bar-blog a.ab-item').text(),
                url: $('#wp-admin-bar-blog a.ab-item').attr('href') + "feed"
            }, function () {
                // Done
            });
        });
    };

    this.listSubscriptions = function (callback, done) {
        // Looks like WP doesn't allow us to export the list of followed blogs. Boooh.
        done(0);
    };
};

exports.Wordpress = Wordpress;