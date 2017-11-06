
// Requirements.
var express = require('express');
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var moment = require('moment');
var cors = require('cors');
var fetch = require('node-fetch');

// Init app.
var app = express();

// Use cors.
app.use(cors());

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// set our port
var port = process.env.PORT || 7000;

// get an instance of the express Router
var router = express.Router();

// GET /
router.get('/', function(req, res) {
  res.send("<pre>MeliProxy API Usage:\n\n/api/stats: Get aggregated hits statistics for the last 24 hours\n/api/servers: Get all the active Envoy servers</pre>");
});

// GET /api
router.get('/api', function(req, res) {
  res.redirect('/');
});

// GET /stats
router.get('/api/stats', function(req, res) {
  // Connection URL
  var url = 'mongodb://'+process.env.MONGODB_HOST+':27017/meliproxy';

  // Use connect method to connect to the Server
  MongoClient.connect(url, function(err, db) {
    assert.equal(null, err);

    // Get stats collection
    var stats = db.collection('stats');

    // Get records from the last day only.
    var queryObj = {
      datetime: { $gte: new Date(moment().subtract(1,'day').toISOString()) }
    };
    stats.find(queryObj).sort( { datetime: 1 } ).toArray(function(err, docs) {
      assert.equal(err, null);
      res.json(docs);
      db.close();
    });
  });
});

// GET /servers
router.get('/api/servers', function(req, res) {

  const servers = process.env.SERVERS.split(';');
  let serverData = {};
  let requestQty = 0;
  var requestsPromise = new Promise(function (success, failure) {
    // Get /server_info
    servers.forEach(function (server) {
      fetch('http://'+server+':8001/server_info')
      .then(function(res) {
        return res.text();
      }).then(function(body) {
        if (typeof serverData[server] === 'undefined') {
          serverData[server] = {
            host: server
          };
        }
        serverData[server].serverInfo = body;
        requestQty ++;
        if (requestQty == (servers.length*2)) {
          success(serverData);
        }
      });
    });

    // Get /stats
    servers.forEach(function (server) {
      fetch('http://'+server+':8001/stats')
      .then(function(res) {
        return res.text();
      }).then(function(body) {
        if (typeof serverData[server] === 'undefined') {
          serverData[server] = {
            host: server
          };
        }
        serverData[server].stats = {};
        body.split(/\n/).forEach(function (line) {
          var parts = line.split(/[ ]*:[ ]*/);
          serverData[server].stats[parts[0]] = parts[1];
        });
        
        requestQty ++;
        if (requestQty == (servers.length*2)) {
          success(serverData);
        }
      });
    });
  }).then(function (serverData) {
    console.log("Ready all the requests with serverData:",serverData);
    var response = [];
    Object.keys(serverData).forEach(function (key) {
      response.push(serverData[key]);
    });
    res.json(response);
  });
});

// all of our routes will be prefixed with /api
app.use('/', router);

// Start the server
app.listen(port);
console.log('Listening on port ' + port);
