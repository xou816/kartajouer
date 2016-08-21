var rfr = require('rfr');
var EventEmitter = require('events');
var common = rfr('lib/common');
var timers = require('timers');

'use strict';

/*
*/

// Register module $namespace as a namespace for additionnal drag/drop policies
exports.add_namespace = function(namespace) {
    common.add_namespace(namespace);
};

/*
ServerBoard: single game manager.
It connects with clients, sends them data for a given game.
To create custom games, extend this class.
*/

exports.ServerBoard = function(io, name, max_players) {

    // this.players = [0, 1, 0, ..., 0]
    // A zero is a free player slot, a one is a used slot
    // A variable named player is usually a player id
    this.players = [];
    this.player_names = [];
    this.player_warns = [];
    this.player_drags_from = []; // Keep track of drags (in case of disconnect)
    this.player_sockets = [];
    this.max_players = max_players;
    for (var i = 0; i < max_players; i++) {
        this.players.push(0);
    }

    // Chat related
    this.chat_log = [];
    this.commands = {
        nick: this.command_nickname,
        help: this.command_help,
        pm: this.command_pm,
        turn: this.command_turn,
        list: this.command_list,
    };

    this.name = name; // Used as socket.io room name
    this.io = io;

    this.all = io.of('/'+name);
    this.null = {
        broadcast: this.all,
        emit: function() {},
        on: function() {},
        disconnect: function() {},
    };
    this.all.on('connection', this.handle_connection.bind(this));

    this.turn = -1; // -1 means no one's turn
    this.cards = [];
    this.spots = [];

    this.log('Room created!');
    this.emit('start');

    // var bot = this.register_player(this.null);
    // this.set_name(bot, 'Bot0');

};

exports.ServerBoard.prototype = Object.create(EventEmitter.prototype);

exports.ServerBoard.prototype.set_command = function(name, handler) {
    this.commands[name] = handler;
};

// Return number of connected clients
exports.ServerBoard.prototype.player_count = function() {
    var count = 0;
    this.players.forEach(function(i) { count += i });
    return count;
};

// Return spot with given $id
exports.ServerBoard.prototype.get_spot = function(id) {
    return this.spots[id];
};

// Log to server console
exports.ServerBoard.prototype.log = function(message) {
    console.log('['+Date.now().toString()+'] ['+this.name+'] '+message);
};

exports.ServerBoard.prototype.can_play = function(player) {
    return this.whose_turn() === player; // -1 disables turn feature
};

// Return player id whose turn it is
exports.ServerBoard.prototype.whose_turn = function() {
    return this.turn%this.max_players;
};

// Pass to next turn
// Optionnaly specify which player should play
exports.ServerBoard.prototype.next_turn = function(player) {
    if (typeof player === 'undefined') {
        this.turn++;
    } else {
        this.turn = player;
    }
    this.all.emit('turn', this.whose_turn());
    this.emit('turn');
};

// Name a $spot and its contained cards
// Ids are given in order: the first spot will have id 0
exports.ServerBoard.prototype.register_spot = function(spot) {
    spot.id = this.spots.length;
    this.spots.push(spot);
    spot.stack.forEach(function(card) {
        card.id = this.cards.length;
        this.cards.push(card);
    }, this);
    return spot.id;
};

// Get the stack of cards matching $ids
exports.ServerBoard.prototype.ids_to_cards = function(ids) {
    var stack = new common.Stack();
    ids.forEach(function(id) {
        stack.push(this.cards[id]);
    }, this);
    return stack;
};

// Attempt registering a player and return a player id
// If no free slot is found, return -1
exports.ServerBoard.prototype.register_player = function(socket) {
    var player = this.players.indexOf(0);
    if (player > -1) {
        this.players[player] = 1;
        this.player_sockets[player] = socket;
        this.player_names[player] = 'Player'+player.toString();
        this.player_warns[player] = 0;
        this.player_drags_from[player] = null;
        // Warn server and clients
        this.chat_send('Server', this.get_name(player)+' has joined.');
        this.emit('join', socket, player); // Server side event
        this.update_players();
    }
    return player;
};

// Free a player slot
exports.ServerBoard.prototype.remove_player = function(player) {
    this.players[player] = 0;
    this.player_names[player] = 'Player'+player.toString();
    this.player_warns[player] = 0;
};

// Get player name
exports.ServerBoard.prototype.get_name = function(player) {
    return this.player_names[player];
};

exports.ServerBoard.prototype.get_socket = function(player) {
    return this.player_sockets[player];
};

exports.ServerBoard.prototype.online = function(player) {
    return this.players[player] === 1;
};

exports.ServerBoard.prototype.set_name = function(player, name) {
    if (this.player_names.indexOf(name) === -1 && typeof name !== 'undefined' && name.length > 0) {
        this.player_names[player] = name;
        this.update_players();
        return true;
    }
    return false;
};

// Returns the board orientation for a given $player (an angle)
exports.ServerBoard.prototype.player_orientation = function(player) {
    return -player*2*Math.PI/this.max_players;
};

// Send player info to clients
exports.ServerBoard.prototype.update_players = function() {
    this.all.emit('update_players', { player_names: this.player_names, players: this.players });
};

exports.ServerBoard.prototype.reset = function() {
    // Reset 'database'
    this.spots = [];
    this.cards = [];
    // Rebuild
    this.emit('start');
    // Notify online players
    for (var player = 0; player < this.max_players; player++) {
        if (this.online(player)) this.send_board_data(this.get_socket(player), player);
    }
};

exports.ServerBoard.prototype.send_board_data = function(socket, player) {
    var data = { player: player, board: [] };
    data.orientation = -this.player_orientation(player);
    this.spots.forEach(function(spot) {
        spot.set_context(player, this.can_play(player)); // Set correct context before export
        data.board.push(spot.export()); // Export spot
    }, this);
    socket.emit('update_board', data);
};

// Main connection handler
exports.ServerBoard.prototype.handle_connection = function(socket) {

    var player = this.register_player(socket);

    if (player > -1) { // We have a valid id, there is a free slot

        // Send board data
        this.send_board_data(socket, player);

        // Turn info with a slight delay to prevent screen (and turn notification) from being overwritten
        timers.setTimeout(socket.emit.bind(socket, 'turn', this.whose_turn()), 100);

        // Send chat log
        socket.emit('chat', this.chat_log);

        // Bind handlers
        socket.on('disconnect', this.handle_disconnect.bind(this, socket, player));
        socket.on('client_drag', this.handle_drag.bind(this, socket, player));
        socket.on('client_move', this.handle_move.bind(this, socket, player));
        socket.on('client_drop', this.handle_drop.bind(this, socket, player));
        socket.on('chat', this.handle_chat.bind(this, socket, player));

    } else {

        socket.emit('alert', 'Sorry, server full!');

    }

};

exports.ServerBoard.prototype.update_spot = function(spot) {
    for (var player = 0; player < this.max_players; player++) {
        if (this.online(player)) {
            spot.set_context(player, this.can_play(player));
            this.get_socket(player).emit('update_spot', spot.export());
        }
    }
}

// Kick player on given $socket
exports.ServerBoard.prototype.kick = function(socket, reason, data) {

    // this.chat_send('Server', 'Kicked for cheating attempt!', socket);
    // socket.disconnect();

    var player = this.player_sockets.indexOf(socket);
    if (this.player_warns[player] < 5) {
        this.send_board_data(socket, player);
        this.chat_send('Server', 'An error has been encountered. Resyncing client.', socket);
        this.player_warns[player]++;
    } else {
        this.chat_send('Server', 'Kicked by server.', socket);
        socket.disconnect();
    }

    // Save details of cheating attempt
    this.log('[WARNING] Possible cheating attempt by '+this.get_name(player)+': '+reason);
    if (typeof data !== 'undefined') {
        this.log('Extra data: ');
        console.log(data);
    }

};

exports.ServerBoard.prototype.handle_disconnect = function(socket, player) {

    this.chat_send('Server', this.get_name(player)+' left the game.');
    this.remove_player(player);
    this.update_players();

    var spot = this.player_drags_from[player]; // Retrieve drag spot if any
    if (spot !== null && spot.drag_stack.length > 0) {
        var stack = spot.drag_stack.slice();
        // Same as handle_drop
        spot.transfer_drag_stack(spot);
        socket.broadcast.emit('client_drop', { from: spot.id, to: spot.id });
        this.emit('drop', player, spot, spot, stack);
    }
};

// Drag handler
exports.ServerBoard.prototype.handle_drag = function(socket, player, data) {

    var spot = this.get_spot(data.spot);
    spot.set_context(player, this.can_play(player));
    var matches = this.ids_to_cards(data.matches);
    var new_matches = spot.filter_drag(this.ids_to_cards(data.original_matches)); // Compute matches server side

    if (matches.equals(new_matches)) { // Compare with client side computed matches
        this.auto_reveal(spot, spot, matches); // Reveal hidden cards if necessary
        this.player_drags_from[player] = spot; // Save drag spot
        // Apply
        spot.set_drag_stack(matches);
        socket.broadcast.emit('client_drag', data);
        this.emit('drag', player, spot, matches); // Server side event

    } else { // Fraud?

        this.kick(socket, 'drag policy does not match', [spot, this.ids_to_cards(data.original_matches), matches, new_matches]);

    }

};

// Move handler
exports.ServerBoard.prototype.handle_move = function(socket, player, data) {
    var spot = this.get_spot(data.spot);
    if (spot.drag_stack.length > 0) { // Check whether something can be dragged (lazy verification)
        socket.broadcast.emit('client_move', data); // No change to commit on the server, just send info to clients (position...)
    } else {
        this.kick(socket, 'nothing to move', data);
    }
};

// Drop handler
exports.ServerBoard.prototype.handle_drop = function(socket, player, data) {

    var from = this.get_spot(data.from);
    var to = this.get_spot(data.to);
    from.set_context(player, this.can_play(player));
    to.set_context(player, this.can_play(player));

    if (from.drag_stack.length > 0 && to.accept_drop(from, from.drag_stack)) { // Check for fraud
        var stack = from.drag_stack.slice();
        this.auto_reveal(from, to, stack);
        this.player_drags_from[player] = null;
        // Apply
        from.transfer_drag_stack(to);
        socket.broadcast.emit('client_drop', data);
        this.emit('drop', player, from, to, stack); // Server side event
    } else {
        this.kick(socket, 'drop policy does not match', [from, to]);
    }

};

// Reveal cards appropriately when there is a layout change between $from and $to for a $stack
exports.ServerBoard.prototype.auto_reveal = function(from, to, stack) {

    var type_a = 'drag', type_b = 'drop'; // from and to are different: we compare drag layout for from with drop layout for to
    if (from.id === to.id) { // If they are the same, layout changed from drop to drag
        type_a = 'drop';
        type_b = 'drag';
    }

    if (from.has_layout(type_a, 'downside', 'owner') && to.has_layout(type_b, 'upside', 'owner')) {
        if (to.owner !== -1) this.reveal(this.get_socket(to.owner), stack); // Socket is null if no one owns the spot (owner = -1)
    }
    if (from.has_layout(type_a, 'downside', 'player') && to.has_layout(type_b, 'upside', 'player')) {
        this.reveal(this.all, stack); // Socket should exclude the owner but socket broadcast is buggy
    }

};

// Reveal the values of a $stack to clients (cards that are upside down have value 0 client side to avoid cheating)
exports.ServerBoard.prototype.reveal = function(socket, stack) {
    var data = {};
    stack.forEach(function(card) {
        data[card.id] = card.value;
    });
    socket.emit('update_cards', data);
};

// Move a $stack as server, between $from and $to
// If $stack is omitted, drag the whole content of $from
exports.ServerBoard.prototype.move = function(from, to, stack) {
    if (typeof stack === 'undefined') var stack = from.stack.copy();
    var ids = stack.ids();
    this.all.emit('server_move', { from: from.id, to: to.id, stack: ids }); // Specific client handler (allows animating, etc)
    from.set_drag_stack(stack);
    from.transfer_drag_stack(to);
};

/*
Chat related
*/

// Send $message as $from, on a given $socket
// If omitted, $socket is ServerBoard.all (ie everyone receives the message)
exports.ServerBoard.prototype.chat_send = function(from, message, socket, time) {
    // Prevent XSS
    message = message.replace(/&(?!\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    socket = typeof socket === 'undefined' ? this.all : socket;
    var bot = false;
    if (typeof time === 'undefined') {
        time = Date.now();
        bot = true;
    }
    var data = { bot: bot, private: socket !== this.all, message: message, from: from, time: time };
    this.log(from+': '+message);
    socket.emit('chat', [data]); // Array so that multiple messages can be sent at once (eg chat log)
    if (socket === this.all) this.chat_log.push(data); // Save to log if and only if it is public
};

// Chat handler
exports.ServerBoard.prototype.handle_chat = function(socket, player, data) {
    var display = this.get_name(player);
    var message = data.message;
    if (message[0] == '/') { // It's a command
        var command = message.substring(1).split(' ');
        if (Object.keys(this.commands).indexOf(command[0]) > -1) { // If command exists
            this.commands[command[0]].call(this, socket, player, command.slice(1), data);
            this.log(display+' used command '+message+'.');
        } else {
            this.chat_send('Server', 'Unknown command /'+command[0]+'. Type /help for help.', socket);
        }
    } else { // Otherwise, it's a message, display it
        this.chat_send(display, message, this.all, data.time);
    }
};

// Command: /nick <newname>
// Change your display name
exports.ServerBoard.prototype.command_nickname = function(socket, player, args) {
    var name = args[0];
    var old = this.get_name(player);
    if (this.set_name(player, name)) {
        this.chat_send('Server', old+' is now known as '+name+'.');
    } else {
        this.chat_send('Server', 'Name already taken or invalid name.', socket);
    }
};

// Command: /turn
// Sends the turn event to the client, so as to display again the turn message
exports.ServerBoard.prototype.command_turn = function(socket, player, args) {
    socket.emit('turn', this.whose_turn());
};

// Command: /pm <player> <message>
// Send a private message
exports.ServerBoard.prototype.command_pm = function(socket, player, args, data) {
    if (args.length < 2) {
        this.chat_send('Server', 'Usage: /pm <player> <message>', socket);
        return;
    }
    var to = this.player_names.indexOf(args[0]);
    var message = args.slice(1).join(' '); // Join the arguments after /pm <player>
    if (to > -1) {
        this.chat_send(this.get_name(player), message, this.get_socket(to), data.time);
        this.chat_send(this.get_name(player), message, socket, data.time);
    } else {
        this.chat_send('Server', args[0]+' is not connected.', socket);
    }
};

// Command: /help
exports.ServerBoard.prototype.command_help = function(socket, player, args) {
    this.chat_send('Server', 'Valid commands: '+Object.keys(this.commands).join(', ')+'.', socket);
};

exports.ServerBoard.prototype.command_list = function(socket, player, args) {
    var list = [];
    for (var i = 0; i < this.max_players; i++) {
        if (this.online(i)) list.push(this.get_name(i));
    }
    this.chat_send('Server', 'Online: '+list.join(', ')+'.', socket);
};

/*
Client UI related
*/

// Show a $message on the client overlay for a given $duration
exports.ServerBoard.prototype.ui_show_message = function(message, duration, socket) {
    socket = typeof socket === 'undefined' ? this.all : socket;
    socket.emit('ui_message', {
        message: message,
        duration: duration,
    });
};