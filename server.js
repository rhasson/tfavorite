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
    ws_server = http.createServer(server);
		RedisStore = require('connect-redis')(Express),
    redis = require('redis'),
    kue = require('kue'),
    jobs = kue.createQueue(),
    qs = require('querystring'),
    r = require('request');

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

jobs.process('download all favorites', 5, function(job, done) {
  var rclient = redis.createClient();
  rclient.zrange([
    'favorites:'+job.data.user_id,
    '-1',
    '-1'], function(err, last_item){
      if (!err) {
        var x = JSON.parse(last_item);
        get(job.data.user_id, job.data.total_count, x.id_str);
      }
    });

  function get(user_id, total_count, last_id) {
    var count = (total_count < 200) ? ((total_count > 0) ? total_count : 0) : 200
    total_count -= count;

    var u = base_api + '/favorites/list.json?' +
    qs.stringify({
      user_id: user_id,
      count: total_count, //200 is max
      max_id: last_id
    });

    r.get({url: u, json: true}, function(err, resp, body) {
      if (!err && resp.statusCode === 200 && !body.error) {
        last_id = body[body.length-1].id_str;
        if (total_count === 0) done();
        else get(user_id, total_conut, last_id);
      } else {
        var e = err ? err : body.errors[0].message;
        done(new Error(e));
      }
    });
  }
});

ws_server.listen(80); //8002
