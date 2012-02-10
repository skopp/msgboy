var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('msgboy-backbone-adapter').sync;
var msgboyDatabase = require('./database.js').msgboyDatabase;
var Message = require('./message.js').Message;

var Inbox = Backbone.Model.extend({
    storeName: "inbox",
    database: msgboyDatabase,
    defaults: {
        id: "1",
        options: {
            relevance: 0.0
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
                if (this.get('jid') != 'undefined' && this.get('jid') !== "" && this.get('password') != 'undefined' && this.get('password') !== "") {
                    this.trigger("ready", this);
                } else {
                    this.trigger('error', 'Not Found');
                }
            }.bind(this),
            error: function () {
                this.trigger('error', 'Not Found');
            }.bind(this)
        });
    },

    // Adds a message in the inbox
    addMessage: function (msg, options) {
        // Adds the message if the message isn't yet present
        var message = new Message({
            'id': msg.id
        });

        message.fetch({
            error: function () {
                // The message was not found, so we just have to create one!
                var message = new Message(msg);
                message.save({}, {
                    success: function () {
                        message.calculateRelevance(function (_relevance) {
                            message.save({
                                relevance: _relevance
                            }, {
                                success: function () {
                                    this.trigger("messages:added", message);
                                    options.success(message);
                                }.bind(this)
                            });
                        }.bind(this));
                    }.bind(this),
                    error: function (object, error) {
                        options.error(object, error);
                    }
                });
            }.bind(this),
            success: function () {
                options.success(null);
            }.bind(this)
        });
    },

});

exports.Inbox = Inbox;