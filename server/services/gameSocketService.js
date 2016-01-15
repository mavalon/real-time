'use strict';

var fs = require('fs');
const COUNTDOWN_SECONDS = 15;

let socket = null;
let hasPlayer = false;
let secondsRemaining = 0;
let players = [];
let rank = 0;
let sentence = null;
let ticks = 30;

const Controller = {

    join(user) {
        players.push(user);
        if (secondsRemaining === 0) {
            secondsRemaining = COUNTDOWN_SECONDS;
            Controller.countdown(COUNTDOWN_SECONDS);
        }

        hasPlayer = true;
        Controller.updatePlayers();
    },

    roundStart() {
        socket.emit('startGame', {});
    },

    countdown(sec) {
        socket.emit('gameNotification', { seconds: secondsRemaining});
        setTimeout(() => {
            if (secondsRemaining > 0) {
                Controller.countdown(secondsRemaining--);
            } else {
                ticks = 60;
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
            Controller.gameOver();
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
        setTimeout(() => {
            if (ticks > 0) {
                Controller.tick(ticks--);
            } else {
                Controller.gameOver();
            }
        }, 1000);
    },

    gameOver() {
        players = [];
        sentence = null;
        rank = 0;
        socket.emit('gameOver', {});
        Controller.initRound();
    }
};

module.exports = (io) => {
    socket = io;
    io.on('connection', (socket) => {
        console.log('a user connected');
        Controller.initRound();
        socket.on('join' , Controller.join);
        socket.on('getSentence', Controller.getSentence);
        socket.on('updatePercent' , Controller.updatePercent);
        socket.on('roundStart' , Controller.roundStart);
    });
};