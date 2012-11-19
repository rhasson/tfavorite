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

	function viewport() {
		var e = window,
			a = 'inner';
		if (!('innerWidth' in window)) {
			a = 'client';
			e = document.documentElement || document.body;
		}
		return { width : e[ a+'Width' ] , height : e[ a+'Height' ] }
	}
	
	$('.favcontents').innerHeight(viewport().height);
});