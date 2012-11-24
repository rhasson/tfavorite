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

var FaviousApp = angular.module('FaviousApp', ['ngSanitize']);

FaviousApp.directive('favItem', function($http, $filter) {
	var linkFn = function(scope, element, attr) {
		//setup event handler
		var root_el = $(element[0]),
			click_el = $(root_el).find('div.text_data'),
			media_el = $(root_el).find('div.extended-media'),
			embed_el = $(root_el).find('div.embeded'),
			flag = false;

		$(click_el).on('click', function(evt) {
			if (!flag) {
				var resp = $http({
						method: 'GET',
						url: '/embed/' + scope.item.fav_id,
						params: { url: scope.item.urls.expanded_url }
					});
				resp.success(function(data, status) {
					$(embed_el).css('width', data.width);
					scope.embeded_data = data;
					flag = true;
				});
				resp.error(function(data, status) {
					console.log('Failed to get details for this tweet');
					flag = false;
				});
			} 
			$(media_el).slideToggle('fast');
		});
		//do dirty check to update Angular
		//scope.$digest();
	}

	return {
		restrict: 'A',
		link: linkFn
	}
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

	$scope.getDetails = function(item, $event) {

	}
}