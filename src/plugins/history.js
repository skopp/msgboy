var Feediscovery = require('../feediscovery.js').Feediscovery;
var Maths = require("../maths.js").Maths;

var History = function (Plugins) {
    // Let's register
    Plugins.register(this);
    
    this.name = 'Browsing History';
    this.visitsToBePopular = 3;
    this.deviation = 1;
    this.elapsed = 1000 * 60 * 60 * 3;
    this.onSubscriptionPage = function (doc) {
        // This method returns true if the plugin needs to be applied on this page.
        return true;
    };
    this.hijack = function (doc, follow, unfollow) {
        // Hum. Nothing to do as we can't use the chrome.* apis from content scripts
    };
    this.listSubscriptions = function (callback, done) {
        var seen = [];
        var totalFeeds = 0;

        chrome.history.search({
            'text': '',
            // Return every history item....
            'startTime': ((new Date()).getTime() - 1000 * 60 * 60 * 24 * 15),
            // that was accessed less than 15 days ago, up to 10000 pages.
            'maxResults': 10000
        }, function (historyItems) {
            if (historyItems.length === 0) {
                done(0);
            }
            
            // Synchrounous 
            var processNext = function(items) {
                var item = items.pop();
                if(item) {
                    if (item.visitCount > this.visitsToBePopular) {
                        this.visitsRegularly(item.url, function (result) {
                            if (result) {
                                Feediscovery.get(item.url, function (links) {
                                    for(var i = 0; i < links.length; i++) {
                                        var link = links[i];
                                        if (seen.indexOf(link.href) === -1) {
                                            totalFeeds++;
                                            callback({title: link.title || "", url: link.href});
                                            seen.push(link.href);
                                        }
                                    }
                                    processNext(items);
                                });
                            }
                            else {
                                processNext(items); // Not visited regularly.
                            }
                        });
                    }
                    else {
                        processNext(items); // Not visited often enough
                    }
                }
                else {
                    done(totalFeeds);
                }
            }.bind(this);
            // Let's go.
            processNext(historyItems);
        }.bind(this));
    };
    this.visitsRegularly = function (url, callback) {
        chrome.history.getVisits({url: url}, function (visits) {
            var visitTimes = new Array();
            for(var j = 0; j < visits.length; j++) {
                visitTimes.push(visits[j].visitTime);
            }
            visitTimes = visitTimes.slice(-10);
            var diffs = [];
            for (var i = 0; i < visitTimes.length - 1; i++) {
                diffs[i] =  visitTimes[i + 1] - visitTimes[i];
            }
            
            // Check the regularity and if it is regular + within a certain timeframe, then, we validate.
            if (Maths.normalizedDeviation(diffs) < this.deviation && (visitTimes.slice(-1)[0] -  visitTimes[0] > this.elapsed)) {
                callback(true);
            }
            else {
                callback(false);
            }
        }.bind(this));
    };
    this.subscribeInBackground = function (callback) {
        chrome.history.onVisited.addListener(function (historyItem) {
            if (historyItem.visitCount > this.visitsToBePopular) {
                this.visitsRegularly(historyItem.url, function (result) {
                    Feediscovery.get(historyItem.url, function (links) {
                        for(var i = 0; i < links.length; i++) {
                            callback(links[i]);
                        }
                    });
                });
            }
        }.bind(this));
    };
};

exports.History = History;