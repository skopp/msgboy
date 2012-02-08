var _ = require('underscore');
var Message = require('../../src/models/message.js').Message;
var Archive = require('../../src/models/archive.js').Archive;
var should = require('chai').should();

describe('Archive', function(){
    before(function() {
        // We need to save a couple fixture messages!
    });

    beforeEach(function(done) {
        var Redis = require("redis");
        Redis.createClient().flushall(function() {
            // Let's create Messages!
            var m1 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/dummy.xml', title: 'First Message', createdAt: new Date().getTime() - 5});
            m1.bind('sync', function() {
                var m2 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/real.xml',title: 'Second Message', createdAt: new Date().getTime() - 4});
                m2.bind('sync', function() {
                    var m3 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/dummy.xml',title: 'Third Message', createdAt: new Date().getTime() - 3});
                    m3.bind('sync', function() {
                        var m4 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/dummy.xml',title: 'Fourth Message', createdAt: new Date().getTime() - 2});
                        m4.bind('sync', function() {
                            var m5 = new Message({sourceHost: 'tumblr.com', feed: 'http://superfedr.com/real.xml',title: 'Message from Tumblr', createdAt: new Date().getTime() - 1});
                            m5.bind('sync', function() {
                                done();
                            });
                            m5.save();
                        });
                        m4.save();
                    });
                    m3.save();
                });
                m2.save();
            });
            m1.save();
        });
    });

    describe('comparator', function() {
        it('should sort all the messages by createdAt', function(done) {
            var archive =  new Archive();
            var twelveHourAgoMessage = new Message({title: "Twelve Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 12});
            var twentyFourHourAgoMessage = new Message({title: "Twenty-Four Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 24});
            var sixHourAgoMessage = new Message({title: "Six Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 6});
            var eighteenHourAgoMessage = new Message({title: "Eighteen Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 18});
            var threeHourAgoMessage = new Message({title: "Three Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 3});
            var NineHourAgoMessage = new Message({title: "Nine Hour Ago" , createdAt: new Date().getTime() - 1000 * 60 * 60 * 9});
            archive.add(twelveHourAgoMessage);
            archive.add(twentyFourHourAgoMessage);
            archive.add(threeHourAgoMessage);
            archive.add(NineHourAgoMessage);
            archive.add(eighteenHourAgoMessage);
            archive.add(sixHourAgoMessage);
            var prev = null;
            archive.each(function(m) {
                if(prev) {
                    m.get('createdAt').should.be.below(prev.get('createdAt'));
                }
                prev = m;
            });
            done();
        })
    })
    
    describe('next', function() {
        it('should add messages one by one', function(done) {
            var archive =  new Archive();
            archive.model = Message;
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
            archive.model = Message;
            var count = 0;
            var limit = 3;
            archive.bind('add', function(message) {
                count += 1;
                if(count === limit) {
                    _.each(archive.pluck('sourceHost'), function(h) {
                        h.should.equal('superfeedr.com');
                    });
                    done();
                }
            })
            archive.next(limit, {sourceHost: "superfeedr.com"});
        });
        
    });
    
    describe('forFeed', function() {
        it('should return all the messages for a given feed when called with forFeed', function(done) {
            var archive =  new Archive();
            archive.model = Message;
            archive.bind('reset', function() {
                archive.length.should.equal(3);
                archive.at(0).get('title').should.equal("Fourth Message");
                archive.at(1).get('title').should.equal("Third Message");
                archive.at(2).get('title').should.equal("First Message");
                done();
            })
            archive.forFeed('http://superfedr.com/dummy.xml');
        });
        
    });

    
});

