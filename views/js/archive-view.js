var ArchiveView = Backbone.View.extend({
    upper_bound: new Date().getTime(),
    lower_bound: 0,
    loaded: 20,
    to_load: 20,
    events: {
    },
    initialize: function () {
        _.bindAll(this, 'delete_from_feed', 'show_new', 'completePage', 'load_next');
        $(document).scroll(this.completePage);
        
        $('#container').isotope({
            itemSelector: '.message',
            filter: '.brick-2 .brick-3 .brick-4',
            masonry: {
                columnWidth: 10,
            }
        });
        
        this.collection.bind("add", this.show_new);
        this.load_next();
    },
    completePage: function () {
        if ($("#container").height() < $(window).height()) {
            // We should also pre-emptively load more pages if the document is shorter than the page.
            this.load_next();
        } else if ($(window).scrollTop() > $(document).height() - $(window).height() - 300) {
            // We're close to the bottom. Let's load an additional page!
            this.load_next();
        }
    },
    load_next: function () {
        if (this.loaded === this.to_load) {
            this.loaded = 0;
            this.collection.next(this.to_load, {
                created_at: [this.upper_bound, this.lower_bound]
            });
        }
    },
    show_new: function (message) {
        this.upper_bound = message.attributes.created_at;
        this.loaded++;
        if(message.attributes.state !== "down-ed" && Math.ceil(message.attributes.relevance * 4) > 1) {
            // Binding the events on the message.
            
            if (this.lastRendered && this.lastRendered.get('alternate') === message.get('alternate') && !message.get('ungroup')) {
                this.lastRendered.messages.add(message);
            } else {
                var view = new MessageView({
                    model: message
                });
                $(view.el).hide();
                $("#container").append(view.el); // Adds the view in the document.
                $('#container').isotope('appended', $(view.el), function () {
                    $('#container').isotope('reLayout');
                    $(view.el).show();
                }.bind(this));
                this.lastRendered = message; // store reference to last rendered
                view.render();
            }
        }
        this.completePage();
    },
    delete_from_feed: function (feed) {
        _.each(this.collection.models, function (model) {
            if (model.attributes.feed === feed) {
                $('#container').isotope('remove', $(model.view.el));
                model.view.remove();
                model.destroy({
                    success: function () {
                    }
                });
            }
        });
    }
});

