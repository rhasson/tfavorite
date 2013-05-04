/*
* DB abstraction for the storing and loading favorites
* v.0.0.2
*/

var cradle = require('cradle')
	, redis = require('redis')
	, rclient = redis.createClient()
	, msgpack = require('msgpack')
	, Q = require('q')
	, config = require('../config.js').config;

function DB () {
	cradle.setup({
        host: process.env.NODE_ENV === 'production' ? config.db.host : 'http://127.0.0.1',
        port: process.env.NODE_ENV === 'production' ? config.db.port : 5984,
        auth: process.env.NODE_ENV === 'production' ? config.db.auth : '',
        cache: false,
        raw: false
	});
	this._cradle = new(cradle.Connection);
	this._db = this._cradle.database('favious');
}

module.exports = new DB();
/*
* Gets records for a specific user id
* @user_id: user id
* @params: an object containing additional parameters
*  - count: how many items to get
*  - offset: starting index of where to start grabbing elements.
*  - sort: sort direction, can be "desc" or "asc"
* return: json object with the requested items
*/
DB.prototype.get = function(user_id, params) {
	var def = Q.defer()
		, couch_obj
		, view = 'favorites/by_date'
		, self = this
		, _db_view = self._db.view;

	params = params || {};
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

	Q.ninvoke(self._db, 'view', view, couch_obj)
	.then(function(resp) {
		var ary = resp.map(function(v) {
			return v;
		});
		if (ary.length) _cache(user_id, ary);
		def.resolve(ary)
	})
	.fail(function(err) {
		def.reject(new Error(err));
	});

	return def.promise;
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
DB.prototype.get_by_id = function(user_id, params) {
	var self = this
		, couch_obj = {}
		, def = Q.defer()
		, view = 'favorites/by_user_id';

	params = params || {};
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

	Q.ninvoke(self._db, 'view', view, couch_obj)
	.then(function(resp){
		var ary = resp.map(function(v) {
			return v;
		});
		return def.resolve(ary);
	})
	.fail(function(err) {
		return def.reject(new Error(err));
	});

	return def.promise;
}

/*
* Get multiple tweets based on an array of ids
* @user_id: the user id to which to get tweets
* @ids: array of ids to get
*/
DB.prototype.get_multi = function(user_id, ids) {
	var self = this
		, def = Q.defer()
		, ary = [];

	_get(user_id, ids)
	.then(function(items) {
		Q.ninvoke(self._db, 'get', items)
		.then(function(docs) {
			ary = docs.map(function(v) {
				return v;
			});
			return def.resolve(ary);
		})
		.fail(function(err) {
			return def.reject(new Error(err));	
		});
	})
	.fail(function(err) {
		return def.reject(new Error(err));
	});

	return def.promise;
}

/*
* Save favorites to redis and couch
* @user_id: the user id for which to save
* @favs: an array of objects
*/
DB.prototype.set = function(user_id, favs) {
	var self = this
	  , items = []
	  , def = Q.defer();

	items = favs.map(function(v) {
		v.user_id = user_id;
		return v;
	});

	Q.ninvoke(self._db, 'save', items)
	.then(function(ids) {
		for (var i=0; i < ids.length; i++) {
			if (ids[i].ok === true) {
				items[0]._id = ids[i].id;
				items[0]._rev = ids[i].rev;
			}
		}
		_cache(user_id, items);
		def.resolve(items);
	})
	.fail(function(err) {
		def.reject(new Error(err));
	});

	return def.promise;
}

/*
* deletes a favorite from db
* @user_id: user id to search
* @fav_id: the tweet id of the favorite tweet to delete
*/
DB.prototype.del = function(user_id, ids) {
	var self = this
	  , def = Q.defer();		

	self.get_multi(user_id, ids)
	.then(function(docs) {
		docs.forEach(function(v) {
			Q.ninvoke(self._db, 'remove', v._id, v._rev)
			.then(function() {
				//multi.del('favorites:'+d.id_str);
				rclient.zrem('favindex:'+user_id, v.id_str+':'+v._id);
			})
			.fail(function(err) {
				return def.reject(new Error(err));
			});
		});
		return def.resolve()
	})
	.fail(function(err) {
		return def.reject(new Error(err));
	});

	return def.promise;
}

/*
* returns the total number of favorites in couchdb
* @user_id: the user id to count
*/
DB.prototype.count = function(user_id) {
	var def = Q.defer();

	Q.ninvoke(this._db, 'view', 'favorites/count', {key: user_id})
	.then(function(resp) {
		var count = resp.length ? resp[0].value : 0;
		return def.resolve(count);
	})
	.fail(function(err) {
		return def.reject(new Error(err));
	});

	return def.promise;
}

/*
* caches twit id and associated couchdb id
* @user_id: user id to concentrate the search
* @items: array of tweets with couchdb ids
* returns: promise.  Resolved with response from redis, rejected with error object
*/
_cache = function(user_id, items) {
	var multi = rclient.multi()
		, def = Q.defer();

	items.forEach(function(v) {
		//add favorite id to user's index
		multi.zadd('favindex:'+user_id, 0, v.id_str+':'+v._id);
		//add favorite to redis
		//multi.setnx('favorites:'+v.id_str, msgpack.pack(v));
	});
	multi.exec(function(err, resp) {
		if (!err) return def.resolve(resp);
		else return def.reject(new Error(err));
	});

	return def.promise;
}

/*
* Gets couchdb ids from index sitting on redis
* @user_id: user id to concentrate the search
* @ids: array of tweet ids or couchdb id
* returns: promise.  Resolved with array of couchdb ids, rejected with error object
*/
_get = function(user_id, ids) {
	var multi = rclient.multi()
		, def = Q.defer();

	rclient.zrange(['favindex:' + user_id, '0', '-1'], function(err, list) {
		var ary = [];

		if (err) return def.reject(new Error(err));
		
		// TODO: optimize so you don't need to search entire list of only a few ids were provided
		list.forEach(function(i) {
			i = i.split(':');
			if (ids.indexOf(i[0]) >= 0 || ids.indexOf(i[1]) >= 0) ary.push(i[1]);
		});

		return def.resolve(ary);
	});

	return def.promise;
}