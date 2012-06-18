var _ = require('underscore');
var $ = jQuery = require('jquery');
require('../jquery.masonry.min.js');
var Backbone = require('backbone');
var MessageView = require('./message-view.js').MessageView;
var Archive = require('../models/archive.js').Archive;
require("../date.extension.js");

var ArchiveView = Backbone.View.extend({
    events: {
    },
    initialize: function () {
        _.bindAll(this, 'appendNew', 'prepareNew', 'render');   
    },
    prepareNew: function (message) {
        message.bind('up-ed', function() {
            $('#container').masonry('reload');
        });

        message.bind('down-ed', function() {
            $('#container').masonry('reload');
        });

        message.bind('expanded', function() {
            $('#container').masonry('reload');
        })

        // This should be moved to the archive model as it's not a view thing.
        message.bind('unsubscribed', function() {
            // We have unsubscribed a feed. So we want to delete all of its brothers.
            var brothers = new Archive(); 
            brothers.bind('reset', function() {
                var destroyedOne = _.after(brothers.models.length, function() {
                    // Once all brothers have been destroyed, we can redraw
                    $('#container').masonry('reload');
                });

                _.each(brothers.models, function(brother) {
                    brother = this.collection.get(brother.id) || brother; // Rebinding to the right model.
                    brother.destroy({silent: true, success: destroyedOne}); // Deletes the brothers 
                }.bind(this));
            }.bind(this));
            brothers.forFeed(message.get('feed'));
        }.bind(this));

        var view = new MessageView({
            model: message
        });
        return view;
    },
    prependNew: function (message) {
        var view = this.prepareNew(message);
        view.bind('rendered', function() {
            $('#container').prepend($(view.el)).masonry( 'reload' ); // Adds the view in the document.
            $(view.el).animate({ backgroundColor: "#3284b5" }, 300).animate({ backgroundColor: "#11232c" }, 1000);
            $(view.el).find('p.darkened').animate({ backgroundColor: "#3284b5" }, 300).animate({ backgroundColor: "#11232c" }, 1000);
        }.bind(this));
        view.render();
    },
    appendNew: function (message) {
        var view = this.prepareNew(message);
        
        view.bind('rendered', function() {
            $(view.el).addClass('archive-' + this.cid);
            $('#container').append($(view.el)); // Adds the view in the document.
        }.bind(this));

        // Check if we can group the messages
        if (this.lastParentView && !message.get('ungroup') && this.lastParentView.model.get('sourceLink') === message.get('sourceLink')) {
            this.lastParentView.model.related.add(message);
            $(view.el).addClass('brother'); // Let's show this has a brother!
            this.lastParentView.render(); // re-render the parent
            view.render(); 
        }
        else {
            this.lastParentView = view;
        }
        view.render(); 
    },
    render: function() {
        // Do the Masonry magic
        $('#container').masonry('appended', $('.archive-' + this.cid));
    }
});

exports.ArchiveView = ArchiveView;
