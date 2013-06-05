var n = require('natural')
	, db = require('redis').createClient()
	, tokenize = require('./tokenizer')
	, qparser = require('./queryParser')
	, Q = require('q');

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
		this.update();
	}
}

/*
* Index new elements into the index array
* @fn: callback function to allow adding text into the index
* returns: callback with the current object instance and 
*   done function that must be called after all text as been added
*
* For example:
* s.index(function(idx, done) {
*   idx.add('some text', '111');
*   done();	
* });
*
*/
Search.prototype.index = function(fn) {
	var self = this;
			
	self._multi = db.multi();

	return fn(self, function(err) {
		if (self._multi) {
			self._multi.exec(function(err, resp) {
				if (err) console.log('index multi error: ', err);
				self._multi = null;
				self.update();
			});
		}
	});
}

/*
* add text into the index
* @str: data string to be parsed and indexed
* @id: id associated with the data.  ids will be coorced to strings
* ** NOT TO BE USED BY ITSELF **
*/
Search.prototype.add = function(str, id) {
	var t = false, self = this;
	var words = tokenize(str);
	str = id + ':' + words.join('|');

	self._multi.zadd(self._indexname, 0, str);

	return self;
}

/*
* Remove an element from the index array
* @id: string representation of the element id
*/
Search.prototype.remove = function(id, cb) {
	var self = this;
	id = id.toString();

/** TODO: fix this - cannot use score **/
	db.zremrangebyscore([this._indexname, id, id], function(e, resp) {
		if (e && cb) return cb(new Error(e));
		if (!e) {
			if (resp > 0) {
				self._index.some(function(v, i, a) {
					if (v.id === id) {
						a.splice(i, 1);
						return true;
					}
				});
			}
			return cb ? cb(null, resp) : true;
		}
	});
}

/*
* Query the index with the specific query string
* @q: query string
* returns: array of ids associated with the matched items
*/
Search.prototype.query = function(q) {
	var ary, self = this;
	var def = Q.defer();

	q = qparser.parse(q);

	Q.fcall(calculate, self, q)
	.then(function(resp) {
		return def.resolve(resp);
	})
	.fail(function(err) {
		return def.reject(new Error(err));
	});

	return def.promise;
}

/*
* update in memory index from redis index
* returns: nonthing, just updates the internal _index variable
*/
Search.prototype.update = function() {
	var self = this;
	var def = Q.defer();

	self._index = null;
	db.zcard(self._indexname, function(e, len) {
		if (!e && len) {
			db.zrevrange([self._indexname, '0', '-1'], function(e2, resp) {
				var x, id, words;
				if (!e2 && resp) {
					self._index = new Array(resp.length);
					for(var i=0; i < resp.length; i++) {
						x = resp[i].split(':');
						id = x[0];
						words = x[1].split('|');
						self._index[i] = {id: id, str: words};
					};
					return def.resolve();
				} else return def.reject(new Error(e2));
			});
		}
	});

	return def.promise;
}

/*
* sorts an array of objects by a specific key
* @list: array of objects to sort
* @key: object key to sort on
* @hint: a colon seperated list of sorting params.  i.e: 'date:desc' hint that the key is a date field and should be sorted in descending order
* return: sorted array of objects
*/
Search.prototype.sortBy = function(list, key, hint) {
	var l, newlist;

	newlist = list.sort(function(a, b) {
		//console.log('A: ', a, ' B: ', b)
		if (hint.indexOf('date') >= 0) {
			a = Date.parse(a[key]);
			b = Date.parse(b[key]);
		} else {
			a = a[key];
			b = b[key];
		}

		if (hint.indexOf('desc') >= 0) {
			if (a < b) return 1;
			if (a > b) return -1;
			return 0;
		} else if (hint.indexOf('asc') >= 0) {
			if (a > b) return 1;
			if (a < b) return -1;
			return 0;
		}
	});

	return newlist;
}

/*
* calcuate the string distance between the query and words in the index
* @self: the instantiated Search object
* @q: query string
* return: array of tweet ids who match the query string sorted based on match count (how many times a query word was found in the tweet)
*/
function calculate (self, q) {
//	process.nextTick(function() {
		var newarr = [], arr = [], arr2 = [], def = 0.875, words, matches, coef=0, o, count;

		arr = self._index.filter(function(v) {
			matches=[];
			words = v.str ? v.str : [];
			if (words.length) {
				words.forEach(function(w) {
					q.forEach(function(q1) {
						coef=0;
						if (w.length && q1.length) {
							coef = self._distance(w, q1);
							if (coef >= def) {
								matches[q1] = typeof matches[q1] === 'number' ? matches[q1] + 1 : 1;
							}
						}
					});
				});

				o = Object.keys(matches);
				if (o.length > 0) {
					count = 0;
					o.forEach(function(m) {
						count += matches[m];
					});
					arr2.push({id: v.id, matches: count});
					return true;
				} else return false;
			}
		});
		arr2 = arr2.sort(function(a, b) {
			if (a.matches > b.matches) return 1;
			if (a.matches < b.matches) return -1;
			return 0;
		});

		for(var i=0; i < arr2.length; i++) {
			if (newarr.indexOf(arr2[i].id) === -1) newarr.push(arr2[i].id);
		}

		return newarr;

//	});
}

module.exports = Search;