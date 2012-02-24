var msgboyDatabase = {
    id: "msgboy-database",
    description: "The database for the msgboy",
    migrations: [{
        version: 1,
        migrate: function (transaction, next) {
            transaction.db.createObjectStore("messages");
            transaction.db.createObjectStore("inbox");
            next();
        }
    }, {
        version: 2,
        migrate: function (transaction, next) {
            var store = transaction.objectStore("messages");
            store.createIndex("createdAtIndex", "createdAt", {
                unique: false
            });
            next();
        }
    }, {
        version: 3,
        migrate: function (transaction, next) {
            var store = transaction.db.createObjectStore("feeds");
            store.createIndex("urlIndex", "url", {
                unique: false
            });
            next();
        }
    }, {
        version: 4,
        migrate: function (transaction, next) {
            var store = transaction.objectStore("messages");
            store.createIndex("sourceLinkIndex", "sourceLink", {
                unique: false
            });
            store.createIndex("hostIndex", "sourceHost", {
                unique: false
            });
            next();
        }
    }, {
        version: 5,
        migrate: function (transaction, next) {
            var store = transaction.objectStore("messages");
            store.createIndex("stateIndex", "state", {
                unique: false
            });
            next();
        }
    }, {
        version: 6,
        migrate: function (transaction, next) {
            var store = transaction.objectStore("messages");
            store.createIndex("feedIndex", "feed", {
                unique: false
            });
            next();
        }
    }, {
        version: 7,
        migrate: function (transaction, next) {
            var subscriptions = transaction.db.createObjectStore("subscriptions");
            subscriptions.createIndex("stateIndex", "state", {unique: false});
            subscriptions.createIndex("subscribedAtIndex", "subscribedAt", {unique: false});
            subscriptions.createIndex("unsubscribedAtIndex", "unsubscribedAt", {unique: false});
            next();
        }
    }]
};

exports.msgboyDatabase = msgboyDatabase