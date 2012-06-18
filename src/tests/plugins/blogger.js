var assert = require('assert');
var Plugins = require('../../plugins.js').Plugins;
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
            var b = new Blogger(Plugins);
            assert(b.onSubscriptionPage(docStub));
        });
    });
    describe('hijack', function() {

    });
    describe('listSubscriptions', function() {
        it('should list all feeds to which the user is subscribed', function(done) {
            this.timeout(0); 
            var b = new Blogger(Plugins);
            b.listSubscriptions(function(feed) {
                // This is the susbcribe function. We should check that each feed has a url and a title that are not empty.
                assert(feed.url);
                assert(feed.title);
            }, function(count) {
                // Called when subscribed to many feeds.
                assert(count > 0);
                done();
            });
        });
    });


});
