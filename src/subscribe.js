var Msgboy       = require('./msgboy.js').Msgboy;
var browser     = require('./browsers.js').browser;
var $            = require('jquery');
require('./bootstrap-button.js');

Msgboy.bind("loaded:subscribe", function () {
  // console.log(window.webkitIntent.action); // We need to check that and differentiate between "subscribe" and "view". Do we?
  var feedUrl = window.webkitIntent.data; // That is the url... We need to put it in feediscovery!
  browser.emit({
    signature: "feediscovery",
    params: {
      url: feedUrl
    }
  }, function (links) {
    if(links.length == 0) {
      var inner = '<h2>No feed</h2> \
      <p>We couldn\'t find any feed to which the msgboy could subscribe. Sorry about that.</p>\
      <p style="text-align:center; width:80%">\
      <button class="btn btn-large" id="cancelBtn">Close</button>&nbsp;\
      </p>';
      $("#subscribe").html(inner);
      $("#cancelBtn").click(function() {
        window.close(); 
      });
    }
    else {
      for(var i = 0; i < links.length; i++) {
        var link = links[i];
        if(link.rel == "self") {
          var inner = '<h2>' + link.title + '</h2> \
          <p>Once subscribed, new messages from <em>' + link.title + '</em> will be added to your dashboard. </p>\
          <p style="text-align:center; width:80%">\
          <button class="btn btn-large" id="cancelBtn">Close</button>&nbsp;\
          <button class="btn btn-primary btn-large" id="subscribeBtn" data-loading-text="Subscribing...">Subscribe</button>\
          </p>';
          $("#subscribe").html(inner);
          $('.btn').button();
          $("#cancelBtn").click(function() {
            window.close(); 
          });
          $("#subscribeBtn").click(function() {
            $("#subscribeBtn").button('loading');
            browser.emit({
              signature: "subscribe",
              params: {
                title: link.title,
                url: feedUrl
              }
            }, function (response) {
              $("#subscribeBtn").html('<i class="icon-ok icon-white"></i> Subscribed');
            });
          });
        }
      }
    }
  });
});