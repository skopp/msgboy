var assert = require('assert');
var Message = require('../../models/message.js').Message;

describe('Message', function(){
  before(function() {
    // We need to save a couple fixture messages!
  });

  beforeEach(function() {
  });

  describe('defaults', function() {
    it('should have a relevance of 0.6', function() {
      var message  = new Message();
      assert.equal(message.get('relevance'), 0.6);
    });

    it('should have a state of new', function() {
      var message  = new Message();
      assert.equal(message.get('state'), "new");
    });
  });

  describe('when initializing the message', function() {
    it('should set the value for sourceHost', function() {
      var message = new Message({source: {links: {alternate: [{href: "http://msgboy.com/an/entry", type: "text/html"}]}}});
      assert.equal(message.get('sourceHost'), "msgboy.com");
    });
    it('should set the value for sourceLink', function() {
      var message = new Message({source: {links: {alternate: [{href: "http://msgboy.com/an/entry", type: "text/html"}]}}});
      assert.equal(message.get('sourceLink'), "http://msgboy.com/an/entry");
    });
    it('should set the value for createdAt', function() {
      var message = new Message({})
      assert(message.get('createdAt') >= new Date().getTime() - 10);
      assert(message.get('createdAt') <= new Date().getTime() + 10);
    });
    it('should set the value for mainLink', function() {
      var message = new Message({links: {alternate: {"text/html": [{href: "http://msgboy.com/an/entry"}]}}});
      assert.equal(message.get('mainLink'), "http://msgboy.com/an/entry");
    });
    it('should set the value for text to the summary if no content exists', function() {
      var _summary = "summary";
      var message = new Message({summary: _summary});
      assert.equal(message.get('text'), _summary);
    });
    it('should set the value for text to the content if no summary exists', function() {
      var _content = "content";
      var message = new Message({content: _content});
      assert.equal(message.get('text'), _content);
    });
    it('should set the value for text to the content if it s longer than the summary', function() {
      var _summary = "summary";
      var _content = "content is longer here";
      var message = new Message( {summary: _summary, content: _content});
      assert.equal(message.get('text'), _content);
    });
    it('should set the value for text to the summary if it s longer than the content', function() {
      var _summary = "summary is longer here";
      var _content = "content";
      var message = new Message( {summary: _summary, content: _content});
      assert.equal(message.get('text'), _summary);
    });
  });

  describe('when voting up', function() {
    it('should set the state to up-ed', function() {
      var message  = new Message();
      message.voteUp();
      assert.equal(message.get('state'), 'up-ed');
    });
  });

  describe('when voting down', function() {
    it('should set the state to down-ed', function() {
      var message  = new Message();
      message.voteDown();
      assert.equal(message.get('state'), 'down-ed');
    });
  });

  describe('when skipping', function() {
    it('should set the state to skiped', function() {
      var message  = new Message();
      message.skip();
      assert.equal(message.get('state'), 'skipped');
    });
  });

  describe('when setting the state', function() {
    it('should set the state accordingly', function() {
      var message  = new Message();
      message.setState("up-ed");
      assert.equal(message.get('state'), 'up-ed');
    });
    it('should trigger the state event', function(done) {
      var message  = new Message();
      message.bind('up-ed', function() {
        done();
      });
      message.setState("up-ed");
    });
    it('should call the callback if defined', function(done) {
      var message  = new Message();
      message.setState("up-ed", function(result) {
        assert.equal(result, true);
        done();
      });
    });
  });

  describe('calculateRelevance', function() {
  });

  describe('when saving', function() {
    it('should not save duplicate messages (with the same id)', function(done) {
      var id = "a-unique-id";

      var runTest = function() {
        var message  = new Message();
        message.create({id: id}, {
          success: function() {
            var dupe = new Message();
            dupe.create({id: id}, {
              success: function() {
                // This should not happen!
                throw new Error('We were able to save the dupe!');
              },
              error: function() {
                done();
              }
            });
          }.bind(this),
          error: function() {
            throw new Error('We couldn\'t save the message');
            // This should not happen!
          }.bind(this)
        });
      };

      // First, we need to clean up any existing message.
      var clean = new Message({id: id});
      clean.fetch({
        success: function () {
          // The message exists! Let's delete it.
          clean.destroy({
            success: function() {
              runTest();
            }.bind(this)
          });
        }.bind(this),
        error: function () {
          // The message does not exist.
          runTest();
        }.bind(this)
      })
    });

    it('should yet allow for updates', function(done) {
      var id = "a-unique-id";
      var message  = new Message();
      message.save({id: id}, {
        success: function() {
          message.save({title: "hello world"}, {
            success: function() {
              // This should not happen!
              done();
            },
            error: function() {
              throw new Error('We were not able to update the message.');
            }
          });
        }.bind(this),
        error: function() {
          throw new Error('We couldn\'t save the message');
          // This should not happen!
        }.bind(this)
      }); 
    })
  });

  describe('relevanceBasedOnBrothers', function() {
  });
});
