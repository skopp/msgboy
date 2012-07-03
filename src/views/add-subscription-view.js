var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var Msgboy = require('../msgboy.js').Msgboy;
var browser = require('../browsers.js').browser;
var urlParser = require('url');
require('../bootstrap-typeahead.js');

var AddSubscriptionView = Backbone.View.extend({
  events: {
  },

  initialize: function () {
    $('#urlTypeahead').typeahead({
      source: function(typeahead,query) {
        browser.findUrlInHistory(query, function(urls) {
          // Let's add the root of the urls we found.
          var suggest = [];
          _.each(urls, function(url) {
            var p = urlParser.parse(url);
            if(p.protocol.match("http")) {
              var r = _.clone(p);
              r.pathname = "/";
              delete r.query;
              delete r.search;
              suggest.push(urlParser.format(r));
              suggest.push(urlParser.format(p));
            }
          });
          typeahead.process(_.uniq(suggest));
        });
      }
    });
 },

});

exports.AddSubscriptionView = AddSubscriptionView;

