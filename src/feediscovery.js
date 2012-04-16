// Feediscovery module. The only API that needs to be used is the Feediscovery.get
Feediscovery = {};
Feediscovery.stack = [];
Feediscovery.running = false;
// For now, let's just use a regular object.
// We may want to cap its size (LRU policy)
// and also persist its content before shutting down the browser.
Feediscovery.cache = {}
Feediscovery.cacheSize = 1000; // That's a random number. Maybe it should be lower or higher?

Feediscovery.get = function (_url, _callback) {
    // Let's first do some verifications on the url to avoid wasting resources.
    if(_url.match(/chrome-extension:/) || _url.match(/javascript:/)) {
        // No feediscovery lookup for chrome extensions.
        _callback([]);
    }
    else {
        if(Feediscovery.cache[_url]) {
            _callback(Feediscovery.cache[_url]);
        }
        else {
            Feediscovery.stack.push([_url, function(links) {
                Feediscovery.cache[_url] = links; // Let's set the cache!
                // Also if the size is greater than a previously set max, we should not add more.
                var keys = Object.keys(Feediscovery.cache);
                if(keys.length > Feediscovery.cacheSize) {
                    // Then, we need to find a ley that we're going to drop.
                    var k = keys[Math.floor(Math.random()*keys.length)]; // For now we drop a random key. That is not the smartest cache.
                    delete Feediscovery.cache[k];
                }
                _callback(links);
            }]);
            if(!Feediscovery.running) {
                Feediscovery.running = true;
                Feediscovery.run();
            }
        }
    }
    
};
Feediscovery.run = function () {
    var next = Feediscovery.stack.shift();
    if (next) {
        var client = new XMLHttpRequest(); 
        client.onreadystatechange = function() {
            if(this.readyState == this.DONE) {
                next[1](JSON.parse(client.responseText));
                Feediscovery.run();
            }
        };
        client.open("GET", "http://feediscovery.appspot.com/?url=" + encodeURI(next[0]) , true); // Open up the connection
        client.send( null ); // Send the request
    } else {
        setTimeout(function () {
            Feediscovery.run();
        }, 1000);
    }
};
exports.Feediscovery = Feediscovery;
