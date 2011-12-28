var SubscriptionView = Backbone.View.extend({
    tagName:  "tr",
    events: {
    },
    initialize: function () {
        console.log(this.model.toJSON());
        this.template = _.template($('#subscription-template').html());
    },
    render: function() {
        $(this.el).html(this.template(this.model.toJSON()));
        return this;
    },
});

var SubscriptionsView = Backbone.View.extend({
    events: {
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
    }
    
});
