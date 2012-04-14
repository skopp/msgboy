var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Message = require('./message.js').Message;

var Inbox = Backbone.Model.extend({
    storeName: "inbox",
    database: msgboyDatabase,
    defaults: {
        id: "1",
        options: {
            relevance: 1.0,
            pinMsgboy: false
        }
    },
    initialize: function () {
    },

    setup: function (username, token) {
        this.save({
            epoch: new Date().getTime(),
            jid: username,
            password: token
        }, {
            success: function () {
                this.trigger("ready", this);
                this.trigger("new", this);
            }.bind(this),
            error: function () {
                this.trigger('error');
            }.bind(this)
        });
    },

    // Fetches and prepares the inbox if needed.
    fetchAndPrepare: function () {
        this.fetch({
            success: function () {
                if (typeof(this.get('jid')) !== 'undefined' && this.get('jid') !== "" && typeof(this.get('password')) !== 'undefined' && this.get('password') !== "") {
                    this.trigger("ready", this);
                } else {
                    this.trigger('error', 'Not Found');
                }
            }.bind(this),
            error: function () {
                this.trigger('error', 'Not Found');
            }.bind(this)
        });
    }
});

exports.Inbox = Inbox;