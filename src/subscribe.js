var _       = require('underscore');
var Msgboy  = require('./msgboy.js').Msgboy;
var browser = require('./browsers.js').browser;
var $       = require('jquery');
require('./bootstrap-button.js');

Msgboy.bind("loaded:subscribe", function () {
  var feedUrl = window.webkitIntent.data; // That is the url... We need to put it in feediscovery!
  browser.emit({
    signature: "feediscovery",
    params: {
      url: feedUrl,
      checkSubscription: true
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
      _.each(links, function(link) {
        if(!link.subscribed) {
          var title = $('<h2>' + link.title + '</h2>');
          var inner = $('<p>Once subscribed, new messages from <em>' + link.title + '</em> will be added to your dashboard. </p>');
          title.appendTo($("#subscribe"));
          inner.appendTo($("#subscribe"));
          
          var btn = $('<button class="btn btn-primary btn-large" data-loading-text="Subscribing...">Subscribe</button>')
          btn.button();
          btn.click(function() {
            btn.button('loading');
            browser.emit({
              signature: "subscribe",
              params: {
                force: true,
                title: link.title,
                url: link.href
              }
            }, function (response) {
              btn.html('<i class="icon-ok icon-white"></i> Subscribed');
            });
          });
          inner.prepend(btn);
        }
        else {
          var title = $('<h2>' + link.title + '</h2>');
          var inner = $('<p>You are currently subscribed to <em>' + link.title + '</em>. Unsubscribe if you don\'t want to get messages from it anymore. </p>');
          title.appendTo($("#subscribe"));
          inner.appendTo($("#subscribe"));
          
          var btn = $('<button class="btn btn-primary btn-large" data-loading-text="Unsubscribing...">Unsubscribe</button>')
          btn.button();
          btn.click(function() {
            btn.button('loading');
            browser.emit({
              signature: "unsubscribe",
              params: {
                force: true,
                title: link.title,
                url: link.href
              }
            }, function (response) {
              btn.html('<i class="icon-ok icon-white"></i> Unsubscribed');
            });
          });
          inner.prepend(btn);
        }
      });
    }
  });
});