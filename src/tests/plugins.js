var should = require('chai').should();
var Plugins = require('../plugins.js').Plugins;

describe('Plugins', function(){
    before(function(ready) {
        ready();
    });

    beforeEach(function(ready) {
        ready();
    });
    
    describe('importSubscriptions', function() {
        beforeEach(function(ready) {
            Plugins.all = [];
            Plugins.register({
                listSubscriptions: function(cb, done) {
                    cb({url: "url1", title: "title1"});
                    cb({url: 'url2', title: "title2"});
                    cb({url: 'url3', title: "title3"});
                    done(3)
                },
                name: "Stub 1"
            });
            Plugins.register({
                listSubscriptions: function(cb, done) {
                    cb({url: "url4", title: "title4"});
                    cb({url: 'url5', title: "title5"});
                    done(2)
                },
                name: "Stub 2"
            });
            ready();
        });
        it('should listSubscriptions for each plugin', function(done) {
            var subscriptionsUrls = []
            Plugins.importSubscriptions(function(sub) {
                subscriptionsUrls.push(sub.url)
            }, function(count) {
                if(count === 5) {
                    subscriptionsUrls.should.include('url1');
                    subscriptionsUrls.should.include('url2');
                    subscriptionsUrls.should.include('url3');
                    subscriptionsUrls.should.include('url4');
                    subscriptionsUrls.should.include('url5');
                    done();
                }
            });
        });
    });
    
    it("should have a 'Blogger' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === "Blogger") {
                done();
            }
        });
    });

    it("should have a 'Browser Bookmarks' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Browser Bookmarks') {
                done();
            }
        });
    });

    it("should have a Digg plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Digg') {
                done();
            }
        });
    });

    it("should have a 'Disqus Comments' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Disqus Comments') {
                done();
            }
        });
    });

    it("should have a 'Generic plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Generic') {
                done();
            }
        });
    });

    it("should have a 'Google Reader' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Google Reader') {
                done();
            }
        });
    });

    it("should have a 'Browsing History' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Browsing History') {
                done();
            }
        });
    });

    it("should have a 'Posterous' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Posterous') {
                done();
            }
        });
    });

    it("should have a 'Quora People' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Quora People') {
                done();
            }
        });
    });

    it("should have a 'Quora Topics' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Quora Topics') {
                done();
            }
        });
    });

    it("should have a 'Status.net' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Status.net') {
                done();
            }
        });
    });

    it("should have a 'Tumblr' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Tumblr') {
                done();
            }
        });
    });

    it("should have a 'Typepad' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Typepad') {
                done();
            }
        });
    });
    
    it("should have a 'Wordpress' plugin", function(done) {
        _.each(Plugins.all, function(plugin) {
            if(plugin.name === 'Wordpress') {
                done();
            }
        });
    });
    
    // require('./plugins/blogger.js');
    // require('./plugins/bookmarks.js');
    require('./plugins/digg.js');
    require('./plugins/disqus.js');
    require('./plugins/generic.js');
    require('./plugins/google-reader.js');
    require('./plugins/history.js');
    require('./plugins/posterous.js');
    require('./plugins/quora-people.js');
    require('./plugins/quora-topics.js');
    require('./plugins/statusnet.js');
    require('./plugins/tumblr.js');
    require('./plugins/typepad.js');
    require('./plugins/wordpress.js');
    
});