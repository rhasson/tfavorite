/*
* Search query parser
* v.0.0.1
*/

var tokenize = require('./tokenizer');

function QueryParser(args) {
	
}

QueryParser.prototype.parse = function parse(q) {
	var _q = tokenize(q);

	return _q;
}

module.exports = new QueryParser();