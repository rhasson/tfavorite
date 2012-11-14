/*
*	Routes implementation
*	v.0.0.1
*/

var r = require('request'),
		qs = require('querystring'),
		config = require('../config').config,
		url = require('url');

exports.routes = {
	index: function(req, res, next) {
console.log('SESSION: ', req.session);
		var name = req.session.access_token ? req.session.access_token.screen_name : '';
		res.render('home', {user: name});
	},
	auth_cb: function(req, res, next) {
				var v = qs.parse(url.parse(req.url).query);
				if (!v.denied){
					req.session.access_token.oauth_verifier = v.oauth_verifier;
					var oauth = {
								consumer_key: config.twitter.consumer_key,
								consumer_secret: config.twitter.consumer_secret,
								token: req.session.access_token.oauth_token,
								verifier: req.session.access_token.oauth_verifier,
								token_secret: req.session.access_token.oauth_token_secret
							},
							u = config.twitter.base_url + '/oauth/access_token';
					r.post({url: u, oauth: oauth}, function(err, resp, body) {
						if (!err && resp.statusCode === 200) {
							req.session.access_token = qs.parse(body);
							req.session.oauth = {
								consumer_key: config.twitter.consumer_key,
								consumer_secret: config.twitter.consumer_secret,
								token: req.session.access_token.oauth_token,
								token_secret: req.session.access_token.oauth_token_secret
							};
							var u = config.twitter.base_url + '/1/users/show.json?',
									params = {
										screen_name: req.session.access_token.screen_name,
										user_id: req.session.access_token.user_id
									};
							u += qs.stringify(params);
							r.get({url: u, oauth: req.session.oauth, json: true}, function(err2, resp2, user) {
								if (!err2 && resp2.statusCode === 200) {
									console.log(user);
									res.redirect('/');
								}
							});
						}
					});
				}
	}, 
	twitter_login: function(req, res, next) {
		var oauth = {
			callback: config.home_url + config.twitter.callback,
			consumer_key: config.twitter.consumer_key,
			consumer_secret: config.twitter.consumer_secret
		},
		u = config.twitter.base_url + '/oauth/request_token';

		r.post({url: u, oauth: oauth}, function(err, resp, body) {
			if (!err && resp.statusCode === 200) {
				req.session.access_token = qs.parse(body);

				res.redirect(
					config.twitter.base_url + 
					'/oauth/authenticate?' + 
					qs.stringify({oauth_token: req.session.access_token.oauth_token}));
			} else console.log(body);
		});
	}
}

