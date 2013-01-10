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
* @obj: either a string represneting user id, or an object containing user_id and other parameters
* return: json object with the requested items
*/
DB.prototype.get = function(obj, cb) {
	var args,
		user_id,
		self = this;

	if (typeof obj === 'string') {
		user_id = obj;
		obj = { count: 20 };
	} else {
		user_id = obj.user_id;
		obj.count = obj.count || 20;
	}

	args = [
		'favorites:'+user_id,
		'0',
		obj.count.toString()];

	rclient.zrevrange(args, function(e, items) {
		var x, ary;
		if (!e && items.length) {
			ary = '[' + items.toString() + ']';
			_cb(null, ary, cb);
		} else if (items.length === 0) {
			self._db.view('favorites/by_user_id', {key: user_id}, function(err, resp) {
				items = resp
				_cb(null, resp, cb);
			});
		} else {
			_cb(err, [], cb);
		}
	});
}

DB.prototype.set = function(user_id, favs, cb) {
	var self = this;

	if (user_id) {
		async.forEach(favs, _save_redis, function(err) {
			if (err) return cb(err, null);
			else async.forEach(favs, _save_couch, function(err2) {
				return cb(err2, null);
			});
		});	
	}

	function _save_redis(item, acb) {
		var args = [
		  'favorites:'+user_id,
			item.id_str,
			JSON.stringify(item)];
		rclient.zadd(args, function (e, v) {
			if (e) console.t.log('Error with saving favorites to redis, ZADD: ', e);
			return acb(e);
		});
	}

	function _save_couch(item, acb) {
		self._db.save(item, function(e, doc) {
			if (e) console.t.log('Error saving favorites to couch: ', e);
			return acb(e);
		});
	}
}

DB.prototype.count = function(user_id, cb) {
	this._db.view('favorites/count', {key: user_id}, function(err, resp) {
		_cb(err, resp, cb);
	});
}

module.exports = exports = new DB();

function _cb(err, data, cb) {
	var error = null, ary = [];
	if (!err) {
		try { var d = JSON.parse(data); }
		catch (e) { 
			return cb(new Error(e));
		}
		if (!('error' in d)) {
			if (!('value' in d[0]))	return cb(null, d);
			else {
				d.forEach(function(v,i) {
					delete v.value._id;
					delete v.value._rev;
					ary.push(v.value);
				});
				return cb(null, ary);
			}
		}
		else return cb(new Error(d.error + " : " + d.reason));
	} else {
		return cb(new Error(err));
	}
}