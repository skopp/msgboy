var Archive = require('../models/archive.js');

describe('Archive', function(){
    var archive =  new Archive({cool: 'stuff'});
    before(function() {
        // We need to save a couple fixture messages!
    });
    
    beforeEach(function() {
        // reset the archive
    });
    
    
    it('should sort message in reverse chronological order'); //, function(complete) {
    //          complete();
    //      });
    
    it('should yield messages one after the other when called with each');// , function(complete) {   
    //         complete();
    //     });
    
    it('should yield the next message when called with next');// , function(complete) {   
    //         complete(new Error('I am ugly'));
    //     });
    
    it('should return all the messages for a given feed when called with forFeed');// , function(complete) {
    //         complete();
    //     });
    
});
    
