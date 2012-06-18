var assert = require('assert');
var Plugins = require('../../plugins.js').Plugins;
var Statusnet = require('../../plugins/statusnet.js').Statusnet;

describe('Statusnet', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the location is at .*.status.net', function() {
            var docStub = {
                getElementById: function(el) {
                    return el === "showstream";
                }
            };
            var b = new Statusnet(Plugins);
            assert(b.onSubscriptionPage(docStub));
        });
    });
    describe('hijack', function() {
        
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new Statusnet(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                assert(feed.url);
                assert(feed.title !== null)
            }, function(count) {
                // Called when subscribed to many feeds.
                assert(count > 0);
                done();
            });
        });
    });
});
