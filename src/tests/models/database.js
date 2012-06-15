var msgboyDatabase = require('../../models/database.js').msgboyDatabase;

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
            msgboyDatabase.id.should.equal("msgboy-database-test");
        });
        it('should have the right description', function() {
            msgboyDatabase.description.should.equal("The database for the msgboy");
        });
        it('should have 7 versions', function() {
            msgboyDatabase.migrations.should.have.length(7);
        });
    });
});

