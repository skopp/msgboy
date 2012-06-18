var imageExtractor = require('../image-extractor.js').imageExtractor;
var assert = require('assert');

imageExtractor = new imageExtractor();

describe('imageExtractor', function(){
  describe('imgSize', function() {

  });
  describe('extractLargestImageFromBlob', function() {
    it('should return null if there was none', function(done) {
      imageExtractor.extractLargestImageFromBlob("This is a text sample with no image at all.", null, function(image) {
        done();
      })
    });

    it('should return an object with src, width and height if there was one', function(done) {
      var blob = '<p><a href="http://ffffound.com/image/0d9c9495fccbf85ec19ad087e3de1e255f83e518"><img src="http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg" alt="" border="0" width="480" height="480"></a></p><p>via <a href="http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg">http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg</a></p>';
      imageExtractor.extractLargestImageFromBlob(blob, null, function(image) {
        assert.equal(image, "http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg");
        done();
      });
    });

    it('should return the largest one', function(done) {
      var blob = '<p><a href="http://ffffound.com/image/0d9c9495fccbf85ec19ad087e3de1e255f83e518"><img src="http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg" alt="" border="0" width="480" height="480"></a></p><p>via <a href="http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg">http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg</a></p>';
      imageExtractor.extractLargestImageFromBlob(blob, null, function(image) {
        assert.equal(image, "http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg");
        done();
      });
    });

    it('should return the absolute url based on the base if the url of the image is relative', function(done) {
      var blob = '<table border="0" cellpadding="2" cellspacing="7" style="vertical-align:top;"><tr><td width="80" align="center" valign="top"><font style="font-size:85%;font-family:arial,sans-serif"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNFZlT7-WfGbQvBdlb3CTCuWWGc_kA&amp;url=http://www.theglobeandmail.com/news/world/powerful-storms-destroy-us-towns-kill-at-least-29/article2357253/"><img src="/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg?s=l" alt="" border="1" width="80" height="80" /><br /><font size="-2">Globe and Mail</font></a></font></td><td valign="top" class="j"><font style="font-size:85%;font-family:arial,sans-serif"><br /><div style="padding-top:0.8em;"><img alt="" height="1" width="1" /></div><div class="lh"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNGflW9pZurmRUryNrispwwpWtC5MQ&amp;url=http://www.washingtonpost.com/national/health-science/henryville-twister-caught-on-tape-140/2012/03/05/gIQAVUtTsR_video.html"><b>Henryville twister caught on tape (1:40)</b></a><br /><font size="-1"><b><font color="#6f6f6f">Washington Post</font></b></font><br /><font size="-1">Mar. 5, 2012 - Sam Lashley, a National Weather Service meteorologist, recorded video of the tornado that hit Henryville, Indiana on Friday. The overall death toll from Friday&#39;s weather is 39, including a toddler who was found in a field.</font><br /><font size="-1"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNHJQVT--fmHFLwxuz-O1s5k7Y-Oig&amp;url=http://www.chicagotribune.com/news/local/sns-ap-in--severeweather-indianasnow,0,6707049.story">Wet snow blankets tornado-ravaged S. Ind.; 2 to 4 inches reported in heavily <b>...</b></a><font size="-1" color="#6f6f6f"><nobr>Chicago Tribune</nobr></font></font><br /><font size="-1"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNFYA02T8-8vs5YPGdeFM_4M_8nVLQ&amp;url=http://articles.cnn.com/2012-03-04/us/us_severe-weather_1_tornado-victims-ef-4-alabama-town?_s%3DPM:US">Grief, resilience after storms rip through states, killing 39</a><font size="-1" color="#6f6f6f"><nobr>CNN</nobr></font></font><br /><font size="-1"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNFiX2lNXPTwm3lml8zFWPeDKhzc-A&amp;url=http://edition.cnn.com/2012/03/02/us/severe-weather/?hpt%3Dus_c1">28 dead as &#39;enormous outbreak&#39; of tornadoes tears through US</a><font size="-1" color="#6f6f6f"><nobr>CNN International</nobr></font></font><br /><font size="-1" class="p"><a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNHBXbNnSdIY95atQihXvVJKYbnEqA&amp;url=http://usnews.msnbc.msn.com/_news/2012/03/05/10580677-snowy-weather-adds-to-tornado-survivors-misery"><nobr>msnbc.com</nobr></a>&nbsp;-<a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNEfbNBdF-vjSqb-sV6J0xZK9PGEew&amp;url=http://www.wvnstv.com/story/17079238/search-for-tornado-survivors-continues-in-midwest-and-south"><nobr>WVNS-TV</nobr></a>&nbsp;-<a href="http://news.google.com/news/url?sa=t&amp;fd=R&amp;usg=AFQjCNGn3eTSmJJRBrgnmNJrtwyT003uDw&amp;url=http://www.google.com/hostednews/ap/article/ALeqM5gyz7FSxCAbrAylfyaGNAAsDjKBhA?docId%3D02bc49f9c2284618aab33afeb2e4eec1"><nobr>The Associated Press</nobr></a><link rel="syndication-source" href="www.ap.org/02bc49f9c2284618aab33afeb2e4eec1" /></font><br /><font class="p" size="-1"><a class="p" href="http://news.google.com/news/more?pz=1&amp;ned=us&amp;topic=h&amp;num=3&amp;ncl=dNSd1trbK_xkJwMSQJ-gwNagUq1EM"><nobr><b>all 5,372 news articles&nbsp;&raquo;</b></nobr></a></font></div></font></td></tr></table>';
      imageExtractor.extractLargestImageFromBlob(blob, "http://img.ffffound.com/hello/world", function(image) {
        assert.equal(image, "http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg?s=l");
        done();
      });
    });
  });
  describe('extractImageFromLink', function() {
    it('should be able to extract the right image from http://www.msgboy.com/', function(done) {
      this.timeout(10000);
      imageExtractor.extractImageFromLink('http://www.msgboy.com/', function(image) {
        assert.equal(image, 'http://www.msgboy.com/views/images/splash/splash-screenshot.png');
        done();
      });
    })
  });
  describe('extract', function() {

  })
});