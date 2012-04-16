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
    
    this.processNext = function(items, callback, done, totalFeeds) {
        var item = items.pop();
        if(item) {
            if (item.visitCount > this.visitsToBePopular) {
                this.visitsRegularly(item.url, function (result) {
                    if (result) {
                        totalFeeds++;
                        callback({title: "", url: item.url, doDiscovery: true});
                        this.processNext(items, callback, done, totalFeeds);
                    }
                    else {
                        this.processNext(items, callback, done, totalFeeds); // Not visited regularly.
                    }
                }.bind(this));
            }
            else {
                this.processNext(items, callback, done, totalFeeds); // Not visited often enough
            }
        }
        else {
            done(totalFeeds);
        }
    };
    
    this.listSubscriptions = function (callback, done) {
        chrome.history.search({
            'text': '', // Return every history item....
            'startTime': ((new Date()).getTime() - 1000 * 60 * 60 * 24 * 15), // that was accessed less than 15 days ago, up to 10000 pages.
            'maxResults': 10000
        }, function (historyItems) {
            if (historyItems.length === 0) {
                done(0);
            }
            this.processNext(historyItems, callback, done, 0);
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
                    callback({url: historyItem.url, doDiscovery: true})
                });
            }
        }.bind(this));
    };
};

exports.History = History;