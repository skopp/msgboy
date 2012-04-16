var _ = require('underscore');
var should = require('chai').should();


describe('Feediscovery', function(){
    before(function(ready) {
        ready();
    });
    
    beforeEach(function(ready) {
        ready();
    });
    
    describe('get', function() {
        
        it('should extract the right feed url', function(done) {
            Feediscovery.get('http://ma.tt/', function (links) {
                links[0].href.should.equal('http://ma.tt/feed/');
                links[0].rel.should.equal('alternate');
                links[0].title.should.equal('Matt Mullenweg &raquo; Feed');
                links[0].type.should.equal('application/rss+xml');
                links[1].href.should.equal('http://ma.tt/comments/feed/');
                links[1].rel.should.equal('alternate');
                links[1].title.should.equal('Matt Mullenweg &raquo; Comments Feed');
                links[1].type.should.equal('application/rss+xml');
                done();
            });
            
        })
        
    });
});