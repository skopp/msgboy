// Feediscovery module. The only API that needs to be used is the Feediscovery.get
Feediscovery = {};
Feediscovery.stack = [];
Feediscovery.running = false;

Feediscovery.get = function (_url, _callback) {
    // Let's first do some verifications on the url to avoid wasting resources.
    if(_url.match(/chrome-extension:/) || _url.match(/javascript:/)) {
        // No feediscovery lookup for chrome extensions.
        _callback([]);
    }
    else {
        Feediscovery.stack.push([_url, _callback]);
        if(!Feediscovery.running) {
            Feediscovery.running = true;
            Feediscovery.run();
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
