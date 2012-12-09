var msgboyDatabase = {
    id: "msgboy-database",
    description: "The database for the msgboy",
    migrations: [{
        version: 1,
        migrate: function (transaction, next) {
            var messageStore = transaction.db.createObjectStore("messages");
            messageStore.createIndex("createdAtIndex", "createdAt", {
                unique: false
            });
            messageStore.createIndex("sourceLinkIndex", "sourceLink", {
                unique: false
            });
            messageStore.createIndex("hostIndex", "sourceHost", {
                unique: false
            });
            messageStore.createIndex("stateIndex", "state", {
                unique: false
            });
            messageStore.createIndex("feedIndex", "feed", {
                unique: false
            });
            var inboxStore = transaction.db.createObjectStore("inbox");
            var feedStore = transaction.db.createObjectStore("feeds");
            feedStore.createIndex("urlIndex", "url", {
                unique: false
            });
            var subscriptionStore = transaction.db.createObjectStore("subscriptions");
            subscriptionStore.createIndex("stateIndex", "state", {unique: false});
            subscriptionStore.createIndex("subscribedAtIndex", "subscribedAt", {unique: false});
            subscriptionStore.createIndex("unsubscribedAtIndex", "unsubscribedAt", {unique: false});
            next();
        }
    }]
};

exports.msgboyDatabase = msgboyDatabase
