var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var Subscription = require('../models/subscription.js').Subscription;
var SubscriptionView = require('./subscriptions-view.js').SubscriptionView;
var Msgboy = require('../msgboy.js').Msgboy;
var browser = require('../browsers.js').browser;
var Subscriptions = require('../models/subscription.js').Subscriptions;
var Plugins = require('../plugins.js').Plugins;

var Bookmarks = require('../plugins/bookmarks.js').Bookmarks;
new Bookmarks(Plugins);
var History = require('../plugins/history.js').History;
new History(Plugins);
var GoogleReader = require('../plugins/google-reader.js').GoogleReader;
new GoogleReader(Plugins);
var Tumblr = require('../plugins/tumblr.js').Tumblr;
new Tumblr(Plugins);
var Wordpress = require('../plugins/wordpress.js').Wordpress;
new Wordpress(Plugins);
var Blogger = require('../plugins/blogger.js').Blogger;
new Blogger(Plugins);
var Disqus = require('../plugins/disqus.js').Disqus;
new Disqus(Plugins);
var Generic = require('../plugins/generic.js').Generic;
new Generic(Plugins);
var Posterous = require('../plugins/posterous.js').Posterous;
new Posterous(Plugins);
var Statusnet = require('../plugins/statusnet.js').Statusnet;
new Statusnet(Plugins);
var Typepad = require('../plugins/typepad.js').Typepad;
new Typepad(Plugins);


var ImportView = Backbone.View.extend({
    events: {
    },
    el: "#info",

    initialize: function () {
      _.bindAll(this, 'import', 'showOne', 'doneImporting', 'showLoader', 'hideLoader', 'subscribeAll');
      $(this.el).append($('<h1>Import Subscriptions</h1>'));
      var selector = $("<select id='plugins'>");
      Plugins.all.forEach(function(plugin, _id) {
        if(plugin.importable) {
          var opt = $('<option/>', {id: _id}).text(plugin.name);
          opt.appendTo(selector);
        }
      });

      $(this.el).append(selector);
      $(this.el).append($('<table id="subscriptions" class="table-condensed"><thead><tr><th></th><th></th><th></th></tr></thead></table>'));
      $(this.el).append($('<span id="subscribe-all" class="btn" style="display:none; float:right; margin: 20px;">Subscribe All</span>'));
      $(this.el).append($('<p id="loader"><img src="../img/loader.gif"/><span>Loading</span></p>'));
      $(this.el).append($('<p id="message"><span></span></p>'));

      selector.change(function(v) {
        this.import(Plugins.all[$(selector).find(':selected')[0].id]);
      }.bind(this));
      this.subscriptions = new Backbone.Collection(); // create container for the subscriptions displayed
      $('#subscribe-all').click(this.subscribeAll);
      this.import(Plugins.all[$(selector).find(':selected')[0].id]); // Let's start importing
    },

    import: function(plugin) {
      $("#subscribe-all").hide();
      this.subscriptions.reset();
      var imported = discovered = 0;
      var doneImporting = false;
      this.showLoader("Loading more data from " + plugin.name);
      this.$('#subscriptions .subscription').remove();
      plugin.listSubscriptions(function(pair) {
        if(pair.doDiscovery) {
          imported += 1;
          browser.emit('feediscovery', pair, function(feeds) {
            discovered += 1;
            if(feeds.length > 0) {
              // We only want to show the first feed.
              var feed = feeds[0];
              this.showOne({url: feed.href, title: pair.title, alternate: pair.url});
            }
            if(imported === discovered && doneImporting) {
              this.doneImporting(plugin, discovered);
            }
          }.bind(this));
        }
        else {
          this.showOne(pair);
        }
      }.bind(this), function(total) {
        doneImporting = true;
        if(imported === discovered) {
          this.doneImporting(plugin, total);
        }
      }.bind(this));
    },

    showOne:function(subs) {
      var subscription = new Subscription({id: subs.url});
      this.subscriptions.add(subscription);
      subscription.fetchOrCreate(function () {
        subscription.set('title', subs.title);
        subscription.set('alternate', subs.alternate);
        var view = new SubscriptionView({model: subscription});
        this.$('#subscriptions').append(view.render().el);
      }.bind(this));
    },

    doneImporting: function(plugin, total) {
      if(total === 0) {
        if(plugin.logurl) {
          $("#message span").html("We couldn't find any subscription for you on " + plugin.name + ". Make sure you're <a target='blank' href='" + plugin.logurl + "'>logged in there</a> and try again.");
        }
        else {
          $("#message span").text("We couldn't find any subscription for you on " + plugin.name + ".");
        }
        $("#message").show();
      }
      else {
        $("#subscribe-all").show();
      }
      this.hideLoader();
    },

    showLoader: function(txt) {
      $("#message").hide();
      $("#loader span").text(txt);
      $("#loader").show();
    },

    hideLoader: function() {
      $("#loader").hide();
    },

    subscribeAll: function() {
      this.subscriptions.forEach(function(sub) {
        sub.setState("subscribing");
      });
    }

});

exports.ImportView = ImportView;

