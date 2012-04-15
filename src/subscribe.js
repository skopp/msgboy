var Msgboy = require('./msgboy.js').Msgboy;
var Feediscovery = require('./feediscovery.js').Feediscovery;


Msgboy.bind("loaded", function () {
    var url =  unescape(unescape(window.location.search).match(/subscribe:(.*)/)[1]);
    Feediscovery.get(url, function (links) {
        for(var j = 0; j < links.length; j++) {
            var link = links[j];
            chrome.extension.sendRequest({
                signature: "subscribe",
                params: {
                    title: link.title,
                    url: link.href
                }
            }, function (response) {
                // Done
            });
        }
    });
});
