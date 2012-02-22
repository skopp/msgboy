var Subscriptions = require('../../src/models/subscription.js').Subscriptions;
var Subscription = require('../../src/models/subscription.js').Subscription;
var SubscriptionsView = require('../../src/views/subscriptions-view.js').SubscriptionsView;

describe('SubscriptionsView', function(){
    var subscriptionsView = null;
    
    before(function() {
        // We need to save a couple fixture messages!
    });

    beforeEach(function(done) {
        var Redis = require("redis");
        Redis.createClient().flushall(function() {
            done();
        });
        
        var s1 = new Subscription({id: "http://push-pub.appspot.com/feed"});
        var s2 = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
        var subscriptions = new Subscriptions();
        var subscriptionsView = new SubscriptionsView({collection: subscriptions});
        subscriptions.add(s1);
        subscriptions.add(s2);
    });

    describe('opmlExport', function() {
        it('should ....', function(complete) {
            subscriptionsView.opmlExport();
            complete();
        });
    });


});

