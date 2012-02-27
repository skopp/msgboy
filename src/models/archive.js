var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;

var Archive = Backbone.Collection.extend({
    storeName: "messages",
    database: msgboyDatabase,

    initialize: function () {
        this.model = require('./message.js').Message; // This avoids recursion in requires
    },
    comparator: function (message) {
        return - (message.get('createdAt'));
    },
    next: function (number, condition) {
        var options = {
            conditions: condition,
            limit: number,
            addIndividually: true
        };
        this.fetch(options);
    },
    forFeed: function (_feed) {
        this.fetch({conditions: {feed: _feed}});
    }
});

exports.Archive = Archive;