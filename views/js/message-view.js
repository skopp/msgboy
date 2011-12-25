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
        '<p class="darkened"><%= Msgboy.helper.cleaner.html(model.attributes.title) %></p>',
        '<h1 style="background-image: url(<%= model.faviconUrl() %>)"><%= Msgboy.helper.cleaner.html(model.attributes.source.title) %></h1>'
    ].join('')),
    groupTemplate: _.template([
        '<% model.messages.each(function(story, i) { %>',
        '<div class="message" style="-webkit-transform: rotate(<%= Math.random()*(-i)*(15/model.messages.length) +5 %>deg);">',    // another take on generating the transform.
        '<p class="darkened"><%= Msgboy.helper.cleaner.html(story.attributes.title) %></p>',
        '<h1 style="background-image: url(<%= model.faviconUrl() %>)"><%= Msgboy.helper.cleaner.html(story.attributes.source.title) %></h1>',
        '</div>',
        '<% }); %>',
    ].join('')),
    initialize: function () {
        this.model.view = this; // store reference to view on model
        this.model.bind("change", this.render.bind(this)); 
        this.model.messages.bind('add', this.render.bind(this));
    },
    render: function () {
        var el = $(this.el),
            isGroup = this.model.messages.length > 1;
            
        // set some attributes on the container div
        $(this.el).attr({
            'data-msgboy-relevance': this.model.get('relevance'),
            'id': isGroup ? 'group_' + this.model.id : this.model.id,
            'data-msgboy-state': this.model.get('state')
        });
        
        // remove all the brick classes, add new one
        el.removeClass("brick-1 brick-2 brick-3 brick-4 group text");
        el.addClass(this.getBrickClass());
        
        // render our compiled template
        if (isGroup) {
            el.html(this.groupTemplate({model: this.model}));
            el.addClass("group");
            el.addClass("stack"); // added to help with CSS specificity for stack effects.
        } else {
            el.html(this.template({model: this.model}));
            el.addClass("text");
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
            if (!$(evt.target).hasClass("vote") && !$(evt.target).hasClass("share")) {
                if (evt.shiftKey) {
                    chrome.extension.sendRequest({
                        signature: "notify",
                        params: this.model.toJSON()
                    });
                } else {
                    chrome.extension.sendRequest({
                        signature: "tab",
                        params: {url: this.model.main_link(), selected: false}
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
        this.model.voteDown(function (result) {
            if (result.unsubscribe) {
                var request = {
                    signature: "unsubscribe",
                    params: this.model.attributes.feed
                };
                chrome.extension.sendRequest(request);
            }
        }.bind(this));
    },
    handleShare: function(e) {
        this.model.trigger('share', this.model);
    },
    handleExpand: function (e) {
        this.trigger('expand');
        // removes the group.
        this.remove();        
        return false;
    },
    handleImageLoad: function (e) {
        var img = e.target,
            img_size = Msgboy.helper.element.original_size($(img));

        // eliminate the tracking pixels and ensure min of at least 50x50
        if (img.width > 50 && img.height > 50) {
            this.$("p").addClass("darkened");
            $(this.el).append('<img class="main" src="' + $(img).attr("src") + '"/>');
            // Resize the image.
            if (img_size.width / img_size.height > $(self.el).width() / $(self.el).height()) {
                this.$(".message > img.main").css("min-height", "150%");
            } else {
                this.$(".message > img.main").css("min-width", "100%");
            }
        }
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
