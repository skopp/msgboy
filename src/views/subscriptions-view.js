var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('msgboy-backbone-adapter').sync;
var Subscriptions = require('../models/subscription.js').Subscriptions;

var SubscriptionView = Backbone.View.extend({
    tagName:  "tr",
    events: {
        "click .btn": "toggleSubscription"
    },
    initialize: function () {
        this.template = _.template($('#subscription-template').html());
        this.model.bind('subscribing', this.subscribe, this);
        this.model.bind('unsubscribing', this.unsubscribe, this);
        this.model.bind('change', this.render, this);
    },
    render: function() {
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
        chrome.extension.sendRequest({
            signature: "subscribe",
            params: {
                title: "", // TODO : Add support for title 
                url: this.model.get('id'),
                force: true
            }
        }, function (response) {
            this.model.setState("subscribed");
        }.bind(this));
    },
    unsubscribe: function() {
        chrome.extension.sendRequest({
            signature: "unsubscribe",
            params: {
                title: "", // TODO : Add support for title 
                url: this.model.get('id'),
                force: true
            }
        }, function (response) {
            this.model.setState("unsubscribed");
        }.bind(this));
    }
});


var SubscriptionsView = Backbone.View.extend({
    events: {
        "click #opml": "opmlExport"
    },

    initialize: function () {
        _.bindAll(this, 'showOne', 'render', 'opmlExport');
        // Loading the subscriptions.
        this.collection = new Subscriptions();
        this.collection.bind('reset', this.render, this);
        this.collection.fetch();
    },
    
    showOne: function(subscription) {
        var view = new SubscriptionView({model: subscription});
        this.$('#subscriptions').append(view.render().el);
    },
    
    render: function() {
        this.collection.each(this.showOne);
    },
    
    opmlExport: function() {
        var opml = '<?xml version="1.0" encoding="UTF-8"?><opml version="1.0"><head><title>Your Msgboy Subscriptions</title></head><body>';
        this.collection.each(function(subscription) {
            opml += '<outline xmlUrl="' + escape(subscription.id) + '" />';
        });
        opml += '</body></opml>';
        window.location = "data:application/xml;base64," + window.btoa(opml);   
    }
    
});

exports.SubscriptionsView = SubscriptionsView;

