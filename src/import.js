var $ = jQuery = require('jquery');
var Msgboy = require('./msgboy.js').Msgboy;
var SubscriptionsView = require('./views/subscriptions-view.js').SubscriptionsView;
var ImportView = require('./views/import-view.js').ImportView;

Msgboy.bind("loaded:import", function () {
  var importView  = new ImportView();
});
