var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var BackboneAdapter = require('../backbone-indexeddb.js');
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
        $(this.el).data('url', message.mainLink());
        $('#comment').val(message.get('title') + " - " + message.get('source').title);
        $(this.el).modal('show');
    },
    
    updateCountdown: function() {
        var lngth = $("#comment").val().length;
        $("#character-count").text(lngth + " characters");
        if(lngth > 120) {
            $(".btn.twitter").addClass("disabled");
        }
    },
    
    sendShare: function(e) {
        var url = encodeURI($('#modal-share').data('url'));
        var service = $(e.target).data('service');
        var comment = encodeURI($('#comment').val());
        chrome.extension.sendRequest({
            signature: "tab",
            params: {url: "http://msgboy.com/share/prepare?url=" + url + "&comment=" + comment + "&service=" + service, selected: true}
        });
        $('#modal-share').modal('hide');
    }
});

exports.ModalShareView = ModalShareView;
