var Msgboy = require('./msgboy.js').Msgboy;
var browser = require('./browsers.js').browser;
var $ = require('jquery');

Msgboy.bind("loaded:signup", function () {
    if(window.location.search.match(/\?denied/)) {
        // The user denied access!
        $("#intro").html("<h1>Signup</h1>\
        <p>We currently <em>need</em> you to accept the Google\
        OpenId authentication. (and we hope we can change that too.) \
        It is required as we need a unique identifier for each \
        user. </p>\
        <p>However, please know that <em>we do not ask for any \
        personal data</em>, and just get a unique identifier from \
        Google.</p> \
        <p><a class=\"btn\" id=\"retrySignup\" value=\"Retry\" \
        href=\"http://msgboy.com/session/new?ext=" + browser.msgboyId() +"\">Authorize Msgboy</a></p>");
    }
    else {
        var matches = window.location.search.match(/\?u=(.*)\&t=(.*)/);
        browser.emit({
            signature: "register",
            params: {username: matches[1], token: matches[2]}
        }, function (response) {
            window.location = browser.getUrl('/views/html/dashboard.html');
        });
    }
});

