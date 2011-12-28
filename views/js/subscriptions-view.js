var SubscriptionView = Backbone.View.extend({
    tagName:  "tr",
    events: {
    },
    initialize: function () {
        this.template = _.template($('#subscription-template').html());
    },
    render: function() {
        $(this.el).html(this.template(this.model.toJSON()));
        return this;
    },
});

var SubscriptionsView = Backbone.View.extend({
    events: {
        "click #opml": "opmlExport"
    },

    initialize: function () {
        // Loading the subscriptions.
        this.collection = new Subscriptions();
        this.collection.bind('all', this.render, this);
        this.collection.fetch();
    },
    
    showOne: function(subscription) {
        var view = new SubscriptionView({model: subscription});
        this.$('#subscriptions').append(view.render().el);
    },
    
    render: function() {
        this.collection.each(this.showOne);
    },
    
    opmlExport: function() {
        var opml = '<?xml version="1.0" encoding="UTF-8"?><opml version="1.0"><head><title>Your Msgboy Subscriptions</title></head><body>';
        this.collection.each(function(subscription) {
            opml += '<outline xmlUrl="' + escape(subscription.id) + '" />';
        });
        opml += '</body></opml>'
        window.location = "data:application/xml;base64," + Base64.encode(opml);
    }
    
});
