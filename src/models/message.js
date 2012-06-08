var _ = require('underscore');
var UrlParser = require('url');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Archive = require('./archive.js').Archive;

var Message = Backbone.Model.extend({
    storeName: "messages",
    database: msgboyDatabase,
    defaults: {
        "mainLink":     "",
        "title":        null,
        "atomId":       null,
        "summary":      null,
        "content":      null,
        "links":        {},
        "createdAt":    0,
        "source":       {},
        "sourceHost":   "",
        "sourceLink":   "",
        "state":        "new",
        "feed":         "",
        "relevance":    0.6
    },
    /* Creates a message (uses save but makes sure we do not overide an existing message.) 
       It also deletes some attributes that we will not use in the msgboy to make it lighter
    */
    create: function(attributes, options) {
        delete this.attributes.summary;
        delete this.attributes.content;
        delete this.attributes.text;
        delete this.attributes.updated;
        delete this.attributes.published;
        this.isNew = function() {
            return true;
        }
        this.save(attributes, options);
    },
    /* Initializes the messages */
    initialize: function (params) {
        // Default params
        if(typeof params === "undefined") {
            params = {}; 
        }
        
        // Setting up the source attributes
        if(typeof(params.sourceLink) === 'undefined' || typeof(params.sourceHost) === 'undefined') {
            if (params.source && params.source.links) {
                if(params.source.links.alternate) {
                    if(params.source.links.alternate["text/html"] && params.source.links.alternate["text/html"][0]) {
                        params.sourceLink = params.sourceLink || params.source.links.alternate["text/html"][0].href;
                        params.sourceHost = params.sourceHost || UrlParser.parse(params.sourceLink).hostname;
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
        }
        
        // Setting up the createdAt
        if (typeof(params.createdAt) === 'undefined') {
            params.createdAt = new Date().getTime();
        }
        
        // Setting up the mainLink
        if (typeof(params.mainLink) === 'undefined') {
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
        }
        
        // Setting up the text, as the longest between the summary and the content.
        if (typeof(params.text) === 'undefined') {
            if (params.content) {
                if (params.summary && params.summary.length > params.content.length) {
                    params.text =  params.summary;
                }
                else {
                    params.text =  params.content;
                }
            }
            else if (params.summary) {
                params.text =  params.summary;
            }
            else {
                params.text = "";
            }
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
                if (brothers.length >= 3 && (!states["up-ed"] || states["up-ed"] < 0.05) && (states["down-ed"] > 0.5 || counts["down-ed"] >= 5)) {
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
            
            // Bonus if there is an image!
            if(this.get('image')) {
                relevance = (2-relevance) * relevance // The smaller the relevance, the greater the bonus!
            }
            
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

