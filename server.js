/*
*  favio.us server implementation
*  v.0.0.1
*/

var Express = require('express')
    , server = Express()
    , app = require('http').createServer(server)
    , ws = require('socket.io').listen(app)
		, RedisStore = require('connect-redis')(Express)
    , store = new RedisStore
    , routes = require('./routes').routes
    , wsroutes = require('./routes').wsroutes
    , cookie = require('./node_modules/express/node_modules/cookie')
    , parseSignedCookies = require('./node_modules/express/node_modules/connect/lib/utils').parseSignedCookies
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

ws.set('authorization', function(data, next) {
  var c = '';
  if (data.headers.cookie) {
    c = parseSignedCookies(cookie.parse(data.headers.cookie), SECRET);
    if ('sid' in c) {
      store.get(c.sid, function(err, session) {
        if (!err && session) {
          data.sid = c.sid;
          data.user_id = session.user.id_str;
          data.oauth = session.oauth;
          next(null, true);
        } else next('Failed to get session from store', false);
      });
    }  else next('No session found in cookie', false);
  }
});

ws.on('connection', function(socket) {
  socket.on('init', function(msg) {
    wsroutes.init(msg, socket);
  });

  socket.on('get_favorites', function(msg) {
    wsroutes.get_favorites(msg, socket);
  });
  
  socket.on('get_embed', function(msg) {
    wsroutes.get_embed(msg, socket);
  });

  socket.on('remove_favorite', function(msg) {
    wsroutes.remove_favorite(msg, socket);
  });

  socket.on('search', function(msg) {
    wsroutes.search(msg, socket);
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

app.listen(80); //8002

proc.startWorker();