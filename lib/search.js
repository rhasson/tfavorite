var natural = require('natural');

function Search() {
	this._index = [];
	this._tokenizer = natural.WordTokenizer();
	this._distance = natural.JaroWinklerDistance;
	this._fields = [];
}

/*
* arr: array of objects containing field name and boost level
*   {name: 'fieldname', boost: 100}
*/
Search.prototype.init(arr) {
	this._fields.concat(arr);
}

/*
* take an input, tokenize it and add it to the index
*/
Search.prototype.add(input) {
	var self = this;
	if (input instanceof Array) {
		input.forEach(function(input_v) {
			self._fields.forEach(function(fields_v) {
				var v;
				v = parse(input_v, fields_v.name.split('.'))
			});
		});
	}
}

function parse(in, f) {
	var x;
	if (f.length > 0) {
		x = f.shift();
		parse(in[x], f);
	} else {
		return in[x];
	}
}