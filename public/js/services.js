angular.module('FaviousApp.services.Favorites', []).
	factory('res_favorites', ['$rootScope', '$resource', function(root, res) {
		return $res('/favorite/:id', {id: '@id'});
	}]);

angular.module('FaviousApp.services.Embeds', []).
	factory('res_embeds', ['$rootScope', '$resource', function(root, res) {
		return $res('/embed/:id', {id: '@id'});
	}]);

angular.module('FaviousApp.services.Search', []).
	factory('res_search', ['$rootScope', '$resource', function(root, res) {
		return $res('/search');
	}]);