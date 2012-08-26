var _       = require('underscore');
var urlParser = require('url');
var queryString = require('querystring');
var Msgboy  = require('./msgboy.js').Msgboy;
var browser = require('./browsers.js').browser;
var $       = require('jquery');
require('./bootstrap-button.js');


function showFeed(link) {
  if(!link.subscribed) {
    var title = $('<h2>' + link.title + '</h2>');
    var inner = $('<p>Once subscribed, new messages from <em>' + link.title + '</em> will be added to your dashboard. </p>');
    title.appendTo($("#subscribe"));
    inner.appendTo($("#subscribe"));

    var btn = $('<button class="btn btn-primary" data-loading-text="Subscribing...">Subscribe</button>')
    btn.button();
    btn.click(function() {
      btn.button('loading');
      browser.emit("subscribe", {
        force: true,
        title: link.title,
        url: link.href
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

    var btn = $('<button class="btn btn-primary" data-loading-text="Unsubscribing...">Unsubscribe</button>')
    btn.button();
    btn.click(function() {
      btn.button('loading');
      browser.emit("unsubscribe", {
        force: true,
        title: link.title,
        url: link.href
      }, function (response) {
        btn.html('<i class="icon-ok icon-white"></i> Unsubscribed');
      });
    });
    inner.prepend(btn);
  }
}

function showFeeds(links) {
  $("#subscribe").empty();
  if(links.length == 0) {
    var inner = '<h2>No feed</h2> \
      <p>This website doesn\'t allow its users to subscribe to its content at this point :(</p>\
      <p style="text-align:center; width:80%">\
      <button class="btn" id="cancelBtn">Close</button>&nbsp;\
      </p>';
    $("#subscribe").html(inner);
    $("#cancelBtn").click(function() {
      window.close();
    });
  }
  else {
    _.each(links, function(link) {
      showFeed(link);
    });
  }
}


Msgboy.bind("loaded:subscribe", function () {
  var feedUrl = "";
  if(window.webkitIntent) {
    if(window.webkitIntent.getExtra && window.webkitIntent.getExtra("url")) {
      feedUrl = window.webkitIntent.getExtra("url");
    }
    else {
      feedUrl = window.webkitIntent.data; // That is the url... We need to put it in feediscovery!
    }
  }
  else {
    userUrl = $.trim(queryString.parse(window.location.search.substr(1)).url);
    var parsed = urlParser.parse(userUrl);
    if(!parsed.protocol) {
      userUrl = "http://" + userUrl;
      parsed = urlParser.parse(userUrl);
    }
    feedUrl = urlParser.format(parsed);
  }

  if(typeof(queryString.parse(window.location.search.substr(1)).nodisc) === "undefined") {
    browser.emit("feediscovery", { url: feedUrl, checkSubscription: true }, function (links) {
      showFeeds(links);
    });
  }
  else {
    showFeeds([{
      subscribed: queryString.parse(window.location.search.substr(1)).subscribed,
      title: queryString.parse(window.location.search.substr(1)).title,
      href: feedUrl
    }]);
  }
});

