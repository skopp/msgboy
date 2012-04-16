var Msgboy = require('./msgboy.js').Msgboy;


Msgboy.bind("loaded", function () {
    var url =  unescape(unescape(window.location.search).match(/subscribe:(.*)/)[1]);
    
    chrome.extension.sendRequest({
        signature: "subscribe",
        params: {
            title: "",
            url: url,
            doDiscovery: true
        }
    }, function (response) {
        // Done
    });
});
