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

function favListCtrl($scope, $http) {
	var resp = $http({
			method: 'GET',
			url: '/favs',
			params: {limit: 20}
	});
	resp.success(function(data, status) {
		if (status === 200 && data) {
			$scope.list = data;
			$('div.loading').remove()
		} else {
			$scope.list = [];
		}
	});
	resp.error(function(data, status) {
		console.error('Failed to get favorites from server: ', data);
	});
}