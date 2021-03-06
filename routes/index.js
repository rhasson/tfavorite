/*
*	Routes implementation
*	v.0.0.1
*/

var r = require('request')
		, qs = require('querystring')
		, crypto = require('crypto')
		, config = require('../config').config
		, db = require('../lib/db')
		, url = require('url')
		, util = require('util')
		, kue = require('kue')
		, search = require('../lib/search.js')
		, jobs = kue.createQueue()
		, cache = {}
		, queries = [];

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
		var self = this;
		if (!v.denied) {
			req.session.access_token.oauth_verifier = v.oauth_verifier;
			var oauth = {
						consumer_key: config.twitter.consumer_key,
						consumer_secret: config.twitter.consumer_secret,
						token: req.session.access_token.oauth_token,
						verifier: req.session.access_token.oauth_verifier,
						token_secret: req.session.access_token.oauth_token_secret
					},
					//need to remove the version from the api url
					u = config.twitter.base_url.substr(0, config.twitter.base_url.length-4) + '/oauth/access_token';
			/* get access token from twitter oauth service */
			r.post({url: u, oauth: oauth}, postAuth_cb);
		}

		/** callback helper functions **/

		/* auth token response */
		function postAuth_cb(err, resp, body) {
			if (!err && resp.statusCode === 200) {
				req.session.access_token = qs.parse(body);
				//req.session.access_token.user_id = req.session.access_token.user_id.toString();
				req.session.oauth = {
					consumer_key: config.twitter.consumer_key,
					consumer_secret: config.twitter.consumer_secret,
					token: req.session.access_token.oauth_token,
					token_secret: req.session.access_token.oauth_token_secret
				};

				/* save session object to cache */
				//cache[req.session.access_token.user_id] = req.session;
				var u = config.twitter.base_url + '/users/show.json?',
						params = {
							screen_name: req.session.access_token.screen_name,
							user_id: req.session.access_token.user_id
						};
				u += qs.stringify(params);
				/* get logged in user information and update session object in cache */
				r.get({url: u, oauth: req.session.oauth, json: true}, getUserInfo_cb);
			}
		}

		/* user info from api response */
		function getUserInfo_cb(err, resp, user) {
			if (!err && resp.statusCode === 200) {
				req.session.user = user;
				cache[req.session.user.id_str] = req.session;
				checkFavorites(redsIndex_cb);
			}
		}

		/* check if new favorites are available since last login */
		function checkFavorites(cb) {
			var params = {},
				user_id = req.session.user.id_str;

			db.get(user_id, function(err, current_favs) {
				if (!err && current_favs.length) {
					getFromApi(req.session, function(err2, api_favs) {
						if (!err2 && api_favs.length) {
							if (current_favs[0].id_str === api_favs[0].id_str) {
								console.log('ids match, return from db')
								cb(null, current_favs);
							} else {
								console.log('ids didnt match, save from api')
								save_cb(null, api_favs, function(err3) {
									if (!err3) {
										jobs.create('download all favorites', {
											session: req.session,
											user_id: user_id,
											total_count: req.session.user.favourites_count,
											start_id: current_favs[0].id_str,
											end_id: api_favs[0].id_str
										}).save();
										render_cb(null);
									}
								});
							}
						} else if (err2 || api_favs.length === 0) {
							cb(null, current_favs);
						}
					});
				} else {
					getFromApi(req.session, function(err, api_favs) {
						console.log('nothing found, saving from api and loading the rest')
						if (!err && api_favs.length) {
							save_cb(null, api_favs, function(err2) {
								if (!err2) {
									jobs.create('download all favorites', {
										session: req.session,
										user_id: user_id,
										start_id: api_favs[api_favs.length-1].id_str,
										total_count: req.session.user.favourites_count - api_favs.length
									}).save();
									render_cb(null);
								}
							});
						}

					});
				}
			});
		}

		/* save in db after rendering but before redirecting */
		function save_cb(s_err, list, cb) {
			if (!s_err) {
				redsindex(list, req.session.user.id_str);
				render(list, function(e, favs) {
					var c = (typeof cb === 'function') ? cb : render_cb;
					db.set(req.session.user.id_str, favs, c);
				});
			}
		}

		/* index the new favorites */
		function redsIndex_cb(f_err, list) {
			if (!f_err) {
				/* index important values from favorite object */
				redsindex(list, req.session.user.id_str); //verify if this is blocking and should be done async
				/* format favorite object to pull out only relevant info to send client */
				render(list, render_cb);
			}
		}

		/* format the favorites to make only needed fields available to client */
		function render_cb(r_err, favs) {
			res.redirect('/');
/*			if (!r_err) {
				res.redirect('/');
			} else res.redirect('/logout');
*/
		}
	},

	twitter_login: function(req, res, next) {
		var oauth = {
			callback: config.home_url + config.twitter.callback,
			consumer_key: config.twitter.consumer_key,
			consumer_secret: config.twitter.consumer_secret
		},
		u = config.twitter.base_url.substr(0, config.twitter.base_url.length-4) + '/oauth/request_token';

		r.post({url: u, oauth: oauth}, function(err, resp, body) {
			if (!err && resp.statusCode === 200) {
				req.session.access_token = qs.parse(body);

				res.redirect(
					config.twitter.base_url.substr(0, config.twitter.base_url.length-4) + 
					'/oauth/authenticate?' + 
					qs.stringify({oauth_token: req.session.access_token.oauth_token}));
			} else console.log(body);
		});
	},

	logout: function(req, res, next) {
		if (req.session && req.session.user) cache[req.session.user.id_str] = null;
		req.session = null;
		res.render('home', {user: ''});
	},

	get_favorites: function(req, res, next) {
		/*getFavorites(req.session.user.id_str, req.query, function(err, data){
			if (!err) res.json(list);
			else next();
		});*/
		next();
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
	},

	remove: function(req, res, next) {
		removeFavorite(req, req.params.id, function(err, resp) {
			if (!err) {
				res.json(resp);
			} else {
				res.json({Error: 'failed to remove favorite', id: req.params.id});
			}
		});
	}
};

/*
*  WebSockets command parsing and routing
*/
exports.wsroutes = {
	init: function(msg, socket) {
		var resp_msg = {};
		if (socket.handshake.sid) {
			crypto.randomBytes(128, function(e, b){
				if (!e) {
					resp_msg.status = 'ok';
					resp_msg.data = { token: b.toString('base64') };
					cache[resp_msg.data.token] = socket.handshake.sid;  //save the ws session id with the user id
				} else {
					resp_msg.status = 'error';
					resp_msg.error = 'failed to create session token';
				}
				return socket.emit('init', resp_msg);
			});
		}
	},
	
	get_favorites: function(msg, socket) {
		var user_id = '', sid = '', resp_msg = {};
		console.log('MSG: ',msg)

		if (msg.token) {
			sid = cache[msg.token];
			if (sid === socket.handshake.sid) {
				user_id = socket.handshake.user_id;
				resp_msg.token = msg.token;

				if (!queries['_'+user_id]) queries['_'+user_id] = new search(user_id);

				if (msg.params.start_id || msg.params.end_id) {
					db.get_by_id(user_id, msg.params, function(err, resp) {
						if (!err) {
							var temp_id = msg.params.start_id || msg.params.end_id;
							resp_msg.status = 'ok';
							resp_msg.data = resp.filter(function(i) {
								if (i.id_str !== temp_id) return true;
							});
							socket.emit('get_favorites', resp_msg);
						} else {
							resp_msg.status = 'error';
							resp_msg.error = err.message;
							socket.write('get_favorites', resp_msg);
						}
					});
				} else {
					db.get(user_id, msg.params, function(err, resp) {
						if (!err) {
							resp_msg.status = 'ok';
							resp_msg.data = resp;
							/*d = JSON.stringify(resp_msg);
							d = d.slice(0, d.length-1);
							d += ', "data": '+resp+'}';*/
							socket.emit('get_favorites', resp_msg);
						} else {
							resp_msg.status = 'error';
							resp_msg.error = err.message;
							socket.write('get_favorites', resp_msg);
						}
					});
				}
			}
		}
	},

	get_embed: function(msg, socket) {
		var sid = '', resp_msg = {};
		if (msg.token) {
			sid = cache[msg.token];
			if (sid === socket.handshake.sid) {
				resp_msg.token = msg.token;
				getEmbededMedia(msg.params, function(err, resp) {
					if (!err) {
						resp_msg.status = 'ok';
						resp_msg.data = resp;
					} else {
						resp_msg.status = 'error';
						resp_msg.error = err.message;
					}
					socket.emit('get_embed', resp_msg);
				});
			}
		}
	},
	
	remove_favorite: function(msg, socket) {
		var sid = '', user_id = '', resp_msg = {};
		if (msg.token) {
			sid = cache[msg.token];
			if (sid === socket.handshake.sid) {
				user_id = socket.handshake.user_id;
				resp_msg.token = msg.token;
				removeFavorites(user_id, socket.handshake.oauth, msg.params.id, function(err, resp) {
					if (!err) {
						resp_msg.status = 'ok';
						resp_msg.data = null;
					} else {
						resp_msg.status = 'error';
						resp_msg.error = err.message;
					}
					socket.emit('remove_favorite', resp_msg);
				});
			}
		}
	},

	search: function(msg, socket) {
		var sid = '', user_id = '', resp_msg = {}, q;
		if (msg.token) {
			sid = cache[msg.token];
			if (sid === socket.handshake.sid) {
				user_id = socket.handshake.user_id;
				if (queries['_'+user_id]) q = queries['_'+user_id];
				else {
					resp_msg.status = 'error';
					resp_msg.data = 'Search failed - could not retreive search index';
					return socket.emit('search', resp_msg);
				}
				resp_msg.token = msg.token;
				if (msg.params.q && msg.params.q.length) {
					q.query(msg.params.q).then(function(ids) {
						db.get_multi(user_id, ids, function(e, resp) {
							resp_msg.status = 'ok';
							resp_msg.data = q.sortBy(resp, 'created_at', 'date_desc');
							return socket.emit('search', resp_msg);
						});
					}, function(e) {
						resp_msg.status = 'error';	
						resp_msg.data = 'Search failed - ' + e;
						return socket.emit('search', resp_msg);
					});
/*					q.query(msg.params.q, function(e, ids) {
						if (!e) {
							db.get_multi(user_id, ids, function(e, resp) {
								if (!e) {
									resp_msg.status = 'ok';
									resp_msg.data = q.sortBy(resp, 'created_at', 'date_desc');
									//resp_msg.data = resp;
								} else {
									resp_msg.status = 'error';	
									resp_msg.data = 'Search failed - ' + e;
								}
								return socket.emit('search', resp_msg);
							});
						}
					});
*/					
				}
			}
		}
	}
}

/*
*  Helper functions
*/


/*
* gets favorites from twitter api
* @req: session object
* @params: parameters to pass to the api call
* @cb: callback - return json object of favorites array from twitter or error
*/
function getFromApi(req, params, cb) {
	var sess = req.session || req;
	var name = sess.access_token.screen_name;
	var u = config.twitter.base_url + '/favorites/list.json?';
	var x = {
		user_id: sess.user.id_str,
		include_entities: true
	};

	if (typeof params === 'function') {
		cb = params;
		params = { count: 20 };
	}
	
	util._extend(x, params);
	u += qs.stringify(x);
	r.get({url: u, oauth: sess.oauth, json: true}, function(err, resp, body) {
		if (!err && resp.statusCode === 200) {
			return cb(null, body);
		} else {
			if (err) return cb(err);
			else if (err instanceof Error) return cb(new Error(err));
			else return cb(new Error(body.errors[0].message));
		}
	});
}

/*
*  Remove a favorite given it's id
*  @user_id: user id
*  @id: favorite id from Twitter
*/
function removeFavorites(user_id, oauth, id, cb) {
	var u;

	if (typeof id === 'fuction') {
		cd = id;
		return cb(new Error('missing id'));
	}
	if (user_id) {
		u = config.twitter.base_url + '/favorites/destroy.json';
		r.post({url: u, oauth: oauth, body: 'id='+id, json: true}, function(err, resp, body) {
			if (!err && resp.statusCode === 200) {
				db.del(user_id, id, function(e) {
					return cb(e, body);
				});
			} else {
				if (err) return cb(err);
				else if (err instanceof Error) return cb(new Error(err));
				else return cb(new Error(body.errors[0].message));
			}
		});
	}
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
				maxwidth: item.maxwidth//435,
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
		} else {
			if (err) return cb(err);
			else if (err instanceof Error) return cb(new Error(err));
			else return cb(new Error(body.errors[0].message));
		}
	});
}

function render(list, cb) {
  process.nextTick(function() {
    if (list.length > 0) {
      if (list[0].id) {
        var newlist = list.map(function(v, i) {
          //var t = v.text.slice(0, v.entities.urls[0].indices[0]);
          return {
            text: v.text,
            entities: v.entities,
            user : {
              id: v.user.id_str,
              pic: v.user.profile_image_url,
              screen_name: v.user.screen_name,
              name: v.user.name
            },
            retweet_count: v.retweet_count,
            created_at: v.created_at,
            id_str: v.id_str
          }
        });
        return cb(null, newlist);
      } else {
        return cb(null, list);
      }
    } else return cb(null, []);
  });
}

/*
* index important text elemnts into a search index for the particular user
* @ary: array of favorite object directly from twitter api
* @user_id: user id of the logged in user
*/
function redsindex(ary, user_id) {
	var s = new search(user_id, {load: false});
	ary.forEach(function(item, i) {
		s.index(item.text, item.id_str);
		s.index(item.user.name, item.id_str);
		s.index(item.user.screen_name, item.id_str);
/*		if (item.user.place) {
			s.index(item.user.place.full_name, item.id_str);
			s.index(item.user.place.country, item.id_str);
		}
*/
		if (item.entities.urls.length) {
			item.entities.urls.forEach(function(u) {
				s.index(u.expanded_url, item.id_str);
			});
		}
		if (item.entities.hashtags.length) {
			item.entities.hashtags.forEach(function(h) {
				s.index(h.text, item.id_str);
			});
		}
		if (item.entities.user_mentions.length) {
			item.entities.user_mentions.forEach(function(m) {
				s.index(m.name, item.id_str);
				s.index(m.screen_name, item.id_str);
			});
		}
	});
}
