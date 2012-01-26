var Backbone = require('backbone');
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Message = require('./message.js').Message;

var Archive = Backbone.Collection.extend({
    storeName: "messages",
    database: msgboyDatabase,
    model: Message,

    initialize: function () {
    },
    comparator: function (message) {
        return - (message.attributes.created_at);
    },
    each: function (condition) {
        this.fetch({
            conditions: condition,
            addIndividually: true
        });
    },
    next: function (number, condition) {
        options = {
            conditions: condition,
            limit: number,
            addIndividually: true
        };
        this.fetch(options);
    },
    forFeed: function (_feed) {
        this.fetch({feed: _feed});
    }
});

exports.Archive = Archive;