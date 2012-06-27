// This page exports the functionalities needed by Msgboy from browsers.
// It's mostly an abstraction layer.

if(typeof(chrome) !== 'undefined') {
  exports.browser = require('./browsers/chrome.js').chrome;
}
else {
  // We need a better mechanism to detect FF!
  exports.browser = require('./browsers/firefox.js').firefox;
}
