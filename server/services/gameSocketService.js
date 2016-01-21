'use strict';

var fs = require('fs');
const COUNTDOWN_SECONDS = 15;
const MAX_PLAYERS_PER_GAME = 5;
const GAME_MAX_SECONDS = 60;

let io = null;
let rooms = [];

let Room = function() {
    this.initRound(rooms.length);
    return this;
};

Room.prototype = {
    name: '',
    players: [],
    ticks: GAME_MAX_SECONDS,
    rank: 0,
    sentence: null,
    secondsRemaining: 0,
    hasPlayer: false,
    socket: null,
    gameStarted: false,
    index: 0,
    number: 0,

    initRound(roomNumber) {

        if (this.sentence) return;
        this.players = [];
        this.ticks = GAME_MAX_SECONDS;
        this.number = roomNumber;
        this.name = `room${roomNumber++}`;
        const obj = JSON.parse(fs.readFileSync('./data/sentences.json', 'utf8'));
        const idx = Math.floor((Math.random() * obj.length) + 1);
        this.sentence = (obj[idx]);
        io.sockets.to(this.name).emit('setSentence', this.sentence);
    },

    join(user) {
        this.players.push(user);
        if (this.secondsRemaining === 0) {
            this.secondsRemaining = COUNTDOWN_SECONDS;
            this.countdown(COUNTDOWN_SECONDS);
        }

        this.hasPlayer = true;
        this.updatePlayers();
    },

    countdown(sec) {
        io.sockets.to(this.name).emit('gameNotification', { seconds: this.secondsRemaining});
        setTimeout(() => {
            if (this.secondsRemaining > 0) {
                this.countdown(this.secondsRemaining--);
                this.gameStarted = false;
            } else {
                this.gameStarted = true;
                this.ticks = GAME_MAX_SECONDS;
                this.tick(this.ticks);
            }
        }, 1000);
    },
    updatePlayers() {
        console.log('updatePlayers 1');
        io.sockets.to(this.name).emit('updatePlayers', {
            players: this.players,
            sentence: this.sentence,
            roomNumber: this.number
        });

    },

    tick(sec) {
        setTimeout(() => {
            if (this.ticks > 0) {
                this.tick(this.ticks--);
            } else {
                this.gameOver();
            }
        }, 1000);
    },

    getSentence() {
        return this.sentence;
    },

    updatePercent(player) {
        let thisRank = 0;
        let pct = 0;
        for(let i = 0; i < this.players.length; i++) {
            pct = parseInt(this.players[i].percent);
            if ((pct < (100)) && (this.players[i].id === player.id)) {
                pct = player.percent;
                this.players[i].percent = pct;
                if (pct === 100) {
                    this.rank++;
                    thisRank = this.rank;
                    this.isGameOver();
                }
                io.sockets.to(this.name).emit('updatePlayer', {
                    id: player.id,
                    percent: pct,
                    rank: thisRank
                });
                break;
            }
        };
    },

    gameOver() {
        this.players = [];
        this.sentence = null;
        this.rank = 0;
        this.ticks = 0;

        io.sockets.to(this.name).emit('gameOver', {});
        //this.initRound();
    },

    isGameOver() {
        let hasIncompletePlayers = false;
        let hasTime = (this.ticks > 0);
        if (hasTime) {
            console.log(this.players.length);
            for(let i = 0; i < this.players.length; i++) {
                console.log(this.players[i].percent);
                if (this.players[i].percent < 100) {
                    hasIncompletePlayers = true;
                }
                break;
            }
        }
        if ((!hasIncompletePlayers) || (!hasTime)){
            //console.log(hasIncompletePlayers);
            //console.log(hasTime);
            this.gameOver();
        }
    },


    roundStart() {
        io.sockets.to(this.name).emit('startGame', {});
    }
};

const Controller = {

    getRoomToJoin() {
        let r = null;
        for (let x = 0; x < rooms.length; x++) {
            let room = rooms[x];
            if (room.players.length < MAX_PLAYERS_PER_GAME && !room.gameStarted) {
                r = room;
                break;
            }
        }
        if (!r) {
            r = new Room();
            rooms.push(r);
        }
        console.log(r.name);
        return r;
    }
};
/*

module.exports = (io) => {
    io = io;
    socket = io.socket;
    io.sockets.on('connection', (socket) => {
        console.log('a user connected');
        Controller.initRound();
        socket.on('join' , Controller.join);
        socket.on('getSentence', Controller.getSentence);
        socket.on('updatePercent' , Controller.updatePercent);
        socket.on('roundStart' , Controller.roundStart);
    });
};
*/
module.exports = (inout) => {
     io = inout;
     io.sockets.on('connection', (socket) => {
        console.log('a user connected');

        socket.on('join', (user) => {

            if (user.room) {
                io.socket.leave(user.room);
            }
            let room = Controller.getRoomToJoin();
            user.room = room.name;
            user.number = room.number;
            socket.username = user.name;
            socket.join(room.name);
            room.join(user);
        });

        //socket.on('join' , Controller.join);
        socket.on('getSentence', (user) => {
            rooms[user.number].getSentence();
        });
        socket.on('updatePercent' , (user) => {
            rooms[user.number].updatePercent(user);
        });
        socket.on('roundStart' , (user) => {
            rooms[user.number].roundStart();
        });
    });
};