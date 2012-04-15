var Msgboy = require('./msgboy.js').Msgboy;
var Archive = require('./models/archive.js').Archive;
var Message = require('./models/message.js').Message;

window.iterations = 0

function more(archive, upperBound, lowerBound, toLoad) {
    window.iterations = window.iterations + 1;
    archive.next(toLoad, {
        createdAt: [upperBound, lowerBound]
    });
}

Msgboy.bind("loaded", function () {
    var upperBound = new Date().getTime();
    var lowerBound = 0;
    var toLoad = 50;
    
    window.start = new Date().getTime();
    
    var archive = new Archive();
    
    archive.bind('add', function(m) {
        upperBound = m.attributes.createdAt;
    });
    
    archive.bind('reset', function() {
        
        console.log("->", new Date().getTime() - window.start);
        window.start = new Date().getTime();
        if(window.iterations < 20) {
            more(archive, upperBound, lowerBound, toLoad);
        }
    });
    more(archive, upperBound, lowerBound, toLoad);
    
});