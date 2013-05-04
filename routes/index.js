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
		, Q = require('q')
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
			Q.nfcall(r.post, {url: u, oauth: oauth})
			.then(function(resp) {
				/* get user details after auth completes */
				return postAuthHandler(resp[0].statusCode, resp[0].body);
			})
			.then(function(resp) {
				if (resp[0].statusCode === 200) {
					req.session.user = resp[0].body;
					return checkFavorites();
				} else {
					throw new Error('Failed to get user details from Twitter');
				}
			})
			.then(function(favlist, saved) {
				console.log('CHECK: ', favlist, saved)
				if (!queries['_'+req.session.user.id_str]) queries['_'+req.session.user.id_str] = new search(req.session.user.id_str);
				/* index important values from favorite object */
				
				/*** TODO: move to a worker thread ***/
				Q.fcall(redsindex, favlist, req.session.user.id_str, queries['_'+req.session.user.id_str]); //verify if this is blocking and should be done async
				
				/* format favorite object to pull out only relevant info to send client */
				Q.fcall(render, favlist)
				.then(function(newlist) {
					if (!saved) {
						db.set(req.session.user.id_str, newlist);
					}
					res.redirect('/');
				});
			})
			.fail(function(err) {
				console.log(err);
				res.json(err);
			})
			.done();
		}

		/* auth token response */
		function postAuthHandler(statusCode, body) {
			if (statusCode === 200) {
				req.session.access_token = qs.parse(body);
				req.session.oauth = {
					consumer_key: config.twitter.consumer_key,
					consumer_secret: config.twitter.consumer_secret,
					token: req.session.access_token.oauth_token,
					token_secret: req.session.access_token.oauth_token_secret
				};

				/* save session object to cache */
				var u = config.twitter.base_url + '/users/show.json?',
						params = {
							screen_name: req.session.access_token.screen_name,
							user_id: req.session.access_token.user_id
						};
				u += qs.stringify(params);
				/* get logged in user information and update session object in cache */
				return Q.nfcall(r.get, {url: u, oauth: req.session.oauth, json: true});
			} else {
				throw new Error(body);
			}
		}

		/* check if new favorites are available since last login */
		function checkFavorites() {
			var params = {}
			  , user_id = req.session.user.id_str
			  , def = Q.defer();

			db.get(user_id)
			.then(function(current_favs) {
				if (current_favs.length) {
					getFromApi(req.session)
					.then(function(api_favs) {
						if (api_favs.length) {
							if (current_favs[0].id_str === api_favs[0].id_str) {
								console.log('ids match, return from db')
								def.resolve(current_favs, true);
							} else {
								console.log('ids didnt match, save from api')
								jobs.create('download all favorites', {
									session: req.session,
									user_id: user_id,
									total_count: req.session.user.favourites_count,
									start_id: current_favs[0].id_str,
									end_id: api_favs[0].id_str
								}).save();
								def.resolve(api_favs, false);
							}
						} else if (api_favs.length === 0) {
							console.log('nothing returned by api, returning favs from db')
							def.resolve(current_favs, true);
						}
					})
					.fail(function() {
						console.log('failed to get from api, returning favs from db')
						def.resolve(current_favs, true);
					});
				} else {
					getFromApi(req.session)
					.then(function(api_favs) {
						console.log('nothing found, saving from api and loading the rest')
						if (api_favs.length) {
							jobs.create('download all favorites', {
								session: req.session,
								user_id: user_id,
								start_id: api_favs[api_favs.length-1].id_str,
								total_count: req.session.user.favourites_count - api_favs.length
							}).save();
							def.resolve(api_favs, false);
						}
					})
					.fail(function() {
						def.resolve([], true);
					});
				}
			})
			.fail(function(e) {
				console.log('FAILED: ', e)
				def.resolve([], true);
			});

			return def.promise;
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
		//if (req.session && req.session.user) cache[req.session.user.id_str] = null;
		req.session = null;
		res.render('home', {user: ''});
	},

	/* GET /favorite/12121?&end='343434' */
	get_favorite: function(req, res, next) {
		var user_id = req.session.user.id_str
			, resp_msg
			, q = req.query || {};

		if (req.params.id) {
			q.start_id = req.params.id;
			db.get_by_id(user_id, q)
			.then(function(resp) {
				resp_msg = resp.filter(function(i) {
					if (i.id_str !== q.start || i.id_str !== q.end) return true;
				});
				res.json(resp_msg);
			})
			.fail(function(err) {
				console.log('Failed to get favorites: ' +err.message);
				res.json([]);
			});
		} else {
			db.get(user_id, q)
			.then(function(resp) {
				res.json(resp)
			})
			.fail(function(err) {
				res.json([]);
			});
		}
	},

	/* GET /embed/1212&url='http://....'&maxwidth='200' */
	get_embed: function(req, res, next) {
		getEmbededMedia(req.query)
		.then(function(resp) {
			var a = new Array(resp);
			res.json(a);
		})
		.fail(function(err) {
			res.json([]);
		});
	},

	/* DELETE /favorite/1212 */
	remove_favorite: function(req, res, next) {
		removeFavorite(req.session.user.id_str, req.session.oauth, req.params.id)
		.then(function(resp) {
			res.json(true);
		})
		.fail(function(err) {
			res.json(false);
		});
	},

	/* GET /search?q='query string' */
	search: function(req, res, next) {
		var s, resp_msg;
		var user_id = req.session.user.id_str;

		if (queries['_'+user_id]) s = queries['_'+user_id];
		else res.json([]);

		if ('q' in req.query) {
			s.query(req.query.q)
			.then(function(ids) {
				db.get_multi(user_id, ids)
				.then(function(resp) {
					resp_msg = s.sortBy(resp, 'created_at', 'date_desc');
					res.json(resp_msg);
				})
				.fail(function(err) {
					res.json([]);
				})
			})
			.fail(function(err) {
				res.json(err);
			});
		}
		else res.json([]);
	}

};


/*
*  Helper functions
*/


/*
* gets favorites from twitter api
* @req: session object
* @params: parameters to pass to the api call
* @cb: callback - return json object of favorites array from twitter or error
*/
function getFromApi(req, params) {
	var sess = req.session || req
	  , deferred = Q.defer()
	  , name = sess.access_token.screen_name
	  , u = config.twitter.base_url + '/favorites/list.json?'
	  , x = {
		user_id: sess.user.id_str,
		include_entities: true
	};

	if (!params || !params.count) {
		params = { count: 20 };
	}
	
	util._extend(x, params);
	u += qs.stringify(x);
	//r.get({url: u, oauth: sess.oauth, json: true}, function(err, resp, body) {
	Q.nfcall(r.get, {url: u, oauth: sess.oauth, json: true})
	.then(function(resp) {
		if (resp[0].statusCode === 200) deferred.resolve(resp[0].body);
	})
	.fail(function(err) {
		if (err) deferred.reject(err);
		else if (err instanceof Error) deferred.reject(new Error(err));
		else deferred.reject(new Error(body.errors[0].message));
	});

	return deferred.promise;
}

/*
*  Remove a favorite given it's id
*  @user_id: user id
*  @id: favorite id from Twitter
*/
/* TODO: handle several ids to delete */
function removeFavorites(user_id, oauth, id) {
	var u
	  , def = Q.defer();

	u = config.twitter.base_url + '/favorites/destroy.json';
	Q.nfcall(r.post, {url: u, oauth: oauth, body: 'id='+id, json: true})
	.then(function(resp) {
		if (resp[0].statusCode === 200) {
			var i = new Array(id);
			db.del(user_id, i)
			.then(function() {
				return def.resolve();
			})
			.fail(function(err) {
				return def.reject(err);
			});
		}
	})
	.fail(function(err) {
		return def.reject(err);
	});

	return def.promise;
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
	var oembed
	  , def = Q.defer()
	  , u = ''
	  , host = url.parse(item.url).host
	  ,	o = {
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
	else return def.resolve({});
	
	Q.nfcall(r.get, {url: u, json: true})
	.then(function(resp) {
		if (resp[0].statusCode === 200) return def.resolve(resp[0].body);
		else return def.resolve([]);
	})
	.fail(function(err) {
		return (err instanceof Error) ? def.reject(err) : def.reject(new Error(err));
	});

	return def.promise;
}

function render(list) {
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
        return newlist;
      } else {
        return list;
      }
    } else return [];
}

/*
* index important text elemnts into a search index for the particular user
* @ary: array of favorite object directly from twitter api
* @user_id: user id of the logged in user
* @s: search instance
*/
function redsindex(ary, user_id, s) {
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
