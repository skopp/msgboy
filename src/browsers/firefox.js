var firefoxWrapper = {
    // This is a browser wrapper!

    /*
    This function returns the absolute url in the app for the path submitted as argument.
    */
    getUrl: function(path) {
      console.debug('getUrl', path);
        // return chrome.extension.getURL(path);
    },
    
    /*
        Opens a new tab
    */
    openNewTab: function(params, callback) {
      console.debug('openNewTab', params);
        // chrome.windows.getAll({}, function (windows) {
        //     windows = _.select(windows, function (win) {
        //         return win.type ==="normal" && win.focused;
        //     }, this);
        //     // If no window is focused and"normal"
        //     if (windows.length === 0) {
        //         window.open(params.url); 
        //     }
        //     else {
        //         params.windowId = windows[0].id;
        //         chrome.tabs.create(params, callback);
        //     }
        // });
    },
    
    /*
        Emits a signal inside the browser which should hopefully be caught by 
        one of the tabs.
    */
    emit: function(signal, args, callback) {
      console.debug('emit', signal, args);
      
        // if(typeof(callback) === 'undefined') {
        //     callback = function() {
        //         // Not doing anything.
        //     };
        // }
        // chrome.extension.sendRequest({
        //   signature: signal,
        //   params: args, 
        // }, callback);
    },
    
    /*
        Listens to all messages in the browser
    */
    listen: function(callback) {
      console.debug('listen');
      
        // chrome.extension.onRequest.addListener(function (_request, _sender, _sendResponse) {
        //     callback(_request, _sender, _sendResponse);
        // });
    },
    
    /*
      Only listens to a specific signal.
    */
    on: function(signal, callback) {
      console.debug('on', signal);
      // chrome.extension.onRequest.addListener(function (_request, _sender, _sendResponse) {
      //   if (_request.signature == signal && _request.params) {
      //     callback(_request.params, _sendResponse);
      //   }
      // });
    },
    
    /* 
        *DEPRECATED* Adding this for compatibilty reasons but we should favor webintents in the future.
        As soon as they can work from 'buttons' like extensions, we will get rid of that.
        also, this won't be supported in FF ever.
    */
    externalListen: function(callback) {
      console.debug('externalListen');
      
        // chrome.extension.onRequestExternal.addListener(function (_request, _sender, _sendResponse) {
        //     // For now, we only allow the Msgboy Button Extension, but later we'll open that up.
        //     if(_sender.id === "conpgobjdgiggknoomfoemablbgkecga") {
        //         callback(_request, _sender, _sendResponse);
        //     }
        // });
    },
    
    /*
        Returns the id of the msgboy app.
    */
    msgboyId: function() {
      console.debug('msgboyId');
      
      return 'msgboy';
        // return chrome.i18n.getMessage("@@extension_id");
    },
    
    productionId: 'ligglcbjgpiljeoenbhnnfdipkealakb',
    
    /*
        Loads the extensions's properties.
    */
    loadProperties: function(callback) {
      console.debug('loadProperties');
      
      callback(this.msgboyId());
        // chrome.management.get(this.msgboyId(), callback);
    },
    
    /*
        Returns the `number` most recent bookmarks.
    */
    getRecentBookmarks: function(number, callback) {
      console.debug('getRecentBookmarks', number);
      
        // chrome.bookmarks.getRecent(number, callback);
    },
    
    /*
        Listens to bookmark creation.
    */
    listenToNewBookmark: function(callback) {
      console.debug('listenToNewBookmark');
      
        // chrome.bookmarks.onCreated.addListener(callback);
    },
    
    /* 
        Returns the `number` most recent visits.
    */
    getRecentVisits: function(number, callback) {
      console.debug('getRecentVisits', number);
      
        // chrome.history.search({
        //     'text': '', // Return every history item....
        //     'startTime': ((new Date()).getTime() - 1000 * 60 * 60 * 24 * 15), // that was accessed less than 15 days ago, up to 10000 pages.
        //     'maxResults': number
        // }, callback);
    },

    /* 
        Returns the most recent visits for a given URL
    */
    getVisitsForUrl: function(_url, callback) {
      console.debug('getVisitsForUrl', _url);
      
        // chrome.history.getVisits({url: _url}, callback);
    },
    
    /*
        Listens to bookmark creation.
    */
    listenToNewVisit: function(callback) {
      console.debug('listenToNewVisit');
      
        // chrome.history.onVisited.addListener(callback);
    },
    
    /* 
        Returns the current tab
    */
    getCurrentTab: function(callback) {
      console.debug('getCurrentTab');
      
        // chrome.tabs.getCurrent(callback);
    },
    
    /*
        Pins a tab if pin is true. unpin if false.
    */
    pinTab: function(id, pin) {
      console.debug('pinTab', id);
      
        // chrome.tabs.update(id, {pinned: pin}, function() {
        //     // Done
        // });
    },
    
    inject: function(tabId, file, callback) {
      console.debug('inject', tabId, file);
      
        // chrome.tabs.executeScript(tabId, {
        //     file: file
        // }, callback);
    },
    
    /*
        This function yields true if the dashboard is open.
    */
    isDashboardOpen: function(fn) {
      console.debug('isDashboardOpen');
      
        // var open = false;
        // chrome.windows.getAll({populate: true}, function(windows) {
        //     for( var j = 0, w; w = windows[j]; j++) {
        //         for (var i = 0, tab; tab = w.tabs[i]; i++) {
        //             if (tab.url && tab.url.match(new RegExp("chrome-extension://" + chrome.i18n.getMessage("@@extension_id") + ""))) {
        //                 // Fine, the tab is opened. No need to do much more.
        //                 open = true;
        //                 break;
        //             }
        //         }
        //     }
        //     fn(open);
        // });
    }
};

exports.firefox = firefoxWrapper;