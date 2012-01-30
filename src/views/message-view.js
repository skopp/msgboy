var _ = require('underscore');
var $ = jQuery = require('jquery-browserify');
var Backbone = require('backbone-browserify');
var BackboneAdapter = require('../backbone-adapter.js');
var Message = require('../models/message.js');
var Sanitizer = require('sanitizer');

var MessageView = Backbone.View.extend({
    tagName: "div",
    className: "message",
    events: {
        "click .up": "handleUpClick",
        "click .down": "handleDownClick",
        "click .share": "handleShare",
        "click": "handleClick"
    },
    // TODO: i'd prefer is we didn't set style attributes. Also, the favicon can be an img tag, just for cleanliness when writing to the template.
    template: _.template([
        '<span class="controls">',
            '<button class="vote down"></button>',
            '<button class="share"></button>',
            '<button class="vote up"></button>',
        '</span>',
        '<p class="darkened"><%= model.escape("title") %></p>',
        '<div class="full-content" style="display:none;"></div>',
        '<h1 style="background-image: url(<%= model.faviconUrl() %>)"><%= model.escape("source").title %></h1>'
    ].join('')),
    initialize: function () {
        this.model.bind('change', this.layout.bind(this)); 
        this.model.bind('remove', this.remove.bind(this))
        this.model.bind('destroy', this.remove.bind(this)); 
        this.model.bind('expand', function() {
            $(this.el).removeClass('brother'); // Let's show this bro!
        }.bind(this)); 
        this.model.bind('unsubscribe', function () {
            var request = {
                signature: "unsubscribe",
                params: {
                    title: "", // TODO : Add support for title 
                    url: this.model.attributes.feed,
                    force: true
                },
                force: true
            };
            chrome.extension.sendRequest(request, function (response) {
                // Unsubscribed... We need to delete all the brothas and sistas!
                this.model.trigger('unsubscribed');
            }.bind(this));
        }.bind(this));
    },
    render: function () {
        this.layout();
        this.trigger('rendered');
    },
    layout: function() {
        var el = $(this.el), 
        isGroup = this.model.messages && this.model.messages.length > 1;
            
        // set some attributes on the container div
        $(this.el).attr({
            'data-msgboy-relevance': this.model.get('relevance'),
            'id': this.model.id,
            'data-msgboy-state': this.model.get('state')
        });
        
        // remove all the brick classes, add new one
        el.removeClass("brick-1 brick-2 brick-3 brick-4 text");
        el.addClass(this.getBrickClass());

        el.html(this.template({model: this.model}));
        el.addClass("text");
        this.$(".full-content").html($(this.model.text(Sanitizer.sanitize(this.model.text()))));
        
        // render our compiled template
        if (isGroup) {
            el.prepend($('<div class="ribbon">' + (this.model.messages.length) + ' stories</div>'));
        }
        
        $(this.el).find('.full-content img').load(this.handleImageLoad.bind(this));
    },
    // Browser event handlers
    handleClick: function (evt) {
        var el = $(this.el),
                isGroup = this.model.messages.length > 1;
        if (isGroup) {
            this.handleExpand();
        }
        else {
            this.model.trigger('clicked');
            if (!$(evt.target).hasClass("vote") && !$(evt.target).hasClass("share")) {
                if (evt.shiftKey) {
                    chrome.extension.sendRequest({
                        signature: "notify",
                        params: this.model.toJSON()
                    });
                } else {
                    chrome.extension.sendRequest({
                        signature: "tab",
                        params: {url: this.model.mainLink(), selected: false}
                    });
                    this.trigger("clicked");
                }
            }
        }
    },
    handleUpClick: function () {
        this.model.voteUp();
    },
    handleDownClick: function () {
        this.model.voteDown();
    },
    handleShare: function(e) {
        this.model.trigger('share', this.model);
    },
    handleExpand: function (e) {
        this.model.messages.each(function(message, i) {
            message.trigger('expand');
        });
        this.model.trigger('expanded', this);
        this.model.messages.reset(); // And now remove the messages inside :)
        this.layout();
        return false;
    },
    handleImageLoad: function (e) {
        // We should check the size of the image and only display it if it's bigger than the previous one.
        // We should also resize it to fit the square.
        var img = e.target;
        $(this.el).append('<img class="main" src="' + $(img).attr("src") + '"/>');
        
        // var img = e.target,
        //     img_size = Msgboy.helper.element.original_size($(img));
        // 
        // // eliminate the tracking pixels and ensure min of at least 50x50
        // if (img.width > 50 && img.height > 50) {
        //     this.$("p").addClass("darkened");
            // $(this.el).append('<img class="main" src="' + $(img).attr("src") + '"/>');
        //     // Resize the image.
        //     if (img_size.width / img_size.height > $(self.el).width() / $(self.el).height()) {
        //         this.$(".message > img.main").css("min-height", "150%");
        //     } else {
        //         this.$(".message > img.main").css("min-width", "100%");
        //     }
        // }
    },
    getBrickClass: function () {
        var res,
            state = this.model.get('state');
            
        if (state === 'down-ed') {
            res = 1;
        } else if (state === 'up-ed') {
            res = 4;
        } else {
            res = Math.ceil(this.model.attributes.relevance * 4); 
        }
        return 'brick-' + res;
    }
});

exports.MessageView = MessageView;
