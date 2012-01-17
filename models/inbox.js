var Inbox = Backbone.Model.extend({
    storeName: "inbox",
    database: msgboyDatabase,
    defaults: {
        id: "1",
        options: {
            relevance: 0.5
        }
    },
    initialize: function () {
    },

    // Create credentials and saves them.
    // We may want to not run that again when we already have credentails.
    createCredentials: function () {
        window.open("http://msgboy.com/session/new?ext=" + chrome.i18n.getMessage("@@extension_id"));
    },

    setup: function (username, token) {
        this.save({
            epoch: new Date().getTime(),
            jid: username,
            password: token
        }, {
            success: function () {
                Msgboy.log.debug("Inbox created for " + username);
                this.trigger("ready", this);
                this.trigger("new", this);
            }.bind(this),
            error: function () {
                Msgboy.log.debug("Failed to create inbox for " + username);
            }.bind(this)
        });
    },

    // Fetches and prepares the inbox if needed.
    fetchAndPrepare: function () {
        this.fetch({
            success: function () {
                if (this.attributes.jid && this.attributes.jid !== "" && this.attributes.password && this.attributes.password !== "") {
                    Msgboy.log.debug("Loaded inbox for " + this.attributes.jid);
                    this.trigger("ready", this);
                } else {
                    Msgboy.log.debug("Refreshing new inbox ");
                    this.createCredentials();
                }
            }.bind(this),
            error: function () {
                // Looks like there is no such inbox.
                Msgboy.log.debug("Creating new inbox");
                this.createCredentials();
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