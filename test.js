var n = require('natural');

var doc = [
	"#CeBIT: #Mozilla CEO Gary Kovacs auf der Bühne des Telekomstands zu #Firefox OS, Halle 4 pic.twitter.com/5U9ADYOVrV",
	"looking for support below 15100 in $GBPUSD http://dcl.sr/g83",
	"read piece by @nate_thayer for unbelievably now-common day in the life of a modern freelance journo http://ow.ly/inG0M",
	"#Launch2013 was just featured in the @HuffingtonPost! Read more: http://huff.to/ZlfHzs  feat. @georgezachary @tonysphere @Jason",
	"Announcing Our First Investment, $20,000 in Balbus http://j.mp/12qYRWm",
	"Cloudants working it at #devweek & London meetup tonight: http://cloudantinlondon.eventbrite.com/  & http://instagr.am/p/WeSPqdirTs/  @drsm79 @Cloudant_Ryan @mikerhodes"
]

var s;

function Search() {
	this._index = [];
	this._boost = 1.5;
}

Search.prototype.index = function(str, id) {
	var t = false;
	//str = str.split(/\s/).join('').toLowerCase();
	str = str.replace(/[/\/()\!\^\&\*\:\.]/ig,'').toLowerCase();
	t = this._index.some(function(v) { return v.id.indexOf(id) !== -1 });
	if (!t) this._index.push({str: str, id: id});
}

Search.prototype.query = function(q) {
	var ary, coef, def, self = this;
	//q = q.split(/\s/).join('').toLowerCase();
	q = q.replace(/[/\/()\!\^\&\*\:\.]/ig,'').toLowerCase();

	ary = this._index.filter(function(v) {
		def = (q.length / v.str.length) * self._boost;
		coef = n.DiceCoefficient(v.str, q)
		console.log('TEST : ',def, ' - ', v.str, n.DiceCoefficient(v.str, q));
		return  coef >= def;
	});

	ary = ary.map(function(v) {
		return v.id;
	});
	
	return ary;
}

s = new Search();
doc.forEach(function(v, i) {
	s.index(v, (i+10).toString());
});

module.exports = s;