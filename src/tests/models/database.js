var msgboyDatabase = require('../../models/database.js').msgboyDatabase;
var assert = require('assert');

describe('Database', function(){
    before(function() {
        // We need to use a distinct database and clean it up before performing the tests
        msgboyDatabase.id = msgboyDatabase.id + "-test";
        indexedDB.deleteDatabase(msgboyDatabase.id);
    });

    beforeEach(function() {
    });

    describe('shema', function() {
        it('should have the right id', function() {
            assert.equal(msgboyDatabase.id, "msgboy-database-test");
        });
        it('should have the right description', function() {
            assert.equal(msgboyDatabase.description, "The database for the msgboy");
        });
        it('should have 7 versions', function() {
            assert.equal(msgboyDatabase.migrations.length, 7);
        });
    });
});

