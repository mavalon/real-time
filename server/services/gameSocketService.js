'use strict';

const COUNTDOWN_SECONDS = 15;
const GAME_MAX_SECONDS = 60;

let fs = require('fs');
let io = null;
let rooms = [];
let redis = null;

module.exports = (inout, rclient) => {

    io = inout;
    redis = rclient;

    // user connects
    io.sockets.on('connection', (socket) => {

        // new player joins the game
        socket.on('join', (user) => {

            // leave existing rooms (only one game at a time)
            if (user.room) {
                io.socket.leave(user.room);
            }

            DB.getRoomToJoin(function(err, ret, newgame) {

                if (err) return cb(err);

                // add player record for the selected room
                let key = `Game:${ret}:Player:${user.id}`;
                redis.hmset(key, user, function(err, response) {

                    // subscribe to the room
                    socket.username = user.name;
                    socket.join(`game${ret}`);

                    Game.addPlayerToGame(ret, user, function(err, result) {

                    });

                    if (newgame) {
                        io.sockets.emit('broadcastGame', {});
                    }

                })

            });
        });

        socket.on('ready', (data) => {

            DB.setPlayerReady(data, function(err, ready) {
                if (ready) {
                    setTimeout(
                        function() {
                            io.sockets.to(`game${data.gameId}`).emit('startGame', { start: true });
                        }, 2000);

                }
            });

        });

        // user pressed key, update his progress
        socket.on('updatePercent' , (user) => {
            Game.updatePercent(user);
        });

    });
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

    setSentence(gameState) {
        const obj = JSON.parse(fs.readFileSync('./data/sentences.json', 'utf8'));
        const idx = Math.floor((Math.random() * obj.length) + 1);
        let sentence = (obj[idx]);

        gameState.sentence = sentence;
        // broadcast to current room
        io.sockets.to(gameState.name).emit('setSentence', sentence);
        return JSON.stringify(sentence);
    },

    join(user, add, gameState) {

        // todo: check if user exists in list before adding
        //let _self = this;

        // add user to list of players
        DB.setUser(add, user, user.number, function(err, added) {

            if (added) {
                //gameState.state.players.push(user);
            }
            // start countdown if first player in the room
            if (gameState.secondsRemaining === 0) {
                gameState.secondsRemaining = COUNTDOWN_SECONDS;
                //gameState.countdown(COUNTDOWN_SECONDS);
            }

            //broadcast all players to all players
            DB.getGamePlayer(user, function(err, res) {
                console.log(res);
            });
        });

    },

    addPlayerToGame(game, player, cb) {

        let key = `Game:${game}`;
        redis.hgetall(key, function(err, state) {

            if (err) return cb(err);

            let players = JSON.parse(state.players);

            players.push(player);
            state.players = JSON.stringify(players);

            redis.hmset(key, state, function(err, result) {

                state.players = JSON.parse(state.players);
                state.sentence = JSON.parse(state.sentence);

                // broadcast players
                io.sockets.to(state.name).emit('updatePlayers', {
                    players: state.players,
                    sentence: state.sentence,
                    roomNumber: state.number
                });

                cb(err, state);

            });

            //return JSON.stringify(players);

        });

    },

    updatePercent(user) {

        const gameId = user.number;
        const userId = user.id;
        const gameName = `game${gameId}`;
        const key = `Game:${gameId}:Player:${userId}`;

        redis.hgetall(key, function(err, result) {
            let player = result;
            player.percent = user.percent;
            player.rank = 0;
            redis.hmset(key, player, function(err, res) {
                if (err) return;
                // broadcast to room player's current progress
                io.sockets.to(gameName).emit('updatePlayer', {
                    id: player.id,
                    percent: player.percent,
                    rank: player.rank
                });
            });
        });

    },

    isGameOver(gameId) {
        let hasIncompletePlayers = false;
        let hasTime = (this.state.ticks > 0);
        if (hasTime) {
            for(let i = 0; i < this.state.players.length; i++) {
                if (this.state.players[i].percent < 100) {
                    hasIncompletePlayers = true;
                    break;
                }
            }
        }
        if ((!hasIncompletePlayers) || (!hasTime)){
            Game.gameOver(gameId);
        }
    },

    gameOver(gameId) {
        io.sockets.to(`game${gameId}`).emit('gameOver', {});
    }
};

const DB = {

    // find an existing game that's not yet started, or create a new one
    getRoomToJoin(cb) {

        // get first available game if any exist at all, and remove from available games, since it will no longer be available
        redis.lpop('AvailableGames', function(err, item) {

            // no games exist
            if (!item) {

                // get next room id
                redis.incr('NextRoomId', function(err, id) {

                    const args = Game.defaultState(id);

                    // todo: generate sentence after both players have joined
                    args.sentence = Game.setSentence(args);
                    args.players = JSON.stringify(args.players);

                    // create game with default settings
                    redis.hmset(`Game:${id}`, args, function(err, result) {
                        if (err) return cb(err);

                        // make game available to all
                        redis.rpush('AvailableGames', id, function(err, item) {
                            cb(null, id, true);
                        });

                    });

                });

            } else {

                cb(null, item, false);

            }

            // note, cb returns (error, item, gameNewlyCreated)

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
        const key = `Game:${number}:Player:${user.id}`;
        const args = ["name", user.name, "color", user.color, "percent", user.percent, "rank", user.rank];

        redis.hmset(key, args, function(err, res) {
            if (err) return cb(err, false);
            cb(null, true);
        });
    },

    getGamePlayer(user, cb) {
        const key = `Game:${user.number}:Player:${user.id}`;
        redis.hgetall(key, function(err, res) {
           cb(null, res);
        });
    },

    setPlayerReady(data, cb) {
        const key = `Game:${data.gameId}`;

        redis.hgetall(key, function(err, game) {
            if(err) return cb(err);

            let players = JSON.parse(game.players);
            for(let n = 0; n < players.length; n++) {

                if (players[n].id === data.userId) {
                    players[n].ready = true;
                    break;
                }
            }

            game.players = JSON.stringify(players);
            redis.hmset(key, game, function(err, ret) {});

            const playerCount = players.length;
            let readyCount = 0;
            for(let n = 0; n < players.length; n++) {
                if (players[n].ready) {
                    readyCount++;
                }
            }

            if ((playerCount > 1) && (playerCount === readyCount)) {
                cb(null, true);
            }

        });
    }

};
