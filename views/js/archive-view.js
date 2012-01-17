var ArchiveView = Backbone.View.extend({
    upperDound: new Date().getTime(),
    lowerBound: 0,
    loaded: 0,
    toLoad: 20,
    events: {
    },
    initialize: function () {
        _.bindAll(this, 'showNew', 'completePage', 'loadNext');
        $(document).scroll(this.completePage);
        
        $('#container').isotope({
            itemSelector: '.message',
            filter: '.brick-2 .brick-3 .brick-4',
            masonry: {
                columnWidth: 10,
            }
        });
        
        this.collection.bind('add', this.showNew);
        this.collection.bind('add', function() {
            if (this.loaded === this.toLoad) {
                this.completePage();
            }
        }.bind(this));
        this.loadNext();
    },
    completePage: function () {
        if ($("#container").height() < $(window).height()) {
            // We should also pre-emptively load more pages if the document is shorter than the page.
            this.loadNext();
        } else if ($(window).scrollTop() > $(document).height() - $(window).height() - 300) {
            // We're close to the bottom. Let's load an additional page!
            this.loadNext();
        }
    },
    loadNext: function () {
        this.loaded = 0; // Reset the loaded counter!
        this.collection.next(this.toLoad, {
            created_at: [this.upperDound, this.lowerBound]
        });
    },
    showNew: function (message) {
        this.upperDound = message.attributes.created_at;
        this.loaded++;
        if(message.attributes.state !== "down-ed" && Math.ceil(message.attributes.relevance * 4) > 1) {
            message.bind('up-ed', function() {
                $('#container').isotope('reLayout');
            });
            
            message.bind('down-ed', function() {
                $('#container').isotope('reLayout');
            });

            message.bind('destroy', function() {
                $('#container').isotope('reLayout');
            });
            
            message.bind('unsubscribed', function() {
                var brothers = new Archive(); 
                brothers.forFeed(message.get('feed'));
                brothers.bind('reset', function() {
                    _.each(brothers.models, function(brother) {
                        brother = this.collection.get(brother.id) || brother; // Rebinding to the right model.
                        brother.destroy(); // Deletes the brothers 
                    }.bind(this));
                }.bind(this));
            }.bind(this));
            
            // Check weather this message needs to be grouped with the previous.
            if (this.lastRendered && this.lastRendered.get('alternate') === message.get('alternate') && !message.get('ungroup')) {
                this.lastRendered.messages.add(message);
                if(this.lastRendered.messages.length == 2) {
                    this.lastRendered.view.bind('expand', function(view) {
                        view.model.messages.each(function (m) {
                            var v = new MessageView({
                                model: m
                            });
                            $(v.el).hide();
                            $(view.el).after($(v.el)); // Adds the view in the document.
                            $('#container').isotope('appended', $(v.el), function () {
                                $('#container').isotope('reLayout');
                                $(v.el).show();
                            });
                            m.messages.reset();
                            v.render();
                        });
                    }.bind(this));
                }
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
                view.bind('remove', function() {
                    $('#container').isotope('remove', $(view.el));
                    $('#container').isotope('reLayout');
                });
                this.lastRendered = message; // store reference to last rendered
                view.render();
            }
        }
    }
});

