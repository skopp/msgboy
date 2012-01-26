var Msgboy = require('./msgboy.js').Msgboy;



Msgboy.bind("loaded", function () {
    // Bam. Msgboy loaded
    console.log("Loaded")
});
Msgboy.run();
