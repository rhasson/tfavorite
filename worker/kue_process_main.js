var redis = require('redis'),
  rclient = redis.createClient(),
  kue = require('kue'),
  jobs = kue.createQueue(),
  qs = require('querystring'),
  reds = require('reds'),
  r = require('request'),
  base_url = require('../config').config.twitter.base_url,
  require('console-trace');

jobs.process('download all favorites', 5, function(job, done) {
  console.log('Kue child has began processing for: ', job.data.user_id);
  var s = reds.createSearch('searchindex:'+job.data.user_id);
  rclient.zrange([
    'favorites:'+job.data.user_id,
    '-1',
    '-1'], function(err, last_item){
      if (!err) {
        var x = JSON.parse(last_item);
        get(job.data.user_id, job.data.total_count, x.id_str);
      }
    });

//TODO: add logic to handle API quotas and limits
  function get(user_id, total_count, last_id) {
    console.log('Child GET for ', user_id, ' and count: ', total_count);
    var count = (total_count < 200) ? ((total_count > 0) ? total_count : 0) : 200
    var remaining = total_count - count;

    var u = base_url + '/favorites/list.json?' +
    qs.stringify({
      user_id: user_id,
      count: count, //200 is max
      max_id: last_id
    });

    r.get({url: u, oauth: job.data.session.oauth, json: true}, function(err, resp, body) {
      var newlist, e;
      if (!err && resp.statusCode === 200 && !body.error) {
        //index favorites into reds
        redsindex(s, body, job.data.user_id);
        //normalize (render) favorites
        newlist = render(body);
        //store in redis
        saveFavorites(job.data.user_id, newlist);
        last_id = body[body.length-1].id_str;
        job.progress(job.data.total_count - remaining, job.data.total_count);
        if (remaining === 0) done();
        else get(user_id, remaining, last_id);
      } else {
        e = err ? err : body.errors[0].message;
        done(new Error(e));
      }
    });
  }
});

/*
* normalize array of favorites only include items that are valuable
* @list: array of favorites
* returns new array or empty array
*/
function render(list) {
    if (list.length > 0) {
      if (list[0].id) {
        var newlist = list.map(function(v, i) {
          //var t = v.text.slice(0, v.entities.urls[0].indices[0]);
          return {
            text: v.text,
            entities: v.entities,
            user : {
              id: v.user.id,
              pic: v.user.profile_image_url,
              screen_name: v.user.screen_name,
              name: v.user.name
            },
            retweet_count: v.retweet_count,
            created_at: v.created_at,
            id_str: v.id_str
          }
        });
        return newlist;
      } else return list;
    } else return [];
}

/*
* index important text elemnts into a search index for the particular user
* @s: reds search index
* @ary: array of favorite object directly from twitter api
* @user_id: user id of the logged in user
*/
function redsindex(s, ary, user_id) {
  ary.forEach(function(item, i) {
    s.index(item.text, item.id_str);
    s.index(item.user.name, item.id_str);
    s.index(item.user.screen_name, item.id_str);
/*    if (item.user.place) {
      s.index(item.user.place.full_name, item.id_str);
      s.index(item.user.place.country, item.id_str);
    }
*/
    if (item.entities.urls.length) {
      item.entities.urls.forEach(function(u) {
        s.index(u.expanded_url, item.id_str);
      });
    }
    if (item.entities.hashtags.length) {
      item.entities.hashtags.forEach(function(h) {
        s.index(h.text, item.id_str);
      });
    }
    if (item.entities.user_mentions.length) {
      item.entities.user_mentions.forEach(function(m) {
        s.index(m.name, item.id_str);
        s.index(m.screen_name, item.id_str);
      });
    }
  });
}

/*
*  Save favorites to redis
*  @id: user id
*  @favs: array of favorires
*/
function saveFavorites(id, favs) {
  var args;

  if (id) {
    favs.forEach(function(item) {
      args = [
        'favorites:'+id,
        item.id_str,
        JSON.stringify(item)];
      rclient.zadd(args, function (e, v) {
        if (e) console.log('Error with saving favorites to redis from worker, ZADD: ', e);
      });
    });
  }
}

process.on('disconnect', function() {
  console.log('Worker disconnected');
  process.exit(1)
});
process.on('error', function(err) {
  console.log('Worker encountered an error: ', err);
  process.exit(1);
});
process.on('close', function() {
  console.log('Worker closed');
  process.exit(1);
});
process.on('exit', function(code, signal) {
  console.log('Worker exited with code: ', code, ' and signal: ', signal);
  process.exit(1);
});