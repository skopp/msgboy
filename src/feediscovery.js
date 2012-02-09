var $ = jQuery      = require('jquery');

// Feediscovery module. The only API that needs to be used is the Feediscovery.get
Feediscovery = {};
Feediscovery.stack = [];
Feediscovery.running = false;

Feediscovery.get = function (_url, _callback) {
    Feediscovery.stack.push([_url, _callback]);
    if(!Feediscovery.running) {
        Feediscovery.running = true;
        Feediscovery.run();
    }
    else {
        console.log(Feediscovery.stack.length);
    }
};
Feediscovery.run = function () {
    var next = Feediscovery.stack.shift();
    if (next) {
        $.ajax({url: "http://feediscovery.appspot.com/",
            data: {url: next[0]},
            success: function (data) {
                next[1](JSON.parse(data));
                Feediscovery.run();
            },
            error: function () {
                // Let's restack, in the back.
                Feediscovery.get(next[0], next[1]);
            }
        });
    } else {
        setTimeout(function () {
            Feediscovery.run();
        }, 1000);
    }
};

exports.Feediscovery = Feediscovery;
