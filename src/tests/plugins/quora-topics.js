var should = require('chai').should();
var QuoraTopics = require('../../plugins/quora-topics.js').QuoraTopics;

describe('QuoraTopics', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the location is at www.quora.com', function() {
            var docStub = {
                location: {
                    host: "www.quora.com"
                }
            };
            var b = new QuoraTopics();
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {
        
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new QuoraTopics();
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
});
