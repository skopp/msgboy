var should = require('chai').should();
require('./tests/models/subscription.js');
require('./tests/models/archive.js');
require('./tests/models/database.js');
require('./tests/models/inbox.js');
require('./tests/models/message.js');
// require('./tests/msgboy.js');
// require('./tests/plugins/.js');
// require('./tests/views/.js');


// Hijack the logs.
console._log = console.log;
console.log = function() {
    //
}