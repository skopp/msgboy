var Msgboy       = require('./msgboy.js').Msgboy;
var Feediscovery = require('./feediscovery.js').Feediscovery;
var $            = require('jquery');
require('./bootstrap-button.js');

Msgboy.bind("loaded", function () {
    // console.log(window.webkitIntent.action); // We need to check that and differentiate between "subscribe" and "view". Do we?
    var feedUrl = window.webkitIntent.data; // That is the url... We need to put it in feediscovery!
    
    Feediscovery.get(feedUrl, function (links) {
        for(var i = 0; i < links.length; i++) {
            var link = links[i];
            if(link.rel == "self") {
                var inner = '<h2>' + link.title + '</h2> \
                <p>Once subscribed, new messages from <em>' + link.title + '</em> will be added to your dashboard. </p>\
                <p style="text-align:center; width:80%">\
                    <button class="btn large" id="cancelBtn">Close</button>&nbsp;\
                    <button class="btn primary large" id="subscribeBtn" data-loading-text="Subscribing...">Subscribe</button>\
                </p>';
                $("#subscribe").html(inner);
                $('.btn').button();
                $("#cancelBtn").click(function() {
                    window.close(); 
                });
                $("#subscribeBtn").click(function() {
                    $("#subscribeBtn").button('loading');
                    chrome.extension.sendRequest({
                        signature: "subscribe",
                        params: {
                            title: link.title,
                            url: feedUrl
                        }
                    }, function (response) {
                        $("#subscribeBtn").html('Subscribed');
                        $("#subscribeBtn").addClass("icon-ok");
                    });
                });
            }
        }
    });
});