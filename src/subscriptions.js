var $ = jQuery = require('jquery');
var Msgboy = require('./msgboy.js').Msgboy;
var SubscriptionsView = require('./views/subscriptions-view.js').SubscriptionsView;

Msgboy.bind("loaded", function () {
     var view  = new SubscriptionsView({el: $("#info")});
});
