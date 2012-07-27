var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var Msgboy = require('../msgboy.js').Msgboy;
var browser = require('../browsers.js').browser;
var Subscriptions = require('../models/subscription.js').Subscriptions;
var Plugins = require('../plugins.js').Plugins;

var SubscriptionView = Backbone.View.extend({
    tagName:  "tr",
    className: "subscription",
    events: {
        "click .btn": "toggleSubscription"
    },
    initialize: function () {
        this.template = _.template('<td class="title"><% if (obj.alternate) { %><a target="_blank" href="<%= alternate %>"><%= title %></a><% } else { %><%= title %><%} %></td>\
    <td class="state"><%= state %></td>\
    <td class="action"><button class="btn btn-mini"><%= state === "subscribed" || state === "subscribing" ? "Unsubscribe" : "Subscribe"%></button></td>');
        this.model.bind('subscribing', this.subscribe, this);
        this.model.bind('unsubscribing', this.unsubscribe, this);
        this.model.bind('change', this.render, this);
    },
    render: function() {
      if(typeof(this.model.get('title')) === "undefined" || !this.model.get('title')) {
        this.model.set('title', this.model.get('id'));
      }
      $(this.el).html(this.template(this.model.toJSON()));
      return this;
    },
    toggleSubscription: function () {
        var currentState = this.model.get('state');
        if(currentState === "subscribed" || currentState === "subscribing") {
            // Unsubscribe
            this.model.setState("unsubscribing");
        } else {
            // Subscribe
            this.model.setState("subscribing");
        }
    },
    subscribe: function() {
        browser.emit("subscribe", {
          title: "", // TODO : Add support for title
          url: this.model.get('id'),
          force: true
        }, function (response) {
            this.model.setState("subscribed");
        }.bind(this));
    },
    unsubscribe: function() {
        browser.emit("unsubscribe", {
          title: "", // TODO : Add support for title
          url: this.model.get('id'),
          force: true
        }, function (response) {
            this.model.setState("unsubscribed");
        }.bind(this));
    }
});


var SubscriptionsView = Backbone.View.extend({
    events: {
        'click #opml': 'opmlExport',
        'change #selectState': 'select'
    },

    initialize: function () {
        _.bindAll(this, 'showOne', 'render', 'opmlExport', 'select');
        // Loading the subscriptions.
        this.collection = new Subscriptions();
        this.collection.bind('reset', this.render, this);
        this.collection.fetch( {
          conditions: {state: "subscribed"},
        });

        // Also loads all the plugins.
        _.each(Plugins.all, function(plugin) {
            var btn = $('<span href="#" class="btn plugin-reset" style="margin:10px" id="">'+ plugin.name + '</span>');
            btn.click(function() {
                plugin.listSubscriptions(function (subscriptions) {
                    _.each(subscriptions, function (feed) {
                        browser.emit("subscribe", feed);
                    }.bind(this));
                }.bind(this), function (count) {
                    console.log("Done with", plugin.name, "and subscribed to", count);
                }.bind(this));
            }.bind(this));
            this.$('#plugins').append(btn);
        }.bind(this));

    },

    showOne: function(subscription) {
        var view = new SubscriptionView({model: subscription});
        this.$('#subscriptions').append(view.render().el);
    },

    render: function() {
      this.$('#subscriptions tr.subscription').empty();
      this.collection.each(this.showOne);
    },

    opmlExport: function() {
        var opml = '<?xml version="1.0" encoding="UTF-8"?><opml version="1.0"><head><title>Your Msgboy Subscriptions</title></head><body>';
        this.collection.each(function(subscription) {
            opml += '<outline xmlUrl="' + escape(subscription.id) + '" />';
        });
        opml += '</body></opml>';
        window.location = "data:application/xml;base64," + window.btoa(opml);
    },

    select: function(evt) {
      this.collection.reset();
      if(this.$('#selectState').val() === "all") {
        this.collection.fetch();
      }
      else {
        this.collection.fetch( {
          conditions: {state: this.$('#selectState').val()},
        });
      }
    }
});

exports.SubscriptionView = SubscriptionView;
exports.SubscriptionsView = SubscriptionsView;

