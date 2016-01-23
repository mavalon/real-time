'use strict';

const COUNTDOWN_SECONDS = 15;
const MAX_PLAYERS_PER_GAME = 5;
const GAME_MAX_SECONDS = 60;

let util = require('../libs/utility');
let fs = require('fs');
let io = null;
let rooms = [];
let redis = null;

// each game play is a room
let Room = function(id) {

    // initialize with new index
    this.initRound(id);
    return this;

};

const Game = {

    defaultState(number) {
        let state = {
            name: `game${number}`,
            players: [],
            ticks: GAME_MAX_SECONDS,
            rank: 0,
            sentence: null,
            secondsRemaining: 0,
            gameStarted: false,
            number: number
        }
        return state;
    },

    gameKey(gameId) {
        return `game:${gameId}`;
    },

    setSentence(gameState) {
        const obj = JSON.parse(fs.readFileSync('./data/sentences.json', 'utf8'));
        const idx = Math.floor((Math.random() * obj.length) + 1);
        let sentence = (obj[idx]);

        gameState.sentence = sentence;
        // broadcast to current room
        io.sockets.to(gameState.name).emit('setSentence', sentence);
        return JSON.stringify(sentence);
    },

    gamePlayerKey(user) {
        return `game:${user.number}:player:${user.id}`;
    },

    join(user, add, gameState) {

        // todo: check if user exists in list before adding
        //let _self = this;

        // add user to list of players
        Controller.setUser(add, user, user.number, function(err, added) {

            if (added) {
                //gameState.state.players.push(user);
            }
            // start countdown if first player in the room
            if (gameState.secondsRemaining === 0) {
                gameState.secondsRemaining = COUNTDOWN_SECONDS;
                gameState.countdown(COUNTDOWN_SECONDS);
            }

            //broadcast all players to all players
            //gameState.updatePlayers();

            Controller.getGamePlayer(user, function(err, res) {
                console.log(res);
            });
        });

    }

};

Room.prototype = {

    socket: null,

    // game state
    state: {
        name: '',
        players: [],
        ticks: GAME_MAX_SECONDS,
        rank: 0,
        sentence: null,
        secondsRemaining: 0,
        gameStarted: false,
        number: 0
    },

    // initialize game
    initRound(roomNumber) {

        if (this.state.sentence) return;
        let _self = this;

        _self.state.players = [];
        _self.state.ticks = GAME_MAX_SECONDS;
        _self.state.number = roomNumber;

        //todo: get new room name
        _self.state.name = `room${roomNumber}`;

        // todo: get sentence from database
        // currently pulling random sentence from json file
        const obj = JSON.parse(fs.readFileSync('./data/sentences.json', 'utf8'));
        const idx = Math.floor((Math.random() * obj.length) + 1);
        _self.state.sentence = (obj[idx]);

        // broadcast to current room
        io.sockets.to(_self.state.name).emit('setSentence', _self.state.sentence);

    },

    // new user joins room/game
    join(user, add) {

        // todo: check if user exists in list before adding
        let _self = this;

        // add user to list of players
        Controller.setUser(add, user, this.state.number, function(err, added) {

            if (added) {
                _self.state.players.push(user);
            }
            // start countdown if first player in the room
            if (_self.state.secondsRemaining === 0) {
                _self.state.secondsRemaining = COUNTDOWN_SECONDS;
                _self.countdown(COUNTDOWN_SECONDS);
            }

            //broadcast all players to all players
            _self.updatePlayers();

            Controller.getGamePlayer(user, function(err, res) {
                console.log(res);
            });
        });

    },

    // countdown to start of game
    countdown(sec) {
        // if new game, announce that to all inactive players that a real-time game's about to start
        if (sec===COUNTDOWN_SECONDS)
        {
        }
        io.sockets.emit('broadcastGame', { seconds: sec});

        // announce seconds to game (to users in the room waiting to play)
        io.sockets.to(this.state.name).emit('broadcastCountdown', { seconds: this.state.secondsRemaining});
        setTimeout(() => {
            if (this.state.secondsRemaining > 0) {
                this.countdown(this.state.secondsRemaining--);
                this.state.gameStarted = false;
            } else {
                // start the game, start timer
                this.state.gameStarted = true;
                this.state.ticks = GAME_MAX_SECONDS;
                this.tick(this.state.ticks);
            }
        }, 1000);
    },

    // broadcast game state to all players
    updatePlayers() {
        io.sockets.to(this.state.name).emit('updatePlayers', {
            players: this.state.players,
            sentence: this.state.sentence,
            roomNumber: this.state.number
        });

    },

    // timer to end of game
    tick(sec) {
        setTimeout(() => {
            if (this.state.ticks > 0) {
                this.tick(this.state.ticks--);
            } else {
                this.gameOver();
            }
        }, 1000);
    },

    // on player keypress, update percentage completed
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

                // broadcast to room player's current progress
                io.sockets.to(this.state.name).emit('updatePlayer', {
                    id: player.id,
                    percent: pct,
                    rank: thisRank
                });
                break;
            }
        };
    },

    // set state to game over, and broadcast to room to end game
    gameOver() {
        this.state.players = [];
        this.state.sentence = null;
        this.state.rank = 0;
        this.state.ticks = 0;

        io.sockets.to(this.state.name).emit('gameOver', {});
        //setNewRoomNumber(function(err, res) {});
    },

    // get current status of game based on time remaining and how many players completed the sentence
    isGameOver() {
        let hasIncompletePlayers = false;
        let hasTime = (this.state.ticks > 0);
        if (hasTime) {
            console.log(this.state.players.length);
            for(let i = 0; i < this.state.players.length; i++) {
                console.log(this.state.players[i].percent);
                if (this.state.players[i].percent < 100) {
                    hasIncompletePlayers = true;
                    break;
                }
            }
        }
        if ((!hasIncompletePlayers) || (!hasTime)){
            this.gameOver();
        }
    }

};

function getCurrentRoomNumber(cb) {

    redis.get('room:current', function(err, id) {

        if (err || !id) {
            setNewRoomNumber(function(err, id) {
               if (err) return;
                cb(null, id);
            });
        } else {
            cb(null, id)
        }

    })


};

function setNewRoomNumber(cb) {
    redis.incr('room:current', function(err, id) {
        if (err) return cb(err);
        cb(null, id);
    });
};

function getSetRoom(number, state, cb) {

    const key = Game.gameKey(number);
    redis.exists(key, function(err, res) {
        // create if doesn't exist
       if (err || !(!!res)) {
           // create game and return it
           const key = `game:${number}:user:${user.id}`;
           const args = [
               "name", state.name,
               "ticks", state.ticks,
               "sentence", state.sentence,
               "rank", state.rank,
               "secondsRemaining", state.secondsRemaining,
               "gameStarted", false,
               "number", state.number
           ];
           redis.hmset(key, args, function(err, result) {
               if (err) return cb(err);
               cb(null, state);
           });
       } else {
           // get / return game
           redis.hgetall(key, function(err, result) {
               if (err) return cb(err);
               if (result.gameStarted) return cb(null, null);
               cb(null, result);
           });
       }
    });

};

const Controller = {

    // find an existing game that's not yet started, or create a new one
    getRoomToJoin(cb) {

        getCurrentRoomNumber(function(err, id) {

            const key = Game.gameKey(id);
            // if exists return it
            redis.exists(key, function(err, exists) {
               if (!!exists) {
                   redis.hgetall(key, function(err, result) {
                       if (err) return cb(err);
                       if (!!parseInt(result.gameStarted)) return cb(null, null);
                       cb(null, result);
                   });
               } else {
                   const args = Game.defaultState(id);
                   args.sentence = Game.setSentence(args);
                   redis.hmset(key, args, function(err, result) {
                       if (err) return cb(err);
                       cb(null, args);
                   });
               }
            });

            // else create it

        });

        /*
        let r = null;
        for (let x = 0; x < rooms.length; x++) {
            let room = rooms[x];
            if (room.state.players.length < MAX_PLAYERS_PER_GAME && !room.state.gameStarted) {
                r = room;
                return cb(null, r);
            }
        }

        setNewRoomNumber(function(err, number) {
            if (err) return cb(err);
            if (!err) {
                r = new Room(number);
                rooms.push(r);
                cb(null, r);
            }
        });

        */

    },
    canJoinRoom(userId, roomId, cb) {
        redis.exists(`game:${roomId}:user:${userId}`, function(err, exists) {
           if (err) return cb(err);
           cb(null, !(!!exists));
        });
    },
    getRoomById(id) {

        for(let x=0; x < rooms.length;x++) {
            const room = rooms[x];
            if (room.state.number == id) {
                return room;
            }
        }
        return null;
    },
    setUser(addUser, user, number, cb) {

        if (!addUser) return cb(null, false);
        const key = `game:${number}:user:${user.id}`;
        const args = ["name", user.name, "color", user.color, "percent", user.percent, "rank", user.rank];

        redis.hmset(key, args, function(err, res) {
            if (err) return cb(err, false);
            cb(null, true);
        });
    },
    getGamePlayer(user, cb) {
        const key = `game:${user.number}:user:${user.id}`;
        redis.hgetall(key, function(err, res) {
           cb(null, res);
        });
    }
};

module.exports = (inout, rclient) => {
    io = inout;
    redis = rclient;

     // user connects
     io.sockets.on('connection', (socket) => {
        console.log('a user connected');

         // new player joins the game
        socket.on('join', (user) => {

            // leave existing rooms (only one game at a time)
            if (user.room) {
                io.socket.leave(user.room);
            }

            Controller.getRoomToJoin(function(err, ret) {
                //let room = ret;
                user.room = ret.name;
                user.number = ret.number;
                socket.username = user.name;

                // todo: verify user is unique to this room
                Controller.canJoinRoom(user.id, ret.number, function(err, canJoin) {
                    if (canJoin) {
                        socket.join(ret.name);
                    }
                    Game.join(user, canJoin, ret);
                });


            });
        });

         // user pressed key, update his progress
        socket.on('updatePercent' , (user) => {
            let r = Controller.getRoomById(user.number);
            r.updatePercent(user);
        });


    });
};

