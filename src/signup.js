var Msgboy = require('./msgboy.js').Msgboy;
var $ = require('jquery');

Msgboy.bind("loaded", function () {
    if(window.location.search.match(/\?denied/)) {
        // The user denied access!
        $("#intro").html("<h1>Signup</h1>\
        <p>Unfortunately, we currently <em>need</em> you to \
        accept the Google OpenId authentication at the moment. \
        It is required as we need a unique identifier for each \
        user. </p>\
        <p>However, please know that <em>we do not ask for any \
        personal data</em>, and just get a unique identifier from \
        Google.</p> \
        <p><a class=\"btn\" id=\"retrySignup\" value=\"Retry\" \
        href=\"http://msgboy.com/session/new?ext=" + chrome.i18n.getMessage("@@extension_id") +"\">Retry</a></p>");
    }
    else {
        var matches = window.location.search.match(/\?u=(.*)\&t=(.*)/);
        chrome.extension.sendRequest({
            signature: "register",
            params: {username: matches[1], token: matches[2]}
        }, function (response) {
            window.location = chrome.extension.getURL('/views/html/dashboard.html');
        });
    }
});

