var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
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
        clearTimeout(this.nextTimeout);
        var message = this.buffer.shift(); // Race condition here!
        if(message) {
            var view = new MessageView({
                model: message
            });
            
            message.bind("up-ed", function () {
                // The message was uped. We need to go to that page
                // And show the next
                this.showNext();
                view.remove();
                chrome.extension.sendRequest({
                    signature: "tab",
                    params: {url: message.get('mainLink'), selected: true}
                });
            }.bind(this));

            message.bind("down-ed", function () {
                this.showNext();
                view.remove();
            }.bind(this));
            
            message.bind("clicked", function() {
                this.showNext();
                view.remove();
            }.bind(this));

            view.bind('rendered', function() {
                $("body").append(view.el); // Adds the view in the document.
            }.bind(this));
            
            view.render(); 
            
            this.nextTimeout = setTimeout(function () {
                this.showNext();
                view.remove();
            }.bind(this), this.period);
        }
        else {
            chrome.extension.sendRequest({
                signature: "close",
                params: null
            }, function (response) {
                window.close();
            });
        }
    }
});

exports.NotificationView = NotificationView;
