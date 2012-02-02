Disqus = function () {

    this.name = 'Disqus Comments';

    this.onSubscriptionPage = function () {
        // This method returns true if the plugin needs to be applied on this page.
        return (document.getElementById("disqus_thread"));
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
        callback([]); // We're not able to list all subscriptions
        done(0);
    };

};

exports.Disqus = Disqus;