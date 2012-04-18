GoogleReader = function (Plugins) {
    // Let's register
    Plugins.register(this);
    
    this.name = 'Google Reader'; // Name for this plugin. The user will be asked which plugins he wants to use.

    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return (doc.location.host === "www.google.com" && doc.location.pathname === '/reader/view/');
    };

    this.hijack = function (doc, follow, unfollow) {
        // This methods hijacks the susbcription action on the specific website for this plugin.
        var submitted = function () {
            var quickadd = doc.getElementById("quickadd");
            follow({
                url: quickadd.value,
                title: quickadd.value,
                doDiscovery: true
            }, function () {
                // Done
            });
        };
        var form = doc.getElementById('quick-add-form');
        form.addEventListener('submit', submitted);
        
        var addButton = doc.querySelectorAll('#quick-add-form .goog-button-body')[0];
        addButton.addEventListener('click', submitted);
    };

    this.listSubscriptions = function (callback, done) {
        var feedCount = 0;
        Plugins.httpGet("http://www.google.com/reader/subscriptions/export", function(data) {
            // That was successful!
            var fragment = Plugins.buildFragmentDocument(data);
            var outlines = fragment.querySelectorAll("outline");
            for(var i = 0; i < outlines.length; i++) {
                var line = outlines[i];
                feedCount += 1;
                callback({
                    url:  line.getAttribute("xmlUrl"),
                    title: line.getAttribute("title")
                });
            }
            done(feedCount);
        }, function() {
            // That was a fail :()
        });
    };
};

exports.GoogleReader = GoogleReader;