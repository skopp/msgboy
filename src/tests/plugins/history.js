var should = require('chai').should();
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
            var b = new History();
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(1000000); // Allow for up to 1000 seconds.
            var b = new History();
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                feed.url.should.exist;
                feed.title.should.exist;
            }, function(count) {
                // Called when subscribed to many feeds.
                count.should.not.equal(0);
                done();
            });
        });
    });
    
    describe('subscribeInBackground', function() {
        
    });

});