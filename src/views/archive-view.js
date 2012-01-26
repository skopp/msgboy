var Backbone = require('backbone');
var Archive = require('../models/archive.js');
var MessageView = require('./message-view.js').MessageView;

var ArchiveView = Backbone.View.extend({
    upperDound: new Date().getTime(),
    lowerBound: 0,
    loaded: 0,
    toLoad: 50,
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
        
        this.loadingTimes =[];
        this.loaded = this.toLoad;
        this.collection.bind('add', this.showNew);
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
        if (this.loaded === this.toLoad) {
            this.loaded = 0; // Reset the loaded counter!
            this.collection.next(this.toLoad, {
                created_at: [this.upperDound, this.lowerBound]
            });
        }
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
            
            message.bind('expanded', function() {
                $('#container').isotope('reLayout');
            })

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

            var view = new MessageView({
                model: message
            });
            
            view.bind('rendered', function() {
                this.completePage();
                $('#container').append(view.el); // Adds the view in the document.
                $('#container').isotope('appended', $(view.el));
            }.bind(this));

            // Check if we can group the messages
            if (this.lastParentView && this.lastParentView.model.get('alternate') === message.get('alternate') && !message.get('ungroup')) {
                this.lastParentView.model.messages.add(message);
                $(view.el).addClass('brother'); // Let's show this has a brother!
                view.render(); // We can render it as well as nobody cares about it for now.
            }
            else {
                if(this.lastParentView) {
                    this.lastParentView.render();
                }
                this.lastParentView = view;
            }
        }
    }
});

exports.ArchiveView = ArchiveView;
