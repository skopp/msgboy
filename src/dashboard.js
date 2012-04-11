var $ = jQuery = require('jquery');
var Msgboy = require('./msgboy.js').Msgboy;
var Archive = require('./models/archive.js').Archive;
var Message = require('./models/message.js').Message;
var Inbox = require('./models/inbox.js').Inbox;
var ArchiveView = require('./views/archive-view.js').ArchiveView;
var ModalShareView = require('./views/modal-share-view.js').ModalShareView;


Msgboy.bind("loaded", function () {
    
    Msgboy.inbox = new Inbox();
    Msgboy.inbox.fetch();
    
    // Bam. Msgboy loaded
    var archive = new Archive();
    var stacked = new Archive();
    
    // The archiveView Object
    var archiveView = new ArchiveView({
        el: $("#archive"),
        collection: archive,
    });

    // The modalShareView Object.
    var modalShareView = new ModalShareView({
        el: "#modal-share"
    });

    // When a message is shared
    archive.bind('share', function (message) {
        modalShareView.showForMessage(message);
    });
    
    // When a message is down-voted
    archive.bind('down-ed', function(message) {
        if(message.attributes.sourceHost !== "msgboy.com") {
            chrome.extension.sendRequest({
                signature: "down-ed",
                params: message
            }, function (response) {
                // Nothing to do.
            });
        }
    })

    // Refresh the page! Maybe it would actually be fancier to add the elements to the archive and then push them in front. TODO
    $("#new_messages").click(function () {
        $("#new_messages").attr("data-unread", 0);
        $("#new_messages").css("top","-36px");
        $("#new_messages").text("");
        stacked.forEach(function(m) {
            archiveView.prependNew(m); // We should just hide this!
        });
        stacked.reset();
        //window.location.reload(true);
    });

    // Listening to the events from the background page.
    chrome.extension.onRequest.addListener(function (request, sender, sendResponse) {
        if (request.signature == "notify" && request.params) {
            var m = new Message({id: request.params.id});
            m.fetch({
                success: function() {
                    if(Msgboy.inbox.attributes.options.autoRefresh) {
                        archiveView.prependNew(m); // We should just hide this!
                    }
                    else {
                        stacked.add(m);
                        // Cool, we have a new message. Let's see if we add it to the top, or reload the page.
                        // Let's get the content of $("#new_messages")
                        var count = parseInt($("#new_messages").attr("data-unread"));
                        if (count) {
                            $("#new_messages").attr("data-unread", count + 1);
                            $("#new_messages").text("View " + (count + 1) + " new");
                        } else {
                            $("#new_messages").css("top","0");
                            $("#new_messages").attr("data-unread", "1");
                            $("#new_messages").text("View 1 new");
                        }
                    }
                }.bind(this)
            });
        }
    });
});


