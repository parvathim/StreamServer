var nconf = require('nconf');

nconf.argv().env();

nconf.defaults({
	MONGODB_URI: 'mongodb://localhost/stream_nodejs',
	PORT: 4040
});

module.exports = nconf;	

//GITHUB_CLIENT_ID: 'fbf471bb1e4323243e66',
//GITHUB_CLIENT_SECRET: '26faf108fada9575bdea8ba4306c24ecae99659e',
//GITHUB_CALLBACK: 'http://localhost:4040/auth/github/callback'
