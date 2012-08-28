var feender = require('feender');

// Feediscovery module. The only API that needs to be used is the Feediscovery.get
Feediscovery = function() {
  this.stack = [];
  this.running = false;
  this.cache = {};
  this.concurrent = 5;
  this.tokens = 0;
  Feediscovery.cacheSize = 1000; // That's a random number. Maybe it should be lower or higher?
}

Feediscovery.prototype.get = function (_url, _callback) {
  // Let's first do some verifications on the url to avoid wasting resources.
  if(_url.match(/chrome-extension:/) || _url.match(/javascript:/)) {
    // No feediscovery lookup for chrome extensions.
    _callback([]);
  }
  else {
    if(this.cache[_url]) {
      _callback(this.cache[_url]);
    }
    else {
      this.stack.push([_url, function(links) {
        this.cache[_url] = links; // Let's set the cache!
        // Also if the size is greater than a previously set max, we should not add more.
        var keys = Object.keys(this.cache);
        if(keys.length > this.cacheSize) {
          // Then, we need to find a key that we're going to drop.
          var k = keys[Math.floor(Math.random()*keys.length)]; // For now we drop a random key. That is not the smartest cache.
          delete this.cache[k];
        }
        _callback(links);
      }.bind(this)]);

      this.run();
    }
  }
};

// Runs the feediscovery
Feediscovery.prototype.run = function () {
  if(this.tokens < this.concurrent) {
    var next = this.stack.shift();
    if (next) {
      this.tokens += 1;
      feender(next[0], function(err, feeds) {
        next[1](feeds);
        this.tokens -= 1;
        this.run();
      }.bind(this));
    }
  }
};

exports.Feediscovery = Feediscovery;
