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

    join(user) {
        players.push(user);
        //usernames[user.name] = user.name;
        if (secondsRemaining === 0) {
            secondsRemaining = COUNTDOWN_SECONDS;
            Controller.countdown(COUNTDOWN_SECONDS);
        }

        hasPlayer = true;
        Controller.updatePlayers(user);
    },

    roundStart() {
        socket.emit('startGame', {});
    },

    countdown(sec) {
        socket.emit('gameNotification', { seconds: secondsRemaining});
        global.setTimeout(() => {
            if (secondsRemaining > 0) {
                Controller.countdown(secondsRemaining--);
            } else {
                ticks = GAME_MAX_SECONDS;
                Controller.tick(ticks);
            }
        }, 1000);
    },

    updatePlayers() {
        console.log('updatePlayers 1');
        socket.emit('updatePlayers', {
            players: players,
            sentence: sentence
        });

    },

    updatePercent(player) {
        let thisRank = 0;
        let pct = 0;
        for(let i = 0; i < players.length; i++) {
            pct = parseInt(players[i].percent);
            if ((pct < (100)) && (players[i].id === player.id)) {
                pct = player.percent;
                players[i].percent = pct;
                if (pct === 100) {
                    rank++;
                    thisRank = rank;
                    Controller.isGameOver();
                }
                socket.emit('updatePlayer', {
                    id: player.id,
                    percent: pct,
                    rank: thisRank
                });
                break;
            }
        };
    },

    isGameOver() {
        let hasIncompletePlayers = false;
        let hasTime = (ticks > 0);
        if (hasTime) {
            console.log(players.length);
            for(let i = 0; i < players.length; i++) {
                console.log(players[i].percent);
                if (players[i].percent < 100) {
                    hasIncompletePlayers = true;
                }
                break;
            }
        }
        if ((!hasIncompletePlayers) || (!hasTime)){
            //console.log(hasIncompletePlayers);
            //console.log(hasTime);
            Controller.gameOver(`Game Over`);
        }
    },

    initRound() {
        if (sentence) return;
        const obj = JSON.parse(fs.readFileSync('./data/sentences.json', 'utf8'));
        const idx = Math.floor((Math.random() * obj.length) + 1);
        sentence = (obj[idx]);
        socket.emit('setSentence', sentence);
    },

    getSentence() {
        return sentence;
    },

    tick(sec) {
        global.setTimeout(() => {
            if (ticks > 0) {
                ticks--;
                Controller.tick(ticks);
            } else {
                Controller.gameOver(`Time's up!`);
            }
        }, 1000);
    },

    gameOver(message) {
        players = [];
        sentence = null;
        rank = 0;
        socket.emit('gameOver', {message: message});
        Controller.initRound();
    },
    getRoomToJoin() {
        let r = null;
        for (let x = 0; x < rooms.length; x++) {
            let room = rooms[x];
            if (room.players.length < MAX_PLAYERS_PER_GAME && !room.gameStarted) {
                r = room;
                break;
            }
        }
        if (!r) r = new Room();
        return r;
    }
};

module.exports = (io) => {
    socket = io;
    io.on('connection', (socket) => {
        console.log('a user connected');
        Controller.initRound();

        let room = Controller.getRoomToJoin();

        socket.on('join', (user) => {

            user.room = room;
            socket.username = user.name;
            socket.join(room.name);
            Controller.join(user);
        });

        //socket.on('join' , Controller.join);
        socket.on('getSentence', Controller.getSentence);
        socket.on('updatePercent' , Controller.updatePercent);
        socket.on('roundStart' , Controller.roundStart);
    });
};

var Room = () => {
    this.name = `room${roomNumber++}`;
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
    gameStarted: false
}