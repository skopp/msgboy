var Message = require('./message.js').Message;

var Msgboy = null;

var saveMessage = function(message, cb) {
    var msg = new Message(message);
    msg.create({}, {
        success: function () {
            Msgboy.log.debug("Saved message " + msg.id);
            if(typeof cb !== "undefined") {
                cb(msg);
            }
        }.bind(this),
        error: function (object, error) {
            // Message was not saved... probably a dupe
            Msgboy.log.debug("Could not save message " + JSON.stringify(msg.toJSON()));
            Msgboy.log.debug(error);
        }.bind(this)
    });
}

var MessageTrigger = {
    observe: function(msgboy) {
        Msgboy = msgboy;
        
        // Template
        // Msgboy.bind('inbox:new', function() {
        //     saveMessage();
        // });
        
        Msgboy.bind('down-ed', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:first-downvote",
                "title": "This was your first downvote",
                "ungroup": true,
                "summary": 'Click this box to learn more about what happens when you down-vote!',
                "image": '',
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/HMQu9Q',
                            "rel": "alternate",
                            "title": "Down-voting",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime(),
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "alternate": "http://msgboy.com/",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 1.0,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            }, function(message) {
                Msgboy.inbox.trigger("messages:added", message);
            });
        });

        Msgboy.bind('plugins:imported', function(count) {
            saveMessage({
                "id": "tag:msgboy.com,2012:plugins",
                "title": "We successfuly found " + count + " site for you!",
                "ungroup": true,
                "summary": 'When looking at your <em>browsing habits</em>, we found ' + count + ' sites you seem to care about.',
                "image": '',
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/HiC1pI',
                            "rel": "alternate",
                            "title": "Msgboy plugins",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime(),
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "alternate": "http://msgboy.com/",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            }, function(message) {
                Msgboy.inbox.trigger("messages:added", message);
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:welcome",
                "title": "Welcome to msgboy! He will show you the web you care about.",
                "ungroup": true,
                "summary": 'Welcome to msgboy! It will show you the web you care about.',
                "image": '/views/images/msgboy-help-screen-1.png',
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GM8UEd',
                            "rel": "alternate",
                            "title": "Welcome to Msgboy",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime(),
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "alternate": "http://msgboy.com/",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 1.0,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:bookmark-and-visit",
                "title": "Bookmark or come back to sites you love.",
                "ungroup": true,
                "image": "/views/images/msgboy-help-screen-2.png",
                "summary": "Bookmark sites you love. The msgboy will show you messages when they update",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GH1qqp',
                            "rel": "alternate",
                            "title": "Bookmark or come back to sites you love.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 1000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "alternate": "http://msgboy.com/",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:real-time",
                "title": "Newly posted stories appear in realtime.",
                "ungroup": true,
                "summary": "Newly posted stories appear in realtime, so you're always aware the first to know",
                "image": "/views/images/msgboy-help-screen-3.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GGed9c',
                            "rel": "alternate",
                            "title": "Newly posted stories appear in realtime.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 2000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:train",
                "title": "Train msgboy to give you what you want.",
                "ungroup": true,
                "summary": "The msgboy gets better when you use it more. Vote stuff up and down",
                "image": "/views/images/msgboy-help-screen-5.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GPqQRH',
                            "rel": "alternate",
                            "title": "Train msgboy to give you what you want.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 3000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:vote-up",
                "title": "Click '+' for more like this.",
                "ungroup": true,
                "summary": "Vote stories up if you want more like them",
                "image": "/views/images/msgboy-help-screen-6.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GFvG6L',
                            "rel": "alternate",
                            "title": "Click '+' for more like this.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 4000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.8,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:vote-down",
                "title": "Click '-' if you're not interested.",
                "ungroup": true,
                "summary": "Vote stories down if you want less stories like that. The msgboy will also unsubscribe from those unwanted sources",
                "image": "/views/images/msgboy-help-screen-7.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GM9e5U',
                            "rel": "alternate",
                            "title": "Click '-' if you're not interested.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 5000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:notifications",
                "title": "Follow and rate stories with notifications.",
                "ungroup": true,
                "summary": "Get notifications... so that even if you are now looking at the msgboy, you know about stuff!",
                "image": "/views/images/msgboy-help-screen-8.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GHdxzD',
                            "rel": "alternate",
                            "title": "Follow and rate stories with notifications.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 6000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:use-settings",
                "title": "You can throttle notifications in settings.",
                "ungroup": true,
                "summary": "But don't forget that the msgboy is here to help, so he can also STFU!",
                "image": "/views/images/msgboy-help-screen-9.png",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GH1AhF',
                            "rel": "alternate",
                            "title": "You can throttle notifications in settings.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 7000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
        
        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:your-data-protected",
                "title": "Your data is safe and protected.",
                "ungroup": true,
                "summary": "The msgboy runs locally. All your browsing data stays local.",
                "image": "",
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": 'http://msg.by/GGyPSx',
                            "rel": "alternate",
                            "title": "Your data is safe and protected.",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime() - 7000,
                "source": {
                    "title": "Msgboy",
                    "url": "http://blog.msgboy.com/",
                    "links": {
                        "alternate": {
                            "text/html": [
                            {
                                "href": "http://blog.msgboy.com/",
                                "rel": "alternate",
                                "title": "",
                                "type": "text/html"
                            }
                            ]
                        }
                    }
                },
                "sourceHost": "msgboy.com",
                "state": "new",
                "feed": "http://blog.msgboy.com/rss",
                "relevance": 0.6,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });
    }
}

exports.MessageTrigger = MessageTrigger;