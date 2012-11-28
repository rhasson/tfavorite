angular.module('FaviousApp.service', []).
	factory('socket', ['$rootScope', '$q', function(root, q) {
		var sock = new SockJS('http://favio.us/ws');
		var old_send = sock.send;
		
		sock.__proto__.send = function(data, cb) {
			var d;

			if (!root.ws_token && (!data.action || data.action != 'init')) return cb(new Error('Must first initialize the socket transport'));
			else if (data.action != 'init' && !data.token) data.token = root.ws_token;

			sock.onmessage = function(resp) {
				var r, a = {};

				try { r = JSON.parse(resp.data); }
				catch (e) { return cb(new Error(e));	}
console.log('send onmessage: ', r);
				if (!r.error) {
					if (root.ws_token == r.token) {
						//remove the token parameter before returning back to user
						for (var i in r) {
							if (i != 'token') a[i] = r[i];
						}
						return cb(null, a);
					} else return cb(new Error('Unauthorized response'));
				} else return cb(new Error(r.error));
			}

			try { d = JSON.stringify(data); }
			catch (e) { return cb(new Error(e)); }

			old_send.call(sock, d);
		}

		sock.__proto__.get = function(req) {
			var deferred = q.defer();
			if (!req) deferred.reject('Missing request parameters');

			sock.send(req, function(err, resp) {
				root.$apply(function() {
					if (!err) {
						deferred.resolve(resp);
					} else deferred.reject(err);
				});
			});
			return deferred.promise;
		}
		
		sock.__proto__.init = function(id) {
			var deferred = q.defer()
			var old = null;
			console.log('token: ', root.ws_token);
			root.$apply(function() {
				if (!id) deferred.reject('Missing a user id');
				if (!root.ws_token) {
					console.log('Sending: ', id)
	/*				if (typeof sock.onmessage == 'function') old = sock.onmessage;
					sock.onmessage = function(resp) {

						sock.onmessage = old;
						if (typeof sock.onmesage == 'funtion') sock.onmesage.call(resp);
					}
	*/
					sock.send({action: 'init', id: id}, function(err, resp) {
						root.$apply(function() {
							console.log('INIT RESP: ', err, resp);
							if (!err) {
								root.ws_token = resp.data.token;
								deferred.resolve('ok');
								console.log('success: ', root.ws_token)
							} else {
								root.ws_token = null;
								console.log('failed')
								deferred.reject(err || resp.error);
							}
						});
					});
				} else deferred.resolve('ok');
			});
			return deferred.promise;
		}
		
		sock.__proto__.hasToken = function() {
			if (root.ws_token) return true;
			else return false;
		}
		sock.__proto__.isToken = function(t) {
			if (root.ws_token == t) return true;
			else return false;
		}

		return sock;
	}]);