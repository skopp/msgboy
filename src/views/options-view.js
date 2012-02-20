var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('msgboy-backbone-adapter').sync;
var Inbox = require('../models/inbox.js').Inbox;

var OptionsView = Backbone.View.extend({
    events: {
        "change #relevance": "change",
        "click #resetRusbcriptions": "resetRusbcriptions",
        "click #pinMsgboy": "pinMsgboy"
    },
    el: "#options",

    initialize: function () {
        _.bindAll(this, "render", "change", "resetRusbcriptions", "pinMsgboy");
        this.model = new Inbox();
        this.model.bind("change", function () {
            this.render();
            chrome.extension.sendRequest({
                signature: "reload",
                params: {}
            });
        }.bind(this));
        this.model.fetch();
    },

    render: function () {
        this.$("#relevance").val((1 - this.model.attributes.options.relevance) * 100);
        this.$("#pinMsgboy").val(this.model.attributes.options.pinMsgboy ? "pined" : "unpined");
        this.$("#pinMsgboy").html(this.model.attributes.options.pinMsgboy ? "Unpin" : "Pin");
    },

    change: function (event) {
        var attributes = {};
        attributes.options = {};
        attributes.options[event.target.id] = 1 - $(event.target).val() / 100;
        this.model.save(attributes);
    },

    resetRusbcriptions: function (event) {
        chrome.extension.sendRequest({
            signature: "resetRusbcriptions",
            params: {}
        }, function () {
            // Nothing to do.
        });
    },
    
    pinMsgboy: function(event) {
        var attributes = {};
        attributes.options = {};
        attributes.options[event.target.id] = event.target.value === "unpined";
        this.model.save(attributes);
        chrome.tabs.getCurrent(function(tab) {
            chrome.tabs.update(tab.id, {pinned: attributes.options[event.target.id]}, function() {
                // Done
            }.bind(this))
        }.bind(this));
    }
});

exports.OptionsView = OptionsView;
