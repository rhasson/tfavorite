/*
*  favio.us server implementation
*  v.0.0.1
*/

var Express = require('express'),
		server = Express(), 
		routes = require('./routes').routes;
		//RedisStore = require('connect-redis')(Express);

/* Server Configuration */
server.configure(function(){
  server.use(Express.logger());
  server.set('views', __dirname + '/views');
  server.set('view engine', 'jade');
  server.use(Express.bodyParser());
  server.use(Express.cookieParser());
  server.use(Express.session({secret: 'testing this stuff'}));//, store: new RedisStore}));
  server.use(Express.methodOverride());
  server.use(server.router);
  server.use(Express.static(__dirname + '/public'));
  server.use(Express.errorHandler({showStack: true, dumpExceptions: true}));
});

server.configure('development', function(){
  server.use(Express.errorHandler({ dumpExceptions: true, showStack: true }));
});

server.configure('production', function(){
  server.use(Express.errorHandler());
});

server.get('/', routes.index);
server.get('/tlogin', routes.twitter_login);
server.get('/auth_cb', routes.auth_cb);
server.get('/favs', routes.get_favorites);
server.get('/embed/:id', routes.get_embed);

server.listen(80); //8002
