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
*  - offset: starting index of where to start grabbing elements
*  - sort: sort direction, can be "desc" since by default the sort if "asc"
* return: json object with the requested items
*/
DB.prototype.get = function(user_id, params, cb) {
	var args = [],
		ary,
		self = this;
	args.push('favindex:'+user_id);

	if (typeof params === 'function') {
		cb = params;
		params = { count: 20 };
	} else {
		params.count = params.count || 20;
	}

	args.push('get');
	args.push('favorites:*');
	args.push('limit');
	params.offset ? args.push(params.offset) : args.push(0);
	if (params.count) args.push(params.count);
	if (params.sort) args.push(params.sort);

	rclient.sort(args, function(err, resp) {
		console.log('sort: ', err, resp.length);
		if (!err && resp.length) {
			ary = '[' + resp.toString() + ']';
			_cb(null, ary, cb);
		} else if (resp.length === 0) {
			self._db.view('favorites/by_user_id', {key: user_id, limit: params.count}, function(err2, doc) {
				_cb(err, doc, function(e, list) {
					_save_redis(user_id, list, function(er) {
						if (er) _cb(er, [], cb);
						else return cb(e, list);
					});
				});
			});
		} else {
			_cb(err, [], cb);
		}
	});
}

/*
* Save favorites to redis and couch
* @user_id: the user id for which to save
* @favs: an array of objects
*/
DB.prototype.set = function(user_id, favs, cb) {
	var self = this;

	if (user_id && typeof user_id === 'string') {
		_save_redis(user_id, favs, function(e) {
			if (!e) _save_couch(self._db, user_id, favs, cb);
		});
	}
}

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
		multi.sadd('favindex:'+user_id, v.id_str);
		//add favorite to redis
		multi.set('favorites:'+v.id_str, JSON.stringify(v));
	});
	multi.exec(function(err, resp) {
		if (!err) {
			return acb(null);
			console.t.log('redis save response: ',resp);
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
