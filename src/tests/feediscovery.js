var _ = require('underscore');
var Feediscovery = require('../feediscovery.js').Feediscovery;
var assert = require('assert');

var feediscovery = new Feediscovery();

describe('Feediscovery', function(){
    before(function(ready) {
        ready();
    });
    
    beforeEach(function(ready) {
        ready();
    });
    
    describe('get', function() {
        
        it('should extract the right feed url', function(done) {
            feediscovery.cache = {};
            feediscovery.get('http://ma.tt/', function (links) {
                assert.equal(links[0].href, 'http://ma.tt/feed/');
                assert.equal(links[0].rel, 'alternate');
                assert.equal(links[0].title, 'Matt Mullenweg &raquo; Feed');
                assert.equal(links[0].type, 'application/rss+xml');
                assert.equal(links[1].href, 'http://ma.tt/comments/feed/');
                assert.equal(links[1].rel, 'alternate');
                assert.equal(links[1].title, 'Matt Mullenweg &raquo; Comments Feed');
                assert.equal(links[1].type, 'application/rss+xml');
                done();
            });
        });
        it('should set the cache', function(done) {
            feediscovery.cache = {};
            feediscovery.get('http://ma.tt/', function (links) {
                assert.equal(feediscovery.cache['http://ma.tt/'][0].href, links[0].href);
                done();
            })
        });
        
        it('should run synchronously');
        
        it('should use the cache when an item was cached', function(done) {
            feediscovery.cache = {
                'http://ma.tt/': [
                    {
                        href: 'http://ma.tt/feedForMattsBlog/'
                    }
                ]
            };
            feediscovery.get('http://ma.tt/', function (links) {
                assert.equal(links[0].href, 'http://ma.tt/feedForMattsBlog/');
                done();
            });
            
        });
        
        it('should not cache more than a given number of values', function(done) {
            feediscovery.cache = {
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
            feediscovery.cacheSize = 3;
            feediscovery.get('http://apple.com', function (links) {
                assert.equal(Object.keys(feediscovery.cache).length, 3);
                done();
            });
            
        });
    });
});