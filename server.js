/*
*  favio.us server implementation
*  v.0.0.1
*/

var Express = require('express'),
    http = require('http'),
		server = Express(),
    sockjs = require('sockjs'),
		routes = require('./routes').routes,
    wsroutes = require('./routes').wsroutes,
    ws = sockjs.createServer({ sockjs_url: 'http://favio.us/js/sockjs-0.3.4.min.js',
        jsessionid: true }),
    ws_server = http.createServer(server),
		RedisStore = require('connect-redis')(Express),
    proc = require('./worker/index.js');

/* Server Configuration */
server.configure(function(){
  server.use(Express.logger());
  server.set('views', __dirname + '/views');
  server.set('view engine', 'jade');
  server.use(Express.bodyParser());
  server.use(Express.cookieParser());
  server.use(Express.session({ key: 'jsessionid', secret: 'testing this stuff', store: new RedisStore}));
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

ws.on('connection', function(socket) {
  socket.on('data', function(msg) {
    wsroutes.parse(msg, socket);
  });
  socket.on('close', function() {
    console.log('CLOSING CONNECTION')
  });
});

server.get('/', routes.index);
server.get('/tlogin', routes.twitter_login);
server.get('/logout', routes.logout);
server.get('/auth_cb', routes.auth_cb);
server.get('/favs', routes.get_favorites);
server.get('/remove/:id', routes.remove)
server.get('/embed/:id', routes.get_embed);

ws.installHandlers(ws_server, {prefix: '/ws'});

ws_server.listen(80); //8002

proc.startWorker();