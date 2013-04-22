/*
*  favio.us server implementation
*  v.0.0.3
*/

var Express = require('express')
    , server = Express()
		, RedisStore = require('connect-redis')(Express)
    , store = new RedisStore
    , routes = require('./routes').routes
    , proc = require('./worker/index.js');

var SECRET = 'testing this stuff';

/* Server Configuration */
server.configure(function(){
  server.use(Express.logger());
  server.set('views', __dirname + '/views');
  server.set('view engine', 'jade');
  server.use(Express.bodyParser());
  server.use(Express.cookieParser());
  server.use(Express.session({ key: 'sid', secret: SECRET, store: store}));
  server.use(Express.methodOverride());
  server.use(server.router);
  server.use(Express.static(__dirname + '/public'));
  server.use(Express.errorHandler({ showStack: true, dumpExceptions: true }));
});

server.configure('development', function(){
  server.use(Express.errorHandler({ dumpExceptions: true, showStack: true }));
});

server.configure('production', function(){
  server.use(Express.errorHandler());
});

server.get('/', routes.index);
server.get('/tlogin', routes.twitter_login);
server.get('/logout', routes.logout);
server.get('/auth_cb', routes.auth_cb);

server.get('/favorite/:id', routes.get_favorite);
server.delete('/favorite/:id', routes.remove_favorite);

server.get('/embed/:id', routes.get_embed);

server.get('/search', routes.search);

server.listen(80); //8002

proc.startWorker();