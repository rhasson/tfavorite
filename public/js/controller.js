$(document).ready(function() {
	if (Meny) {
		var meny = Meny.create({
			menuElement: document.querySelector('.meny'),
			contentsElement: document.querySelector('.favcontents'),
			position: 'left',
			height: 200,
			width: 260,
			threshold: 40
		});
	}

	$('.list').freetile({
		selector: '.el_item'
	});
});