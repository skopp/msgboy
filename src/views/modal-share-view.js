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
            '<a href="#" class="btn secondary share-ext webintents" data-service="webintents">Other</a>',
            '<a href="#" class="btn secondary share-ext instapaper" data-service="instapaper">Instapaper</a>',
            '<a href="#" class="btn secondary share-ext twitter"    data-service="twitter">Twitter</a>',
            '<a href="#" class="btn secondary share-ext facebook"   data-service="facebook">Facebook</a>',
        '</div>',
        '<div class="modal-footer">',
        '</div>',
    ].join('')),

    initialize: function (args) {
        this.message = args.message;
        
        this.urlToShare = this.message.get('mainLink'); // By default, we share the mainLink Url.
        // Let's shorten that link in the back.
        var shortenerUrl = UrlParser.parse("http://msgboy.com/share/shorten");
        shortenerUrl.query = {
            url: this.urlToShare
        }
        $.get(UrlParser.format(shortenerUrl), null, function(data) {
            // On successful shortening, we use that short url!
            this.urlToShare = data;
        }.bind(this));   
             
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
        var service = $(e.target).data('service');
        var comment = this.$('#comment').val();
        var title = this.$('h2').val();
        if(service === "webintents") {
            var intent = new WebKitIntent("http://webintents.org/share", "text/uri-list", this.urlToShare);
            var onSuccess = function(data) {
                $(this.el).modal('toggle');
            };
            var onError = function(data) { 
                $(this.el).modal('toggle');
            };
            window.navigator.webkitStartActivity(intent, onSuccess, onError);
        }
        else {
            var sharingUrl = UrlParser.parse("http://msgboy.com/share/prepare");
            sharingUrl.query = {
                service: service,
                url: this.urlToShare,
                title: title,
                comment: comment
            }
            chrome.extension.sendRequest({
                signature: "tab",
                params: {url: UrlParser.format(sharingUrl), selected: true}
            });
            $(this.el).modal('toggle');
        }
        return false;
    }
});

exports.ModalShareView = ModalShareView;
