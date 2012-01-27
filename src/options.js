var Msgboy = require('./msgboy.js').Msgboy;
var Archive = require('./models/archive.js').Archive;
var $ = jQuery = require('jquery-browserify');
var OptionsView = require('./views/options-view.js').OptionsView;

Msgboy.bind("loaded", function () {
    var view  = new OptionsView();
});
Msgboy.run();
