var $ = jQuery = require('jquery');
var Msgboy = require('./msgboy.js').Msgboy;
var OptionsView = require('./views/options-view.js').OptionsView;

Msgboy.bind("loaded", function () {
    new OptionsView({
        el: $("#options")
    });
});

