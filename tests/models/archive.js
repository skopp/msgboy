var Archive = require('../../src/models/archive.js').Archive;

describe('Archive', function(){
    before(function() {
        // We need to save a couple fixture messages!
    });

    beforeEach(function(done) {
        var Redis = require("redis");
        Redis.createClient().flushall(function() {
            done();
        });
    });
    
    describe('next', function() {
        it('should add messages one by one', function(done) {
            var archive =  new Archive();
            var count = 0;
            var limit = 3;
            archive.bind('add', function(message) {
                count += 1;
                if(count === limit) {
                    done();
                }
            })
            archive.next(limit);
        });
        
        it('should stick to the conditions on messages added', function(done) {
            var archive =  new Archive();
            var count = 0;
            var limit = 3;
            archive.bind('add', function(message) {
                count += 1;
                if(count === limit) {
                    archive.pluck('sourceHost').should.equal(['superfeedr.com', 'superfeedr.com', 'superfeedr.com']);
                    done();
                }
            })
            archive.next(limit, {sourceHost: "superfeedr.com"})
        });
        
    });

    describe('forFeed', function() {
        
    });

    it('should sort message in reverse chronological order', function(complete) {
        var archive =  new Archive();
        complete();
    });

    it('should yield messages one after the other when called with each', function(complete) {   
        var archive =  new Archive();
        complete();
    });

    it('should yield the next message when called with next', function(complete) {   
        var archive =  new Archive();
        complete();
        // complete(new Error('I am ugly'));
    });

    it('should return all the messages for a given feed when called with forFeed', function(complete) {
        var archive =  new Archive();
        complete();
    });

});

