angular.module('FaviousApp.service', []).
	factory('socket', ['$rootScope', '$q', function(root, q) {
		var sock = io.connect('http://favio.us');
		var old_send = sock.send;
		
		/*
		* sends request object to server
		*  @data.action: string action to be performed such as 'init', 'get_favorites'
		*  @data.params: object representing parameters
		*  @data.token: session token (will not be present with 'init' message)
		*/
		sock.__proto__.send = function(data, cb) {

			if (!root.ws_token && (!data.action || data.action != 'init')) return cb(new Error('Must first initialize the socket transport'));
			else if (data.action != 'init' && !data.token) data.token = root.ws_token;
console.log('SENDING: ', data)
			sock.on(data.action, function(r) {
				var a = [];
				if (!r.error && r.status !== 'error') {
					if (root.ws_token === r.token) {
						//remove the token parameter before returning back to user
						for (var i in r) {
							if (i !== 'token') a[i] = r[i];
						}
						return cb(null, a);
					} else return cb(new Error('Unauthorized request'));
				} else return cb(new Error(r.error));
			});

			sock.emit(data.action, data);
/*
			sock.onmessage = function(resp) {
				var r, a = {};
				try { r = JSON.parse(resp.data); }
				catch (e) { return cb(new Error(e));	}
console.log('send onmessage: ', r);
				if (!r.error && r.status !== 'error') {
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
*/
		}

		sock.__proto__.get = function(req) {
			var deferred = q.defer();
			if (!req) deferred.reject('Missing request parameters');

			sock.send(req, function(err, resp) {
				root.$apply(function() {
					if (!err && resp.status !== 'error') {
						deferred.resolve(resp);
					} else deferred.reject(err || resp.data);
				});
			});
			return deferred.promise;
		}
		
		sock.__proto__.init = function(id) {
			var deferred = q.defer()
			var old = null;
			console.log('token: ', root.ws_token);
			//root.$apply(function() {
				if (!id) deferred.reject('Missing a user id');
				if (!root.ws_token) {
					console.log('Sending: ', id)
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
			//});
			return deferred.promise;
		}
		
		sock.__proto__.hasToken = function() {
			if (root.ws_token) return true;
			else return false;
		}
		sock.__proto__.isToken = function(t) {
			if (root.ws_token === t) return true;
			else return false;
		}

		return sock;
	}]);