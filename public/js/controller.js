/* Angular application decliration */
var FaviousApp = angular.module('FaviousApp', 
	['FaviousApp.services.Favorites'
		, 'FaviousApp.services.Embeds'
		, 'FaviousApp.services.Search'
		,'ngSanitize'
	]);

FaviousApp.scrollFlag = false;

FaviousApp.controller('favListCtrl', function($scope, $timeout, res_favorites, res_embeds, res_search) {
	var old_list, interval=null, searching=false;

	$scope.$watch('query', function(query, oldval) {
		if (!searching) old_list = $scope.list;
		if (query !== undefined && query !== '' && query !== ' ') {
			searching = true;
			window.clearTimeout(interval);
			interval = window.setTimeout(function() {
				if (query !== '' || query !== ' ') {
					console.log('CLIENT SENDING: ',query)
					$scope.list = res_search.query({q: query});
				}
			}, 300);
		} else {
			window.clearTimeout(interval);
			$scope.list = old_list;
			searching = false;
		}
	});


	$(window).on('scroll', function() {
		var trigger = 0.95;
		if (!searching && !FaviousApp.scrollFlag && $(window).scrollTop() / ( $(document).height() - $(window).height() ) > trigger) {
			$scope.getMore($scope.list[$scope.list.length - 1].id_str);
			FaviousApp.scrollFlag = true;
		}
	});

	$scope.getMore = function(next) {
		var self = this, ps;
		
		ps = res_favorites.query({
			  id: next
			, count: 5
		}, function() {  //success
				$scope.list = $scope.list.concat(ps);
				FaviousApp.scrollFlag = false;
		}, function() {  //error
				//TODO: show some simple error message at the bottom of the screen
		});
	}

	$scope.removeFav = function(item, evt) {
		console.log('removing: ', item)
		var newlist = [], ps;
		if (item) {

				ps = res_favorites.remove({
					  id: item.id_str
				}, function() {
					if (ps.length) {
						for(var i=0; i < $scope.list.length; i++) {
							if ($scope.list[i].id_str === item.id_str) $scope.list.splice(i, 1);
						}
					} else console.log('Failed to remove favorite: ', item.id_str);
				});

		}
	}

	$scope.shareFav = function(item, evt) {

	}

	function init() {
		var pi, ps;
		var id = $('.user').attr('data-user-id');

		ps = res_favorites.query({
			  count: 20
		}, function() {
			$scope.list = ps;
			$('div.loading').remove();
		}, function() {
			$('div.loading').html('Cannot reach server at this time, please try again later');
		});
		
	};

	init();

});

/* create a data-fav-body directive to handle the text and links within of the tweet */
FaviousApp.directive('favBody', function($filter) {

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
FaviousApp.directive('favItem', function(res_embeds, $filter) {

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
					ps = res_embeds.get({
							  id: scope.item.fav_id
							, url: u
							, maxwidth: $(click_el).width() - 10
					}, function() {  //success
							$(embed_el).css('width', ps.data.width+10);
							scope.embeded_data = ps.data;
							slide(media_el);
							flag = true;
					}, function() {  //error
							console.log('Failed to get details for this tweet');
							flag = false;
					});
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
