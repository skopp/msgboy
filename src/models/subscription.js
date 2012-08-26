var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;

var Subscription = Backbone.Model.extend({
    storeName: "subscriptions",
    database: msgboyDatabase,
    defaults: {
        subscribedAt: 0,
        unsubscribedAt: 0,
        state: "unsubscribed"
    },
    initialize: function (attributes) {
    },
    fetchOrCreate: function (callback) {
        this.fetch({
            success: function () {
                // The subscription exists!
                callback();
            }.bind(this),
            error: function () {
                // There is no such subscription.
                // Let's save it, then!
                this.save({}, {
                    success: function () {
                        callback();
                    },
                    error: function () {
                        // We're screwed.
                    }
                });
            }.bind(this)
        });
    },
    needsRefresh: function () {
        if (this.attributes.subscribedAt < new Date().getTime() - 1000 * 60 * 60 * 24 * 7 && this.attributes.unsubscribedAt < new Date().getTime() - 1000 * 60 * 60 * 24 * 31) {
            for (var i in Blacklist) {
                if (!this.attributes.id || this.attributes.id.match(Blacklist[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    },
    setState: function (_state) {
        switch (_state) {
        case "subscribed":
            this.save({state: _state, subscribedAt: new Date().getTime()}, {
                success: function () {
                    this.trigger(_state);
                }.bind(this)
            });
            break;
        case "unsubscribed":
            this.save({state: _state, unsubscribedAt: new Date().getTime()}, {
                success: function () {
                    this.trigger(_state);
                }.bind(this)
            });
            break;
        default:
            this.save({state: _state}, {
                success: function () {
                    this.trigger(_state);
                }.bind(this),
                error: function (o, e) {
                    // Dang
                }
            });
        }
    }
});

var Subscriptions = Backbone.Collection.extend({
    storeName: "subscriptions",
    database: msgboyDatabase,
    model: Subscription,
    pendingSubscriptions: function () {
        this.fetch({
            conditions: {state: "subscribing"},
            addIndividually: true,
            limit: 100
        });
    },
    pendingUnsubscriptions: function () {
        this.fetch({
            conditions: {state: "unsubscribing"},
            addIndividually: true,
            limit: 100
        });
    }

});

var Blacklist = [
    /.*wikipedia\.org\/.*/
];

exports.Subscription = Subscription;
exports.Subscriptions = Subscriptions;
