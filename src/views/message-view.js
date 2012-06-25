var _ = require('underscore');
var $ = jQuery = require('jquery');
require('../jquery.color.js');
var Backbone = require('backbone');
var browser = require('../browsers.js').browser;

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
            '<button title="Vote Down" class="vote down"></button>',
            '<button title="Share" class="share"></button>',
            '<button title="Vote Up" class="vote up"></button>',
        '</span>',
        '<h1 style="background-image: url(<%= model.faviconUrl() %>)"><%= model.get("source").title %></h1>',
        '<p><%= model.escape("title") %></p>'
    ].join('')),
    initialize: function () {
        $(this.el).attr('title', this.model.get('mainLink'));
        $(this.el).data('model', this.model);
        this.model.bind('change', this.layout.bind(this)); 
        this.model.bind('remove', this.remove.bind(this))
        this.model.bind('destroy', this.remove.bind(this)); 
        this.model.bind('expand', function() {
            // Let's remember to never group these stories again.
            this.model.save({ungroup: true});
            $(this.el).removeClass('stack'); // Let's show this bro!
            $(this.el).removeClass('brother'); // Let's show this bro!
            $(this.el).animate({ backgroundColor: "#3284b5" }, 300).animate({ backgroundColor: "#11232c" }, 1000);
            $(this.el).find('p.darkened').animate({ backgroundColor: "#3284b5" }, 300).animate({ backgroundColor: "#11232c" }, 1000);
        }.bind(this)); 
        this.model.bind('unsubscribe', function () {
            browser.emit('unsubscribe', {
                title: "", // TODO : Add support for title 
                url: this.model.get('feed'),
                force: true
            },function (response) {
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
        isGroup = this.model.related && this.model.related.length >= 1;
        
        // remove all the brick classes, add new one
        el.removeClass("brick-1 brick-2 brick-3 brick-4 text");
        el.addClass(this.getBrickClass());

        el.html(this.template({model: this.model}));
        el.addClass("text");
        
        // render our compiled template
        if (isGroup) {
            el.addClass('stack');
            el.prepend($('<div class="ribbon">' + (this.model.related.length) + ' others</div>'));
        }
        if(typeof this.model.get('image') !== "undefined") {
            var i = $('<i class="message-image"></i>');
            i.css("background-image", "url(" + this.model.get('image') + ")");
            $(this.el).prepend(i);
        }
        if(this.model.get('sourceHost') === "msgboy.com") {
            el.addClass('msgboy');
        }
    },
    // Browser event handlers
    handleClick: function (evt) {
        var el = $(this.el),
                isGroup = this.model.related.length >= 1;
        if (isGroup) {
            this.handleExpand();
        }
        else {
            if (!$(evt.target).hasClass("vote") && !$(evt.target).hasClass("share")) {
                if (evt.shiftKey) {
                    browser.emit("notify", this.model.toJSON());
                } else {
                    // User wants to open a tab.
                    // We need to open a tab right after this one.
                    browser.getCurrentTab(function(tab) {
                        var tabParams = {url: this.model.get('mainLink'), selected: false};
                        if(tab) {
                            tabParams['index'] = tab.index + 1;
                        }
                        browser.emit('tab', tabParams);
                        this.model.trigger('clicked');
                    }.bind(this));
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
        this.model.related.each(function(message, i) {
            message.trigger('expand');
        });
        this.model.trigger('expand', this); // Let's also expand this model.
        this.model.trigger('expanded', this);
        this.model.related.reset(); // And now remove the messages inside :)
        this.layout();
        return false;
    },
    getBrickClass: function () {
        var res, state = this.model.get('state');
            
        if (state === 'down-ed') {
            res = '1';
        } else if (state === 'up-ed') {
            res = '4';
        } else {
            if(this.model.collection && this.model.collection.percentiles) {
                if(this.model.get('relevance') < this.model.collection.percentiles[0]) {
                    res = '1';
                }
                else if (this.model.get('relevance') < this.model.collection.percentiles[1]) {
                    res = '2';
                }
                else if (this.model.get('relevance') < this.model.collection.percentiles[2]) {
                    // This brick has 2 versions!
                    res = '3';
                }
                else {
                    res = '4';
                }
            }
            else {
                res = Math.ceil(this.model.attributes.relevance * 4); 
            }
        }
        return 'brick-' + res;
    }
});

exports.MessageView = MessageView;
