var $ = jQuery = require('jquery');

Disqus = function () {

    this.name = 'Disqus Comments';

    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return (doc.getElementById("disqus_thread"));
    };

    this.hijack = function (follow, unfollow) {
        $("#dsq-post-button").live('click', function (event) {
            follow({
                url: $(".dsq-subscribe-rss a").attr("href"),
                title: document.title + " comments"
            }, function () {
                //Done
            });
        });
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };

};

exports.Disqus = Disqus;