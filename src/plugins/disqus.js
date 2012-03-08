Disqus = function (Plugins) {
    // Let's register
    Plugins.register(this);

    this.name = 'Disqus Comments';

    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return (doc.getElementById("disqus_thread"));
    };

    this.hijack = function (doc, follow, unfollow) {
        doc.addEventListener("click", function(event) {
            if(Plugins.hasClass(event.target,  "dsq-button")) {
                var feedElem = document.querySelectorAll(".dsq-subscribe-rss")[0];
                follow({
                    url: feedElem.getAttribute("href"),
                    title: document.title + " comments"
                }, function () {
                    //Done
                });
            }
        });
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };

};

exports.Disqus = Disqus;