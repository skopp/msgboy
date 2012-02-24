var should = require('chai').should();
var Wordpress = require('../../plugins/wordpress.js').Wordpress;

describe('Wordpress', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the page has an element whose id is wpadminbar', function() {
            var docStub = {
                getElementById: function(id) {
                    return id === "wpadminbar";
                }
            }
            var w = new Wordpress();
            w.onSubscriptionPage(docStub).should.equal(true);
        });
    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {

    });

});
