var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;

var Archive = Backbone.Collection.extend({
    storeName: "messages",
    database: msgboyDatabase,
    percentiles: [0.2, 0.5, 0.8], // Default percentiles for the relevance in that archive.
    upperBound: new Date().getTime(), // Default upper bound
    lowerBound: 0, // Default lower bound

    initialize: function (opts) {
        if(opts) {
            this.upperBound = opts.upperBound;
            this.lowerBound = opts.lowerBound;
        }
        this.model = require('./message.js').Message; // This avoids recursion in requires
        this.bind('reset', this.computeRelevance);
    },
    computeRelevance: function() {
        var relevances = this.pluck('relevance').sort();
        this.percentiles = [
            relevances[parseInt(relevances.length/8) - 1], 
            relevances[parseInt(relevances.length*2/3) + 1], 
            relevances[parseInt(relevances.length*7/8)]
        ]; 
    },
    comparator: function (message) {
        return - (message.get('createdAt'));
    },
    load: function (number) {
        var options = {
            conditions: {
                createdAt: [this.upperBound, this.lowerBound]
            },
            limit: number,
        };
        this.fetch(options);
    },
    forFeed: function (_feed) {
        this.fetch({conditions: {feed: _feed}});
    }
});

exports.Archive = Archive;