var assert =  require('assert');
var _ = require('underscore');
var msgboyDatabase = require('../../models/database.js').msgboyDatabase;
var Message = require('../../models/message.js').Message;
var Archive = require('../../models/archive.js').Archive;

describe('Archive', function(){
    before(function(done) {
        // We need to use a distinct database and clean it up before performing the tests
        msgboyDatabase = _.clone(msgboyDatabase);
        msgboyDatabase.id = msgboyDatabase.id + "-test";
        indexedDB.deleteDatabase(msgboyDatabase.id);
        Message = Message.extend({ database: msgboyDatabase});
        Archive = Archive.extend({ database: msgboyDatabase});
        var m1 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/dummy.xml', title: 'First Message', createdAt: new Date().getTime() - 5});
        m1.bind('change', function() {
            var m2 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/real.xml',title: 'Second Message', createdAt: new Date().getTime() - 4});
            m2.bind('change', function() {
                var m3 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/dummy.xml',title: 'Third Message', createdAt: new Date().getTime() - 3});
                m3.bind('change', function() {
                    var m4 = new Message({sourceHost: 'superfeedr.com', feed: 'http://superfedr.com/dummy.xml',title: 'Fourth Message', createdAt: new Date().getTime() - 2});
                    m4.bind('change', function() {
                        var m5 = new Message({sourceHost: 'tumblr.com', feed: 'http://superfedr.com/real.xml',title: 'Message from Tumblr', createdAt: new Date().getTime() - 1});
                        m5.bind('change', function() {
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
                    assert(m.get('createdAt') <= prev.get('createdAt'));
                }
                prev = m;
            });
            done();
        });
    });
    
    describe('forFeed', function() {
        it('should return all the messages for a given feed when called with forFeed', function(done) {
            var archive =  new Archive();
            archive.bind('reset', function() {
                assert.equal(archive.length, 3);
                assert.equal(archive.at(0).get('title'), "Fourth Message");
                assert.equal(archive.at(1).get('title'), "Third Message");
                assert.equal(archive.at(2).get('title'), "First Message");
                done();
            })
            archive.forFeed('http://superfedr.com/dummy.xml');
        });
    });

    describe('load', function() {
      it('should fetch the right number of messages in the range')
    });
    
    describe('computePercentiles', function() {
      it('should compute the percentiles for 12.5%, 66% and 87.5%', function() {
        var archive =  new Archive();
        var m0 = new Message({relevance: 0.9});
        var m1 = new Message({relevance: 0.6});
        var m2 = new Message({relevance: 0.8});
        var m3 = new Message({relevance: 0.3});
        var m4 = new Message({relevance: 0.1});
        var m5 = new Message({relevance: 0.7});
        var m6 = new Message({relevance: 0.4});
        var m7 = new Message({relevance: 0.4});
        var m8 = new Message({relevance: 0.2});
        var m9 = new Message({relevance: 0.1});
        archive.add(m0);
        archive.add(m1);
        archive.add(m2);
        archive.add(m3);
        archive.add(m4);
        archive.add(m5);
        archive.add(m6);
        archive.add(m7);
        archive.add(m8);
        archive.add(m9);
        
        archive.computePercentiles();
        assert.deepEqual(archive.percentiles, [0.1, 0.7, 0.8]);
      });
    });

});

