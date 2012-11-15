$(document).ready(function() {
	if (Meny) {
		var meny = Meny.create({
			menuEl: $('.meny'),
			contentEl: $('.favcontents'),
			position: 'left',
			height: 200,
			width: 260,
			threshold: 40
		});
	}
});