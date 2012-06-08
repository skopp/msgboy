// This page exports the functionalities needed by Msgboy from browsers.
// It's mostly an abstraction layer.
var chrome = require('./browsers/chrome.js').chrome;

exports.browser = chrome;