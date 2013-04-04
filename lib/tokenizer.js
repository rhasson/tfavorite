var stop_words = require('./stop_words');

module.exports = function tokenize(str) {
	var _str = str.toLowerCase();

	//replace full urls with only the domain name
	_str = _str.replace(/([http|https]{4,5}\:\/\/)(\w.+)(\w+\.[a-z]{2,3})(\/\w+\??\S+)+/ig, '$2$3')

	//remove apostrophes
	_str = _str.replace(/(\w+)(\')(\w)/ig, '$1$3');

	//remove punctuation
    _str = _str.replace(/\W/ig, ' ');

    //split sentence into words
    _str = _str.trim().split(/\s+/ig);

    //remove stop words
	_str = _str.filter(function(i) {
		return !stop_words(i);
	});

	_str = _str.filter(function(i) {
		return i.length > 0 && i !== '' && i !== ' ' && i !== undefined
	});

	return _str;
}