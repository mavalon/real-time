var socket = io();
var idGen = new Generator();
var rt;

var PLAYING_MSG = 'Type away!';
var GAME_OVER_MSG = 'Game over!';

$(document).ready(function() {

    rt = new RealTime();
    rt.init();
    $('.nav,#alert').click(rt.goToPanel);
    $('#enter,#again').click(rt.joinGame);
    $('textarea').keyup(rt.setPercent);

});

var RealTime = function (options) {

    this.options = $.extend({}, options);

};

RealTime.prototype = {

    props: {
        players: [],
        currentPanel: 'lobby',
        gameId: 0,
        myId: '',
        sentence: null,
        room: 0
    },

    // notify server that user has joined the game
    joinGame: function() {
        $('#race').html('');
        $('textarea').val('').attr('readonly', 'true');
        socket.emit('join', {
            id: rt.props.myId,
            name: $('#username').val(),
            color: rt.getRandomColor(),
            percent: 0.5,
            rank: 0
        });
    },

    // keyup: update player's progress
    setPercent: function() {
        var sentenceLength = $('#sentence').text().length;
        var typedLength = $('textarea').val().length;
        var percentComplete = (typedLength / sentenceLength)*100;
        if (percentComplete > 100) percentComplete = 100;
        const data = {
            percent: percentComplete,
            id: rt.props.myId,
            number: rt.props.number
        };
        socket.emit('updatePercent', data);
    },

    goToPanel: function() {

        rt.props.currentPanel = $(this).data('panel');
        $('div').removeClass('show');
        $('#'+rt.props.currentPanel).addClass('show');

        if (rt.props.currentPanel!=='lobby')
            $('#alert').removeClass('show');

    },

    updateRace: function() {

        var html = '';
        var outer = document.createElement('div');
        $('p.sentence,#sentence').text(rt.props.sentence.sentence);
        $.each(rt.props.players, function(index, user) {
            var div = document.createElement('div');
            var pct = document.createElement('div');
            var lbl = document.createElement('div');
            var w = this.percent+'%';
            var b = $(pct).css('width');

            if (rt.props.myId===user.id) $(lbl).css('font-weight', 'bold');
            $(lbl).addClass('label').text(this.name);
            $(pct).addClass('percentage').width(w).css('background-color', this.color);
            $(div).attr('id', user.id).addClass('bar').append(lbl).append(pct);
            $(outer).append(div);
        });
        $('#race').html($(outer).html());
    },

    getRandomColor: function() {
        return "rgb(" + this._r() + "," + this._r() + "," + this._r() + ")";
    },

    startGame: function() {

        $('textarea').removeAttr('readonly').focus();
        $('#game').addClass('playing');
        rt.updateState(PLAYING_MSG);
    },

    endGame: function() {
        $('textarea').attr('readonly', true);
        $('#game').removeClass('playing');
        rt.updateState(GAME_OVER_MSG);
    },

    updateState: function(msg) {
        $('#state').text(msg);
    },

    _r: function() {
        return Math.floor(Math.random()*256);
    },

    // set handlers for all broadcast messages from the server
    init: function() {

        // get placeholder id -- replace with actual facebook id,
        // or get next id from redis
        rt.props.idGen = new Generator();
        rt.props.myId = idGen.getId();

        // if another user starts a game and is waiting for another player, alert all users who are not currently in a game
        socket.on('broadcastGame', function(data) {
            if (rt.props.currentPanel === 'lobby')
            {
                $('#alert').addClass('show');
                console.log(data.seconds);
                setTimeout(function() {
                    $('#alert').removeClass('show');
                }, data.seconds*1000);
            }

        });

        // currently, this is a countdown to the start of the game, but i will be removing this
        // instead, we will notify when the game has started so that we can just remove the alert (if it hasn't already been hidden)
        socket.on('gameNotification', function(data) {
            $('.countdown').text(data.seconds);
            if (data.seconds > 0) {
                $('#status').addClass('counting');

                if (rt.props.currentPanel === 'lobby')
                    $('#alert').addClass('show');

            } else {
                $('#status').removeClass('counting');
                $('#alert').removeClass('show');
                $('textarea').removeAttr('readonly');
                rt.startGame();
            }
        });

        // a player's score has changed, update the progress bar
        socket.on('updatePlayer', function(data) {
            console.log(data);
            var player = data;
            var div = $('#'+player.id).find('.percentage');
            $(div).width(player.percent+'%');
            if (player.rank > 0) $(div).text(data.rank);
        });

        // all players and their status is sent back to client, update all progress bars
        socket.on('updatePlayers', function(data) {
            console.log(data);
            rt.props.players = data.players;
            rt.props.sentence = data.sentence;
            rt.props.number = data.roomNumber;
            rt.updateRace();
        });

        // update sentence displayed -- this will probably change
        socket.on('setSentence', function(data) {
            if (!rt.props.sentence)  rt.props.sentence = (data);
            $('p.sentence,#sentence').text(rt.props.sentence.sentence);
        });

        // notified that the game is over, change display
        socket.on('gameOver', rt.endGame);
    }

};

function Generator() {};
Generator.prototype.rand =  Math.floor(Math.random() * 26) + Date.now();
Generator.prototype.getId = function() {
    return this.rand++;
};