var passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy;
    //var mongoose = require('mongoose');
//   var User = require('User');
var models = require('../models');
var	User = models.User;
//	Item = models.Item,
//	Pin = models.Pin,
//	Follow = models.Follow;


passport.serializeUser(function (user, done) {
        done(null, user.id);
    });

    passport.deserializeUser(function (id, done) {
        User.findOne({
            _id: id
        }, 'password', function (err, user) { // don't ever give out the password or salt
            done(err, user);
        });
    });

/*passport.serializeUser(function(user, done) {
    var sessionUser = {username: user.username, displayName: user.displayName, avatar_url: user._json.avatar_url, github_id: user.id}
    done(null, sessionUser);
});

passport.deserializeUser(function(sessionUser, done) {
    done(null, sessionUser);
});*/

/*passport.use(new GitHubStrategy({
        clientID: config.get('GITHUB_CLIENT_ID'),
        clientSecret: config.get('GITHUB_CLIENT_SECRET'),
        callbackURL: config.get('GITHUB_CALLBACK')
    }, function(accessToken, refreshToken, profile, done) {
        return done(null, profile);
    })
);*/


    passport.use(new LocalStrategy({
            usernameField: 'username',
            passwordField: 'password' // this is the virtual field on the model
        },
        function (username, password, done) {
	    console.log(username + '||' + password)
            User.findOne({
                username: username
            }, function (err, user) {
		console.log(err + '||' + user);                
		if (err) return done(err);
		
                if (!user) {
                    return done(null, false, {
                        message: 'This email is not registered.'
                    });
                }
                if (!user.authenticate(password)) {
                    return done(null, false, {
                        message: 'Incorrect Password.'
                    });
                }
                return done(null, user);
            });
        }
    ));

