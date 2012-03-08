Generic = function (Plugins) {
    // Let's register
    Plugins.register(this);
    
    this.name = 'Generic';

    this.onSubscriptionPage = function (doc) {
        return true;
    };

    this.listSubscriptions = function (callback, done) {
        done(0);
    };

    this.hijack = function (doc, follow, unfollow) {
        doc.addEventListener("click", function(event) {
            if(Plugins.hasClass(event.target, "msgboy-follow")) {
                follow({
                    title: event.target.getAttribute("data-msgboy-title"),
                    url: event.target.getAttribute("data-msgboy-url")
                }, function () {
                    //Done
                });
            }
         });
    };
};

exports.Generic = Generic;