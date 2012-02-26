var should = require('chai').should();
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
                location: {
                    host: "hello.status.net"
                }
            };
            var b = new Statusnet();
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {
        
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(10000); // Allow for up to 10 seconds.
            var b = new Statusnet();
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
