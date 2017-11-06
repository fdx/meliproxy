
// Install packages.
var chokidar = require('chokidar');
var fs = require("fs");
var path = require("path");
var moment = require("moment");
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');

// Walk function.
var walk = function(dir, callback) {
  fs.readdir(dir, function(err, files) {
    if (err) throw err;
    files.forEach(function(file) {
      var filepath = path.join(dir, file);
      fs.stat(filepath, function(err,stats) {
        if (stats.isDirectory()) {
          walk(filepath, callback);
        } else if (stats.isFile()) {
          callback(filepath, stats);
        }
      });
    });
  });
};

var byHour = {}; // storage hash

function getEmptyRecord(m) {
  var date = m.format('YYYY-MM-DD');
  var hour = parseInt(m.format('HH'));
  m.hour(hour);
  m.minute(0);
  m.second(0);
  return {
    datetime: new Date(m.toISOString()),
    date: date,
    hour: hour,
    totalQty: 0,
    okQty: 0,
    ratelimitQty: 0,
    notfoundQty: 0,
    errorQty: 0,
    _durationTotal: 0,
    durationAvg: null,
    _latencyTotal: 0,
    latencyAvg: null
  };
}

function fillHourGaps(reset) {
  if (reset) {
    byHour = {};
  }
  var timeCursor = moment('2017-11-01 00:00:00');
  var timeNow = moment();
  while(timeCursor.isBefore(timeNow)) {
    var day = timeCursor.format('YYYY-MM-DD');
    var hour = timeCursor.format('HH');
    if (typeof byHour[day] === 'undefined') {
      byHour[day] = {};
    }
    if (typeof byHour[day][hour] === 'undefined') {
      byHour[day][hour] = getEmptyRecord(timeCursor);
    }

    // add 1 hour.
    timeCursor = timeCursor.add(1,'hour');
  }
}

// Fill gaps every 45mins.
fillHourGaps();
setInterval(fillHourGaps,2700000);

var timeout = null;
var writeTimeout = null;
var running = false;
var reRunFlag = false;

function aggregateLogs()
{
  if (running) {
    reRunFlag = true;
    console.log("reRunFlag turned ON");
    return;
  } else {
    running = true;
  }

  // Clear timeout (if set).
  if (timeout) {
    clearTimeout(timeout);
    timeout = null;
  }

  // Reset byHour container.
  fillHourGaps(true);

  // Log
  console.log("Agregatting logs...");

  // Walk over directory.
  walk('/logs/logs',function (filepath, stats) {
    // Read each file of the directory.
    console.log("Processing file: "+filepath);
    fs.readFile(filepath, function(error, data) {
      if(error) throw(error);

      // Split lines.
      data.toString().split(/\n/).forEach(function(line) {

        // Ignore empty lines.
        if (line.length <= 0) {
          return;
        }

        // Parse log line.
        var parts = line.split('"'),
          datetime = parts[0].split(' ')[0].replace(/^\[/,'').replace(/\]$/,''),
          datetimeMoment = moment(datetime),
          day = datetimeMoment.format('YYYY-MM-DD'),
          hour = datetimeMoment.format('HH'),
          minute = datetimeMoment.format('mm'),
          request = parts[1],
          responseCode = parseInt(parts[2].split(' ')[1]),
          responseFlags = parts[2].split(' ')[2],
          bytesSent = parts[2].split(' ')[4],
          bytesReceived = parseInt(parts[2].split(' ')[3]),
          duration = parseInt(parts[2].split(' ')[5]),
          upstreamTime = parseInt(parts[2].split(' ')[6]),
          xForwardedFor = parts[3],
          userAgent = parts[5],
          requestId = parts[7],
          requestAuthority = parts[9],
          upstreamHost = parts[11]
        ;
        // Build request object.
        const requestObject = {
          datetime,
          datetimeMoment,
          day,
          hour,
          minute,
          request,
          responseCode,
          responseFlags,
          bytesReceived,
          bytesSent,
          duration,
          upstreamTime,
          xForwardedFor,
          userAgent,
          requestId,
          requestAuthority,
          upstreamHost,
        };
        
        // In our time span?
        if (1) {

          // Init with an empty record (if needed).
          if (typeof byHour[requestObject.day][requestObject.hour] === 'undefined') {
            byHour[requestObject.day][requestObject.hour] = getEmptyRecord(requestObject.datetimeMoment);
          }

          // Increment qty.
          byHour[requestObject.day][requestObject.hour].totalQty ++;
          if (requestObject.responseCode >= 200 && requestObject.responseCode <= 299) {
            // es un request bueno.
            byHour[requestObject.day][requestObject.hour].okQty ++;
          } else if (requestObject.responseCode >= 400 && requestObject.responseCode <= 499) {
            if (requestObject.responseCode == 429) {
              // ratelimit.
              byHour[requestObject.day][requestObject.hour].ratelimitQty ++;
            } else {
              // not found
              byHour[requestObject.day][requestObject.hour].notfoundQty ++;
            }
          } else {
            // error.
            byHour[requestObject.day][requestObject.hour].errorQty ++;
          }

          // Duration
          if (!isNaN(requestObject.duration)) {
            byHour[requestObject.day][requestObject.hour]._durationTotal += requestObject.duration;
            byHour[requestObject.day][requestObject.hour].durationAvg = byHour[requestObject.day][requestObject.hour]._durationTotal/byHour[requestObject.day][requestObject.hour].totalQty;
            
            // Latency
            if (!isNaN(requestObject.upstreamTime)) {
              var latency = requestObject.duration - requestObject.upstreamTime;
              byHour[requestObject.day][requestObject.hour]._latencyTotal += latency;
              byHour[requestObject.day][requestObject.hour].latencyAvg = byHour[requestObject.day][requestObject.hour]._latencyTotal/byHour[requestObject.day][requestObject.hour].totalQty;
            }
          }
        } else {
          // Ignore line.
        }

        // Re-set write timeout.
        // Significa que tiene que pasar al menos 1 sec sin ningún nuevo record
        // para que se dispare el proceso que termina el processing. Hay mejores
        // formas de hacer esto. Pero así es simple y efectivo, y a su vez se
        // puede aprovechar la capacidad de procesamiento en paralelo de Node.
        if (writeTimeout) {
          clearTimeout(writeTimeout);
          writeTimeout = null;
        }
        writeTimeout = setTimeout(function () {
          // Construct finalData array.
          var finalData = [];          
          Object.keys(byHour).forEach(function (oneDateKey) {
            Object.keys(byHour[oneDateKey]).forEach(function (oneHourKey) {
              finalData.push(byHour[oneDateKey][oneHourKey]);
            });
          });

          // Write data to mongo
          var url = 'mongodb://'+process.env.MONGODB_HOST+':27017/meliproxy';
          
          // Use connect method to connect to the Server
          MongoClient.connect(url, function(err, db) {
            assert.equal(null,err);
            console.log("Connected correctly to server");

            // Get the documents collection
            var stats = db.collection('stats');

            // Remove all the records of stats collection.
            stats.remove({},function (err,numberRemoved) {
              console.log("Stats removed: " + numberRemoved);

              // Insert the new records.
              stats.insertMany(finalData, function(err, result) {
                assert.equal(err, null);
                assert.equal(finalData.length,result.result.n);

                // Inserted sucessfully.
                console.log("Inserted "+finalData.length+" documents into the document collection");

                // Close db connection.
                db.close();

                console.log("DONE");

                // Running end.
                running = false;

                // Set timeout to re-process in 1 second.
                if (reRunFlag) {
                  console.log("Setting timeout to reRun...");
                  timeout = setTimeout(aggregateLogs,1000);
                  reRunFlag = false;
                }
              });
            });            
          });
        },1000);
      });
    });
  });
}

// Initialize watcher.
var watcher = chokidar.watch('/logs/logs', {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  usePolling: true,
});

// Add event listeners.
watcher
  .on('add', aggregateLogs)
  .on('change', aggregateLogs)
  .on('unlink', aggregateLogs)
;

console.log("Waiting for fs changes");
aggregateLogs();
