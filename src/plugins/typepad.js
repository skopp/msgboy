var $ = jQuery = require('jquery');

var Typepad = function () {

    this.name = 'Typepad'; // Name for this plugin. The user will be asked which plugins he wants to use.

    this.onSubscriptionPage = function (doc) {
        return (doc.location.host === "www.typepad.com" && doc.location.pathname === '/services/toolbar');
    };

    this.hijack = function (follow, unfollow) {
        $("#follow-display").click(function () {
            follow({
                title: $.trim($($("#unfollow-display a")[0]).html()) + " on Typepad",
                href : $($("#unfollow-display a")[0]).attr("href") + "/activity/atom.xml"
            }, function () {
                // Done
            });
            return false;
        });
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };
};

exports.Typepad = Typepad;