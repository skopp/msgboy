

Statusnet = function (Plugins) {
    // Let's register
    Plugins.register(this);
    

    this.name = 'Status.net'; // Name for this plugin. The user will be asked which plugins he wants to use.

    this.onSubscriptionPage = function (doc) {
        // This method needs to returns true if the plugin needs to be applied on this page.
        return (doc.getElementById("showstream") || false);
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };

    this.hijack = function (doc, follow, unfollow) {
        var form = null,
            addButton = null;
        
        var submitted = function () {
            followElem.addEventListener('click', function(event) {
                var feedLink = Plugins.getFeedLinkInDocWith(doc, "application/rss+xml");
                follow({
                    title: doc.title,
                    url: feedLink.getAttribute('href')
                }, function() {
                    // Done!
                });
            });
        };
        
        doc.addEventListener('DOMNodeInserted', function(evt) {
            form = doc.getElementById('form_ostatus_connect');
            addButton = doc.querySelectorAll('#form_ostatus_connect .submit_dialogbox')[0];            
            if(form) {
                form.addEventListener('submit', submitted);
            }
            if(addButton) {
                addButton.addEventListener('click', submitted);
            }
        });

    };
};

exports.Statusnet = Statusnet;