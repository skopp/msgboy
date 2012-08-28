var $ = jQuery = require('jquery');
var Msgboy = require('./msgboy.js').Msgboy;
var OptionsView = require('./views/options-view.js').OptionsView;

Msgboy.bind("loaded:options", function () {
  new OptionsView({
    el: $("#info")
  });
});
