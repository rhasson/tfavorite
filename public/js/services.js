angular.module('FaviousApp.services.Favorites', ['ngResource']).
	factory('res_favorites', ['$rootScope', '$resource', function(root, $resource) {
		return $resource('/favorite/:id', {id: '@id'});
	}]);

angular.module('FaviousApp.services.Embeds', []).
	factory('res_embeds', ['$rootScope', '$resource', function(root, $resource) {
		return $resource('/embed/:id', {id: '@id'});
	}]);

angular.module('FaviousApp.services.Search', []).
	factory('res_search', ['$rootScope', '$resource', function(root, $resource) {
		return $resource('/search');
	}]);