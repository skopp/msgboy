var Subscription = require('../../src/models/subscription.js').Subscription;

describe('Subscription', function(){
    before(function() {
        // We need to save a couple fixture messages!
    });

    beforeEach(function(done) {
        var Redis = require("redis");
        Redis.createClient().flushall(function() {
            done();
        });
    });

    it('should ....', function(complete) {
        var subscription =  new Subscription();
        complete();
    });

});

var Subscriptions = require('../../src/models/subscription.js').Subscriptions;

describe('Subscriptions', function(){
    before(function() {
        // We need to save a couple fixture messages!
    });

    beforeEach(function(done) {
        var Redis = require("redis");
        Redis.createClient().flushall(function() {
            done();
        });
    });

    it('should ....', function(complete) {
        var subscription =  new Subscriptions();
        complete();
    });

});

