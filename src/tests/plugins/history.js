var assert = require('assert');
var Plugins = require('../../plugins.js').Plugins;
var History = require('../../plugins/history.js').History;

describe('History', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true', function() {
            var docStub = {};
            var b = new History(Plugins);
            assert(b.onSubscriptionPage(docStub));
        });
    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new History(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                assert(feed.url);
                assert(feed.title !== null);
            }, function(count) {
                // Called when subscribed to many feeds.
                assert(count > 0);
                done();
            });
        });
    });
    
    describe('subscribeInBackground', function() {
        
    });

});
