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

        Msgboy.bind('inbox:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:welcome",
                "title": "Welcome to msgboy! He will show you the web you care about in boxes like these ones.",
                "ungroup": true,
                "summary": 'Welcome to msgboy! He will show you the web you care about.',
                "image": 'http://download.msgboy.com/resources/triggered/welcome_to_msgboy1.png',
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
                    "title": "Msgboy Tips",
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
                "id": "tag:msgboy.com,2012:import-subscriptions",
                "title": 'Click on this box to subscribe to new sites.',
                "ungroup": true,
                "summary": 'Click on this box to subscribe to new sites.',
                "image": 'http://download.msgboy.com/resources/triggered/subcriptionmanagement.png',
                "content": null,
                "links": {
                    "alternate": {
                        "text/html": [
                        {
                            "href": '/data/html/import.html',
                            "rel": "alternate",
                            "title": "Import subscriptions to Msgboy",
                            "type": "text/html"
                        }
                        ]
                    }
                },
                "createdAt": new Date().getTime(),
                "source": {
                    "title": "Msgboy Tips",
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
                "relevance": 0.5,
                "published": new Date().toISOString(),
                "updated": new Date().toISOString()
            });
        });

        Msgboy.bind('subscription:new', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:bookmark-and-visit",
                "title": "Bookmark sites you love to subscribe to them easily",
                "ungroup": true,
                "image": "http://download.msgboy.com/resources/triggered/bookmark_sites_you_love.png",
                "summary": "You can bookmark sites you love. The msgboy will show you messages when they update!",
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
                    "title": "Msgboy Tips",
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

        Msgboy.bind('down-ed', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:first-downvote",
                "title": "This was your first down-vote",
                "ungroup": true,
                "summary": 'Click this box to learn more about what happens when you down-vote!',
                "image": 'http://download.msgboy.com/resources/triggered/down_voting.png',
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
                    "title": "Msgboy Tips",
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

        Msgboy.bind('later', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:real-time",
                "title": "Newly posted stories appear in realtime.",
                "ungroup": true,
                "summary": "Newly posted stories appear in realtime, so you're always the first to know!",
                "image": "http://download.msgboy.com/resources/triggered/realtime.png",
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
                    "title": "Msgboy Tips",
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

        Msgboy.bind('messages:added', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:train",
                "title": "Vote message up and down to train Msgboy.",
                "ungroup": true,
                "summary": "The msgboy gets better when you use him more. Vote stuff up and down to tell him what you like.",
                "image": "http://download.msgboy.com/resources/triggered/train_it.png",
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
                    "title": "Msgboy Tips",
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

        Msgboy.bind('anotherevent', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:vote-up",
                "title": "Click '+' for more like this.",
                "ungroup": true,
                "summary": "Vote stories up if you want more like them.",
                "image": "http://download.msgboy.com/resources/triggered/vote_up.png",
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
                    "title": "Msgboy Tips",
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

        Msgboy.bind('anotherevent', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:vote-down",
                "title": "Click '-' if you're not interested.",
                "ungroup": true,
                "summary": "Vote a story down if you want less stories like it. The msgboy will also unsubscribe from those unwanted sources.",
                "image": "http://download.msgboy.com/resources/triggered/vote_down.png",
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
                    "title": "Msgboy Tips",
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

        Msgboy.bind('later', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:notifications",
                "title": "Have you tried notifications?",
                "ungroup": true,
                "summary": "Click to go to the settings and enable them!",
                "image": "http://download.msgboy.com/resources/triggered/notifications.png",
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
                    "title": "Msgboy Tips",
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

        Msgboy.bind('notification:shown', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:use-settings",
                "title": "You can throttle notifications in settings.",
                "ungroup": true,
                "summary": "But don't forget that the msgboy is here to help, so he can also STFU!",
                "image": "http://download.msgboy.com/resources/triggered/msgboy_settings.png",
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
                    "title": "Msgboy Tips",
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

        Msgboy.bind('later', function() {
            saveMessage({
                "id": "tag:msgboy.com,2012:your-data-protected",
                "title": "Your data is safe and protected.",
                "ungroup": true,
                "summary": "The msgboy runs locally; all your browsing data stays local.",
                "image": "http://download.msgboy.com/resources/triggered/your_data_is_protected.png",
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
                    "title": "Msgboy Tips",
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
