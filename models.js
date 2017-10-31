var mongoose = require('mongoose'),
	config = require('./config/config'),
	_ = require('underscore'),
	Schema = mongoose.Schema,
	stream_node = require('getstream-node');

mongoose.Promise = global.Promise;

var connection = mongoose.connect(config.get('MONGODB_URI'), {
	useMongoClient: true,
});

var FeedManager = stream_node.FeedManager;
var StreamMongoose = stream_node.mongoose;

var userSchema = new Schema(
	{
		username: { type: String, required: true },
		password: { type: String, required: true }
	},
	{
		collection: 'User',
	}
)

userSchema.methods.authenticate = function(plainText) {
        return plainText === this.password;
};

userSchema.statics = {

    load: function (id, cb) {
        this.findOne({ _id : id })
            //.populate('user', 'name email username')
            .exec(cb)
    },

    /**
     * Return users list
     *
     * @param {String} options
     * @return none
     * @callback with err, users list
     * @api public
     */
    list: function (options, cb) {
        var criteria = options.criteria || {}

        this.find(criteria, 'name email role provider organization')
            .sort({'name': 1}) // sort by name
            .limit(options.perPage)
            .skip(options.perPage * options.page)
            .exec(cb)
    }
};

var User = mongoose.model('User', userSchema);

var itemSchema = new Schema(
	{
		user: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
		image_url: { type: String},
		pin_count: { type: Number, default: 0 },
		message: { type: String, required: true },
	},
	{
		collection: 'Item',
	}
)
var Item = mongoose.model('Item', itemSchema);

var pinSchema = new Schema(
	{
		user: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
		item: { type: Schema.Types.ObjectId, required: true, ref: 'Item' },
	},
	{
		collection: 'Pin',
	}
)

pinSchema.plugin(StreamMongoose.activity);

pinSchema.statics.pathsToPopulate = function() {
	return ['user', 'item'];
};

pinSchema.methods.activityForeignId = function() {
	return this.user._id + ':' + this.item._id;
};

var Pin = mongoose.model('Pin', pinSchema);

var followSchema = new Schema(
	{
		user: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
		target: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
	},
	{
		collection: 'Follow',
	}
)

followSchema.plugin(StreamMongoose.activity);

followSchema.methods.activityNotify = function() {
	target_feed = FeedManager.getNotificationFeed(this.target._id);
	return [target_feed];
};

followSchema.methods.activityForeignId = function() {
	return this.user._id + ':' + this.target._id;
};

followSchema.statics.pathsToPopulate = function() {
	return ['user', 'target'];
};

followSchema.post('save', function(doc) {
	if (doc.wasNew) {
		var userId = doc.user._id || doc.user;
		var targetId = doc.target._id || doc.target;
		FeedManager.followUser(userId, targetId);
	}
});

followSchema.post('remove', function(doc) {
	FeedManager.unfollowUser(doc.user, doc.target);
});

var Follow = mongoose.model('Follow', followSchema);

var tweetSchema = Schema({
  text    : String,
  user   : { type: Schema.Types.ObjectId, ref: 'User' },
  verb	: String,
  object: Number
});

tweetSchema.plugin(StreamMongoose.activity);

tweetSchema.methods.createActivity = function() {
	// this is the default createActivity code, customize as you see fit.
      var activity = {};
      var extra_data = this.activityExtraData();
      for (var key in extra_data) {
          activity[key] = extra_data[key];
      }
      activity.to = (this.activityNotify() || []).map(function(x){return x.id});
      activity.actor = this.activityActor();
      activity.verb = this.activityVerb();
      activity.object = this.activityObject();
      activity.foreign_id = this.activityForeignId();
      if (this.activityTime()) {
          activity.time = this.activityTime();
      }
      return activity;
  }

tweetSchema.post('save', function(doc) {
	if (doc.wasNew) {
		var actor = doc.actor;
		var tweet = doc.tweet;
		var verb = doc.verb;
		var object = doc.object;
		FeedManager.activityCreated(doc);
	}
});


var Tweet = mongoose.model('Tweet', tweetSchema);

// register your mongoose connection with the library

// send the mongoose instance with registered models to StreamMongoose
StreamMongoose.setupMongoose(mongoose);

module.exports = {
	User: User,
	Item: Item,
	Pin: Pin,
	Follow: Follow,
	Tweet: Tweet,
};
