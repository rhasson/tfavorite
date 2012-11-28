/*
*	Routes implementation
*	v.0.0.1
*/

var r = require('request'),
		qs = require('querystring'),
		crypto = require('crypto'),
		config = require('../config').config,
		url = require('url'),
		util = require('util'),
		cache = {};

/*
*  Basic HTTP routes handled by Express
*/
exports.routes = {
	index: function(req, res, next) {
		if (req.session && req.session.access_token) res.render('favs', 
			{user: req.session.access_token.screen_name,
			 id: req.session.access_token.user_id});
		else res.render('home', {user: ''});
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
									cache[req.session.access_token.user_id.toString()] = req.session;
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
	},
	logout: function(req, res, next) {
		cach[req.session.access_token.user_id] = null;
		req.session = null;
		res.redirect('/');
	},
	get_favorites: function(req, res, next) {
		getFavorites(req, req.query, function(err, data){
			if (!err) {
				render(data, function(err, list) {
					res.json(list);
				});
			} else next();
		});
	},
	get_embed: function(req, res, next) {
		var o = {
			id: req.params.id,
			url: req.query.url
		};
		getEmbededMedia(o, function(err, data) {
			if (!err) res.json(data);
			else next();
		});
	}
}

/*
*  WebSockets command parsing and routing
*/
exports.wsroutes = {
	parse: function(msg, socket) {
		var data, resp, sess, id;
		
		try { data = JSON.parse(msg); }
		catch (e) { console.log(e); }
		
		switch (data.action) {
			case 'init':
				sess = cache[data.id];  //get session given the user id
				if (sess) {
					crypto.randomBytes(128, function(e, b){
						if (!e) {
							resp = {
								status: 'ok',
								data: {	token: b.toString('base64') }
							};
							cache[resp.data.token] = data.id;  //save the ws session id with the user id
							//sockets[resp.data.token] = socket;
						} else {
							resp = {
								status: 'error',
								error: 'failed to create session token'
							}
						}
						return socket.write(JSON.stringify(resp));
					});
				}
				break;
			case 'get_favorites':
				if (data.token) {
					id = cache[data.token];
					if (id) {
						sess = cache[id];
						getFavorites(sess, data.params, function(err, resp) {
							if (!err) {
								render(resp, function(err, list) {
									socket.write(JSON.stringify({
										status: 'ok',
										token: data.token,
										data: list
									}));
								});
							}
						});
					}
				}
				break;
			case 'get_embed':
				if (data.token) {
					id = cache[data.token];
					if (id) {
						sess = cache[id];
						getEmbededMedia(data.params, function(err, resp) {
							if (!err) {
								socket.write(JSON.stringify({
									status: 'ok',
									token: data.token,
									data: resp
								}));
							}
						});
					}
				}
		}
	}
}

/*
*  Helper functions
*/

function getFavorites(req, params, cb) {
	var name, u, x;
	var sess = req.session || req;

	if (typeof params === 'function') {
		cb = params;
		params = { count: 10 };
	}

	if (sess) {
		name = sess.access_token.screen_name;
		u = config.twitter.base_url + '/1.1/favorites/list.json?';
		x = {
			user_id: sess.access_token.user_id,
			include_entities: true
		};
		util._extend(x, params);
		u += qs.stringify(x);
		r.get({url: u, oauth: sess.oauth, json: true}, function(err, resp, body) {
			if (!err && resp.statusCode === 200) {
				return cb(null, body);
			} else return cb(err);
		});
	} else return cb(false);
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
* @item an object containing favorite id and url to parse
*/
function getEmbededMedia(item, cb) {
	var oembed,
		u = '',
		host = url.parse(item.url).host,
			o = {
				url: item.url,
				maxwidth: 400//435,
				//maxheight: 244
			};
	
	if (host.match(/vimeo.com/ig)) {
		u = config.vimeo.oembed_url + '?' + qs.stringify(o);
	} else if (host.match(/youtube.com|youtu.be/ig)) {
		o.format = 'json';
		u = config.youtube.oembed_url + '?' + qs.stringify(o);
	} else if (host.match(/instagr.am|instagram/)) {
		u = config.instagram.oembed_url + '?' + qs.stringify(o);
	}
	else return cb(null, {});
	
	r.get({url: u, json: true}, function(err, resp, body) {
		if (!err && resp.statusCode === 200) {
			return cb(null, body);
		} else return cb(err);
	});
}

function render(list, cb) {
	var newlist = list.map(function(v, i) {
		var t = v.text.slice(0, v.entities.urls[0].indices[0]);
		return {
			text: t,
			urls: v.entities.urls[0],
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