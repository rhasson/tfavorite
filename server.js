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
  server.use(express.logger());
  server.set('views', __dirname + '/views');
  server.set('view engine', 'jade');
  server.use(express.bodyParser());
  server.use(express.cookieParser());
  server.use(express.session({secret: 'testing this stuff');//, store: new RedisStore}));
  server.use(express.methodOverride());
  server.use(server.router);
  server.use(express.static(__dirname + '/public'));
  server.use(express.errorHandler({showStack: true, dumpExceptions: true}));
});

server.configure('development', function(){
  server.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

server.configure('production', function(){
  server.use(express.errorHandler());
});

server.get('/', routes.index);
server.get('/tlogin', routes.twitter_login);

server.listen(8000);