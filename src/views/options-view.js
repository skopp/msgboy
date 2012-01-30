var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneIndexedDB = require('../backbone-indexeddb.js');
var Inbox = require('../models/inbox.js').Inbox;

var OptionsView = Backbone.View.extend({
    events: {
        "change #relevance": "change",
        "click #resetRusbcriptions": "resetRusbcriptions"
    },
    el: "#options",

    initialize: function () {
        _.bindAll(this, "render", "change", "resetRusbcriptions");
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
    }
});

exports.OptionsView = OptionsView;
