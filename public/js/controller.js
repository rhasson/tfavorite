/* Angular application decliration */
var FaviousApp = angular.module('FaviousApp', ['FaviousApp.service','ngSanitize']);

FaviousApp.controller('favListCtrl', function($scope, socket) {
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
					if (list.status === 'ok') {
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

	$scope.getMore = function(next) {
		if (socket.hasToken()) {
			ps = socket.get({
				action: 'get_favorites',
				params: {
					count: 5,
					start_id: next
				}
			});
			ps.then(function(items) {
				if (items.status === 'ok') $scope.list.concat(items.data);
			},
			function(err) {
				console.log('error', err);
			});
		}
	}

	$scope.removeFav = function(item, evt) {
		console.log('removing: ', item)
		var newlist = [];
		if (item) {
			if (socket.hasToken()) {
				var ps = socket.get({
					action: 'remove_favorite',
					params: { id: item.fav_id }
				});
				ps.then(function(resp) {
					for(var i=0; i < $scope.list.length; i++) {
						if ($scope.list[i].fav_id === item.fav_id) $scope.list.splice(i, 1);
					}
				},
				function(err) {
					console.log('error removing favorite: ', err);
				});
			}
		}
	}

	$scope.shareFav = function(item, evt) {

	}
});

/* create a data-fav-body directive to handle the text and links within of the tweet */
FaviousApp.directive('favBody', function(socket, $filter) {

	var linkFn = function(scope, element, attr) {
		var urls = scope.item.entities.urls;
		var ex, u;

		if (scope.item.text.match(/<a/ig)) {
			element.html(scope.item.text);
			return;
		}

		if (urls.length == 0) scope.item.text = $filter('linky')(scope.item.text);
		//replace t.co urls with display urls
		for (var i=0; i < urls.length; i++) {
			ex = new RegExp(urls[i].url);
			u = '<a href="'+urls[i].url+'" class="fav_link" target="_blank">'+urls[i].display_url+'</a>';
			scope.item.text = scope.item.text.replace(ex, u);
		}
		element.html(scope.item.text);
	}

	return {
		restrict: 'A',
		templateUrl: 'fav-body',
		link: linkFn
	}
});

/* create a data-fav-item directive which wraps every tweet */
FaviousApp.directive('favItem', function(socket, $filter) {

	var linkFn = function(scope, element, attr) {
		//setup event handler
		var root_el = $(element[0]),
			click_el = $(root_el).find('div.text_data'),
			media_el = $(root_el).find('div.extended-media'),
			embed_el = $(root_el).find('div.embeded'),
			flag = false,
			ex = /vimeo|youtu/ig,
			u = '',
			ps;

		$(root_el).on('scroll', function(evt) {
			if (root_el.scrollTop + root_el.offsetHeight >= root_el.scrollHeight) {
                scope.$apply(getMore());
            }
		});

		$(click_el).on('click', function(evt) {
			var urls = scope.item.entities.urls;
			
			if (isDivOpen(media_el)) {
				slide(media_el);
			} else if ($(embed_el).children().length > 0) {
				slide(media_el);
			} else {
				angular.forEach(urls, function(url_item, key) {
					if (url_item.expanded_url.indexOf('instagr.am') !== -1) {
						scope.embeded_data = { url: url_item.expanded_url + '/media/?size=m' };
						if (!$(embed_el).children('img').length) {
							$(embed_el).append('<img src="'+scope.embeded_data.url+'" class="img-polaroid">');
							$(embed_el).children('img').on('load', function() {
								$(embed_el).css('width', $(this).width());
								$(embed_el).children('img').off('load');
							});
						}
						u = url_item.expanded_url;
					} else if (url_item.expanded_url.match(ex)) {
						u = url_item.expanded_url;
					}
				});

				if (u) {
					if (socket.hasToken()) {
						ps = socket.get({
							action: 'get_embed',
							params: {
								id: scope.item.fav_id,
								url: u,
								maxwidth: $(click_el).width() - 10
							}
						});
						ps.then(function(resp) {
							if (resp.status == 'ok') {
								$(embed_el).css('width', resp.data.width+10);
								scope.embeded_data = resp.data;
								slide(media_el);
								flag = true;
							}
						},
						function(err) {
							console.log('Failed to get details for this tweet');
							flag = false;
						});
					}
				}
			}
		});
	}

	return {
		restrict: 'A',
		templateUrl: 'fav-item',
		link: linkFn
	}
});

function isDivOpen(el) {
	if ($(el).hasClass('embeded_opened')) return true;
	else return false;
}

function slide (el) {
	if ($(el).hasClass('embeded_opened')) {
		$(el).removeClass('embeded_opened');
		$(el).addClass('embeded_closed');
		$(el).addClass('hide');
	} else {	
		$(el).removeClass('hide');
		$(el).removeClass('embeded_closed');
		$(el).addClass('embeded_opened');
	}
}
