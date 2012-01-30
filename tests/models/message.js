var Message = require('../../src/models/message.js').Message;
var  should = require('chai').should();

describe('Message', function(){
    before(function() {
        // We need to save a couple fixture messages!
    });
    
    beforeEach(function(done) {
        var Redis = require("redis");
        Redis.createClient().flushall(function() {
            done();
        });
    });
    
    describe('defaults', function() {
        it('should have a relevance of 0.3', function() {
            var message  = new Message();
            message.get('relevance').should.equal(0.3);
        });

        it('should have a state of new', function() {
            var message  = new Message();
            message.get('state').should.equal("new");
        });
    });
    
    describe('when initializing the message', function() {
        it('should set the value for sourceHost', function() {
            var message = new Message({source: {links: {alternate: {"text/html": [{href: "http://msgboy.com/an/entry"}]}}}})
            message.get('sourceHost').should.equal("msgboy.com");
        });
        it('should set the value for sourceLink', function() {
            var message = new Message({source: {links: {alternate: {"text/html": [{href: "http://msgboy.com/an/entry"}]}}}})
            message.get('sourceLink').should.equal("http://msgboy.com/an/entry");
        });
        it('should set the value for createdAt', function() {
            var message = new Message({})
            message.get('createdAt').should.be.above(new Date().getTime() - 10);
            message.get('createdAt').should.be.below(new Date().getTime() + 10);
        });
    });
    
    describe('when voting up', function() {
        it('should set the state to up-ed', function() {
            var message  = new Message();
            message.voteUp();
            message.get('state').should.equal('up-ed');
        });
        it('should trigger change')
    });

    describe('when voting down', function() {
        it('should set the state to down-ed', function() {
            var message  = new Message();
            message.voteDown();
            message.get('state').should.equal('down-ed');
        });
        it('should trigger change')
    });

    describe('when skipping', function() {
        it('should set the state to skiped', function() {
            var message  = new Message();
            message.skip();
            message.get('state').should.equal('up-ed');
        });
        it('should trigger change')
    });
    
    describe('when setting the state', function() {
        it('should set the state to up-ed', function() {
            var message  = new Message();
            message.voteUp();
            message.get('state').should.equal('up-ed');
        });
        it('should trigger change')
    });
    
});
