'use strict';

const COUNTDOWN_SECONDS = 15;
const MAX_PLAYERS_PER_GAME = 5;
const GAME_MAX_SECONDS = 60;

let fs = require('fs');
let io = null;
let rooms = [];

// each game play is a room
let Room = function() {
    this.initRound(rooms.length);
    return this;
};

Room.prototype = {

    socket: null,
    state: {
        name: '',
        players: [],
        ticks: GAME_MAX_SECONDS,
        rank: 0,
        sentence: null,
        secondsRemaining: 0,
        //hasPlayer: false,
        gameStarted: false,
        //index: 0,
        number: 0
    },

    initRound(roomNumber) {

        if (this.state.sentence) return;
        this.state.players = [];
        this.state.ticks = GAME_MAX_SECONDS;
        this.state.number = roomNumber;
        this.state.name = `room${roomNumber++}`;
        const obj = JSON.parse(fs.readFileSync('./data/sentences.json', 'utf8'));
        const idx = Math.floor((Math.random() * obj.length) + 1);
        this.state.sentence = (obj[idx]);
        io.sockets.to(this.state.name).emit('setSentence', this.state.sentence);
    },

    join(user) {
        this.state.players.push(user);
        if (this.state.secondsRemaining === 0) {
            this.state.secondsRemaining = COUNTDOWN_SECONDS;
            this.countdown(COUNTDOWN_SECONDS);
        }

        //this.state.hasPlayer = true;
        this.updatePlayers();
    },

    countdown(sec) {
        if (sec===COUNTDOWN_SECONDS)
        {
            io.sockets.emit('broadcastGame', { seconds: sec});
        }
        io.sockets.to(this.state.name).emit('broadcastCountdown', { seconds: this.state.secondsRemaining});
        setTimeout(() => {
            if (this.state.secondsRemaining > 0) {
                this.countdown(this.state.secondsRemaining--);
                this.state.gameStarted = false;
            } else {
                this.state.gameStarted = true;
                this.state.ticks = GAME_MAX_SECONDS;
                this.tick(this.state.ticks);
            }
        }, 1000);
    },
    updatePlayers() {
        console.log('updatePlayers 1');
        io.sockets.to(this.state.name).emit('updatePlayers', {
            players: this.state.players,
            sentence: this.state.sentence,
            roomNumber: this.state.number
        });

    },

    tick(sec) {
        setTimeout(() => {
            if (this.state.ticks > 0) {
                this.tick(this.state.ticks--);
            } else {
                this.gameOver();
            }
        }, 1000);
    },

    getSentence() {
        return this.state.sentence;
    },

    updatePercent(player) {
        let thisRank = 0;
        let pct = 0;
        let players = this.state.players;
        for(let i = 0; i < players.length; i++) {
            pct = parseInt(players[i].percent);
            if ((pct < (100)) && (players[i].id === player.id)) {
                pct = player.percent;
                this.state.players[i].percent = pct;
                if (pct === 100) {
                    this.state.rank++;
                    thisRank = this.state.rank;
                    this.isGameOver();
                }
                io.sockets.to(this.state.name).emit('updatePlayer', {
                    id: player.id,
                    percent: pct,
                    rank: thisRank
                });
                break;
            }
        };
    },

    gameOver() {
        this.state.players = [];
        this.state.sentence = null;
        this.state.rank = 0;
        this.state.ticks = 0;

        io.sockets.to(this.state.name).emit('gameOver', {});
    },

    isGameOver() {
        let hasIncompletePlayers = false;
        let hasTime = (this.state.ticks > 0);
        if (hasTime) {
            console.log(this.state.players.length);
            for(let i = 0; i < this.state.players.length; i++) {
                console.log(this.state.players[i].percent);
                if (this.state.players[i].percent < 100) {
                    hasIncompletePlayers = true;
                }
                break;
            }
        }
        if ((!hasIncompletePlayers) || (!hasTime)){
            this.gameOver();
        }
    },


    roundStart() {
        io.sockets.to(this.state.name).emit('startGame', {});
    }

};

const Controller = {

    getRoomToJoin() {
        let r = null;
        for (let x = 0; x < rooms.length; x++) {
            let room = rooms[x];
            if (room.state.players.length < MAX_PLAYERS_PER_GAME && !room.state.gameStarted) {
                r = room;
                break;
            }
        }
        if (!r) {
            r = new Room();
            rooms.push(r);
        }
        console.log(r.state.name);
        return r;
    }
};

module.exports = (inout) => {
     io = inout;
     io.sockets.on('connection', (socket) => {
        console.log('a user connected');

        socket.on('join', (user) => {

            if (user.room) {
                io.socket.leave(user.room);
            }
            let room = Controller.getRoomToJoin();
            user.room = room.state.name;
            user.number = room.state.number;
            socket.username = user.name;
            socket.join(room.state.name);
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