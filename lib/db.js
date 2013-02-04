/*
* DB abstraction for the storing and loading favorites
* v.0.0.1
*/

var cradle = require('cradle'),
	redis = require('redis'),
	async = require('async'),
	rclient = redis.createClient(),
	config = require('../config.js').config.db;

require('console-trace');

function DB () {
	cradle.setup({
        host: 'http://127.0.0.1', //config.host,
        port: 5984, //config.port,
        //auth: config.auth,
        cache: false,
        raw: false
	});
	this._cradle = new(cradle.Connection);
	this._db = this._cradle.database('favious');
}

/*
* Gets records for a specific user id
* @user_id: user id
* @params: an object containing additional parameters
*  - count: how many items to get
*  - offset: starting index of where to start grabbing elements.
*  - sort: sort direction, can be "desc" or "asc"
* return: json object with the requested items
*/
DB.prototype.get = function(user_id, params, cb) {
	var args = [],
		ary,
		couch_obj,
		view = 'favorites/by_date',
		self = this;

	args.push('favindex:'+user_id);

	if (typeof params === 'function') {
		cb = params;
		params = {};
	}

	params.sort = params.sort || 'desc';

	if (params.sort === 'desc') {
		couch_obj = {
			startkey: [user_id, {}],
			endkey: [user_id],
			descending: true,
		}
	} else if (params.sort === 'asc') {
		couch_obj = {
			startkey: [user_id],
			endkey: [user_id, {}],
			descending: false,
		}
	}

	if (params.count) couch_obj.limit = params.count;

	args.push('get');
	args.push('favorites:*');
	if (params.count) {
		args.push('limit');
		params.offset ? args.push(params.offset) : args.push(0);
		args.push(params.count);
	}
	if (params.sort === 'desc') args.push(params.sort);

	rclient.sort(args, function(err, resp) {
		var obj = {};
		console.log('sort: ', err, resp.length);
		if (!err && resp.length) {
			ary = '[' + resp.toString() + ']';
			_cb(null, ary, cb);
		} else if (resp.length === 0) {
			self._db.view(view, couch_obj, function(err2, doc) {
				_cb(err, doc, function(e, list) {
					if (list.length > 0) {
						_save_redis(user_id, list, function(er) {
							if (er) _cb(er, [], cb);
							else return cb(null, list);
						});
					} else return cb(e, []);
				});
			});
		} else {
			_cb(err, [], cb);
		}
	});
}

/*
* Gets records by their id
* @user_id: user id to get tweets for
* @params:
*  - start_id: id to start from
*  - end_id: the last id to get up to
*  - count: total number of records to get if end_id is not present
*  - sort: sort direction.  desc or asc
*/
DB.prototype.get_by_id = function(user_id, params, cb) {
	var self = this,
		couch_obj = {},
		view = 'favorites/by_user_id';

	params.sort = params.sort || 'desc';

	if (params.start_id && params.end_id) {
		couch_obj.startkey = [user_id, params.start_id];
		couch_obj.endkey = [user_id, params.end_id];
	} else if (params.start_id) {
		couch_obj.startkey = [user_id, params.start_id];
		if (params.sort === 'desc') {
			couch_obj.descending = true;
			couch_obj.endkey = [user_id]
		} else if (params.sort === 'asc') {
			couch_obj.descending = false;
			couch_obj.endkey = [user_id, {}];
		}
	} else if (params.end_id) {
		couch_obj.endkey = [user_id, params.end_id];
		if (params.sort === 'desc') {
			couch_obj.descending = true;
			couch_obj.startkey = [user_id, {}];
		} else if (params.sort === 'asc') {
			couch_obj.descending = false;
			couch_obj.startkey = [user_id];
		}
	}
	if (params.count) couch_obj.limit = params.count;

	self._db.view(view, couch_obj, function(err, doc) {
		_cb(err, doc, function(e, list) {
			if (list.length > 0) {
				_save_redis(user_id, list, function(err2) {
					if (err2) _cb(err2, [], cb);
					else return cb(null, list);
				});
			} else return cb(e, []);
		});
	});
}

/*
* Save favorites to redis and couch
* @user_id: the user id for which to save
* @favs: an array of objects
*/
DB.prototype.set = function(user_id, favs, cb) {
	var self = this,
		items = [],
		map = [],
		count = favs.length;

	if (user_id && typeof user_id === 'string') {
		_save_redis(user_id, favs, function(e, m) {
			if (!e) {
				map = m.filter(function(v, i) { return i % 2 == 0; });
				items = favs.filter(function(v, i) { return map[i];	});
				_save_couch(self._db, user_id, items, cb);
			}
		});
	}
}

/*
* deletes a favorite from db
* @user_id: user id to search
* @fav_id: the id of the favorite tweet to delete
*/
DB.prototype.del = function(user_id, fav_id, cb) {
	var self = this;
	var multi = rclient.multi();
	var couch_obj = {
			startkey: [user_id, fav_id],
			endkey: [user_id, fav_id]
		};

	self._db.view('favorites/by_user_id', couch_obj, function(err, doc) {
		var d;

		if (!err) {
			d = JSON.parse(doc);

			if (d.length > 0) {
				d = d[0].value;
				self._db.remove(d._id, d._rev, function(e, resp) {
					if (!e) {
						console.log(e, resp);
						multi.del('favorites:'+d.id_str);
						multi.zrem('favindex:'+user_id, d.id_str);
						multi.exec(function(e2, resp2) {
							console.log('redis: ', e2, resp2)
							if (!e2) return cb(null, true);
							else return cb(e2);
						});
					}
				});
			} else return cb(null, false);
		} else return cb(err);
	});
}

/*
* returns the total number of favorites in couchdb
* @user_id: the user id to count
*/
DB.prototype.count = function(user_id, cb) {
	this._db.view('favorites/count', {key: user_id}, function(err, resp) {
		var count = resp.length ? resp[0].value.length : 0;
		return cb(err, count);
	});
}

module.exports = exports = new DB();

function _cb(err, data, cb) {
	var error = null, ary = [];
	if (!err && data.length) {
		try { var d = JSON.parse(data); }
		catch (e) { 
			return cb(new Error(e));
		}
		if (d && !('error' in d)) {
			if (!('value' in d[0]))	return cb(null, d);
			else {
				d.forEach(function(v,i) {
					delete v.value._id;
					delete v.value._rev;
					ary.push(v.value);
				});
				return cb(null, ary);
			}
		} else if (d === null || d === undefined) { 
			return cb(null, []);
		} else if ('error' in d) {
			return cb(new Error(d.error + " : " + d.reason));
		}
	} else if (data.length === 0) {
		return cb (null, []);
	} else {
		return cb(new Error(err));
	}
}

function _save_redis(user_id, items, acb) {
	console.t.log('saving to redis');
	var multi = rclient.multi();
	items.forEach(function(v, i) {
		//add favorite id to user's index
		multi.zadd('favindex:'+user_id, 0, v.id_str);
		//add favorite to redis
		multi.setnx('favorites:'+v.id_str, JSON.stringify(v));
	});
	multi.exec(function(err, resp) {
		if (!err) {
			return acb(null, resp);
		} else return acb(err);
	});
}

function _save_couch(db, user_id, items, acb) {
console.t.log('saving to couch');
	items.map(function(v) {
		v.user_id = user_id;
		return v;
	});
	db.save(items, function(e, doc) {
		if (e) console.t.log('Error saving favorites to couch: ', e);
		if (acb) return acb(e);
		else return;
	});
}
