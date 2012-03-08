var should = require('chai').should();
var Plugins = require('../../plugins.js').Plugins;
var Tumblr = require('../../plugins/tumblr.js').Tumblr;

describe('Tumblr', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });

    describe('onSubscriptionPage', function() {
        it('should return true if the location is at www.tumblr.com and the pathname /dashboard/iframe', function() {
            var docStub = {
                location: {
                    host: "www.tumblr.com",
                    pathname: "/dashboard/iframe"
                }
            };
            var b = new Tumblr(Plugins);
            b.onSubscriptionPage(docStub).should.be.true;
        });
    });
    describe('hijack', function() {
        
    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new Tumblr(Plugins);
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
