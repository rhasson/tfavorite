/*
*	Routes implementation
*	v.0.0.1
*/

var r = require('request'),
		qs = require('querystring'),
		config = require('../config').config,
		url = require('url'),
		async = require('async');

exports.routes = {
	index: function(req, res, next) {
		async.waterfall([
			function(cb) { getFavorites(req, 10, cb); },
			function(obj, cb) { sortList('ascend', obj, cb); },
			function(sortedlist, cb) { render(sortedlist, cb); }
			//function(sortedlist, cb) { embedMedia(sortedlist, cb); }
			//function(embededlist, cb) { render(embededlist, cb); }
		], function(err, list) {
			if (!err) res.render('favs', {user: req.session.access_token.screen_name, favs: list});
			else res.render('home', {user: ''});
		});
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
							var u = config.twitter.base_url + '/1.1/users/show.json?',
									params = {
										screen_name: req.session.access_token.screen_name,
										user_id: req.session.access_token.user_id
									};
							u += qs.stringify(params);
							r.get({url: u, oauth: req.session.oauth, json: true}, function(err2, resp2, user) {
								if (!err2 && resp2.statusCode === 200) {
									req.session.user = user;
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

function getFavorites(req, count, cb) {
	var name, u, params;
	if (req.session.access_token) {
		name = req.session.access_token.screen_name;
		u = config.twitter.base_url + '/1.1/favorites/list.json?';
		u += qs.stringify({
			user_id: req.session.access_token.user_id,
			count: count || 10,
			include_entities: true
		});
		r.get({url: u, oauth: req.session.oauth, json: true}, function(err, resp, body) {
			if (!err && resp.statusCode === 200) {
				return cb(null, body);
			} else return cb(err);
		});
	} else return cb(true);
}

/*
* Sort list of favorites based on a given method
* @method: method to sort based on
* @list: an array of favorite objects
*/
function sortList(method, list, cb) {
	list.forEach(function(v, i) {
		console.log('ENTITIES: ', v.entities)
		console.log('USER ENTITIES: ', v.user.entities)
	});
	return cb(null, list);
}

/*
* Extract media links and embed directly into layout
* @list of favorites to parse
*/
function embedMedia(list, cb) {
	var newlist = [];
	async.forEach(list, checkEmbed, function(err) {
		if (!err) return cb(null, newlist);
		else return cb(null, list);
	});

	function checkEmbed(v, cback) {
		var host = url.parse(v.entities.urls[0].expanded_url).host,
				o = {
					url: v.entities.urls[0].expanded_url,
					width: 435,
					height: 244
				},
				u = config.vimeo.oembed_url + '?' + qs.stringify(o);
		switch (host) {
			case 'vimeo.com':
				r.get({url: u, json: true}, function(err, resp, body) {
					if (!err && resp.statusCode === 200) {
						v.entities.urls.embeded_url = body.html;
						newlist.push(v);
						return cback();
					} else return cback(err);
				});
				break;
			default: 
				newlist.push(v);
				return cback();
		}
	}
}

function render(list, cb) {
	var newlist = list.map(function(v, i) {
		return {
			text: v.text,
			urls: v.entities.urls,
			user : {
				id: v.user.id,
				pic: v.user.profile_image_url,
				screen_name: v.user.screen_name,
				name: v.user.name
			},
			retweet_count: v.retweet_count,
			created_at: v.created_at,
			fav_id: v.id
		}
	});
	return cb(null, newlist);
}