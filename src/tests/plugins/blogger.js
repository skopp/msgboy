var should = require('chai').should();
var Blogger = require('../../plugins/blogger.js').Blogger;

describe('Blogger', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the host is www.blogger.com and the pathname is /navbar.g', function() {
            var docStub = {
                location: {
                    host: "www.blogger.com"
                    , pathname: "/navbar.g"
                }
            };
            var b = new Blogger();
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(10000); // Allow for up to 10 seconds.
            var b = new Blogger();
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
