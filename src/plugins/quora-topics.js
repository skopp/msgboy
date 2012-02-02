QuoraTopics = function () {

    this.name = 'Quora Topics';

    this.onSubscriptionPage = function () {
        return (window.location.host === "www.quora.com");
    };

    this.hijack = function (follow, unfollow) {
        $(".topic_follow.follow_button").not(".unfollow_button").click(function (event) {
            url = "";
            title = "";
            if ($(event.target).parent().parent().find(".topic_name").length > 0) {
                link = $(event.target).parent().parent().find(".topic_name")[0];
                url = "http://www.quora.com" + ($(link).attr("href")) + "/rss";
                title = $($(link).children()[0]).html() + " on Quora";
            }
            else {
                title = document.title;
                url = window.location.href + "/rss";
            }
            follow({
                url: url,
                title: title
            }, function () {
                // Done
            });
        });
    };

    this.listSubscriptions = function (callback, done) {
        callback([]); // We're not able to list all subscriptions
        done(0);
    };
};

exports.QuoraTopics = QuoraTopics;