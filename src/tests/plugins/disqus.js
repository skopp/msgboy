var should = require('chai').should();
var Disqus = require('../../plugins/disqus.js').Disqus;

describe('Disqus', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the page has a disqus_thread', function() {
            var docStub = {
                getElementById: function(id) {
                    return id === "disqus_thread"
                }
            };
            var d = new Disqus();
            d.onSubscriptionPage(docStub).should.be.true;
        });

    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var d = new Disqus();
            d.listSubscriptions(function(feed) {
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
