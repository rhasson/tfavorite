var n = require('natural');

/*
* constructor for Search class
* @opts: object of options currently only supports boost and distance algoritm function
*/
function Search(opts) {
	this._index = [];
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
Search.prototype.index = function(str, id) {
	var t = false;
	id = id.toString();

	str = str.replace(/[/\/()\!\^\&\*\.\:]/ig,'').toLowerCase();
	t = this._index.some(function(v) { return v.id.indexOf(id) !== -1 });
	if (!t) this._index.push({str: str, id: id});
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

	ary = self._index.filter(function(v) {
		def = (q.length / v.str.length) * self._boost;
		coef = self._distance(v.str, q)
		return  coef >= def;
	});
	ary = ary.map(function(v) {
		return v.id;
	});

	return ary;
}

module.exports = Search;