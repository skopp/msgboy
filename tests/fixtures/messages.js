var MessageFixtures = function () {}

MessageFixtures.prototype = {
    messages: [{
        id: "123",
        sourceLink: "http://blog.superfeedr.com",
        host: "blog.superfeedr.com",
        state: "up-ed",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 7
    }, {
        id: "124",
        sourceLink: "http://blog.superfeedr.com",
        host: "blog.superfeedr.com",
        state: "down-ed",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 6.3
    }, {
        id: "125",
        sourceLink: "http://blog.superfeedr.com",
        host: "blog.superfeedr.com",
        state: "new",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 24 * 2.1
    }, {
        id: "126",
        sourceLink: "https://github.com/superfeedr.atom",
        host: "github.com",
        state: "skipped",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 19.3
    }, {
        id: "127",
        sourceLink: "http://www.nytimes.com/",
        host: "nytimes.com",
        state: "up-ed",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 19.1
    }, {
        id: "128",
        sourceLink: "http://www.nytimes.com/",
        host: "nytimes.com",
        state: "up-ed",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 14
    }, {
        id: "129",
        sourceLink: "http://www.nytimes.com/",
        host: "nytimes.com",
        state: "skipped",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 8
    }, {
        id: "130",
        sourceLink: "http://www.nytimes.com/",
        host: "nytimes.com",
        state: "skipped",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 7.9
    }, {
        id: "131",
        sourceLink: "http://blog.superfeedr.com",
        host: "blog.superfeedr.com",
        state: "down-ed",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 7.7
    }, {
        id: "132",
        sourceLink: "http://blog.superfeedr.com",
        host: "blog.superfeedr.com",
        state: "new",
        createdAt: new Date().getTime() - 1000 * 60 * 60 * 7.5
    }],

    add_all: function (done) {
        var messages = _.clone(this.messages);
        this.add_more(messages, done);
    },

    add_more: function (messages, done) {
        var message = messages.shift();
        if (message) {
            var msg = new Message();
            msg.save(message, {
                success: function (obj, err) {
                    this.add_more(messages, done);
                }.bind(this),
                error: function (obj, err) {
                    this.add_more(messages, done);
                }.bind(this)
            });
        } else {
            done();
        }
    },

    clean_all: function (done) {
        // We need to clean all the items.
        var ids = _.pluck(this.messages, 'id');
        var deleted_all = _.after(ids.length, done)
        _.each(ids, function (_id) {
            var message = new Message({
                id: _id
            })
            message.destroy({
                success: deleted_all,
                error: deleted_all
            });
        });
    },

    clean_add: function (done) {
        this.clean_all(function () {
            this.add_all(done);
        }.bind(this));
    }
}

var messageFixtures = new MessageFixtures();