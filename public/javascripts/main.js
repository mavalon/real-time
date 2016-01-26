'use strict';

let socket = io();
let rt;

const PLAYING_MSG = 'Type away!';
const GAME_OVER_MSG = 'Game over!';
const SECONDS_TO_DISPLAY_ALERT = 10;

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

    // state bag for current user's game/room/view
    state: {
        players: [],
        currentPanel: 'lobby',
        gameId: 0,
        myId: '',
        sentence: null,
        room: 0
    },

    // join current active game (or start one)
    joinGame: function () {
        $('#race').html('');
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
        console.log('--- ready ----');
        socket.emit('ready', { userId: rt.state.myId, gameId: rt.state.number });
        $('#ready').removeClass('show');
        $('.loading').addClass('show');
        rt.updateState('Preparing sentence');
    },

    // push to server
    emitJoin(id, name) {

        $('#loadUsers').addClass('show');
        rt.state.myId = id;
        let data = {
            id: id,
            name: name,
            color: rt.getRandomColor(),
            percent: 0.5, // .5 to show something initially
            rank: 0,
            ready: false
        };
        socket.emit('join', data);

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

            if (rt.state.myId === user.id) $(lbl).css('font-weight', 'bold');
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
            id: rt.state.myId,
            number: rt.state.number
        };
        socket.emit('updatePercent', data);
    },

    // generate a random color
    getRandomColor: function () {
        return "rgb(" + this._r() + "," + this._r() + "," + this._r() + ")";
    },

    // race begins
    startGame: function () {

        console.log('------ start game -----');
        $('textarea').removeAttr('readonly').focus();
        $('#game').addClass('playing');
        $('#inputField').addClass('show');
        $('.loading').removeClass('show');
        rt.updateState(PLAYING_MSG);
    },

    // race ends
    endGame: function () {
        $('textarea').attr('readonly', true);
        $('#game').removeClass('playing');
        rt.updateState(GAME_OVER_MSG);
    },

    // echo message
    updateState: function (msg) {
        console.log('---- update state -----');
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
        socket.on('broadcastGame', function (data) {
            if (rt.state.currentPanel === 'lobby') {
                $('#alert').addClass('show');
                //console.log(data.seconds);
                setTimeout(function () {
                    $('#alert').removeClass('show');
                }, SECONDS_TO_DISPLAY_ALERT * 1000);
            }

        });

        // update countdown on the game view
        socket.on('broadcastCountdown', function (data) {
            $('.countdown').text(data.seconds);
            if (data.seconds > 0) {
                $('#status').addClass('counting');

                /*
                 if (rt.state.currentPanel === 'lobby')
                 $('#alert').addClass('show');
                 */

            } else {
                $('#status').removeClass('counting');
                //$('#alert').removeClass('show');
                $('textarea').removeAttr('readonly');
                rt.startGame();
            }
        });

        // update another player's progress bar
        socket.on('updatePlayer', function (data) {
            console.log('---------- update player ----------');
            console.log(data);
            let player = data;
            let div = $('#' + player.id).find('.percentage');
            $(div).width(player.percent + '%');
            if (player.rank > 0) $(div).text(data.rank);
        });

        // reset view for all players' progress bars
        socket.on('updatePlayers', function (data) {
            console.log(data);
            rt.state.players = data.players;
            rt.state.sentence = data.sentence;
            rt.state.number = data.roomNumber;
            rt.updateRace();
        });

        // set game sentence (broadcast to all users in a particular room)
        socket.on('setSentence', function (data) {
            if (!rt.state.sentence)  rt.state.sentence = (data);
            $('p.sentence,#sentence').text(rt.state.sentence.sentence);
        });

        // change status to game over (disable textarea)
        socket.on('gameOver', rt.endGame);

        socket.on('startGame', rt.startGame);

    },

    // for get random user for testing purposes
    loadRandomUser: function () {
        $.get('/data/fbusers.json', function (json) {
            let user = (json[Math.floor(Math.random() * json.length)]);
            $('#id').val(user.id);
            $('#username').val(user.username);
        });
    }
};
