'use strict';

const DATA_EXPIRATION_SECONDS = 86400;
const GAME_MAX_SECONDS = 60;

let fs = require('fs');
let io = null;
let redisClient = null;

module.exports = (inout, rclient) => {

    io = inout;
    redisClient = rclient;

    // user connects
    io.sockets.on('connection', (socket) => {

        // new player joins the game
        socket.on('join', (user) => {

            // leave existing rooms (only one game at a time)
            if (user.room) {
                io.socket.leave(user.room);
            }
            redisClient.keys(`*:Player:${user.id}`, function(err, result) {

                if (result.length > 0) {

                    const parts = result[0].split(':');
                    Game.rebroadcastPlayers(parts[1], user, socket);

                } else {

                    Game.getRoomToJoin(function(err, ret, newgame) {

                        if (err) return cb(err);

                        // add player record for the selected room
                        let key = `Game:${ret}:Player:${user.id}`;

                        redisClient.hmset(key, user, function(err, response) {

                            redisClient.expire(key, DATA_EXPIRATION_SECONDS);

                            // subscribe to the room
                            socket.username = user.id;
                            socket.join(`game${ret}`);

                            Game.addPlayerToGame(ret, user, function(err, result) {});

                            if (newgame) {
                                io.sockets.emit('broadcastGame', {});
                            }

                        })

                    });
                }
            });

        });

        socket.on('ready', (data) => {

            Game.setPlayerReady(data, function(err, ready) {
                if (ready) {
                    setTimeout(
                        function() {
                            io.sockets.to(`game${data.gameId}`).emit('startGame', { start: true });
                            //let t = new Timer(data.gameId);
                            //timers.push(t);
                        }, 2000);

                }
            });

        });

        // user pressed key, update his progress
        socket.on('updatePercent' , (user) => {
            //console.log(user.percent);
            Game.updatePercent(user);
        });

        socket.on('endgame', (gameId) => {

            Game.gameOver(gameId);

        });

    });

};

const Game = {

    defaultState(gameId) {
        let state = {
            name: `game${gameId}`,
            players: [],
            ticks: GAME_MAX_SECONDS,
            rank: 0,
            sentence: null,
            secondsRemaining: 0,
            gameStarted: false,
            gameId: gameId
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

    addPlayerToGame(game, player, cb) {

        let key = `Game:${game}`;
        redisClient.hgetall(key, function(err, state) {

            if (err) return cb(err);

            let players = JSON.parse(state.players);
            if (!Game.playerExists(players, player)) {
                players.push(player);
            }

            state.players = JSON.stringify(players);

            redisClient.hmset(key, state, function(err, result) {

                redisClient.expire(key, DATA_EXPIRATION_SECONDS);

                state.players = players; //JSON.parse(state.players);
                state.sentence = JSON.parse(state.sentence);

                // broadcast players
                io.sockets.to(state.name).emit('updatePlayers', {
                    players: state.players,
                    sentence: state.sentence,
                    gameId: state.gameId
                });

                cb(err, state);

            });

        });

    },

    rebroadcastPlayers(gameId, user, socket) {
        redisClient.hgetall(`Game:${gameId}`, function(err, state) {

            socket.username = user.id;
            socket.join(`game${state.gameId}`);

            state.players = JSON.parse(state.players);
            state.sentence = JSON.parse(state.sentence);

            io.sockets.to(state.name).emit('updatePlayers', {
                players: state.players,
                sentence: state.sentence,
                gameId: state.gameId
            });

        });
    },

    playerExists(players, player) {

        for(let x = 0; x < players.length; x++) {

            let thisPlayer = players[x];
            if (thisPlayer.id === player.id) {
                return true;
            }
        }
        return false;
    },

    updatePercent(user) {

        const gameId = user.gameId;
        const playerId = user.playerId;
        const gameName = `game${gameId}`;
        const key = `Game:${gameId}:Player:${playerId}`;

        redisClient.hgetall(key, function(err, result) {

            if (err) return err;
            if (!result) return;

            let player = result;
            player.percent = user.percent;

            if (parseInt(player.rank) > 0) return;

            player.rank = 0;

            if (user.percent >= 100) {

                // get last rank from game
                const gkey = `Game:${gameId}`;
                redisClient.hgetall(gkey, function(e, res) {

                    // increment and add to current player
                    let rank = parseInt(res.rank)+1;
                    res.rank = rank;
                    player.rank = rank;

                    redisClient.hmset(gkey, res, function(error, r) {

                        redisClient.expire(gkey, DATA_EXPIRATION_SECONDS);
                        // broadcast player
                        Game.saveProgress(key, gameName, player, function(err, res) {
                            if (rank === 2) Game.gameOver(gameId);
                        });

                    });

                });

            } else {
                Game.saveProgress(key, gameName, player, function(err, res) {});
            }

        });

    },

    saveProgress(key, gameName, player, cb) {

        redisClient.hmset(key, player, function(err, res) {
            redisClient.expire(key, DATA_EXPIRATION_SECONDS);
            if (err) return;

            // broadcast to room player's current progress
            io.sockets.to(gameName).emit('updatePlayer', {
                id: player.id,
                percent: player.percent,
                rank: player.rank
            });

            cb(err, res);

        });
    },

    gameOver(gameId) {
        Game.deleteGame(gameId);
        io.sockets.to(`game${gameId}`).emit('gameOver', {});
    },

    deleteGame(gameId) {
        const gameName = `Game:${gameId}`;
        redisClient.keys(`${gameName}:*`, function(err, objects) {
            //const keys = `${gameName} ${objects.join(' ')}`;
            objects.push(gameName);
            redisClient.del(objects, function(err, res){
                //console.log(err);
                //console.log(res);
            });
            //console.log(keys);
        });
    },

    // find an existing game that's not yet started, or create a new one
    getRoomToJoin(cb) {

        // get first available game if any exist at all, and remove from available games, since it will no longer be available
        redisClient.lpop('AvailableGames', function(err, item) {

            // no games exist
            if (!item) {

                // get next room id
                redisClient.incr('NextRoomId', function(err, id) {

                    const args = Game.defaultState(id);

                    // todo: generate sentence after both players have joined
                    args.sentence = Game.setSentence(args);
                    args.players = JSON.stringify(args.players);

                    // create game with default settings
                    const key = `Game:${id}`;
                    redisClient.hmset(key, args, function(err, result) {
                        redisClient.expire(key, DATA_EXPIRATION_SECONDS);
                        if (err) return cb(err);

                        // make game available to all
                        redisClient.rpush('AvailableGames', id, function(err, item) {
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

    setPlayerReady(data, cb) {
        const key = `Game:${data.gameId}`;

        redisClient.hgetall(key, function(err, game) {
            if(err) return cb(err);

            let players = JSON.parse(game.players);
            for(let n = 0; n < players.length; n++) {

                if (players[n].id === data.playerId) {
                    players[n].ready = true;
                    break;
                }
            }

            game.players = JSON.stringify(players);
            redisClient.hmset(key, game, function(err, ret) {
                redisClient.expire(key, DATA_EXPIRATION_SECONDS);
            });

            const playerCount = players.length;
            console.log(players);
            let readyCount = 0;
            for(let n = 0; n < players.length; n++) {
                console.log('ready');
                console.log(players[n]);
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