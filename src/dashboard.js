var $ = jQuery = require('jquery');
var Msgboy = require('./msgboy.js').Msgboy;
var browser = require('./browsers.js').browser;
var Archive = require('./models/archive.js').Archive;
var Message = require('./models/message.js').Message;
var Inbox = require('./models/inbox.js').Inbox;
var ArchiveView = require('./views/archive-view.js').ArchiveView;
var ModalShareView = require('./views/modal-share-view.js').ModalShareView;
var queryString = require('querystring');
var url = require('url');

var readyToLoadNext = true;
var firstArchiveView = null;
var currentArchiveView = null;

function prepareArchiveView(archive) {
    var archiveView = new ArchiveView({
        el: $('#archive'),
        collection: archive,
    });
    
    // When a message is shared
    archive.bind('share', function (message) {
        var modal = new ModalShareView({message: message});
        $(modal.el).appendTo(document.body);
        $(modal.el).on('hidden', function () {
            $(modal.el).remove();
        });
        modal.toggle();
    });

    // When a message is down-voted
    archive.bind('down-ed', function(message) {
        if(message.attributes.sourceHost !== 'msgboy.com') {
            browser.emit({
                signature: 'down-ed',
                params: message
            }, function (response) {
                // Nothing to do.
            });
        }
    });
    return archiveView;
}

function loadNextArchive(opts) {
    readyToLoadNext = false;
    var archive = new Archive(opts);
    archiveView = prepareArchiveView(archive);

    var q = queryString.parse(url.parse(location.href).query);

    console.log(q);

    archive.bind('reset', function() {
      if(q.format === "json") {
        // We export a JSON file!
        window.location = "data:application/json;base64," + window.btoa(JSON.stringify(archive.toJSON()));   
      }   
      else {
        archive.each(function(message) {
          archiveView.appendNew(message);
        });
        archiveView.render();
        // Ready to load next.
        readyToLoadNext = true;
        prepareNextLoadIfNeeded();
      }  
    });
    
    if(q.n) {
      archive.load(parseInt(q.n));      
    }
    else {
      archive.load(50);
    }
    return archiveView;
}

function prepareNextLoadIfNeeded() {
    if(readyToLoadNext) {
        if($(window).scrollTop() + 2*$(window).height() > $(document).height()) {
            var upperBound = currentArchiveView.collection.last().get('createdAt');
            currentArchiveView = loadNextArchive({upperBound: upperBound, lowerBound: 0});
        }
    }
}

function showStack(stacked) {
    stacked.computePercentiles();
    stacked.comparator = function (message) {
        return (message.get('createdAt'));
    }; // We need to reverse the stack since we'll prepend (instead of append)
    stacked.sort({silent: true}); // Re-sort
    var stackedView = prepareArchiveView(stacked);
    stacked.each(function(message) {
        stackedView.prependNew(message)
    });
    return new Archive(); // And prepare for the new stack!
}

function setNewMessagesBar(stack) {
    if(stack.length === 0) {
        $('#newMessages').attr("data-unread", 0);
        $('#newMessages').css("top","-36px");
        $('#newMessages').text("");
    }
    else {
        $("#newMessages").css("top","0");
        $("#newMessages").attr("data-unread", stack.length);
        $("#newMessages").text("View " + stack.length + " new");
        
    }
}

Msgboy.bind('loaded:dashboard', function (page) {
    $('#container').masonry({itemSelector : '.message', columnWidth : 10, animationOptions: { duration: 10 }});

    Msgboy.inbox = new Inbox();
    Msgboy.inbox.fetch();
    var stacked = new Archive();
    
    // Completes the page by loading more messages.
    $(document).scroll(prepareNextLoadIfNeeded);
    
    // Show the time indicator
    $(document).scroll(function() {
        var message = $(document.elementFromPoint(window.innerWidth/2, window.innerHeight - 10)).closest('.message');
        if(message && typeof(message.data('model')) !== "undefined") {
            $("#timetracker").html("<p>" + new Date(message.data('model').attributes.createdAt).toRelativeTime() + "</p>");
        }
        if(this.fadeOutTimeout) {
            clearTimeout(this.fadeOutTimeout);
        }
        $("#timetracker").fadeIn();
        this.fadeOutTimeout = setTimeout(function() {
            this.fadeOutTimeout = null;
            $("#timetracker").fadeOut();
        }, 300);
    });
    
    // New message bar
    $("#newMessages").click(function () {
        $('body,html').animate({
			scrollTop: 0
		}, 500, null, function() {
            stacked = showStack(stacked);
            setNewMessagesBar(stacked);
		});
    });
    
    // Going back to top when clicked!
    $("header").click(function () {
        $('body,html').animate({
			scrollTop: 0
		}, 500, null, function() {
		    // Back to top
		});
    });

    // Listening to the events from the background page.
    browser.on('notify', function(params, fn) {
      var m = new Message({id: params.id});
      m.fetch({
        success: function() {
          if(Msgboy.inbox.attributes.options.autoRefresh) {
            // We need to append this message to the first archive...
            firstArchiveView.collection.unshift(m);
            // Recompute the relevance
            firstArchiveView.collection.computePercentiles();
            // Appnd the new message
            firstArchiveView.prependNew(m);
          }
          else {
            stacked.unshift(m);
            setNewMessagesBar(stacked);
          }
          // No matter what, we highligjt the dashboard
          // browser.highlightTab(); TODO
        }.bind(this)
      });
    });
    
    currentArchiveView = firstArchiveView = loadNextArchive({upperBound: new Date().getTime(), lowerBound: 0});
});


