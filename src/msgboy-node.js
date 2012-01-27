var Msgboy = require('./msgboy.js').Msgboy;
var Archive = require('./models/archive.js').Archive;
var $ = jQuery = require('jquery-browserify');
var ArchiveView = require('./views/archive-view.js').ArchiveView;


Msgboy.bind("loaded", function () {
    // Bam. Msgboy loaded
    var archive = new Archive();
        
     // The archiveView Object
     var archiveView = new ArchiveView({
         el: $("#archive"),
         collection: archive,
     });
     
     // The modalShareView Object.
     // var modalShareView = new ModalShareView({
     //     el: "#modal-share"
     // });
     
     // 
     // // When a message was voted-up
     // archive.bind("up-ed", function (message) {
     //     BayesianFilter.train_with_message(message);
     // });
     // 
     // // When a message was voted-down
     // archive.bind("down-ed", function (message) {
     //     BayesianFilter.train_with_message(message)
     // });
     // 
     // // When a message is shared
     // archive.bind("share", function (message) {
     //     modalShareView.showForMessage(message);
     // });
     // 
     // // Refresh the page! Maybe it would actually be fancier to add the elements to the archive and then push them in front. TODO
     // $("#new_messages").click(function () {
     //     window.location.reload(true);
     // }) 
     // 
     // // Listening to the events from the background page.
     // chrome.extension.onRequest.addListener(function (request, sender, sendResponse) {
     //     if (request.signature == "notify" && request.params) {
     //         // Cool, we have a new message. Let's see if we add it to the top, or reload the page.
     //         // Let's get the content of $("#new_messages")
     //         var count = parseInt($("#new_messages").attr("data-unread"));
     //         if (count) {
     //             $("#new_messages").attr("data-unread", count + 1);
     //             $("#new_messages").text("View " + (count + 1) + " new messages");
     //         } else {
     //             $("#new_messages").css("top","0");
     //             $("#new_messages").attr("data-unread", "1");
     //             $("#new_messages").text("View 1 new message");
     //         }
     //     }
     // });
});
Msgboy.run();
