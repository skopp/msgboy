var _ = require('underscore')._,
backbone = require('backbone');


var AppModel = backbone.Model.extend({
    defaults: {
    },
    initialize: function() {
    }
});

var model = new AppModel({cool: 'stuff'});

