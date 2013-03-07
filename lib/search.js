var n = require('natural'),
		db = require('redis').createClient();

/*
* constructor for Search class
* @name: name for the index, typically will use the user_id value
* @opts: object of options
*		- boost: a value to smooth out the coefficient returned by the string distance check
*		- distance: distance algorithm supported by Natural (dice, jaro, levenshtein)
*		- load: yes|no - whether to load index into memory or not (useful for indexing only)
*/
function Search(name, opts) {
	var self = this;
	this._index = [];
	this._indexname = 'searchindex:' + name;
	this._distance = n.DiceCoefficient;
	this._boost = 1.5;
	this._load = true;
	this._iqueue = [];

	if (opts) {
		this._load = (opts.load === undefined || opts.load === null) ? true : opts.load;
		this._boost = opts.boost ? opts.boost : 1.0;
		if (opts.distance) {
			switch(opts.distance) {
				case 'dice':
					this._distance = n.DiceCoefficient;
					this._boost = 1.5;
					break;
				case 'jaro':
					this._distance = n.JaroWinklerDistance;
					this._boost = 1.0;
					break;
				case 'levenshtein':
					this._distance = n.LevenshteinDistance;
					this._boost = 1.0;
					break;
			}
		}
	}

	if (this._load) {
		db.hgetall(this._indexname, function(e, resp) {
			if (!e && resp) {
				Object.keys(resp).forEach(function(v) {
					self._index.push({id: v, str: resp[v]});
				});
			}
		});
	}
}

/*
* Index new elements into the index array
* @str: data string to be parsed and indexed
* @id: id associated with the data.  ids will be coorced to strings
*/
Search.prototype.index = function(str, id, cb) {
	var t = false, self = this;
	id = id.toString();

	str = str.replace(/[/\/()\!\^\&\*\.\:]/ig,'').toLowerCase();

	db.hsetnx(self._indexname, id, str, function(e, resp) {
		if (e && cb) return cb(new Error(e));
		if (!e && cb) {
			if (resp > 0) self._index.push({id: id, str: str});
			return cb(null, resp);
		}
	});

	//t = this._index.some(function(v) { return v.id.indexOf(id) !== -1 });
	//if (!t) this._index.push({str: str, id: id});
}

/*
* Remove an element from the index array
* @id: string representation of the element id
*/
Search.prototype.remove = function(id, cb) {
	var self = this;
	id = id.toString();

	db.hdel(this._indexname, id, function(e, resp) {
		if (e && cb) return cb(new Error(e));
		if (!e && cb) {
			if (resp > 0) {
				self._index.some(function(v, i, a) {
					if (v.id === id) {
						a.splice(i, 1);
						return true;
					}
				});
			}
			return cb(null, resp);
		}
	});
}

/*
* Query the index with the specific query string
* @q: query string
* returns: array of ids associated with the matched items
*/
Search.prototype.query = function(q, cb) {
	var q, ary, self = this;
	//q = q.split(/\s/).join('').toLowerCase();
	q = q.replace(/[/\/()\!\^\&\*\.\:]/ig,'').toLowerCase();

	db.hlen(self._indexname, function(e, len) {
		if (!e) {
			if (self._index.length < len) {
				self.update(function() {
					ary = calc(self, q);
					return cb(null, ary);
				});
			} else {
				ary = calc(self, q);
				return cb(null, ary);
			}
		} else return cb(new Error(e));
	});

	function calc (self, q) {
		var arr = [], coef, def;

		arr = self._index.filter(function(v) {
			def = (q.length / v.str.length) * self._boost;
			coef = self._distance(v.str, q)
			return  coef >= def;
		});
		arr = arr.map(function(v) {
			return v.id;
		});

		return arr;
	}
}

Search.prototype.update = function(cb) {
	var self = this;
	db.hgetall(self._indexname, function(e, resp) {
		if (!e && resp) {
			self._index = [];
			Object.keys(resp).forEach(function(v) {
				self._index.push({id: v, str: resp[v]});
			});
		}
		return cb();
	});
}


module.exports = Search;