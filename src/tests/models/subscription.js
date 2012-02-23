var should = require('chai').should();
var msgboyDatabase = require('../../models/database.js').msgboyDatabase;
var Subscription = require('../../models/subscription.js').Subscription;
var Subscriptions = require('../../models/subscription.js').Subscriptions;

describe('Subscription', function(){
    before(function() {
        msgboyDatabase = _.clone(msgboyDatabase);
        msgboyDatabase.id = msgboyDatabase.id + "-test";
        indexedDB.deleteDatabase(msgboyDatabase.id);
        Subscription = Subscription.extend({ database: msgboyDatabase});
        Subscriptions = Subscriptions.extend({ database: msgboyDatabase});
    });

    beforeEach(function() {
    });
    
    describe('fetchOrCreate', function() {
        it('should create a subscription that does not exist', function(complete) {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
            s.fetchOrCreate(function() {
                s.id.should.equal("http://blog.superfeedr.com/atom.xml");
                complete();
            });
        });
        it('should fetch a subscription that exists', function(complete) {
            var s = new Subscription({id: "https://github.com/superfeedr.atom"});
            s.fetchOrCreate(function() {
                var t = new Subscription({id: "https://github.com/superfeedr.atom"});
                t.fetchOrCreate(function() {
                    t.id.should.equal("https://github.com/superfeedr.atom");
                    complete();
                });
            });
        });
        
    });

    describe('needsRefresh', function() {
        it('should return true if the subscription is older than a week and unsubscription is older than a month and if the feed is not in the blacklist', function() {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml", subscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 7 - 1, unsubscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 31 - 1});
            s.needsRefresh().should.equal(true);
        });
        it('should return false if the subscription is earlier than a week', function() {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml", subscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 7 + 1});
            s.needsRefresh().should.equal(false);
        });
        it('should return false if unsubscription is earlier than a month', function() {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml", unsubscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 31 + 1});
            s.needsRefresh().should.equal(false);
        });
        it('should return false if the feed is in the blacklist', function() {
            var s = new Subscription({id: "http://en.wikipedia.org/w/index.php?title=Special:RecentChanges&feed=atom", subscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 7 - 1, unsubscribedAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 31 - 1});
            s.needsRefresh().should.equal(false);
        });
    });

    describe('setState', function() {
        it('should set the state', function(complete) {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
            s.bind('change', function() {
                s.get('state').should.equal("subscribing");
                complete();
            })
            s.setState("subscribing");
        });
        it('should trigger the state', function(complete) {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
            s.bind('unsubscribing', function() {
                complete();
            })
            s.setState("unsubscribing");
        });
        
        describe('when setting the state to subscribed', function() {
            it('should set the subscribedAt', function(complete) {
                var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
                s.bind('subscribed', function() {
                    s.get('subscribedAt').should.be.above(new Date().getTime() - 1000);
                    s.get('subscribedAt').should.be.below(new Date().getTime() + 1000);
                    complete();
                })
                s.setState("subscribed");
            });
        });
        describe('when setting the state to unsubscribed', function() {
            it('should set the unsubscribedAt', function(complete) {
                var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
                s.bind('unsubscribed', function() {
                    s.get('unsubscribedAt').should.be.above(new Date().getTime() - 1000);
                    s.get('unsubscribedAt').should.be.below(new Date().getTime() + 1000);
                    complete();
                })
                s.setState("unsubscribed");
            });
        })
        
    });
});

describe('Subscriptions', function(){
    before(function() {
        // We need to save a couple fixture messages!
    });

    beforeEach(function() {
    });

    describe('pending', function(complete) {
        it('should yield all subscriptions whose state is "subscrbing"', function(complete) {
            var s = new Subscription({id: "http://blog.superfeedr.com/atom.xml"});
            s.bind('subscribing', function() {
                var t = new Subscription({id: "https://github.com/superfeedr.atom"});
                t.bind('subscribed', function() {
                    var u = new Subscription({id: "http://push-pub.appspot.com/feed"});
                    u.bind('subscribed', function() {
                        var v = new Subscription({id: "http://github.com/julien.atom"});
                        v.bind('subscribing', function() {
                            var pendingSubscriptions = new Subscriptions();
                            pendingSubscriptions.bind('reset',function(subscritions) {
                                pendingSubscriptions.pluck('id').should.eql([ 'http://blog.superfeedr.com/atom.xml',
                                  'http://github.com/julien.atom' ]);
                                complete();
                            });
                            pendingSubscriptions.pending();
                        });
                        v.setState("subscribing");
                    });
                    u.setState("subscribed");
                });
                t.setState("subscribed");
            });
            s.setState("subscribing");
            var subscription =  new Subscriptions();
        });
    });

});

