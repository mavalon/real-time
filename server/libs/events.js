'use strict';

let game = require('./game');

/*
 var redis = require('redis');
 var sub = redis.createClient();
 var pub = redis.createClient();

 sub.subscribe('chat');
 */

module.exports = function(io) {

    //io = inout;

    // user connects
    io.sockets.on('connection', (socket) => {
        console.log('a user connected');

        // new player joins the game
        socket.on('join', (user) => {

            // leave existing rooms (only one game at a time)
            if (user.room) {
                io.socket.leave(user.room);
            }
            let room = game.getRoomToJoin();
            user.room = room.state.name;
            user.number = room.state.number;
            socket.username = user.name;
            socket.join(room.state.name);
            room.join(user);
        });

        // user pressed key, update his progress
        socket.on('updatePercent' , (user) => {
            rooms[user.number].updatePercent(user);
        });

    });

}

