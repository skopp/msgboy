var $ = jQuery = require('jquery');

var Wordpress = function () {

    this.name = 'Wordpress'; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function () {
        return (document.getElementById("wpadminbar"));
    };

    this.hijack = function (follow, unfollow) {
        $('admin-bar-follow-link').live('click', function (event) {
            follow({
                title: $('#wp-admin-bar-blog a.ab-item').text(),
                url: $('#wp-admin-bar-blog a.ab-item').attr('href') + "/feed"
            }, function () {
                // Done
            });
        });
    };

    this.listSubscriptions = function (callback, done) {
        $.get("http://wordpress.com/#!/read/edit/", function (data) {
            content = $(data);
            links = content.find("a.blogurl");
            var count = 0;
            links.each(function (index, link) {
                count += 1;
                callback({
                    url: $(link).attr("href") + "/feed",
                    title: $(link).text()
                });
            });
            done(count);
        });
    };
};

exports.Wordpress = Wordpress;