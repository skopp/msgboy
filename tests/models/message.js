var _ = require('underscore')._,
Backbone = require('backbone');


var Message = require('../../models/message.js').Message;


describe('Message', function(){
    var message =  new Message();
    before(function() {
        // We need to save a couple fixture messages!
    });
    
    beforeEach(function() {
        // reset the message
    });
    
    describe('defaults', function() {
        it('should have a relevance of 0.3', function(done) {
            message.get('relevance') === 0.5
        });
    });
    
});
    
