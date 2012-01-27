var _ = require('underscore');
var $ = jQuery = require('jquery-browserify');
var Backbone = require('backbone-browserify');
var BackboneIndexedDB = require('../backbone-indexeddb.js');
var MessageView = require('./message-view.js').MessageView;

var NotificationView = Backbone.View.extend({
    events: {
    },
    initialize: function () {
        _.bindAll(this, 'showNext', 'showOrBuffer');
        this.mouseOver = false;
        this.nextTimeout = null;
        this.period = 8000;
        this.buffer = [];
        this.started = false;
    },
    showOrBuffer: function(message) {
        this.buffer.push(message);
        if(!this.started) {
            this.started = true;
            this.showNext(); // Let's start
        }
    },
    showNext: function() {
        var message = this.buffer.shift(); // Race condition here!
        if(message) {
            var view = new MessageView({
                model: message
            });
            
            message.bind("up-ed", function () {
                // The message was uped. We need to go to that page
                // And show the next
                view.remove();
                chrome.extension.sendRequest({
                    signature: "tab",
                    params: {url: message.mainLink(), selected: true}
                });
            }.bind(this));

            message.bind("down-ed", function () {
                view.remove();
            }.bind(this));

            view.bind('rendered', function() {
                console.log(".")
                $("body").append(view.el); // Adds the view in the document.
            }.bind(this));
            
            view.render(); 
            
            this.nextTimeout = setTimeout(function () {
                view.remove();
                this.showNext();
            }.bind(this), this.period);
        }
        else {
            console.log("DONE");
        }
    }
});

exports.NotificationView = NotificationView;
