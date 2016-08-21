var http = require('http');
var express = require('express');
var cookie_parser = require('cookie-parser');
var app = express();
var httpserv = http.createServer(app); // HTTP server
httpserv.listen(80);

var io = require('socket.io').listen(httpserv); // Websocket server
io.set('heartbeat timeout', 10000);
io.set('heartbeat interval', 5000);

var rfr = require('rfr');
var path = require('path');
var fs = require('fs');

/*
Server: manages custom games, creates ServerBoards.
*/

Server = function(app, io) {
    this.app = app;
    this.io = io;
    this.game_dir = 'game/';
    this.rooms = {};
    this.games = {};
};

Server.prototype.register_game = function(name) {

    var game = {};
    var mod = rfr(path.join('game', name, 'main'));
    game.main = mod.main;
    game.options = mod.options;
    game.client_dep = [];

    // Find client dependencies
    (['client', 'common']).forEach((function(dir) {
        fs.readdir(path.join('game', name, dir), (function(err, files) {
            if (!err) {
                this.app.use(path.join('/dep', name), express.static(path.join('game', name, dir)));
                files.forEach(function(file) {
                    game.client_dep.push(path.join('/dep', name, file));
                });
            }
        }).bind(this));
    }).bind(this));

    this.games[name] = game;
};

Server.prototype.create_room = function(room_name, game_name, max_players, options) {
    if (room_name.trim() !== '' && typeof this.rooms[room_name] === 'undefined') {
        var game = this.games[game_name];
        var room = new game.main(this.io, room_name, max_players, options);
        this.rooms[room_name] = { room: room, dep: game.client_dep, game_name: game_name };
    }
};

var server = new Server(app, io);
server.register_game('crapette');
server.register_game('tarot');

server.create_room('tarot', 'tarot', 5);
server.create_room('tarot3', 'tarot', 3);
server.create_room('crapette', 'crapette', 2);

/*
Frontend
*/

app.use(cookie_parser());
app.use('/lib', express.static('lib'));
app.use('/static', express.static('static'));

app.get('/', function(req, res) {
    var error = typeof req.query.error === 'undefined' ? null : decodeURIComponent(req.query.error);
    res.render('list.ejs', { rooms: server.rooms, games: server.games, error: error, cookies: req.cookies });
});

app.get('/play/:name', function(req, res) {
    var name = decodeURIComponent(req.params.name);
    if (typeof server.rooms[name] === 'undefined') {
        res.redirect('/');
    } else {
        var room = server.rooms[name];
        if (room.room.player_count() === room.room.max_players) {
            res.redirect('/');
        } else {
            res.render('play.ejs', { room: name, dep: room.dep, cookies: req.cookies });
        }
    }
});

app.get('/create', function(req, res) {
    var name = req.query.room_name;
    var game = req.query.game_name;
    var players = req.query.max_players;
    if (name.trim() === '' || typeof server.rooms[name] !== 'undefined') {
        res.redirect('/?error='+encodeURIComponent('Invalid name.'));
    } else {
        var options = server.games[game].options;
        if (typeof options !== 'undefined' && (players > options.max_players || players < options.min_players)) {
            res.redirect('/?error='+encodeURIComponent('Player count must be in range ['+options.min_players.toString()+','+options.max_players.toString()+'].'));
        } else {
            server.create_room(name, game, players);
            res.redirect('/');
        }
    }
});

app.get('/name', function(req, res) {
    res.cookie('name', req.query.name);
    res.redirect('/');
});