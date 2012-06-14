var Url = require('url');
var _ = require('underscore');

var imageExtractor = function() {
  
}

// Gets the size of an image based on src
imageExtractor.prototype.imgSize = function(src, base, callback) {
    var height = 0, width = 0, img = null;
    var done = null, timeout = null, loadImg = null;
    var parsed = Url.parse(src);
    var here = Url.parse(document.location.toString());
    var base = Url.parse(base);
    
    done = function(s, height, width) {
        img = null;
        clearTimeout(timeout);
        callback(s, height, width);
    }.bind(this);
    
    timeout = setTimeout(function() {
        done(src, 0, 0);
    }, 3000); // We allow for 3 seconds to extract the image.
    
    loadImg = function(s) {
        img = new Image();
        img.onload = function() {
            done(s, img.height, img.width);
        }.bind(this);
        img.src = s;
    }.bind(this);
    
    if(typeof parsed.host === "undefined" || (parsed.host === here.host && parsed.protocol === here.protocol)) {
        if(typeof base.host === "undefined") {
            done(src, 0, 0);
        } 
        else {
            var abs = Url.resolve(base, parsed.path);
            loadImg(abs);
        }
    } 
    else {
        loadImg(src);
    }
}

// Extracts the largest image of an HTML content
imageExtractor.prototype.extractLargestImageFromBlob = function(blob, base, callback) {
    var container = document.createElement("div");
    var largestImg = null;
    var largestImgSize = null;
    var content = null;
    var imgLoaded = null;
    var images = [];
    var done = function() {
        container.innerHTML = "";
        imgLoaded = null;
        images.length = 0;
        callback(largestImg);
    }.bind(this);

    container.innerHTML = blob;
    images = container.getElementsByTagName("img");

    if(images.length > 0) {
        // Let's try to extract the image for this message.
        imgLoaded = _.after(images.length, function() {
            done();
        }.bind(this));

        _.each(images, function(image) {
            if(typeof image.src === "undefined" || image.src === "") {
                imgLoaded();
            }
            else {
                this.imgSize(image.src, base || "", function(src, height, width) {
                    if((!largestImgSize || largestImgSize < height * width) && 
                    !(height === 250 && width === 300) && 
                    !(height < 100  || width < 100) &&
                    !src.match('/doubleclick.net/')) {
                        largestImgSize = height * width;
                        largestImg = src;
                    }
                    imgLoaded();
                }.bind(this));
            }
        }.bind(this));
    }
    else {
        // No image!
        done();
    }
}


imageExtractor.prototype.extractImageFromLink = function(link, callback) {
  callback(null);
}

imageExtractor.prototype.extract = function(blob, link, callback) {
  // We first try to extract from the Blob,
  this.extractLargestImageFromBlob(blob, link, function(img){
    if(img) {
      callback(img);
    }
    else {
      // And if we can't, we use http://image-extrator.appspot.com/ 
      this.extractImageFromLink(link, function(img) {
        callback(img);
      })
    }
  }.bind(this));
}


exports.imageExtractor = imageExtractor;