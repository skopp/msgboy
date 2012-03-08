var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
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
            var w = new Wordpress(Plugins);
            w.onSubscriptionPage(docStub).should.equal(true);
        });
    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            var w = new Wordpress(Plugins);
            w.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });

});
