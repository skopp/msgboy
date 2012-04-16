var _ = require('underscore');
var should = require('chai').should();
var Feediscovery = require('../feediscovery.js').Feediscovery;


describe('Feediscovery', function(){
    before(function(ready) {
        ready();
    });
    
    beforeEach(function(ready) {
        ready();
    });
    
    describe('get', function() {
        
        it('should extract the right feed url', function(done) {
            Feediscovery.cache = {};
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
        });
        it('should set the cache', function(done) {
            Feediscovery.cache = {};
            Feediscovery.get('http://ma.tt/', function (links) {
                Feediscovery.cache['http://ma.tt/'][0].href.should.equal(links[0].href);
                done();
            })
        });
        
        it('should run synchronously');
        
        it('should use the cache when an item was cached', function(done) {
            Feediscovery.cache = {
                'http://ma.tt/': [
                    {
                        href: 'http://ma.tt/feedForMattsBlog/'
                    }
                ]
            };
            Feediscovery.get('http://ma.tt/', function (links) {
                links[0].href.should.equal('http://ma.tt/feedForMattsBlog/');
                done();
            });
            
        });
        
        it('should not cache more than a given number of values', function(done) {
            Feediscovery.cache = {
                'http://ma.tt/': [ {
                    href: 'http://ma.tt/feedForMattsBlog/'
                }],
                'http://blog.msgboy.com/': [{
                    href: "http://blog.msgboy.com/rss"
                }],
                'http://blog.superfeedr.com/': [{
                    href: 'http://blog.superfeedr.com/atom.xml'
                }]
            };
            Feediscovery.cacheSize = 3;
            Feediscovery.get('http://apple.com', function (links) {
                Object.keys(Feediscovery.cache).length.should.equal(3);
                done();
            });
            
        });
    });
});