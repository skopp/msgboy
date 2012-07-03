var $ = jQuery = require('jquery');
var Msgboy = require('./msgboy.js').Msgboy;
var SubscriptionsView = require('./views/subscriptions-view.js').SubscriptionsView;
var AddSubscriptionView = require('./views/add-subscription-view.js').AddSubscriptionView;

Msgboy.bind("loaded:subscriptions", function () {
     var subscriptionView  = new SubscriptionsView({el: $("#info")});
     var addSubscriptionView  = new AddSubscriptionView({el: $("#addSubscription")});
});
