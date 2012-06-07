var chrome = {
    // This is a browser wrapper!

    /*
    This function returns the absolute url in the app for the path submitted as argument.
    */
    getUrl: function(path) {
    },
    
    /*
        Opens a new tab
    */
    openNewTab: function(params, callback) {
    },
    
    /*
        Emits a signal inside the browser which should hopefully be caught by 
        one of the tabs.
    */
    emit: function(message, callback) {
    },
    
    /*
        Listens to all messages in the browser
    */
    listen: function(callback) {
    },
    
    /* 
        *DEPRECATED* Adding this for compatibilty reasons but we should favor webintents in the future.
        As soon as they can work from 'buttons' like extensions, we will get rid of that.
        also, this won't be supported in FF ever.
    */
    externalListen: function(callback) {
    },
    
    /*
        Returns the id of the msgboy app.
    */
    msgboyId: function() {
    },
    
    productionId: '',
    
    /*
        Loads the extensions's properties.
    */
    loadProperties: function(callback) {
    },
    
    /*
        Returns the `number` most recent bookmarks.
    */
    getRecentBookmarks: function(number, callback) {
    },
    
    /*
        Listens to bookmark creation.
    */
    listenToNewBookmark: function(callback) {
    },
    
    /* 
        Returns the `number` most recent visits.
    */
    getRecentVisits: function(number, callback) {
    },

    /* 
        Returns the most recent visits for a given URL
    */
    getVisitsForUrl: function(_url, callback) {
    },
    
    /*
        Listens to bookmark creation.
    */
    listenToNewVisit: function(callback) {
    },
    
    /* 
        Returns the current tab
    */
    getCurrentTab: function(callback) {
    },
    
    /*
        Pins a tab if pin is true. unpin if false.
    */
    pinTab: function(id, pin) {
    }
};

exports.firefox = firefox;