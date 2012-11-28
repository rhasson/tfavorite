$(document).ready(function() {
	/*if (Meny) {
		var meny = Meny.create({
			menuElement: document.querySelector('.meny'),
			contentsElement: document.querySelector('.favcontents'),
			position: 'top',
			height: 200,
			width: 260,
			threshold: 40
		});
	}*/

/*	$('.list').freetile({
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
*/
});

var FaviousApp = angular.module('FaviousApp', ['FaviousApp.service','ngSanitize']);

FaviousApp.directive('favItem', function(socket, $http, $filter) {
	var linkFn = function(scope, element, attr) {
		//setup event handler
		var root_el = $(element[0]),
			click_el = $(root_el).find('div.text_data'),
			media_el = $(root_el).find('div.extended-media'),
			embed_el = $(root_el).find('div.embeded'),
			flag = false,
			ps;

		$(click_el).on('click', function(evt) {
			if (scope.item.urls.expanded_url.indexOf('instagr.am') !== -1) {
				scope.embeded_data = { url: scope.item.urls.expanded_url + '/media/?size=m' };
				if (!$(embed_el).children('img').length) {
					$(embed_el).append('<img src="'+scope.embeded_data.url+'" class="img-polaroid">');
					$(embed_el).children('img').on('load', function() {
						$(embed_el).css('width', $(this).width());
						$(embed_el).children('img').off('load');
					});
				}
			}

			if (!flag) {
				if (socket.hasToken()) {
					ps = socket.get({
						action: 'get_embed',
						params: {
							id: scope.item.fav_id,
							url: scope.item.urls.expanded_url
						}
					});
					ps.then(function(resp) {
						if (resp.status == 'ok') {
							$(embed_el).css('width', resp.data.width);
							scope.embeded_data = resp.data;
							flag = true;
						}
					},
					function(err) {
						console.log('Failed to get details for this tweet');
						flag = false;
					});
				}
/*				
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
*/				
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

function favListCtrl($scope, socket) {
	socket.onopen = function() {
		var pi, ps;
		var id = $('.user').attr('data-user-id');

		if (!socket.hasToken()) {
			pi = socket.init(id);
			pi.then(function(id) {
				ps = socket.get({
					action: 'get_favorites',
					params: {
						count: 20
					}
				});
				ps.then(function(list) {
					if (list.status == 'ok') {
						$scope.list = list.data
						$('div.loading').remove();
					}
				},
				function(err) {
					console.log('get favorites error: ', err);
					$scope.list = [];
				});
			},
			function(err) {
				console.log('error: ', err);
			});
		}
	}
}