QuoraPeople = function () {

    this.name = 'Quora People';

    this.onSubscriptionPage = function (doc) {
        return (window.location.host === "www.quora.com");
    };

    this.hijack = function (follow, unfollow) {
        $(".follow_button").not(".unfollow_button").not(".topic_follow").click(function (event) {
            if ($.trim($(event.target).html()) !== "Follow Question") {
                // This is must a button on a user's page. Which we want to follow
                follow({
                    title: document.title,
                    url: window.location.href + "/rss"
                });
            }
        });
    };

    this.listSubscriptions = function (callback, done) {
        callback([]); // We're not able to list all subscriptions
        done(0);
    };

};

exports.QuoraPeople = QuoraPeople;