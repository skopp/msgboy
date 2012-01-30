var Msgboy = require('./msgboy.js').Msgboy;
var $ = jQuery = require('jquery');
var OptionsView = require('./views/options-view.js').OptionsView;

Msgboy.bind("loaded", function () {
    var view  = new OptionsView();
});
Msgboy.run();
