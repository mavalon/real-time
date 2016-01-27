'use strict';

let socket = io();                  // for sending/receiving messages to/from the server
let rt;                             // game object ("rt" for "RealTime")
let to = null;                      // timeout for game timer

const GAME_MAX_SECONDS = 60;        // maximum time before a game time's out
const SECONDS_TO_DISPLAY_ALERT = 10;// seconds to display an alert when server notifies that another player is waiting for an opponent
const PLAYING_MSG = 'Type away!';
const GAME_OVER_MSG = 'Game over!';

/*

1) join a game

 socket.emit('join', {playerId: string, username: string, color: string, percent: float, rank: int, ready: boolean});
 data: http://jsoneditoronline.org/?id=918793abf2471017bb658e000653d656

 defaults:
    ready: false
    percent: 0
    rank: 0

2) update player list

    socket.on('updatePlayers', function (data) {})
    data: http://www.jsoneditoronline.org/?id=39cc6c42e9a4c3ed8d469f6ef6973182


3) notify the server that the client is ready to play (i.e., clicked the "ready" button

    socket.emit('ready', { playerId: string, gameId: int });

4) listen for new players who are looking for a challenger (and display an alert)

    socket.on('broadcastGame', function () {});


5)

 */


$(document).ready(function () {

    rt = new RealTime();
    rt.init();

    // display panel
    $('.nav,#alert').click(rt.goToPanel);

    // join game
    $('#enter,#again,#alert').click(rt.joinGame);

    $('#ready').click(rt.setReady);

    // update user progress
    $('textarea').keyup(rt.setPercent);

    // generate random user on click
    $('.randuser').click(rt.loadRandomUser);

    // generate random user on load
    rt.loadRandomUser();
});

let RealTime = function (options) {
    this.options = $.extend({}, options);
};

RealTime.prototype = {

    // state bag for current user's game/view
    state: {
        players: [],            // array of objects with the players' details
        currentPanel: 'lobby',  // the view currently being displayed
        gameId: 0,              // unique identifier for a game (will get this from the server, but need it to send messages back to the server)
        playerId: '',           // this will be either facebook id (formatted: fb_{facebookId}) or guest (formatted guest_{uniqueId})
        sentence: null          // sentence object
    },

    // join current active game (or start one)
    joinGame: function () {
        clearTimeout(to);
        $('#race').html('');
        $('#again, #inputField').removeClass('show');
        $('#status').text('Seeking Opponent');
        $('textarea').val('').attr('readonly', 'true');

        let username = $.trim($('#username').val());
        let id = $.trim($('#id').val());

        if (username.length === 0 || id.length === 0) {
            id = Math.floor(Math.random() * 26) + Date.now();; //JSON.parse(json);
            rt.emitJoin(`guest_${id}`, 'Guest');
            //$.get('/api/newguestid/', function (json) {
            //});
        } else {
            rt.emitJoin(`fb_${id}`, username);
        }

    },

    // notify ready to play
    setReady() {
        //console.log('--- ready ----');
        socket.emit('ready', { playerId: rt.state.playerId, gameId: rt.state.gameId });
        $('#ready').removeClass('show');
        $('.loading').addClass('show');
        rt.updateState('Preparing sentence');
    },

    // push to server
    emitJoin(id, name) {

        $('#loadUsers').addClass('show');
        rt.state.playerId = id;
        let data = {
            id: id,
            name: name,
            color: rt.getRandomColor(),
            percent: 0.5, // .5 to show something initially
            rank: 0,
            ready: false
        };
        socket.emit('join', data);
        console.log(JSON.stringify(data));

    },

    // show/hide panels
    goToPanel: function () {

        rt.state.currentPanel = $(this).data('panel');
        $('div').removeClass('show');
        $('#' + rt.state.currentPanel).addClass('show');

        if (rt.state.currentPanel !== 'lobby')
            $('#alert').removeClass('show');

    },

    // display all player progress bars
    updateRace: function () {

        let html = '';
        let outer = document.createElement('div');
        $('p.sentence,#sentence').text(rt.state.sentence.sentence);
        $.each(rt.state.players, function (index, user) {
            let div = document.createElement('div');
            let pct = document.createElement('div');
            let lbl = document.createElement('div');
            let w = this.percent + '%';
            let b = $(pct).css('width');

            if (rt.state.playerId === user.id) $(lbl).css('font-weight', 'bold');
            $(lbl).addClass('label').text(this.name);
            $(pct).addClass('percentage').width(w).css('background-color', this.color);
            $(div).attr('id', user.id).addClass('bar').append(lbl).append(pct);
            $(outer).append(div);
        });
        $('#race').html($(outer).html());

        if ($('#race').find('.bar').size() > 1)
        {
            $('#status').text('Click "Ready" to start the game');
            $('.loading').removeClass('show');
            $('#ready').addClass('show');
        }
    },

    // broadcast player's score
    setPercent: function () {
        const sentenceLength = $('#sentence').text().length;
        const typedLength = $('textarea').val().length;
        let percentComplete = (typedLength / sentenceLength) * 100;
        if (percentComplete > 100) percentComplete = 100;
        const data = {
            percent: percentComplete,
            id: rt.state.playerId,
            gameId: rt.state.gameId
        };
        socket.emit('updatePercent', data);
    },

    // generate a random color
    getRandomColor: function () {
        return "rgb(" + this._r() + "," + this._r() + "," + this._r() + ")";
    },

    // race begins
    startGame: function () {

        //console.log('------ start game -----');
        $('textarea').removeAttr('readonly').focus();
        $('#game').addClass('playing');
        $('#inputField').addClass('show');
        $('.loading').removeClass('show');
        rt.updateState(PLAYING_MSG);

        rt.echoTime('start at');

        to = setTimeout(function() {
            socket.emit('endgame', rt.state.gameId);
        }, GAME_MAX_SECONDS * 1000);

    },

    // race ends
    endGame: function () {
        $('textarea').attr('readonly', true);
        $('#game').removeClass('playing');
        $('#again').addClass('show');
        rt.updateState(GAME_OVER_MSG);


        rt.echoTime('ended at');
    },

    // echo message
    updateState: function (msg) {
        //console.log('---- update state -----');
        $('#status').text(msg);
    },

    // random number
    _r: function () {
        return Math.floor(Math.random() * 256);
    },

    // handle socket notifications and set initial state
    init: function () {

        // if another user starts a new game when current user is not playing a game,
        // display an alert inviting user to play real time game
        socket.on('broadcastGame', function () {

            if (rt.state.currentPanel === 'lobby') {
                $('#alert').addClass('show');
                //console.log(data.seconds);
                setTimeout(function () {
                    $('#alert').removeClass('show');
                }, SECONDS_TO_DISPLAY_ALERT * 1000);
            }

        });

        // update another player's progress bar
        socket.on('updatePlayer', function (data) {
            let player = data;
            let div = $('#' + player.id).find('.percentage');
            $(div).width(player.percent + '%');
            if (player.rank > 0) $(div).text(data.rank);
        });

        // reset view for all players' progress bars
        socket.on('updatePlayers', function (data) {
            console.log(JSON.stringify(data));
            // save the state so that you can pass these values back to the server at a later time
            rt.state.players = data.players;
            rt.state.sentence = data.sentence;
            rt.state.gameId = data.gameId;
            rt.updateRace();
        });

        // set game sentence (broadcast to all users in a particular room)
        socket.on('setSentence', function (data) {
            if (!rt.state.sentence)  rt.state.sentence = (data);
            $('p.sentence,#sentence').text(rt.state.sentence.sentence);
        });

        // change status to game over (disable textarea)
        socket.on('gameOver', rt.endGame);

        // start game
        socket.on('startGame', rt.startGame);

    },

    // Josh can ignore this (for get random user for testing purposes)
    loadRandomUser: function () {
        $.get('/data/fbusers.json', function (json) {
            let user = (json[Math.floor(Math.random() * json.length)]);
            $('#id').val(user.id);
            $('#username').val(user.username);
        });
    },

    // Josh can ignore this
    echoTime: function(msg) {
        const nowTime = new Date(new Date().getTime()).toLocaleTimeString(); // 11:18:48 AM
        console.log(msg + ': ' + nowTime);
    }
};
