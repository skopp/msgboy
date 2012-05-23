var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var UrlParser = require('url');
var QueryString = require('querystring');
require('../bootstrap-modal.js');

var ModalShareView = Backbone.View.extend({
    events: {
        'show': 'updateCountdown',
        'change #comment': 'updateCountdown',
        'keyup #comment': 'updateCountdown',
        'click .share-ext': 'sendShare'
    },
    
    tagName: "div",
    className: 'modal backdrop fade modal-share',
    
    template: _.template([
        '<div class="modal-header">',
            '<button class="close" data-dismiss="modal">×</button>',
            '<h3>Share</h3>',
            '<h4><%= title %></h4>',
        '</div>',
        '<div class="modal-body">',
            '<label for="comment">Comment</label>',
            '<h2 style="display:none"><%= title %> </h2>',
            '<textarea class="xxlarge" id="comment" name="comment" rows="3"><%= comment %></textarea>',
            '<span class="help-block" id="character-count">0 character</span>',
            '<a href="#" class="btn secondary share-ext instapaper" data-service="instapaper">Instapaper</a>',
            '<a href="#" class="btn secondary share-ext twitter"    data-service="twitter">Twitter</a>',
            '<a href="#" class="btn secondary share-ext facebook"   data-service="facebook">Facebook</a>',
        '</div>',
        '<div class="modal-footer">',
        '</div>',
    ].join('')),

    initialize: function (args) {
        this.message = args.message;
        $(this.el).html(this.template({
            comment: args.message.get('title') + " - " + args.message.get('source').title, 
            title: args.message.get('title')
        }));
        return this;
    },
    
    toggle: function() {
        $(this.el).modal('toggle');
    },
        
    updateCountdown: function() {
        var lngth = this.$("#comment").val().length;
        this.$("#character-count").text(lngth + " characters");
        if(lngth > 120) {
            this.$(".btn.twitter").addClass("disabled");
        }
    },
    
    sendShare: function(e) {
        var url = this.message.get('mainLink');
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
        chrome.extension.sendRequest({
            signature: "tab",
            params: {url: UrlParser.format(sharingUrl), selected: true}
        });
        $(this.el).modal('toggle');
    }
});

exports.ModalShareView = ModalShareView;
