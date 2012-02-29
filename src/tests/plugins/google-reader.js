var should = require('chai').should();
var GoogleReader = require('../../plugins/google-reader.js').GoogleReader;

describe('GoogleReader', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if we\'re on a Google Reader page', function() {
            var docStub = {
                location: {
                    host: "www.google.com"
                    ,pathname: "/reader/view/"
                }
            };
            var b = new GoogleReader();
            b.onSubscriptionPage(docStub).should.be.true;
        });

    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new GoogleReader();
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
