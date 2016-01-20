'use strict';
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();
var http		= require('http').Server(app);
var io			= require('socket.io')(http);
let gameService = require('./server/services/gameSocketService');
let joinLeaveRoom = require('./server/services/joinLeaveRooms');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});
//Initialize the socket service through the http protocol and pass it into gameService to be configured.
gameService(io);
joinLeaveRoom(io);


http.listen(3001, function(){
    console.log('listening on *:3001');
});
/*
// create the socket.io handlers
io.on('connect', function(socket) {

    // if there are already two players connected, tell the user that the server is full
    if (numberOfPlayers == 2) {
        socket.emit('serverFull', {});
        return;
    }

    var playerIndex = numberOfPlayers++;

    // right upon connecting, tell the player whether they're the left or right player (0 or 1)
    socket.emit('identity', { playerIndex: playerIndex });

    // when the player requests to be moved...
    socket.on('moveRequest', function(data) {
        playerCoordinates[playerIndex].x = data.x;
        playerCoordinates[playerIndex].y = data.y;
    });

    // if this is the second player connecting, let's start the game
    if (numberOfPlayers == 2) {
        io.emit('startGame', {}); // let all connected players know that the game has started
        var tickInterval = setInterval(function() {
            moveBall();
        }, 16);
    }

});
*/
module.exports = app;
