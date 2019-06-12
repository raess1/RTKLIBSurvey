// GPS mapper 
// 1. install node:               apt-get install nodejs
// 2. install (in this path):     npm install
// 3. start with:                 node server.js
// 4. point your web browser to: http://localhost:3000


// choose NMEA input stream:
var useSerial = true;  // true=serial, false=tcp

// ---- case useSerial=true ------------------
var serialPort = 'COM19';
// var serialPort = '/dev/cu.usbserial';
// var serialPort = '/dev/ttyUSB0';
//var serialPort = '/dev/tty.usbserial';
//var serialPort = '/dev/tty.usbmodem1411';
var serialBaud = 9600;

// ---- case useSerial=false  ----------------
// 127.0.0.1  ,  185.112.115.234
var tcpIP = '185.112.115.234';
var tcpPort = 8001;

// choose GEOID model:
//geoidModel = 'egm2008-1.pgm';
geoidModel = 'egm2008-5.pgm';


var millis = 0;
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
//var cors = require('cors');
var net = require('net');

var Sylvester = require('sylvester');
var Kalman = require('kalman').KF;

const SerialPort = require('serialport');
const parsers = SerialPort.parsers;
var port = null;

if (useSerial){
  port = new SerialPort(serialPort, {
    baudRate: serialBaud
  });  
} else {
  port = new net.Socket();  
  port.connect(tcpPort, tcpIP, function() {
    console.log('Connected to server');
    // client.write('Hello, server! Love, Client.');
  });
  port.on('close', function() {
    console.log('Connection to server closed');
  }); 
} 

const parser = new parsers.Readline({
  delimiter: '\r\n'
});


port.pipe(parser);

var geoid = require('./geoid.js');
var geomodel = geoid.GEOID('./geoids/' + geoidModel);

// test point
var testheight = geoid.compute(geomodel, 58.299633, 14.271610, true);
console.log('testheight '+testheight + ' should be ~31');



var GPS = require('./gps.js');
var gps = new GPS;
var gpsPackets = 0;

// Simple Kalman Filter set up
var A = Sylvester.Matrix.I(2);
var B = Sylvester.Matrix.Zero(2, 2);
var H = Sylvester.Matrix.I(2);
var C = Sylvester.Matrix.I(2);
var Q = Sylvester.Matrix.I(2).multiply(1e-11);
var R = Sylvester.Matrix.I(2).multiply(0.00001);

// Measure
var u = $V([0, 0]);

var filter = new Kalman($V([0, 0]), $M([[1, 0], [0, 1]]));

gps.state.bearing = 0;
var prev = {lat: null, lon: null, alt: null};

gps.on('data', function(data) {

  if (data.lat && data.lon) {

    filter.update({
      A: A,
      B: B,
      C: C,
      H: H,
      R: R,
      Q: Q,
      u: u,
      y: $V([data.lat, data.lon])
    });
    
    if (prev.lat !== null && prev.lon !== null) {
      gps.state.bearing = GPS.Heading(prev.lat, prev.lon, gps.state.lat, gps.state.lon);
    }    

    gps.state.position = {
      cov: filter.P.elements,
      pos: [data.lat, data.lon, data.alt],
      geoheight: geoid.compute(geomodel, data.lat, data.lon, true),
      filterpos: filter.x.elements
    };
    prev.lat = gps.state.lat;
    prev.lon = gps.state.lon;
    prev.alt = gps.state.alt;
  }

  // send to client...
  io.emit('position', gps.state);  
});

// some HTTP GET request...
app.get('/*', function(req, res) {
  console.log('GET ' + req.originalUrl);    
  if (['/css/style.css', '/survey.js'].indexOf(req.originalUrl) >= 0) {
    res.sendFile(__dirname + req.originalUrl);
  } else res.sendFile(__dirname + '/maps.html');
});

// web server...
http.listen(3000, function() {
  console.log('listening on *:3000');
});

// incoming GPS data...
parser.on('data', function(data) {
  gpsPackets++;
  if (Date.now() > millis){
    millis = Date.now() + 10000;
    console.log('GPS data packets:' + gpsPackets);
    gpsPackets = 0;
  }
  gps.update(data);
  //console.log(data);
});


