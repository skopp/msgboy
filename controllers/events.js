$(document).bind('register', function (element, object) {
    Msgboy.log.debug.debug("request", "register", object.request.params.username);
    Msgboy.inbox.setup(object.request.params.username, object.request.params.token);
});

$(document).bind('subscribe', function (element, object) {
    Msgboy.log.debug("request", "subscribe", object.request.params.url);
    Msgboy.subscribe(object.request.params.url, object.request.params.force || false, function (result) {
        object.sendResponse({
            value: result
        });
    });
});

$(document).bind('unsubscribe', function (element, object) {
    Msgboy.log.debug("request", "unsubscribe", object.request.params.url);
    Msgboy.unsubscribe(object.request.params.url, function (result) {
        object.sendResponse({
            value: result
        });
    });
});

$(document).bind('notify', function (element, object) {
    Msgboy.log.debug("request", "notify", object.request.params);
    Msgboy.notify(object.request.params);
    // Nothing to do.
});

$(document).bind('notificationReady', function (element, object) {
    Msgboy.log.debug("request", "notificationReady");
    Msgboy.currentNotification.ready = true;
    // We should then start sending all notifications.
    while (Msgboy.messageStack.length > 0) {
        chrome.extension.sendRequest({
            signature:"notify",
            params: Msgboy.messageStack.pop()
        }, function (response) {
            // Nothing to do.
        });
    }
});

$(document).bind('tab', function (element, object) {
    Msgboy.log.debug("request", "tab", object.request.params.url);
    var active_window = null;
    chrome.windows.getAll({}, function (windows) {
        windows = _.select(windows, function (win) {
            return win.type ==="normal" && win.focused;
        }, this);
        // If no window is focused and"normal"
        if (windows.length === 0) {
            window.open(object.request.params.url); // Can't use Chrome's API as it's buggy :(
        }
        else {
            // Just open an extra tab.
            options = object.request.params;
            options.windowId = windows[0].id;
            chrome.tabs.create(options);
        }
    });
});

$(document).bind('close', function (element, object) {
    Msgboy.log.debug("request", "close");
    Msgboy.currentNotification = null;
    object.sendResponse({
        value: true
    });
});

// When reloading the inbox is needed (after a change in settings eg)
$(document).bind('reload', function (element, object) {
    Msgboy.log.debug("request", "reload");
    Msgboy.inbox.fetch();
});

// When reloading the inbox is needed (after a change in settings eg)
$(document).bind('reset_susbcriptions', function (element, object) {
    Msgboy.log.debug("request", "reset_susbcriptions");
    Plugins.importSubscriptions(function (subs) {
        Msgboy.subscribe(subs.url, false, function () {
            // Cool. Not much to do.
        });
    });
});


// When reloading the inbox is needed (after a change in settings eg)
$(document).bind('debug', function (element, object) {
    Msgboy.log.debug("request", "debug", object);
});



