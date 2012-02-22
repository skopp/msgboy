var _ = require('underscore');
var Msgboy = require('../src/msgboy.js').Msgboy;
var should = require('chai').should();

describe('Msgboy', function(){

    describe('extractLargestImage', function() {
        
        it('should return null if there was none', function(done) {
            Msgboy.extractLargestImage("Nous recherchons une personne qualifiée dans le domaine de la petite enfance (BEP Carrières Sanitaires et Sociales, CAP Petite Enfance, Titre d'Assistante de vie aux familles...) pour un remplacement du 5 Mars au 13 Mars auprès de trois enfants (10 mois, 3 ans et 6 ans) à Nanterre (proche gare Nanterre Ville).", function(image) {
                done();
            })
        });
        
        it('should return an object with src, width and height if there was one', function(done) {
            Msgboy.extractLargestImage('<p><a href="http://ffffound.com/image/0d9c9495fccbf85ec19ad087e3de1e255f83e518"><img src="http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg" alt="" border="0" width="480" height="480"></a></p><p>via <a href="http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg">http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg</a></p>', function(image) {
                done();
            })
        });

        it('should return the largest one', function(done) {
            Msgboy.extractLargestImage('<p><a href="http://ffffound.com/image/0d9c9495fccbf85ec19ad087e3de1e255f83e518"><img src="http://img.ffffound.com/static-data/assets/6/0d9c9495fccbf85ec19ad087e3de1e255f83e518_m.jpg" alt="" border="0" width="480" height="480"></a></p><p>via <a href="http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg">http://30.media.tumblr.com/tumblr_l0f7hzF3Xd1qzuyswo1_500.jpg</a></p>', function(image) {
            })
        });
        
    })
    
});

