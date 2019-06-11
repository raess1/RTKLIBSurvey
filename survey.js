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

function init(){
  elevationService = new google.maps.ElevationService();
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
});

