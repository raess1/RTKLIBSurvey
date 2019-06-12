// https://github.com/mousebird/proj-4/blob/master/nad/epsg
// http://proj4js.org/
// EPSG:3008  point  195240.674000,6464900.761000,106.602000
// WGS84 point  -183787.7437806396,5804383.10366167,159.5
proj4.defs([
  [ 'EPSG:3008', '+proj=tmerc +lat_0=0 +lon_0=13.5 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs <>'],              
]);

var socket = io();
var map = null;
var gstate = {
    time: 0,
    lat: 0,
    lng: 0,
    alt: 0,  // sea-level
    geoidal: 0,  // difference geoidal to sea-level
};
var gpsMarker = null;
var points =  [];               
var markers = [];
var doFollow = false;
var gpsPointCounter = 0;            
var elevationService = null;
//google.setOnLoadCallback(init);

//Width and height
var width = 500;
var barHeight = 100;
var padding = 1;
var dataset = [];
//Create SVG elements
var centerX = 80;
var centerY = 80;
var path1 = [];
var path2 = [];
var start = 270; // °
var end = -10; // °
var startH = 0;
var endH = 45;
var stepH = 5;
var n = endH - startH;
var speed = 0;
var direction=null;
var shadowSpeed=null;
var steps=null;
var textSpeed=null;
var circleSpeed=null;
var satsGroup=null;
var svgSky= null;
var svgSat=null;
var svgSpeed=null;


function init(){
  elevationService = new google.maps.ElevationService();
}

function elevationToRadius(e) {
  // Degrees:
  // 0° has radius of 110
  // 90° has radius of 0
  return 110 * (1 - e / 90);
}

function speedAngle(i) {
  return end + (Math.min(i, endH) - endH) / (startH - endH) * (start - end);
}

function arc(x, y, radius, startAngle, endAngle) {
  var start = {
    x: x + (radius * Math.cos(endAngle * Math.PI / 180)),
    y: y - (radius * Math.sin(endAngle * Math.PI / 180))
  };

  var end = {
    x: x + (radius * Math.cos(startAngle * Math.PI / 180)),
    y: y - (radius * Math.sin(startAngle * Math.PI / 180))
  };

  var a = startAngle - endAngle > 180 ? 1 : 0;
  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, a, 0, end.x, end.y
  ].join(" ");
}


function updateSpeed(data) {
  var speed = data.speed;
  textSpeed.text(speed);
  direction
          .style("transform", "translate(" + centerX + "px," + centerY + "px)rotate(" + data.bearing + "deg)");
  circleSpeed
          .attr("cx", centerX + Math.cos(speedAngle(speed) / 180 * Math.PI) * 72)
          .attr("cy", centerY - Math.sin(speedAngle(speed) / 180 * Math.PI) * 72);
  shadowSpeed
          .attr("d", arc(centerX, centerY, 72, start, speedAngle(speed)))
          .attr("stroke", "rgba(0, 220, 255, " + (speed / (endH - startH)) + ")");
}

function updateSatellite(data) {
  var rect = svgSat.selectAll("rect")
          .data(data.satsVisible);
  var text = svgSat.selectAll("text")
          .data(data.satsVisible);
  rect
          .enter()
          .append("rect");
  rect
          .enter()
          .append("text");
  rect
          .attr("x", function(d, i) {
            return i * (width / data.satsVisible.length);
          })
          .attr("y", function(d) {
            var v = d.snr || 0;
            return barHeight - (v * 4);
          })
          .attr("width", width / data.satsVisible.length - padding)
          .attr("height", function(d) {
            var v = d.snr || 0;
            return v * 4;
          })
          .attr("fill", function(d) {
            var v = d.snr || 0;
            if (-1 !== data.satsActive.indexOf(d.prn)) {
              return "rgb(0, 0, " + (v * 10 | 0) + ")";
            }
            return "rgb(" + (v * 10 | 0) + ", 0, 0)";
          });
  text
          .attr("x", function(d, i) {
            return 15 + i * (width / data.satsVisible.length);
          })
          .attr("y", barHeight + 20)
          .text(function(d) {
            return d.prn;
          })
          .attr("fill", "black");
  rect
          .exit()
          .remove();
  text
          .exit()
          .remove();
}

function updateSkyView(data) {
  satsGroup.selectAll("circle")
          .data(data.satsVisible)
          .enter()
          .append("circle")
          .attr("cx", function(d, i) {
            return 125 + Math.cos(d.azimuth / 180 * Math.PI - Math.PI / 2) * elevationToRadius(d.elevation);
          })
          .attr("cy", function(d, i) {
            return 125 + Math.sin(d.azimuth / 180 * Math.PI - Math.PI / 2) * elevationToRadius(d.elevation);
          })
          .attr("r", 5)
          .attr("fill", function(d) {
            var v = d.snr || 0;
            if (-1 !== data.satsActive.indexOf(d.prn)) {
              return "rgb(0, 0, " + (v * 10 | 0) + ")";
            }
            return "rgb(" + (v * 10 | 0) + ", 0, 0)";
          })
          .append("title")
          .text(function(d, i) {
            return d.prn;
          });
}


function updateTable(state) {
  $("#tdate").text(state.time);
  $("#tlat").text(state.lat);
  $("#tlon").text(state.lon);
  $("#talt").text(state.alt);
  $("#tspeed").text(state.speed);
  $("#tstatus").text(state.fix);
  $("#tpdop").text(state.pdop);
  $("#tvdop").text(state.vdop);
  $("#thdop").text(state.hdop);
  $("#tactive").text(state.satsActive.length);
  $("#tview").text(state.satsVisible.length);
}

  
function initMap() {                          
  // https://developers.google.com/maps/documentation/javascript/examples/marker-labels
  map = new google.maps.Map(document.getElementById('map'), {
    center: gstate,
    zoom: 20,                
  });                          

  gpsMarker = new google.maps.Marker({
    position: gstate,
    map: map,
    title: 'Your Position',
    label: '',
    icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
    zIndex: google.maps.Marker.MAX_ZINDEX+1,
  });

  /*
  var ellipse = new google.maps.Polygon({
    paths: [],
    strokeColor: 'black',
    strokeOpacity: 0.9,
    strokeWeight: 1,
    fillColor: 'red',
    fillOpacity: 0.3,
    map: map
  });*/

  socket.on('position', function(state) {
    updateSpeed(state);
    updateSatellite(state);
    updateTable(state);
    updateSkyView(state);
    gstate.time = state.time;
    gstate.lat = state.position.pos[0];
    gstate.lng = state.position.pos[1];
    gstate.alt = state.alt;      
    gstate.geoidal = state.geoidal;    
    //console.log('GPS '+JSON.stringify(state));              
    // ellipse.setPaths(path);                
    if ((gpsPointCounter==0) || (doFollow)) map.setCenter(gstate);
    gpsMarker.setPosition(gstate);
    s = state.fix;
    s += ' ' + state.quality || '';
    //if (state.pdop) s += ', pdop: '+state.pdop;
    $("#state").text(s);
    $("#time").text(gstate.time);                
    $("#lat").text(gstate.lat.toFixed(7));                
    $("#lon").text(gstate.lng.toFixed(7));                
    s = 'height: ' + gstate.alt.toFixed(2)                
    //gstate.alt = (gstate.alt-state.position.geoheight).toFixed(2);
    s += ' Geoidal separation: '+gstate.geoidal;                
    $("#alt").text(s);                                                              
    $("#speed").text(state.speed.toFixed(2));                
    gpsPointCounter++;
  });
}

function removeMarker(marker){
  var idx = markers.indexOf(marker);
  if (idx < 0) return;
  console.log('removePoint '+idx);
  markers[idx].setMap(null);
  points.splice(idx,1);              
  markers.splice(idx,1);
  s = '';
  coords = $("#coords").val();
  for (i = 0; i < points.length; i++){
    point = points[i];
    prj = proj4('WGS84',coords, [point.lng,point.lat]);               
    point.lng = prj[0];              
    point.lat = prj[1];              
    s += point.lng
      + "," + point.lat
      + "," + point.alt
      + '\r\n';
  }
  $('#data').val(s);
  dataToMarkers();
}

function dataToMarkers(){
  for (i= 0; i < markers.length; i++){
     markers[i].setMap(null);
  }
  points = [];
  markers = [];
  coords = $("#coords").val();
  var ks = $('#data').val().split("\n");
  for (i = 0; i < ks.length; i++){
      //console.log(ks[i]);
      var vals = ks[i].split(",");                                    
      if (vals.length != 3) continue;
      var point = {lng: parseFloat(vals[0]), lat: parseFloat(vals[1]), alt: parseFloat(vals[2])};
      prj = proj4(coords,'WGS84', [point.lng,point.lat]);               
      point.lng = prj[0];
      point.lat = prj[1];                  
      console.log('updateMarker '+JSON.stringify(point));                                
      var marker = new google.maps.Marker({
        position: point,
        map: map,
        title: (points.length+1).toString(),
        label: (points.length+1).toString(),                                    
      });              
      google.maps.event.addListener(marker, 'rightclick', function(event) {
        removeMarker(this);
      });             
      //marker.setPosition(point);                                              
      points.push(point);
      markers.push(marker);
  }
}


function addPoint(){                            
  var point = {lat:gstate.lat, lng:gstate.lng, alt:gstate.alt};                           
  coords = $("#coords").val();
  console.log('addPoint '+JSON.stringify(point));              
  prj = proj4('WGS84',coords, [point.lng,point.lat]);               
  point.lng = prj[0];              
  point.lat = prj[1];              
  //console.log('projected '+JSON.stringify(point));              
  s = point.lng
  + "," + point.lat
  + "," + point.alt
  + '\r\n';
  if (($('#data').val().length > 0) && (!$('#data').val().endsWith('\n')))
    s = '\n' +s;
  $('#data').val($('#data').val()+s);               
  dataToMarkers();
}

$("#data").on('change keyup paste', function() {
   console.log('textarea paste');               
   dataToMarkers();               
   map.setCenter(points[0]);
});

$("#coords").on('change', function() {
   console.log('coords change');
   dataToMarkers();               
   map.setCenter(points[0]);
});

function toggleFollow(){
  doFollow = !doFollow;
  if (doFollow){
    $("#toggleFollow").text("Follow ON");
  } else {
    $("#toggleFollow").text("Follow OFF");
  }               
}

$(document).ready(function(){
  console.log('ready');   
  var mySelect = $('#coords');
  $.each(proj4.defs, function(val, text) {
    //console.log('coord '+val);
    mySelect.append(
      $('<option></option>').val(val).html(val)
    );
  });              
  
  svgSky = d3.select("body")
        .append("svg")
        .attr("width", 250)
        .attr("height", 250);
  svgSat = d3.select("body")
        .append("svg")
        .attr("width", width)
        .attr("height", barHeight + 50)
        .append("g");
  svgSpeed = d3.select("body")
        .append("svg")
        .style("position", "fixed")
        .style("right", "10px")
        .style("bottom", "10px")
        .attr("width", 160)
        .attr("height", 160)
        .append("g");

  
  for (var i = 0; i <= n; i++) {
    var alpha = (end + start - speedAngle(i)) / 180 * Math.PI;
    var path = path2;
    var r = 4;

    if (i % 5 === 0) {

      path = path1;
      r = 7;

      svgSpeed.append("text")
              .attr("x", centerX + Math.cos(alpha) * 60 - 5)
              .attr("y", centerY - Math.sin(alpha) * 60 + 5)
              .attr("font-weight", "bold")
              .attr("font-size", "10px")
              .text(endH - i);
    }

    path.push("M");
    path.push(centerX + Math.cos(alpha) * (r + 70));
    path.push(centerY - Math.sin(alpha) * (r + 70));
    path.push("L");
    path.push(centerX + Math.cos(alpha) * 70);
    path.push(centerY - Math.sin(alpha) * 70);
  }
  

  shadowSpeed = svgSpeed.append("path")
          .attr("d", arc(centerX, centerY, 72, start, speedAngle(speed)))
          .attr("fill", "none")
          .style("stroke-width", "3")
          .attr("stroke", "rgba(0, 220, 255, 0)");

  svgSpeed.append("path")
          .attr("d", path1.join(" "))
          .attr("fill", "none")
          .style("stroke-width", "2")
          .attr("stroke", "black");

  svgSpeed.append("path")
          .attr("d", path2.join(" "))
          .attr("fill", "none")
          .attr("stroke", "black");

  direction = svgSpeed.append("path")
          .attr("d", [
            "M", Math.cos(Math.PI / 2 + Math.PI) * 5, -Math.sin(Math.PI / 2 + Math.PI) * 5,
            "L", Math.cos(Math.PI / 4 + Math.PI) * 15, -Math.sin(Math.PI / 4 + Math.PI) * 15,
            "L", Math.cos(Math.PI / 2) * 20, -Math.sin(Math.PI / 2) * 20,
            "L", Math.cos(-Math.PI / 4) * 15, -Math.sin(-Math.PI / 4) * 15,
            "Z"
          ].join(" "))
          .style("transform", "translate(" + centerX + "px," + centerY + "px)")
          .attr("fill", "#c00")
          .attr("stroke", "none");

  circleSpeed = svgSpeed.append("circle")
          .attr("r", 4)
          .attr("cx", centerX + Math.cos(speedAngle(speed) / 180 * Math.PI) * 72)
          .attr("cy", centerY - Math.sin(speedAngle(speed) / 180 * Math.PI) * 72)
          .attr("fill", "white")
          .style("stroke-width", 2)
          .attr("stroke", "black");

  textSpeed = svgSpeed.append("text")
          .attr("x", 90)
          .attr("y", 140)
          .attr("font-weight", "bold")
          .attr("font-size", "30px")
          .attr("fill", "black")
          .text(speed);

  svgSpeed.append("text")
          .attr("x", 95)
          .attr("y", 155)
          .attr("font-weight", "bold")
          .attr("font-size", "13px")
          .attr("fill", "black")
          .text("kph");

  svgSpeed.append("text")
          .attr("x", centerX - 30 - 4)
          .attr("y", centerY + 4)
          .attr("font-weight", "bold")
          .attr("font-size", "13px")
          .attr("fill", "black")
          .text("W");

  svgSpeed.append("text")
          .attr("x", centerX + 30 - 4)
          .attr("y", centerY + 4)
          .attr("font-weight", "bold")
          .attr("font-size", "13px")
          .attr("fill", "black")
          .text("E");

  svgSpeed.append("text")
          .attr("x", centerX - 4)
          .attr("y", centerY - 30 + 3)
          .attr("font-weight", "bold")
          .attr("font-size", "13px")
          .attr("fill", "black")
          .text("N");

  svgSpeed.append("text")
          .attr("x", centerX - 4)
          .attr("y", centerY + 30 + 7)
          .attr("font-weight", "bold")
          .attr("font-size", "13px")
          .attr("fill", "black")
          .text("S");


  for (var i = 0; i < 90; i += 30) {
    svgSky.append("circle")
            .attr("cx", 125)
            .attr("cy", 125)
            .attr("r", elevationToRadius(i))
            .attr("fill", "none")
            .attr("stroke", "black");
    svgSky.append("text")
            .attr("x", elevationToRadius(i + 30) + 123)
            .attr("y", 125 + 9)
            .attr("fill", "black")
            .attr("text-anchor", "end")
            .attr("font-size", "8")
            .text((30 + i) + "°");
  }

  svgSky.append("line")
          .attr("x1", 125)
          .attr("y1", 125 - elevationToRadius(30))
          .attr("x2", 125)
          .attr("y2", 125 + elevationToRadius(30))
          .attr("stroke", "black");
  svgSky.append("line")
          .attr("x1", 125 - elevationToRadius(30))
          .attr("y1", 125)
          .attr("x2", 125 + elevationToRadius(30))
          .attr("y2", 125)
          .attr("stroke", "black");

  steps = 36;

  for (var i = 0; i < steps; i++) {
    var alpha = (i / steps - 90 / 360) * Math.PI * 2;
    var L = i % 3 === 0 ? 15 : 5;
    svgSky.append("line")
            .attr("x1", Math.cos(alpha) * 110 + 125)
            .attr("y1", Math.sin(alpha) * 110 + 125)
            .attr("x2", Math.cos(alpha) * (110 - L) + 125)
            .attr("y2", Math.sin(alpha) * (110 - L) + 125)
            .attr("stroke", "black");
    if (i % 3 == 0)
      svgSky.append("text")
              .attr("x", Math.cos(alpha) * 118 + 125)
              .attr("y", Math.sin(alpha) * 118 + 125 + 4)
              .attr("fill", "black")
              .attr("text-anchor", "middle")
              .attr("font-size", "8")
              .text(Math.round(90 + alpha / Math.PI * 180) + "°");
  }
  satsGroup = svgSky.append("g");

  

});

