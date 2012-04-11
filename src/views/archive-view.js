var _ = require('underscore');
var $ = jQuery = require('jquery');
require('../jquery.masonry.min.js');
var Backbone = require('backbone');
var MessageView = require('./message-view.js').MessageView;
var Archive = require('../models/archive.js').Archive;
require("../date.extension.js");

window.$ = $;

var ArchiveView = Backbone.View.extend({
    upperBound: new Date().getTime(),
    lowerBound: 0,
    fadeOutTimeout: null,
    loaded: 0,
    toLoad: 50,
    events: {
    },
    initialize: function () {
        _.bindAll(this, 'appendNew', 'completePage', 'loadNext');
        
        $('#container').masonry({
            itemSelector : '.message',
            columnWidth : 10,
            animationOptions: {
                duration: 1000
            }
        });
          
        $(document).scroll(this.completePage);
        
        $(document).scroll(function() {
            var message = $(document.elementFromPoint(window.innerWidth/2, window.innerHeight - 10)).closest('.message');
            if(message && typeof(message.data('model')) !== "undefined") {
                $("#timetracker").html("<p>" + new Date(message.data('model').attributes.createdAt).toRelativeTime() + "</p>");
            }
            if(this.fadeOutTimeout) {
                clearTimeout(this.fadeOutTimeout);
            }
            $("#timetracker").fadeIn();
            this.fadeOutTimeout = setTimeout(function() {
                this.fadeOutTimeout = null;
                $("#timetracker").fadeOut();
            }, 300);
        });
        
        this.loadingTimes =[];
        this.loaded = this.toLoad;
        this.collection.bind('add', this.appendNew);
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
                createdAt: [this.upperBound, this.lowerBound]
            });
        }
    },
    prependNew: function (message) {
        if(message.attributes.state !== "down-ed" && Math.ceil(message.attributes.relevance * 4) > 1) {
            message.bind('up-ed', function() {
                $('#container').masonry('reload');
            });

            message.bind('down-ed', function() {
                $('#container').masonry('reload');
            });

            message.bind('expanded', function() {
                $('#container').masonry('reload');
            })

            message.bind('unsubscribed', function() {
                // We have unsubscribed a feed. So we want to delete all of its brothers.
                var brothers = new Archive(); 
                brothers.bind('reset', function() {
                    var destroyedOne = _.after(brothers.models.length, function() {
                        // Once all brothers have been destroyed, we can redraw
                        $('#container').masonry('reload');
                    })
                    
                    _.each(brothers.models, function(brother) {
                        brother = this.collection.get(brother.id) || brother; // Rebinding to the right model.
                        brother.destroy({
                            silent: true,
                            success: destroyedOne
                        }); // Deletes the brothers 
                    }.bind(this));
                }.bind(this));
                brothers.forFeed(message.get('feed'));
            }.bind(this));

            var view = new MessageView({
                model: message
            });
            
            view.bind('rendered', function() {
                $('#container').prepend($(view.el)).masonry( 'reload' ); // Adds the view in the document.
                $(view.el).animate({ backgroundColor: "#3284b5" }, 300).animate({ backgroundColor: "#11232c" }, 1000);
                $(view.el).find('p.darkened').animate({ backgroundColor: "#3284b5" }, 300).animate({ backgroundColor: "#11232c" }, 1000);
            }.bind(this));
            view.render(); 
        }
    },
    appendNew: function (message) {
        this.upperBound = message.attributes.createdAt;
        this.loaded++;
        if(message.attributes.state !== "down-ed" && Math.ceil(message.attributes.relevance * 4) > 1) {
            message.bind('up-ed', function() {
                $('#container').masonry('reload');
            });

            message.bind('down-ed', function() {
                $('#container').masonry('reload');
            });

            message.bind('expanded', function() {
                $('#container').masonry('reload');
            })

            message.bind('unsubscribed', function() {
                // We have unsubscribed a feed. So we want to delete all of its brothers.
                var brothers = new Archive(); 
                brothers.bind('reset', function() {
                    var destroyedOne = _.after(brothers.models.length, function() {
                        // Once all brothers have been destroyed, we can redraw
                        $('#container').masonry('reload');
                    })
                    
                    _.each(brothers.models, function(brother) {
                        brother = this.collection.get(brother.id) || brother; // Rebinding to the right model.
                        brother.destroy({
                            silent: true,
                            success: destroyedOne
                        }); // Deletes the brothers 
                    }.bind(this));
                }.bind(this));
                brothers.forFeed(message.get('feed'));
            }.bind(this));

            var view = new MessageView({
                model: message
            });
            
            view.bind('rendered', function() {
                this.completePage();
                $('#container').append($(view.el)); // Adds the view in the document.
                $('#container').masonry('appended', $(view.el));
            }.bind(this));

            // Check if we can group the messages
            if (this.lastParentView && this.lastParentView.model.get('sourceLink') === message.get('sourceLink') && !message.get('ungroup')) {
                this.lastParentView.model.related.add(message);
                $(view.el).addClass('brother'); // Let's show this has a brother!
                view.render(); 
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
