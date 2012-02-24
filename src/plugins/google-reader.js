var $ = jQuery = require('jquery');

GoogleReader = function () {

    this.name = 'Google Reader'; // Name for this plugin. The user will be asked which plugins he wants to use.

    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return (doc.location.host === "www.google.com" && doc.location.pathname === '/reader/view/');
    };

    this.hijack = function (follow, unfollow) {
        // This methods hijacks the susbcription action on the specific website for this plugin.
        var submitted = function () {
            follow({
                url: $("#quickadd").val(),
                title: $("#quickadd").val()
            }, function () {
                // Done
            });
        };
        $("#quick-add-form .goog-button-body").click(submitted);
        $("#quick-add-form").submit(submitted);
    };

    this.listSubscriptions = function (callback, done) {
        var feedCount = 0;
        $.get("http://www.google.com/reader/subscriptions/export", function (data) {
            var subscriptions = [];
            urls = $(data).find("outline").each(function () {
                feedCount += 1;
                callback({
                    url:  $(this).attr("xmlUrl"),
                    title: $(this).attr("title")
                });
            });
            done(feedCount);
        });
    };
};

exports.GoogleReader = GoogleReader;