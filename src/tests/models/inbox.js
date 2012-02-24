var _ = require('underscore');
var msgboyDatabase = require('../../models/database.js').msgboyDatabase;
var Inbox = require('../../models/inbox.js').Inbox;

describe('Inbox', function(){
    before(function() {
        msgboyDatabase = _.clone(msgboyDatabase);
        msgboyDatabase.id = msgboyDatabase.id + "-test";
        indexedDB.deleteDatabase(msgboyDatabase.id);
        Inbox = Inbox.extend({ database: msgboyDatabase});
    });

    beforeEach(function() {
    });

    describe('setup', function() {
        it('should trigger ready if the inbox was created', function(done) {
            var inbox =  new Inbox();
            inbox.bind('ready', function() {
                done();
            })
            inbox.setup("login", "token")
        });

        it('should trigger new if the inbox was not created', function(done) {
            var inbox =  new Inbox();
            inbox.bind('new', function() {
                done();
            })
            inbox.setup("login", "token")
        });
    });
    
    describe('fetchAndPrepare', function() {
        it('should trigger ready if the inbox was found with the right parameters', function(done) {
            var inbox =  new Inbox();
            inbox.bind('ready', function() {
                var jnbox =  new Inbox();
                jnbox.bind('ready', function() {
                    done();
                });
                jnbox.fetchAndPrepare();
            });
            inbox.setup("login", "token");
        });
        it('should trigger error if the jid is missing', function(done) {
            var inbox =  new Inbox();
            inbox.bind('ready', function() {
                var jnbox =  new Inbox();
                jnbox.bind('error', function() {
                    done();
                });
                jnbox.fetchAndPrepare();
            });
            inbox.setup("token");
        });
        it('should trigger ready if the inbox was not found', function(done) {
            var inbox =  new Inbox();
            inbox.bind('error', function() {
                done();
            })
            inbox.fetchAndPrepare();
        })
    })

});

