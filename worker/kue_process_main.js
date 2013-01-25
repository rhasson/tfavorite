var redis = require('redis'),
  rclient = redis.createClient(),
  kue = require('kue'),
  jobs = kue.createQueue(),
  qs = require('querystring'),
  reds = require('reds'),
  r = require('request'),
  db = require('../lib/db'),
  base_url = require('../config').config.twitter.base_url;
  
require('console-trace');

jobs.process('download all favorites', 5, function(job, done) {
  console.t.log('Kue child has began processing for: ', job.data);
  var s = reds.createSearch('searchindex:'+job.data.user_id);
  var couch_obj;
  
  if (job.data.end_id && job.data.start_id) {
    get(10, job.data.start_id, job.data.end_id);
  } else  {
    couch_obj = {
      startkey: [job.data.user_id],
      endkey: [job.data.user_id, {}],
      descending: false,
      limit: 1
    };
    //get the oldest favorite
    db._db.view('favorites/by_user_id', couch_obj, function(err, doc) {
      doc = format(doc);
      if (doc.length > 0) {
        get(job.data.total_count, doc[0].value.id_str);
      } else {
        get(job.data.total_count);
      }
    });
  }

  /*
  * function that will be called recursively to retreive all favorites
  * @total_count: the total count of favorites to get.  decreases with iterations
  * @last_id: the last id retreived
  */
  //TODO: add logic to handle API quotas and limits
  function get(total_count, start_id, end_id) {
    console.t.log('Child GET for ', job.data.user_id, ' and count: ', total_count);
    var count = (total_count < 200) ? ((total_count > 0) ? total_count : 0) : 200
    var remaining = total_count - count;
    var u = base_url + '/favorites/list.json?';

    if (end_id) {
      u += qs.stringify({
        user_id: job.data.user_id,
        count: count,
        since_id: start_id,  //more recent than
        max_id: end_id  //older than
      });
    } else if (start_id) {
      u += qs.stringify({
        user_id: job.data.user_id,
        count: count, //200 is max
        max_id: start_id
      });
    } else {
      u += qs.stringify({
        user_id: job.data.user_id,
        count: count //200 is max
      });
    }

    console.t.log('Child GETTING: ', start_id, end_id, count)
    r.get({url: u, oauth: job.data.session.oauth, json: true}, function(err, resp, body) {
      var newlist, e;
      if (!err && resp.statusCode === 200 && !body.error) {
        //index favorites into reds
        redsindex(s, body, job.data.user_id);
        //normalize (render) favorites
        newlist = render(body);
        //store in redis
        db.set(job.data.user_id, newlist);
        start_id = body[body.length-1].id_str;
        job.progress(remaining, job.data.total_count);
        if (remaining === 0) done();
        else get(remaining, start_id, end_id);
      } else {
        e = err ? err : body.errors[0].message;
        done(new Error(e));
      }
    });
  }
});

/**************************************************************************************/

/*
* format the response from couch
* @doc: json response from couch
* returns cleaned up js object
*/
function format(doc) {
  try {
    var d = JSON.parse(doc);
    console.t.log('rows: ', d);
    return d;
  } catch (e) {
    return new Error(e.message);
  }
}
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