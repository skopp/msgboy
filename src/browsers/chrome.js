var chromeWrapper = {
    // This is a browser wrapper!

    /*
    This function returns the absolute url in the app for the path submitted as argument.
    */
    getUrl: function(path) {
        return chrome.extension.getURL(path);
    },
    
    /*
        Opens a new tab
    */
    openNewTab: function(params, callback) {
        chrome.windows.getAll({}, function (windows) {
            windows = _.select(windows, function (win) {
                return win.type ==="normal" && win.focused;
            }, this);
            // If no window is focused and"normal"
            if (windows.length === 0) {
                window.open(params.url); 
            }
            else {
                params.windowId = windows[0].id;
                callback(chrome.tabs.create(params));
            }
        });
    },
    
    /*
        Emits a signal inside the browser which should hopefully be caught by 
        one of the tabs.
    */
    emit: function(message, callback) {
        if(typeof(callback) === 'undefined') {
            callback = function() {
                // Not doing anything.
            }
        }
        chrome.extension.sendRequest(message, callback);
    },
    
    /*
        Listens to all messages in the browser
    */
    listen: function(callback) {
        chrome.extension.onRequest.addListener(function (_request, _sender, _sendResponse) {
            callback(_request, _sender, _sendResponse);
        });
    },
    
    /* 
        *DEPRECATED* Adding this for compatibilty reasons but we should favor webintents in the future.
        As soon as they can work from 'buttons' like extensions, we will get rid of that.
        also, this won't be supported in FF ever.
    */
    externalListen: function(callback) {
        chrome.extension.onRequestExternal.addListener(function (_request, _sender, _sendResponse) {
            // For now, we only allow the Msgboy Button Extension, but later we'll open that up.
            if(_sender.id === "conpgobjdgiggknoomfoemablbgkecga") {
                callback(_request, _sender, _sendResponse);
            }
        });
    },
    
    /*
        Returns the id of the msgboy app.
    */
    msgboyId: function() {
        return chrome.i18n.getMessage("@@extension_id");
    },
    
    productionId: 'ligglcbjgpiljeoenbhnnfdipkealakb',
    
    /*
        Loads the extensions's properties.
    */
    loadProperties: function(callback) {
        chrome.management.get(this.msgboyId(), callback);
    },
    
    /*
        Returns the `number` most recent bookmarks.
    */
    getRecentBookmarks: function(number, callback) {
        chrome.bookmarks.getRecent(number, callback);
    },
    
    /*
        Listens to bookmark creation.
    */
    listenToNewBookmark: function(callback) {
        chrome.bookmarks.onCreated.addListener(callback);
    },
    
    /* 
        Returns the `number` most recent visits.
    */
    getRecentVisits: function(number, callback) {
        chrome.history.search({
            'text': '', // Return every history item....
            'startTime': ((new Date()).getTime() - 1000 * 60 * 60 * 24 * 15), // that was accessed less than 15 days ago, up to 10000 pages.
            'maxResults': number
        }, callback);
    },

    /* 
        Returns the most recent visits for a given URL
    */
    getVisitsForUrl: function(_url, callback) {
        chrome.history.getVisits({url: _url}, callback);
    },
    
    /*
        Listens to bookmark creation.
    */
    listenToNewVisit: function(callback) {
        chrome.history.onVisited.addListener(callback);
    },
    
    /* 
        Returns the current tab
    */
    getCurrentTab: function(callback) {
        chrome.tabs.getCurrent(callback);
    },
    
    /*
        Pins a tab if pin is true. unpin if false.
    */
    pinTab: function(id, pin) {
        chrome.tabs.update(id, {pinned: pin}, function() {
            // Done
        });
    }
};

exports.chrome = chromeWrapper;