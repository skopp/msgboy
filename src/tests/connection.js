var Connection = require('../connection.js').Connection;
var endpoint = "http://stream.msgboy.com";

var c = new Connection();
c.connect(endpoint, "hello", 'world');

// describe('Connection', function() {
//    it('should connect', function(done) {
//        c.on('ready', function() {
//            done(); 
//        });
//    });
// });
// 
// describe('Subscriptions', function() {
//     it('should allow for a subscription', function(done) {
//          this.timeout(10000);
//          c.subscribe('http://push-pub.appspot.com/feed', function(res) {
//              if(res) {
//                  done();
//              }
//          });
//      });
//      it('should allow for unsubscriptions', function(done) {
//          this.timeout(10000);
//          c.unsubscribe('http://push-pub.appspot.com/feed', function(res) {
//              if(res) {
//                  done();
//              }
//          });
//      });
// });

describe('disconnects', function() {
    it('should reconnect', function(done) {
        this.timeout(10000);
        var first = false
        c.on('ready', function() {
            if(first) {
                done(); // that means we reconnected already
            }
            else {
                first = true;
                c._socket.disconnect();
            }
        });
        
    });
});