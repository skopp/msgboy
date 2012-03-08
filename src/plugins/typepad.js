var Typepad = function (Plugins) {
    // Let's register
    Plugins.register(this);
    

    this.name = 'Typepad'; // Name for this plugin. The user will be asked which plugins he wants to use.

    this.onSubscriptionPage = function (doc) {
        return (doc.location.host === "www.typepad.com" && doc.location.pathname === '/services/toolbar') || doc.location.host === "profile.typepad.com";
    };

    this.hijack = function (doc, follow, unfollow) {
        var followDisplay = doc.getElementById('follow-display');
        followDisplay.addEventListener("click", function() {
            var profileLink = doc.querySelectorAll("#unfollow-display a")[0];
            follow({
                title: "",
                url: profileLink.getAttribute("href") + "/activity/atom.xml"
            }, function () {
                // Done
            });
        });
        
        var followAction = doc.getElementById('follow-action');
        followAction.addEventListener("click", function() {
            var feedLink = Plugins.getFeedLinkInDocWith(doc, "application/atom+xml");
            follow({
                title: feedLink.getAttribute('title'),
                url: feedLink.getAttribute('href')
            }, function() {
                // Done!
            });
        });
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };
};

exports.Typepad = Typepad;