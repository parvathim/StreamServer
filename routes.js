var config = require('./config/config'),
	express = require('express'),
	models = require('./models'),
	passport = require('passport'),
	_ = require('underscore'),
	async = require('async'),
	stream_node = require('getstream-node'),
	fs = require('fs'),
	bodyParser = require('body-parser'),
	rest = require('./restware'),
	methodOverride = require('method-override');

var router = express.Router(),
	User = models.User,
	Item = models.Item,
	Pin = models.Pin,
	Follow = models.Follow,
	Tweet = models.Tweet;

var FeedManager = stream_node.FeedManager;
var StreamMongoose = stream_node.mongoose;
var StreamBackend = new StreamMongoose.Backend();

var enrichActivities = function(body) {
	var activities = body.results;
	return StreamBackend.enrichActivities(activities);
};

var enrichAggregatedActivities = function(body) {
	var activities = body.results;
	return StreamBackend.enrichAggregatedActivities(activities);
};

var ensureAuthenticated = function(req, res, next) {
	if (req.isAuthenticated()) {
		return next();
	}
	res.redirect('/login');
};

router.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


var did_i_pin_it = function(items, pins) {
	var pinned_items_ids = _.map(pins, function(pin) {
		return pin.item.toHexString();
	});
	_.each(items, function(item) {
		if (pinned_items_ids.indexOf(item._id.toHexString()) !== -1) {
			item.pinned = true;
		}
	});
};

var did_i_follow = function(users, followers) {
	var followed_users_ids = _.map(followers, function(item) {
		return item.target.toHexString();
	});
	_.each(users, function(user) {
		if (followed_users_ids.indexOf(user._id.toHexString()) !== -1) {
			user.followed = true;
		}
	});
};

router.use(function(req, res, next) {
	//if (req.isAuthenticated()) {
	console.log(req.body);
	console.log(req.params);
		res.locals = {
			StreamConfigs: stream_node.settings,
			NotificationFeed: FeedManager.getNotificationFeed(
				req.params.id //|| req.user.github_id
			)
		}
	//}
	next();
})

router.use(function(error, req, res, next) {
	if (!error) {
		next();
	} else {
		console.error(error.stack);
		res.send(500);
	}
});

router.use(function(req, res, next) {
	//if (!req.isAuthenticated()) {
	//	return next();
	//} else 
	//if (!req.params.id) {
	req.user = {};
	console.log(req.body);
		User.findOne({ _id: req.body.id })
			.lean()
			.exec(function(err, user) {
				if (err) return next(err);
				console.log(user);
				notificationFeed = FeedManager.getNotificationFeed( user._id);

				req.user.id =  user._id;
				req.user.token = notificationFeed.token;
				req.user.APP_ID = FeedManager.settings.apiAppId;
				req.user.APP_KEY = FeedManager.settings.apiKey;

				notificationFeed.get({ limit: 0 }).then(function(body) {
					if (typeof body !== 'undefined')
						req.user.unseen = body.unseen;
					next();
				});
			});
//	} else {
//		next();
//	}
});

/*******************************
    Support DELETE from forms
*******************************/


router.use(bodyParser.urlencoded({ extended: true }));
router.use(
	methodOverride(function(req, res) {
		if (req.body && typeof req.body === 'object' && '_method' in req.body) {
			// look in urlencoded POST bodies and delete it
			var method = req.body._method;
			delete req.body._method;
			return method;
		}
	})
);

router.get('/', function(req, res, next) {
	Item.find({}).populate('user').lean().exec(function(err, popular) {
		if (err) return next(err);

		if (req.isAuthenticated()) {
			Pin.find({ user: req.user.id })
				.lean()
				.exec(function(err, pinned_items) {
					did_i_pin_it(popular, pinned_items);
					return res.render('trending', {
						location: 'trending',
						user: req.user,
						stuff: popular,
					});
				});
		} else
			return res.render('trending', {
				location: 'trending',
				user: req.user,
				stuff: popular,
			});
	});
});

/******************
  Flat Feed
******************/

router.get('/flat/:id',  function(req, res, next) {
	var flatFeed = FeedManager.getNewsFeeds(req.params.id)['timeline'];

	flatFeed
		.get({})
		.then(enrichActivities)
		.then(function(enrichedActivities) {
			console.log(enrichedActivities);
			res.send(200, {
				location: 'flat_feed',
				user: req.user,
				activities: enrichedActivities,
				path: req.url
			});
		})
		.catch(next);
});

/******************
  Aggregated Feed
******************/

router.get('/aggregated_feed/:id', function(req, res, next) {
	var aggregatedFeed = FeedManager.getNewsFeeds(req.params.id)[
		'timeline_aggregated'
	];

	aggregatedFeed
		.get({})
		.then(enrichAggregatedActivities)
		.then(function(enrichedActivities) {

			res.send(200, {
				location: 'aggregated_feed',
				user: req.user,
				activities: enrichedActivities,
				path: req.url
			});
	/*			res.render('aggregated_feed', {
				location: 'aggregated_feed',
				user: req.user,
				activities: enrichedActivities,
				path: req.url,
			});*/
		})
		.catch(next);
});

/******************
  Notification Feed
******************/

router.post('/notification_feed/:id', function(
	req,
	res,
	next
) {
	var notificationFeed = FeedManager.getNotificationFeed(req.params.id);
	console.log(req.body);
	notificationFeed
		.get({ mark_read: true, mark_seen: true })
		.then(function(body) {
			console.log(body);
			var activities = body.results;
			if (activities.length == 0) {
				return res.send('');
			} else {
				req.body.unseen = 0;
				return res.send(200,StreamBackend.enrichActivities(activities[0].activities));
			}
		})
		.then(function(enrichedActivities) {
			//res.render('notification_follow',
			 return res.send(200, {
				lastFollower: enrichedActivities[0],
				count: enrichedActivities.length,
				layout: false,
			});
		})
		.catch(next);
});

/******************
  People
******************/

router.get('/people/:id', function(req, res) {
	console.log(req.params.id);
	User.find({}).lean().exec(function(err, people) {
		//Follow.find({ user: req.user.id }).exec(function(err, follows) {
		Follow.find({ user: req.params.id }).exec(function(err, follows) {
			if (err) return next(err);
			did_i_follow(people, follows);
			console.log(people);
			console.log(follows);
			var full = new Object();
			full.people=people;
			full.follows=follows;
			//return res.json(200,people);
			return rest.sendSuccess(res,'Sending people list for the user', full);

			/*render('people', {
				location: 'people',
				user: req.user,
				people: people,
				path: req.url,
				show_feed: true,
			});*/
		});
	});
});

/******************
  User Profile
******************/

router.get('/profile', function(req, res, next) {
	var userFeed = FeedManager.getUserFeed(req.user.id);

	userFeed
		.get({})
		.then(enrichActivities)
		.then(function(enrichedActivities) {
			res.render('profile', {
				location: 'profile',
				user: req.user,
				profile_user: req.user,
				activities: enrichedActivities,
				path: req.url,
				show_feed: true,
			});
		})
		.catch(next);
});

router.get('/profile/:user', function(req, res, next) {
	User.findOne({ username: req.params.user }, function(err, foundUser) {
		if (err) return next(err);

		if (!foundUser)
			return res.send('User ' + req.params.user + ' not found.');

		var flatFeed = FeedManager.getNewsFeeds(foundUser._id)['flat'];

		flatFeed
			.get({})
			.then(enrichActivities)
			.then(function(enrichedActivities) {
				res.render('profile', {
					location: 'profile',
					user: req.user,
					profile_user: foundUser,
					activities: enrichedActivities,
					path: req.url,
					show_feed: true,
				});
			})
			.catch(next);
	});
});

/******************
  Account
******************/

router.get('/account', function(req, res) {
	res.render('account', { user: req.user });
});

/******************
  Auth
******************/

router.post('/login', function(req, res,next) {
	//if (req.isAuthenticated()) return res.redirect('/');

	//res.render('login', { location: 'people', user: req.user });

 	console.log('[LOGIN] Started');
	console.log(req.body);

	User.findOne({
                username: req.body.username
            }, function (err, localUser) {
                if (err) return done(err);

                if (!localUser) {
                    //console.log("[LOGIN v2] ERROR!!!! User not found in CareBook");
                    return res.json(400, {message: 'User not found'});
                }
                //console.log("[LOGIN v2] Local User OK");

                //Use localUser henceforth for sesion creation & lookup.
                req.logIn(localUser, function (err) {
                    if (err) return res.send(err);

                    var userInfo = localUser.userInfo;
                   // userInfo.name = req.body.fullName;
                    //userInfo.role = req.body.customData.role;

                    res.json(localUser);
                })

		});	

/*    	passport.authenticate('local', function (err, user, info) {
        var error = err || info;
	//console.log(error + " " + user);
        if (error) {
            //console.log('[LOGIN v1] Local Authentication FAILED');
            return res.json(401, error);
        }
	return res.json(user);
    	})(req, res, next);*/
});

router.get('/logout', function(req, res) {
	req.logout();
	res.redirect('/');
});

router.get('/auth/github', passport.authenticate('local', { failureRedirect: '/login' }));

router.get(
	'/auth/github/signup', function(req, res) {
		User.findOne({ username: req.user.username }, function(err, foundUser) {
			if (!foundUser) {
				User.create(
					{
						username: req.user.username,
						password: req.user.password,
					},
					function(err, newUser) {
						if (err) return next(err);

						return res.redirect('/');
					}
				);
			} else return res.redirect('/login');
		});
	}
);

/******************
  Follow
******************/

router.post('/follow/:id/:selfid', function(req, res, next) {
	User.findOne({ _id: req.params.id }, function(err, target) {
		if (target) {
			var followData = { user: req.params.selfid, target: req.params.id };
			var follow = new Follow(followData);
			follow.save(function(err) {
				if (err) next(err);
				res.set('Content-Type', 'application/json');
				return res.send({ follow: { id: req.params.id } });
			});
		} else {
			res.status(404).send('Not found');
		}
	});
});

router.delete('/follow', function(req, res) {
	Follow.findOne({ user: req.user.id, target: req.body.target }, function(
		err,
		follow
	) {
		if (follow) {
			follow.remove(function(err) {
				if (err) next(err);
				res.set('Content-Type', 'application/json');
				return res.send({ follow: { id: req.body.target } });
			});
		} else {
			res.status(404).send('Not found');
		}
	});
});

/******************
  Pin
******************/

router.post('/pin', function(req, res, next) {
	Item.findOne({ _id: req.body.item }, function(err, item) {
		console.log('item', item);
		if (item) {
			var pinData = { user: req.user.id, item: item };
			var pin = new Pin(pinData);
			pin.save(function(err,data) {
				if (err) next(err);
				res.set('Content-Type', 'application/json');
				return res.send({ pin: { id: req.body.item } });
			});
		} else {
			res.status(404).send('Not found');
		}
	});
});

router.delete('/pin', function(req, res) {
	var user = req.user;
	var pinData = { user: req.user.id, item: req.body.item };

	Pin.findOne(pinData, function(err, foundPin) {
		if (foundPin) {
			foundPin.remove();
		}
	});

	res.set('Content-Type', 'application/json');
	return res.send({ pin: { id: req.body.item } });
});

/******************
  Auto Follow
******************/

router.get('/auto_follow/', function(req, res, next) {
	var followData = { user: req.user.id, target: req.user.id };
	res.set('Content-Type', 'application/json');

	Follow.findOne(followData, function(err, foundFollow) {
		if (!foundFollow) {
			console.log('follow data', followData);
			record = new Follow(followData);
			record.save(function(err) {
				console.error(err);
				if (err) next(err);
				return res.send({ follow: { id: record._id } });
			});
		} else {
			return res.send({});
		}
	});
});

/******************
  Add Activity
******************/

router.post('/activity/:id', function(req, res, next) {
	console.log(req.body);
	User.findOne({ _id: req.params.id }, function(err, target) {
		if (target) {
			var tweetData = req.body;
			var item = new Tweet(tweetData);
			item.save(function(err,data) {
				if (err) next(err);
				res.set('Content-Type', 'application/json');
				console.log(data);
				return res.send(data);
			});
		} else {
			res.status(404).send('Not found');
		}
	});
});

module.exports = router;
