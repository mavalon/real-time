'use strict';

var fs = require('fs');
const COUNTDOWN_SECONDS = 15;
const GAME_MAX_SECONDS = 30;
const MAX_PLAYERS_PER_GAME = 5;

let socket = null;
let hasPlayer = false;
let secondsRemaining = 0;
let players = [];
let rank = 0;
let sentence = null;
let ticks = GAME_MAX_SECONDS;

let roomNumber = 1;

let currentRoom = 'room_1';

let rooms = [];
let usernames = [];

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

module.exports = (io) => {
    socket = io;
    io.on('connection', (socket) => {
        console.log('a user connected');

        socket.on('join', (user) => {

            let room = Controller.getRoomToJoin();
            user.room = room;
            socket.username = user.name;
            socket.join(room.name);
            room.join(user);
        });

        //socket.on('join' , Controller.join);
        socket.on('getSentence', (user) => {
            rooms[user.number].getSentence();
        });
        socket.on('updatePercent' , (user) => {
            rooms[user.number].updatePercent();
        });
        socket.on('roundStart' , (user) => {
            rooms[user.number].roundStart();
        });
    });
};

var Room = function() {
    this.initRound();
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

    join(user) {
        this.players.push(user);
        //const rm = players.room;
        //usernames[user.name] = user.name;
        if (this.secondsRemaining === 0) {
            this.gameStarted = false;
            this.secondsRemaining = COUNTDOWN_SECONDS;
            this.countdown(COUNTDOWN_SECONDS);
        }

        this.hasPlayer = true;
        this.updatePlayers(user);
    },

    updatePlayers(user) {
        console.log('updatePlayers 1');
        socket.to(this.name).emit('updatePlayers', {
            players: this.players,
            sentence: this.sentence,
            room: this.number
        });

    },
    countdown(sec) {
        let _self = this;
        socket.emit('gameNotification', { seconds: _self.secondsRemaining});
        setTimeout(() => {
            if (_self.secondsRemaining > 0) {
                _self.countdown(_self.secondsRemaining--);
                _self.gameStarted = false;
            } else {
                _self.ticks = GAME_MAX_SECONDS;
                _self.tick(_self.ticks);
                _self.gameStarted = true;
            }
        }, 1000);
    },

    initRound(roomNumber) {

        this.name = `room${roomNumber++}`;
        this.number = roomNumber;

        if (this.sentence) return;
        const obj = JSON.parse(fs.readFileSync('./data/sentences.json', 'utf8'));
        const idx = Math.floor((Math.random() * obj.length) + 1);
        this.sentence = (obj[idx]);
        socket.to(this.name).emit('setSentence', sentence);
    },

    isGameOver() {
        let hasIncompletePlayers = false;
        let hasTime = (this.ticks > 0);
        if (hasTime) {
            //console.log(players.length);
            for(let i = 0; i < this.players.length; i++) {
                //console.log(this.players[i].percent);
                if (this.players[i].percent < 100) {
                    hasIncompletePlayers = true;
                }
                break;
            }
        }
        if ((!hasIncompletePlayers) || (!hasTime)){
            //console.log(hasIncompletePlayers);
            //console.log(hasTime);
            this.gameOver(`Game Over`);
        }
    },
    gameOver(message) {
        this.players = [];
        this.sentence = null;
        this.rank = 0;
        socket.to(this.name).emit('gameOver', {message: message});
        this.initRound();
    },

    tick(sec) {
        let _self = this;
        setTimeout(() => {
            if (_self.ticks > 0) {
                _self.ticks--;
                _self.tick(ticks);
            } else {
                _self.gameOver(`Time's up!`);
            }
        }, 1000);
    },

    roundStart(user) {
        socket.to(this.name).emit('startGame', {});
    },


    updatePercent() {
        let thisRank = 0;
        let pct = 0;
        //const rm = this.room;
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
                socket.to(this.name).emit('updatePlayer', {
                    id: player.id,
                    percent: pct,
                    rank: thisRank
                });
                break;
            }
        };
    },


    getSentence() {
        return this.sentence;
    }
}