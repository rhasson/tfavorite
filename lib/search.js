var n = require('natural'),
		db = require('redis').createClient();

/*
* constructor for Search class
* @name: name for the index, typically will use the user_id value
* @opts: object of options
*		- boost: a value to smooth out the coefficient returned by the string distance check
*		- distance: distance algorithm supported by Natural (dice, jaro, levenshtein)
*/
function Search(name, opts) {
	this._index = [];
	this._indexname = 'searchindex:' + name;
	this._distance = n.DiceCoefficient;
	this._boost = 1.5;

	if (opts) {
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
}

/*
* Index new elements into the index array
* @str: data string to be parsed and indexed
* @id: id associated with the data.  ids will be coorced to strings
*/
Search.prototype.index = function(str, id, cb) {
	var t = false;
	id = id.toString();

	str = str.replace(/[/\/()\!\^\&\*\.\:]/ig,'').toLowerCase();
	db.hsetnx(this._indexname, id, str, function(e, resp) {
		if (e && cb) return cb(new Error(e)); 
		if (!e && cb) return cb(null, resp);
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
		if (!e && cb) return cb(null, resp);
	});

	/*self._index.some(function(v, i, a) {
		if (v.id === id) {
			a.splice(i, 1);
			return true;
		}
	});
	*/
}

/*
* Query the index with the specific query string
* @q: query string
* returns: array of ids associated with the matched items
*/
Search.prototype.query = function(q) {
	var ary, coef, def, self = this;
	//q = q.split(/\s/).join('').toLowerCase();
	q = q.replace(/[/\/()\!\^\&\*\.\:]/ig,'').toLowerCase();


	/*
	ary = self._index.filter(function(v) {
		def = (q.length / v.str.length) * self._boost;
		coef = self._distance(v.str, q)
		return  coef >= def;
	});
	ary = ary.map(function(v) {
		return v.id;
	});

	return ary;
	*/
}

module.exports = Search;