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
					offset: next
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

		if (urls.length == 0) scope.item.text = $filter('linky')(scope.item.text);
		//replace t.co urls with display urls
		for (var i=0; i < urls.length; i++) {
			ex = new RegExp(urls[i].url);
			u = '<a href="'+urls[i].url+'" class="fav_link" target="_blank">'+urls[i].display_url+'</a>';
			scope.item.text = scope.item.text.replace(ex, u);
		}

		element.append(scope.item.text);
	}

	return {
		restrict: 'A',
		link: linkFn
	}
});

/* create a data-fav-item directive which wraps every tweet */
FaviousApp.directive('favItem', function(socket, $filter) {

	var itemTpl = 
		"<div class='profile_pic media'>" +
		  "<a class='pull-left' href='#'>" +
		    "<img class='img-polaroid img-rounded media-object' ng-src='{{item.user.pic}}'>" +
		  "</a>" +
		  "<div class='profile_header media-body'>" +
		    "<span class='profile_header_label'><h5>@{{item.user.screen_name}}</h5></span>" +
		    "<span class='profile_header_label'><h6>{{item.user.name}}</h6></span>" +
		  "</div>" +
		"</div>" + //div.profile_pic
		"<div class='text_data media'>" +
		  "<div><div class='text_body' data-fav-body></div></div>" +
		  "<div class='extended-media embeded_closed hide'>" +
		    "<div class='embeded' ng-bind-html-unsafe='embeded_data.html'></div>" +
		    "<div class='media_desc'>" +
		      "<span class='media_label'>" +
		        "<h5>{{embeded_data.title}}</h5>" +
		        "<a href='{{embeded_data.author_url}}' target='_blank'><h6>{{embeded_data.author_name}}</h6></a>" +
		      "</span>" + //span.media_label
		    "</div>" + //div.media_desc
		  "</div>" + //div.extended_media
		"</div>" + //div.text_data
		"<div class='actions row'>" +
		  "<div class='actionlinks_container pull-right'>" +
		  "<a class='actionlinks' href='#' ng-click='removeFav(item, event)'><h6>Remove</h6></a>" +
		  "<a class='actionlinks' href='#' ng-click='shareFav(item, event)'><h6>Share</h6></a>" +
		  "</div>" + //div.actionlinks_container
		"</div>"; //div.action

	var linkFn = function(scope, element, attr) {
		//setup event handler
		var root_el = $(element[0]),
			click_el = $(root_el).find('div.text_data'),
			media_el = $(root_el).find('div.extended-media'),
			embed_el = $(root_el).find('div.embeded'),
			flag = false,
			ps;

		$(click_el).on('click', function(evt) {
			var urls = scope.item.entities.urls;
			//TODO: handle multiple urls where urls variable is an array
			if (urls.expanded_url.indexOf('instagr.am') !== -1) {
				scope.embeded_data = { url: urls.expanded_url + '/media/?size=m' };
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
							url: urls.expanded_url,
							maxwidth: $(click_el).width() - 10
						}
					});
					ps.then(function(resp) {
						if (resp.status == 'ok') {
							$(embed_el).css('width', resp.data.width+10);
							scope.embeded_data = resp.data;
							flag = true;
						}
					},
					function(err) {
						console.log('Failed to get details for this tweet');
						flag = false;
					});
				}			
			} 
			//$(media_el).slideToggle('fast');
			//$(media_el).toggleClass('hide');
			slide(media_el);
		});
		//do dirty check to update Angular
		//scope.$digest();
	}

	return {
		restrict: 'A',
		template: itemTpl,
		link: linkFn
	}
});


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
