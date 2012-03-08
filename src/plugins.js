var Plugins = {
    all: [],

    register: function (plugin) {
        this.all.push(plugin);
    },
    
    importSubscriptions: function (callback, doneOne, doneAll) {
        var subscriptionsCount = 0;
        
        var processNextPlugin = function(plugins, idx) {
            var plugin = plugins[idx];
            if(plugin) {
                plugin.listSubscriptions(function (subscription) {
                    callback({
                        url: subscription.url,
                        title: subscription.title
                    });
                }, function (count) {
                    doneOne(plugin, count);
                    subscriptionsCount += count;
                    processNextPlugin(plugins, idx + 1);
                });
            }
            else {
                doneAll(subscriptionsCount, idx + 1);
            }
        };

        processNextPlugin(Plugins.all, 0);
    },
    
    httpGet: function(url, success, error) {
        // this is an implementation of Jquery's get $.get, because we don't want to use jquery just for it.
        var client = new XMLHttpRequest(); 
        client.onreadystatechange = function() {
            if(this.readyState == this.DONE) {
                success(client.responseText);
            }
        };
        client.open("GET", url, true); // Open up the connection
        client.send( null ); // Send the request
    },
    
    hasClass: function (elem, selector) {
        var className = " " + selector + " ";
        if ((" " + elem.className + " ").indexOf(className) > -1) {
            return true;
        }
        return false;
    },
    
    getFeedLinkInDocWith: function(doc, mimeType) {
        var links = doc.getElementsByTagName("link");
        for(var i = 0; i < links.length; i++) {
            var link = links[i];
            if(link.getAttribute("rel") === "alternate" && link.getAttribute("type") === mimeType) {
                return link;
            }
        }
        return null;
    },
    
    buildFragmentDocument: function(str) {
        var fragment = document.createDocumentFragment();
        var div = document.createElement('div');
        div.innerHTML = str;
        
        for (var i=0; i < div.childNodes.length; i++) {
          var node = div.childNodes[i].cloneNode(true);
          fragment.appendChild(node);
        };
        return fragment
    }
};

exports.Plugins = Plugins;

// This is the skeleton for the Plugins
var Plugin = function () {
    this.name = ''; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function (doc) {
        // This method needs to returns true if the plugin needs to be applied on this page.
    };

    this.listSubscriptions = function (callback, done) {
        // This methods will callback with all the subscriptions in this service. It can call the callback several times with more feeds.
        // Feeds have the following form {url: _, title: _}.
        done(0);
    };

    this.hijack = function (doc, follow, unfollow) {
        // This method will add a callback that hijack a website subscription (or follow, or equivalent) so that msgboy also mirrors this subscription.
        // So actually, we should ask the user if it's fine to subscribe to the feed, and if so, well, that's good, then we will subscribe.
    };

    this.subscribeInBackground = function (callback) {
        // The callback needs to be called with a feed object {url: _, title: _}
        // this function is called from the background and used to define a "chrome-wide" callback. It should probably not be used by any plugin specific to a 3rd pary site, but for plugins like History and/or Bookmarks
    };
};
