var _ = require('underscore')._,
backbone = require('backbone');


var AppModel = backbone.Model.extend({
    defaults: {
    },
    initialize: {
    }
});

var model =  new AppModel({cool: 'stuff'});

