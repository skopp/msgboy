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

