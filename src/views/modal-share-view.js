var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var UrlParser = require('url');
var QueryString = require('querystring');
Backbone.sync = require('backbone-indexeddb').sync;
require('../bootstrap-modal.js');


var ModalShareView = Backbone.View.extend({
    events: {
        'show': 'updateCountdown',
        'change #comment': 'updateCountdown',
        'keyup #comment': 'updateCountdown',
        'click .share-ext': 'sendShare'
    },
    el: "#modal-share",

    initialize: function () {
    },
    
    showForMessage: function(message) {
        $(this.el).data('url', message.get('mainLink'));
        this.$('#comment').val(message.get('title') + " - " + message.get('source').title);
        this.$('h2').val(message.get('title'));
        $(this.el).modal('show');
    },
    
    updateCountdown: function() {
        var lngth = this.$("#comment").val().length;
        this.$("#character-count").text(lngth + " characters");
        if(lngth > 120) {
            this.$(".btn.twitter").addClass("disabled");
        }
    },
    
    sendShare: function(e) {
        var url = $('#modal-share').data('url');
        var service = $(e.target).data('service');
        var comment = this.$('#comment').val();
        var title = this.$('h2').val();
        var sharingUrl = UrlParser.parse("http://msgboy.com/share/prepare");
        sharingUrl.query = {
            service: service,
            url: url,
            title: title,
            comment: comment
        }
        console.log(UrlParser.format(sharingUrl));
        chrome.extension.sendRequest({
            signature: "tab",
            params: {url: UrlParser.format(sharingUrl), selected: true}
        });
        $('#modal-share').modal('hide');
    }
});

exports.ModalShareView = ModalShareView;
