var Msgboy = require('./msgboy.js').Msgboy;

Msgboy.bind("loaded", function () {
    var matches = window.location.search.match(/\?u=(.*)\&t=(.*)/);
    chrome.extension.sendRequest({
        signature: "register",
        params: {username: matches[1], token: matches[2]}
    }, function (response) {
        window.location = chrome.extension.getURL('/views/html/dashboard.html');
    });
});

