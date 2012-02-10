var $ = jQuery = require('jquery');
var _ = require('underscore');
var parseUri = require('../utils.js').parseUri;
var Backbone = require('backbone');
Backbone.sync = require('msgboy-backbone-adapter').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Archive = require('./archive.js').Archive;

var Message = Backbone.Model.extend({
    storeName: "messages",
    database: msgboyDatabase,
    defaults: {
        "title":        null,
        "atomId":       null,
        "summary":      null,
        "content":      null,
        "links":        {},
        "createdAt":    0,
        "source":       {},
        "sourceHost":   null,
        "sourceLink":   null,
        "state":        "new",
        "feed":         null,
        "relevance":    0.5
    },
    /* Initializes the messages */
    initialize: function (params) {
        if(typeof params === "undefined") {
            params = {}; // Default params
        }
        // Setting up the source attributes
        if (params.source && params.source.links) {
            if(params.source.links.alternate) {
                if(params.source.links.alternate["text/html"] && params.source.links.alternate["text/html"][0]) {
                    params.sourceLink = params.sourceLink || params.source.links.alternate["text/html"][0].href;
                    params.sourceHost = params.sourceHost || parseUri(params.sourceLink).host;
                }
                else {
                    params.sourceLink = params.sourceLink || ""; // Dang. What is it?
                    params.sourceHost = params.sourceHost || "";
                }
            }
            else {
                params.sourceLink = params.sourceLink || ""; // Dang. What is it?
                params.sourceHost = params.sourceHost || "";
            }
        }
        else {
            params.sourceLink = params.sourceLink || ""; // Dang. What is it?
            params.sourceHost = params.sourceHost || "";
        }
        
        // Setting up the createdAt
        if (!params.createdAt) {
            params.createdAt = new Date().getTime();
        }
        
        
        // Setting up the mainLink
        if (params.links && params.links.alternate) {
            if (params.links.alternate["text/html"] && params.links.alternate["text/html"][0]) {
                params.mainLink = params.links.alternate["text/html"][0].href;
            }
            else {
                // Hum, let's see what other types we have!
                params.mainLink = "";
            }
        }
        else {
            params.mainLink = "";
        }
        
        // Setting up the text, as the longest between the summary and the content.
        if (params.content) {
            if (params.summary && params.summary.length > params.content.length) {
                params.text =  params.summary;
            }
            else {
                params.text =  params.content;
            }
        }
        else if (this.get('summary')) {
            params.text =  params.summary;
        }
        else {
            params.text = "";
        }
        
        
        // Setting up the params
        this.set(params);
        
        this.related = new Backbone.Collection(); // create container for similar messages
        this.related.comparator = function(message) {
            return -message.get('createdAt');
        }
        return this;
    },
    /* Votes the message up */
    voteUp: function () {
        this.setState("up-ed");
    },
    /* Votes the message down */
    voteDown: function () {
        this.setState("down-ed", function (result) {
            // We need to unsubscribe the feed if possible, but only if there is enough negative votes.
            var brothers = new Archive();
            brothers.forFeed(this.attributes.feed);
            
            brothers.bind('reset', function () {
                var states = relevanceMath.percentages(brothers.pluck("state"), ["new", "up-ed", "down-ed", "skipped"], function (member, index) {
                    return 1;
                });
                var counts = relevanceMath.counts(brothers.pluck("state"));
                if (brothers.length > 3 && (!states["up-ed"] || states["up-ed"] < 0.05) && (states["down-ed"] > 0.5 || counts["down-ed"] > 5)) {
                    this.trigger('unsubscribe');
                }
            }.bind(this));
        }.bind(this));
    },
    /* Skip the message */
    skip: function () {
        this.setState("skipped");
    },
    /* Sets the state for the message */
    setState: function (_state, callback) {
        this.save({
            state: _state
        }, {
            success: function () {
                if (typeof(callback) !== "undefined" && callback) {
                    callback(true);
                }
                this.trigger(_state, this);
            }.bind(this),
            error: function () {
                if (typeof(callback) !== "undefined" && callback) {
                    callback(false);
                }
            }.bind(this)
        });
    },
    /* This calculates the relevance for this message and sets it. */
    /* It just calculates the relevance and does not save it. */
    calculateRelevance: function (callback) {
        // See Section 6.3 in Product Requirement Document.
        // We need to get all the messages from this source.
        // Count how many have been voted up, how many have been voted down.
        // First, let's pull all the messages from the same source.
        var brothers = new Archive();
        brothers.comparator = function (brother) {
            return brother.attributes.createdAt;
        };
        brothers.forFeed(this.attributes.feed);
        brothers.bind('reset', function () {
            var relevance = 0.7; // This is the default relevance
            if (brothers.length > 0) {
                // So, now, we need to check the ratio of up-ed and down-ed. [TODO : limit the subset?].
                relevance =  this.relevanceBasedOnBrothers(brothers.pluck("state"));
            }
            // Keywords [TODO]
            // Check when the feed was susbcribed. Add bonus if it's recent! [TODO].
            if (typeof(callback) !== "undefined" && callback) {
                callback(relevance);
            }
        }.bind(this));
    },
    relevanceBasedOnBrothers: function (states) {
        if (states.length === 0) {
            return 1;
        }
        else {
            var percentages = relevanceMath.percentages(states, ["new", "up-ed", "down-ed", "skipped"]);

            return relevanceMath.average(percentages, {
                "new" : 0.6,
                "up-ed": 1.0,
                "down-ed": 0.0,
                "skipped": 0.4
            });
        }
    },
    faviconUrl: function () {
        return "http://g.etfv.co/" + this.get('sourceLink') + "?defaulticon=lightpng";
    }
});

exports.Message = Message;

var relevanceMath = {
    counts: function (array, defaults, weight) {
        var counts = {}, sum = 0;
        _.each(array, function (element, index, list) {
            if (!counts[element]) {
                counts[element] = 0;
            }
            if (typeof(weight) !== "undefined") {
                counts[element] += weight(element, index);
            }
            else {
                counts[element] += 1;
            }
        });
        sum = _.reduce(counts, function (memo, num) {
            return memo + num;
        }, 0);
        return counts;
    },
    // Returns the percentages of each element in an array.
    percentages: function (array) {
        var counts = {}, percentages = {}, sum = 0;
        _.each(array, function (element, index, list) {
            if (!counts[element]) {
                counts[element] = 0;
            }
            counts[element] += 1;
        });
        sum = _.reduce(counts, function (memo, num) {
            return memo + num;
        }, 0);
        _.each(_.keys(counts), function (key) {
            percentages[key] = counts[key] / sum;
        });
        return percentages;
    },
    // Returns the average based on the weights and the percentages.
    average: function (percentages, weights) {
        var sum = 0, norm = 0;
        _.each(_.keys(percentages), function (key) {
            sum += percentages[key] * weights[key];
            norm += percentages[key];
        });
        if (norm === 0) {
            return sum;
        } else {
            return sum / norm;
        }
        return sum;
    }
};

exports.relevanceMath = relevanceMath;

// Welcome messages
var WelcomeMessages = [{
    "title": "Welcome to msgboy!",
    "ungroup": true,
    "summary": 'Welcome to the msgboy, powered by Superfeedr!',
    "image": '/views/images/msgboy-help-screen-1.png',
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "createdAt": new Date().getTime(),
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "sourceHost": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 1.0,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Bookmark sites you love.",
    "ungroup": true,
    "image": "/views/images/msgboy-help-screen-2.png",
    "summary": "Bookmark sites you love. The msgboy will show you messages when they update",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "createdAt": new Date().getTime() - 1000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "sourceHost": "msgboy.com",
    "alternate": "http://msgboy.com/",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Newly posted stories appear in realtime.",
    "ungroup": true,
    "summary": "Newly posted stories appear in realtime, so you're always aware the first to know",
    "image": "/views/images/msgboy-help-screen-3.png",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "createdAt": new Date().getTime() - 2000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "sourceHost": "msgboy.com",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Train msgboy to give you what you want.",
    "ungroup": true,
    "summary": "The msgboy gets better when you use it more. Vote stuff up and down",
    "image": "/views/images/msgboy-help-screen-5.png",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "createdAt": new Date().getTime() - 3000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "sourceHost": "msgboy.com",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Click '+' for more like this.",
    "ungroup": true,
    "summary": "Vote stories up if you want more like them",
    "image": "/views/images/msgboy-help-screen-6.png",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "createdAt": new Date().getTime() - 4000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "sourceHost": "msgboy.com",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.8,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Hit '-' if you're not interested.",
    "ungroup": true,
    "summary": "Vote stories down if you want less stories like that. The msgboy will also unsubscribe from those unwanted sources",
    "image": "/views/images/msgboy-help-screen-7.png",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "createdAt": new Date().getTime() - 5000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "sourceHost": "msgboy.com",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "Follow and rate stories with notifications.",
    "ungroup": true,
    "summary": "Get notifications... so that even if you are now looking at the msgboy, you know about stuff!",
    "image": "/views/images/msgboy-help-screen-8.png",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "createdAt": new Date().getTime() - 6000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "sourceHost": "msgboy.com",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}, {
    "title": "You can throttle notifications in settings.",
    "ungroup": true,
    "summary": "But don't forget that the msgboy is here to help, so he can also STFU!",
    "image": "/views/images/msgboy-help-screen-9.png",
    "content": null,
    "links": {
        "alternate": {
            "text/html": [{
                "href": '/views/html/help.html',
                "rel": "alternate",
                "title": "Welcome to Msgboy",
                "type": "text/html"
            }]
        }
    },
    "createdAt": new Date().getTime() - 7000,
    "source": {
        "title": "Msgboy",
        "url": "http://blog.msgboy.com/",
        "links": {
            "alternate": {
                "text/html": [{
                    "href": "http://blog.msgboy.com/",
                    "rel": "alternate",
                    "title": "",
                    "type": "text/html"
                }]
            }
        }
    },
    "sourceHost": "msgboy.com",
    "state": "new",
    "feed": "http://blog.msgboy.com/rss",
    "relevance": 0.6,
    "published": new Date().toISOString(),
    "updated": new Date().toISOString()
}
];

exports.WelcomeMessages = WelcomeMessages;
