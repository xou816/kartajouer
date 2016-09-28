'use strict';

if (typeof game === 'undefined') console.error('Missing common.js!');

/*
CanvasObject: abstract object that allows passing 2D context to child CanvasObjects and composing transformations across the tree.
This makes sure coordinates are properly converted.
Top most parent must have its own matrix and ctx properties!
Parents have to be set manually.
*/

game.CanvasObject = function() {
    this.parent = null;
    this.matrix = new Transform(); // See transform.js
};

// Recursively find the drawing context and apply transform matrix
game.CanvasObject.prototype.get_context = function(apply_matrix) {
    if (this.parent != null) {
        var ctx = this.parent.get_context(false); // Do not apply matrix (useless costly operation)
    } else {
        var ctx = this.ctx;
    }
    if (apply_matrix || typeof apply_matrix === 'undefined') this.get_matrix().setTransformFor(ctx);
    return ctx;
};

// Recursively apply transforms
game.CanvasObject.prototype.get_matrix = function() {
    if (this.parent != null) {
        var matrix = this.parent.get_matrix();
        matrix.multiply(this.matrix);
    } else {
        var matrix = this.matrix.copy();
    }
    return matrix;
};


// Convert screen coordinates to CanvasObject coordinates (invert = true)
game.CanvasObject.prototype.convert_coords = function(x, y, invert) {
    var matrix = this.get_matrix();
    if (typeof invert === 'undefined' || invert) matrix.invert(); // Most of the time inversion is required
    return matrix.transformPoint(x, y);
};


// Add CanvasObject.prototype to my_object.prototype (multiple inheritance sucks...)
game.declare_canvas_object = function(my_object) {
    Object.keys(game.CanvasObject.prototype).forEach(function(property) {
        my_object.prototype[property] = game.CanvasObject.prototype[property];
    });
};

/*
ClientCard: client side cards.
*/

// Sizes are in % of min(board height, board width)
game.CardStyle = {
    width: 10,
    height: 20,
    border_radius: 1,
    symbol: 2, // Symbol size
    border: 0.5,
    border_color: '#555',
    downside_color: '#AAA',
    upside_color: 'white',
    trump_color: '#DDD',
};

game.ClientCard = function(value) {
    game.Card.call(this, value); // 0 is a special value used by the server
    game.CanvasObject.call(this);
    this.x = 0;
    this.y = 0;
    this.style = game.CardStyle;
    this.drag = null; // Drag information (to restore drag offset)
};

game.ClientCard.prototype = Object.create(game.Card.prototype); // Inherit from common implementation
game.declare_canvas_object(game.ClientCard);

// Move a card to screen point ($x, $y)
game.ClientCard.prototype.move = function(x, y) {
    if (this.is_dragged()) { // Restore drag offset
        var coords = this.convert_coords(x, y);
        this.x = coords[0] - this.drag.dx;
        this.y = coords[1] - this.drag.dy;
    } else {
        var coords = this.convert_coords(x, y);
        this.x = coords[0];
        this.y = coords[1];
    }
};

game.ClientCard.prototype.is_dragged = function() {
    return (this.drag != null);
};

// Save drag offset to restore it when card is moved
// Additionnaly allows checking for drag state (see ClientCard.is_dragged)
game.ClientCard.prototype.set_drag_origin = function(x, y) {
    var xy = this.convert_coords(x, y);
    this.drag = {dx: xy[0] - this.x, dy: xy[1] - this.y};
};

// Set up the outline path on a given $ctx
game.ClientCard.prototype.path = function(ctx) {

    var r = this.style.border_radius;
    var w = this.style.width;
    var h = this.style.height;
    var x = this.x;
    var y = this.y;

    // Rounded corners
    if (r > 0) {
        ctx.beginPath();
        ctx.arc(x + r, y + r, r, Math.PI, -Math.PI/2, false); // Top left
        ctx.lineTo(x + w - r, y);
        ctx.arc(x + w - r, y + r, r, -Math.PI/2, 0, false); // Top right
        ctx.lineTo(x + w, y + h - r);
        ctx.arc(x + w - r, y + h - r, r, 0, Math.PI/2, false); // Bottom right
        ctx.lineTo(x + r, y + h);
        ctx.arc(x + r, y + h - r, r, Math.PI/2, Math.PI, false); // Bottom left
        ctx.closePath();
    } else {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.closePath();
    }

};

// Draw a card
game.ClientCard.prototype.draw = function() {

    var ctx = this.get_context(); // Use global context
    ctx.save();
    this.path(ctx);

    ctx.strokeStyle = this.style.border_color;
    ctx.lineWidth = this.style.border;
    ctx.stroke();

    if (this.up && this.value != 0) {
        this.draw_upside(ctx);
    } else {
        this.draw_downside(ctx);
    }

    ctx.restore();
};

game.ClientCard.prototype.draw_downside = function(ctx) {
    ctx.fillStyle = this.style.downside_color;
    ctx.fill();
};

game.ClientCard.prototype.draw_upside = function(ctx) {

    var size = this.style.symbol;
    var text = this.display_value();

    if (this.value <= 56) {

        ctx.fillStyle = this.style.upside_color;
        ctx.fill();

        ctx.font = 0.8*size+'px sans';
        ctx.lineWidth = 0.1*size;

        var color = this.color(); // Set color for fill, stroke and text operations
        ctx.fillStyle = color;
        ctx.strokeStyle = color; // Stroke to make text more legible (appears bold)

        // Top symbol
        ctx.save();
        ctx.translate(this.x + 3/2*size, this.y + 3/2*size + size);
        this.draw_symbol(ctx, size);
        ctx.translate(-1/4*size, -size);
        ctx.fillText(text, 0, 0);
        ctx.strokeText(text, 0, 0);
        ctx.restore();

        // Bottom, reversed symbol
        ctx.save();
        ctx.translate(this.x + this.style.width - 3/2*size, this.y + this.style.height - 3/2*size - size);
        ctx.rotate(Math.PI);
        this.draw_symbol(ctx, size);
        ctx.translate(-1/4*size, -size);
        ctx.fillText(text, 0, 0);
        ctx.strokeText(text, 0, 0);
        ctx.restore();

    } else {

        ctx.fillStyle = this.style.trump_color;
        ctx.fill();

        ctx.save();
        ctx.font = 'bold '+(3*size)+'px sans';
        ctx.fillStyle = this.style.border_color;
        ctx.lineWidth = 0.2*size;
        var width = ctx.measureText(text).width;
        ctx.translate(this.x + 1/2*(this.style.width - width), this.y + 1/2*this.style.height);
        ctx.fillText(text, 0, 0);
        ctx.restore();

    }


};

game.ClientCard.prototype.draw_symbol = function(ctx, size) {

    if (this.value <= 14) { // Diamond

        ctx.save();
        ctx.rotate(Math.PI/4);
        ctx.fillRect(-size/2, -size/2, 3/4*size, 3/4*size);
        ctx.restore();

    } else if (this.value <= 28) { // Heart

        ctx.beginPath();
        ctx.arc(-size/4, 0, size/4, 3/4*Math.PI, -Math.PI/4, false);
        ctx.arc(size/4, 0, size/4, -3/4*Math.PI, Math.PI/4, false);
        ctx.lineTo(0, size/2+size/4);
        ctx.closePath();
        ctx.fill();

    } else if (this.value <= 42) { // Spades

        ctx.beginPath();
        ctx.arc(size/4, 0, size/4, -Math.PI/4, 3/4*Math.PI, false);
        ctx.arc(-size/4, 0, size/4, Math.PI/4, -3/4*Math.PI, false);
        ctx.lineTo(0, -3/4*size);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(size/4, size/4, size/4, Math.PI, Math.PI/2, true);
        ctx.lineTo(-size/2, size/2);
        ctx.arc(-size/4, size/4, size/4, Math.PI/2, 0, true);
        ctx.closePath();
        ctx.fill();

    } else if (this.value <= 56) { // Club

        ctx.beginPath();
        ctx.arc(size/4, size/6, size/4, 0, 2*Math.PI, true);
        ctx.arc(-size/4, size/6, size/4, 0, 2*Math.PI, true);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -size/5, size/4, 0, 2*Math.PI, true);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(size/4, size/4, size/4, Math.PI, Math.PI/2, true);
        ctx.lineTo(-size/2, size/2);
        ctx.arc(-size/4, size/4, size/4, Math.PI/2, 0, true);
        ctx.closePath();
        ctx.fill();

    }

};

// Clear the canvas zone occupied by a card
game.ClientCard.prototype.clear = function() {
    var ctx = this.get_context();
    var margin = this.style.border;
    ctx.clearRect(this.x-margin, this.y-margin, this.style.width+2*margin, this.style.height+2*margin);
};

// Hitbox testing, ($x, $y) being screen coordinates
game.ClientCard.prototype.is_inside = function(x, y) {
    var coords = this.convert_coords(x, y);
    x = coords[0];
    y = coords[1];
    return (this.x <= x) && (x <= this.x + this.style.width) && (this.y <= y) && (y <= this.y + this.style.height);
};

game.ClientCard.prototype.center = function() {
    return [this.x + this.style.width/2, this.y + this.style.height/2];
};

game.ClientCard.prototype.seed = function() {
    if (typeof this.random === 'undefined') this.random = Math.random();
    return this.random;
};

/*
*/

game.ClientStack = function(arr) {
    game.CanvasObject.call(this);
    game.Stack.call(this, arr);
};

game.ClientStack.prototype = Object.create(game.Stack.prototype); // Inherit from common implementation
game.declare_canvas_object(game.ClientStack);

game.ClientStack.prototype.copy = function() {
    return new game.ClientStack(this.slice());
};

game.ClientStack.prototype.draw = function() {
    this.forEach(function(card) {
        card.draw();
    });
};

game.ClientStack.prototype.clear = function() {
    this.forEach(function(card) {
        card.clear();
    });
};

/*
Layout: used by both layout.drag and layout.drop policies.
*/

game.Layout = {};

game.Layout.hand = function(spot, stack, focus) {
    var nb = stack.length;
    var max_angle = 0.75*Math.PI;
    var radius = 8;
    var angle = 0.075*Math.PI;
    if (nb*angle > max_angle) {
        angle = max_angle/nb;
    }
    var offset = 0;
    for (var i = 0; i < stack.length; i++) {
        var card = stack[i];
        card.x = spot.x + (spot.width - card.style.width)/2;
        card.y = spot.y;
        var dx = card.x + card.style.width/2, dy = card.y + card.style.height; // Rotate aroud the center of the bottom edge
        card.matrix.reset();
        card.matrix.translate(0, radius);
        card.matrix.translate(dx, dy);
        card.matrix.rotate(angle*(offset+i-Math.floor(nb/2)));
        card.matrix.translate(-dx, -dy);
        card.matrix.translate(0, -radius);
        if (typeof focus !== 'undefined' && focus.id === card.id) {
            offset = 1.5;
            card.y -= 1;
        }
    }
};

game.Layout.gallery = function(spot, stack, focus) {
    var nb = stack.length;
    var width = game.CardStyle.width + game.CardStyle.border;
    var diff = 100-nb*width;
    if (diff > 0) {
        for (var i = 0; i < nb; i++) {
            var card = stack[i];
            card.matrix.reset();
            card.x = diff/2 + i*width;
            card.y = spot.y;
            if (typeof focus !== 'undefined' && focus.id === card.id) {
                card.y -= 1;
            }
        }
    } else {
        var offset = 0;
        for (var i = 0; i < nb; i++) {
            var card = stack[i];
            card.matrix.reset();
            card.x = (offset+i)*100/nb;
            card.y = spot.y;
            if (typeof focus !== 'undefined' && focus.id === card.id) {
                offset = 1;
                card.y -= 1;
            }
        }
    }
};

// Add a random tilt to cards
game.Layout.random = function(spot, stack, focus) {
    stack.forEach(function(card) {
        card.x = spot.x + spot.width/2 - card.style.width/2;
        card.y = spot.y + spot.height/2 - card.style.height/2;
        var n = 6; // Max absolute tilt angle is pi/n
        var angle = card.seed()*Math.PI/n - Math.PI/(2*n);
        var center = card.center();
        card.matrix.reset();
        card.matrix.translate(center[0], center[1]);
        card.matrix.rotate(angle);
        card.matrix.translate(-center[0], -center[1]);
    });
};

game.Layout.offset = function(spot, stack, focus) {
    var offset = 0;
    stack.forEach(function(card) {
        card.matrix.reset();
        var i = spot.stack.indexOf(card);
        card.x = spot.x;
        card.y = spot.y +1/10*card.style.height*(offset+i);
        if (typeof focus !== 'undefined' && focus.id === card.id) {
            offset = 1;
        };
    });
};

game.Layout.deck = function(spot, stack, focus) {
    stack.forEach(function(card) {
        card.matrix.reset();
        var i = spot.stack.indexOf(card);
        card.x = spot.x + 1/100*card.style.height*i;
        card.y = spot.y + 1/100*card.style.height*i;
    });
};

/*
ClientSpot
*/

game.ClientSpot = function(x, y, width, height) {
    game.Spot.call(this, x, y, width, height);
    game.CanvasObject.call(this);
    this.stack = new game.ClientStack();
    this.stack.parent = this;
    this.drag_stack = new game.ClientStack();
    this.drag_stack.parent = this;
    this.thickness = 0.25;
};

game.ClientSpot.prototype = Object.create(game.Spot.prototype);
game.declare_canvas_object(game.ClientSpot);

// Draw the hitbox as an outline
game.ClientSpot.prototype.draw_helper = function() {
    var ctx = this.get_context();
    ctx.save();
    ctx.strokeStyle = '#CCC';
    ctx.lineWidth = this.thickness;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
    ctx.restore();
};

// Clear hitbox
game.ClientSpot.prototype.clear_helper = function() {
    var ctx = this.get_context();
    var th = this.thickness; // See draw_helper above!
    ctx.clearRect(this.x-th, this.y-th,  this.width+2*th, this.height+2*th);
};

// Hitbox testing
game.ClientSpot.prototype.is_inside = function(x, y) {
    var strict = false;
    var converted = this.convert_coords(x, y);
    var inside = (this.x <= converted[0] && converted[0] <= this.x + this.width && this.y <= converted[1] && converted[1] <= this.y + this.height);
    if (!strict) { // Use card hitboxes to make dropping easier
        this.stack.forEach(function(card) {
            inside = inside || card.is_inside(x, y);
        });
    }
    return inside;
};

// Return a subset of a spot stack under the point ($x, $y)
game.ClientSpot.prototype.get_matches = function(x, y) {
    var matches = new game.ClientStack();
    this.stack.forEach(function(card) {
        if (card.is_inside(x, y)) {
            matches.push(card);
        }
    });
    return matches;
};

game.ClientSpot.prototype.update_layout = function(focus) {
    this.get_context_property('layout').split(',').forEach(function(name) {
        var fun = game.Layout[name.trim()];
        fun(this, this.stack, focus);
    }, this);
};

// Some inherited methods must specify the parent CanvasObject for proper transformations handling
// We also need to introduce client side layouting

game.ClientSpot.prototype.push = function(card) {
    game.Spot.prototype.push.call(this, card);
    card.parent = this.stack;
};

game.ClientSpot.prototype.remove = function(card) {
    game.Spot.prototype.remove.call(this, card);
    card.parent = null;
};

game.ClientSpot.prototype.tie = function(card, other_spot) {
    game.Spot.prototype.tie.call(this, card, other_spot);
    card.parent = other_spot.stack;
    other_spot.update_layout();
};

game.ClientSpot.prototype.free = function(card) {
    game.Spot.prototype.free.call(this, card);
    card.parent = this.drag_stack;
};

game.ClientSpot.prototype.set_drag_stack = function(substack) {
    game.Spot.prototype.set_drag_stack.call(this, substack);
    this.update_layout();
};

game.ClientSpot.prototype.import = function(data) {

    this.x = data.x;
    this.y = data.y;
    this.width = data.width;
    this.height = data.height;

    // Apply correct orientation and keep it in memory
    this.orientation = data.orientation;
    ([this, this.drag_stack]).forEach(function(object) {
        object.matrix.reset();
        object.matrix.translate(50, 50);
        object.matrix.rotate(data.orientation);
        object.matrix.translate(-50, -50);
    });

    this.id = data.id;
    this.owner = data.owner;

    this.context = data.context;
    this.policy = data.policy;
    this.layout = data.layout;
    this.visibility = data.visibility;

};

/*
Canvas: small wrapper around the actual canvas element
*/

// Create a new Canvas as child of a given $dom_node
game.Canvas = function(dom_node) {
    game.CanvasObject.call(this);
    this.node = document.createElement('canvas');
    this.node.style.position = 'absolute';
    this.node.style.left = 0;
    this.node.style.top = 0;
    dom_node.appendChild(this.node);
    this.ctx = this.node.getContext('2d');
    this.matrix = new Transform();
    this.autoscale();
};

game.Canvas.prototype = Object.create(game.CanvasObject.prototype);

game.Canvas.prototype.clear = function() {
    var ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.node.width, this.node.height);
    ctx.restore();
};

game.Canvas.prototype.autoscale = function() {
    var w = this.node.parentNode.offsetWidth, h = this.node.parentNode.offsetHeight;
    this.node.width = w;
    this.node.height = h;
    var tr_x = w > h ? 1 : 0;
    var tr_y = h > w ? 1 : 0;
    var factor = Math.min(w, h)/100;
    this.matrix.reset();
    this.matrix.translate(tr_x/2*(Math.max(w, h)-Math.min(w, h)), tr_y/2*(Math.max(w, h)-Math.min(w, h)))
    this.matrix.scale(factor, factor);
};

game.Canvas.prototype.rotate = function(angle) {
    this.matrix.translate(50, 50); // Assume scaled!!
    this.matrix.rotate(angle);
    this.matrix.translate(-50, -50);
};

/*
*/

game.TextBox = function(box, box_color, text, text_color) {
    game.CanvasObject.call(this);
    this.box = box;
    this.box_color = box_color;
    this.text = text;
    this.text_color = text_color;
};

game.TextBox.prototype = Object.create(game.CanvasObject.prototype);

game.TextBox.prototype.draw = function() {

    var x = this.box[0], y = this.box[1], width = this.box[2], height = this.box[3];
    var ctx = this.get_context();
    ctx.save();

    ctx.font = (1/2*height).toString()+'px sans';
    var text_width = ctx.measureText(this.text).width;
    var render_width = Math.max(width, text_width+4);
    var text_diff = render_width-text_width;
    var box_diff = render_width-width;

    ctx.translate(x - box_diff/2, y);
    ctx.clearRect(0, 0, render_width, height);
    if (this.box_color !== null) {
        ctx.fillStyle = this.box_color;
        ctx.fillRect(0, 0, render_width, height);
    }
    ctx.fillStyle = this.text_color === undefined ? 'black' : this.text_color;
    ctx.fillText(this.text, text_diff/2, 3/4*height);

    this.box[0] = x - box_diff/2;
    this.box[2] = render_width;
    ctx.restore();

};

game.TextBox.prototype.clear = function() {
    var ctx = this.get_context();
    ctx.clearRect(this.box[0]-1, this.box[1]-1, this.box[2]+2, this.box[3]+2);
};


/*
ClientBoard: holds spots, handles pointer events and communicates with server.
*/

game.ClientBoard = function(dom_node, socket, name) {

    this.node = dom_node;
    this.node.style.position = 'relative';
    this.background = new game.Canvas(dom_node);
    this.foreground = new game.Canvas(dom_node);
    this.overlay = new game.Canvas(dom_node);
    window.addEventListener('resize', this.resize.bind(this));

    this.socket = socket;
    this.player = -1;
    this.orientation = 0;
    this.turn = -1;

    this.mouse_spot = null;
    this.force_drop = false;
    this.server_move_queue = [];

    this.spots = [];
    this.cards = [];

    // Client events
    this.node.addEventListener('mousedown', (function(event) {
        event.preventDefault();
        this.canvas_drag_handler(event.pageX, event.pageY);
    }).bind(this));
    this.node.addEventListener('touchstart', (function(event) {
        event.preventDefault();
        this.canvas_drag_handler(event.changedTouches[0].pageX, event.changedTouches[0].pageY);
    }).bind(this))
    this.node.addEventListener('mousemove', (function(event) {
        event.preventDefault();
        this.canvas_move_handler(event.pageX, event.pageY);
    }).bind(this));
    this.node.addEventListener('touchmove', (function(event) {
        event.preventDefault();
        this.canvas_move_handler(event.changedTouches[0].pageX, event.changedTouches[0].pageY);
    }).bind(this));
    this.node.addEventListener('mouseup', (function(event) {
        event.preventDefault();
        this.canvas_drop_handler(event.pageX, event.pageY);
    }).bind(this));
    this.node.addEventListener('touchend', (function(event) {
        event.preventDefault();
        this.canvas_drop_handler(event.changedTouches[0].pageX, event.changedTouches[0].pageY);
    }).bind(this));

    // Server events
    socket.on('update_board', this.update_board.bind(this));
    socket.on('update_spot', this.update_spot.bind(this));
    socket.on('update_cards', this.update_cards.bind(this));
    socket.on('update_players', this.update_players.bind(this));
    socket.on('client_drag', this.drag_handler.bind(this));
    socket.on('client_move', this.move_handler.bind(this));
    socket.on('client_drop', this.drop_handler.bind(this));
    socket.on('turn', this.turn_handler.bind(this));
    socket.on('server_move', this.server_move_handler.bind(this));
    socket.on('pong', this.pong.bind(this));
    socket.on('disconnect', this.pong.bind(this, -1));

    // Used to limit the number of 'move' events being sent
    this.move_last = 0;
    this.move_interv = 32;

    // Overlay related events
    socket.on('ui_message', this.ui_message.bind(this));

    // Name setting (a bit hacky...)
    if (name.length > 0) {
        this.chat_send('/nick '+name);
    }

};

game.ClientBoard.prototype.chat_send = function(message) {
    this.socket.emit('chat', { message: message, time: Date.now() });
};

game.ClientBoard.prototype.on_message_received = function(handler) {
    this.socket.on('chat', function(array) {
        array.forEach(function(message) {
            handler.call(null, message);
        }, this);
    }, this);
};

game.ClientBoard.prototype.can_play = function(player) {
    return this.turn === player;
};

game.ClientBoard.prototype.turn_handler = function(turn) {

    this.turn = turn;

    // Visual feedback
    this.draw_players();
    if (this.turn > -1) {
        var message = turn === this.player ? 'Your turn!' : this.get_name(turn)+'\'s turn!';
        this.ui_message({ message: message, duration: 1000 });
        document.title = message;
    }

    // Set context
    this.spots.forEach(function(spot) {
        spot.set_context(this.player, this.can_play(this.player));
    }, this);

};

game.ClientBoard.prototype.get_name = function(player) {
    return this.player_names[player];
};

game.ClientBoard.prototype.online = function(player) {
    return this.players[player] === 1;
};

// Get the stack of cards matching $ids
game.ClientBoard.prototype.ids_to_cards = function(ids) {
    var stack = new game.ClientStack();
    ids.forEach(function(id) {
        stack.push(this.cards[id]);
    }, this);
    return stack;
};

// Import server data (handler)
game.ClientBoard.prototype.update_board = function(data) {

    this.player = data.player;
    this.spots = [];
    this.cards = [];
    this.orientation = data.orientation;

    data.board.forEach(function(spot_data) { // Spots pushed in order to keep indices and ids being the same

        var spot = new game.ClientSpot();
        spot.import(spot_data);

        // Import cards as well
        spot_data.stack.forEach(function(card_data) {
            var card = new game.ClientCard(card_data.value);
            card.id = card_data.id;
            this.cards[card.id] = card; // Register cards as well
            spot.push(card);
        }, this);

        spot.update_layout();
        
        this.spots.push(spot);
        spot.parent = this.background;

    }, this);

    this.resize();
};

game.ClientBoard.prototype.update_spot = function(spot_data) {
    var spot = this.spots[spot_data.id];
    this.clear();
    spot.import(spot_data);
    spot.update_layout();
    spot.update_visibility();
    this.draw();
};

game.ClientBoard.prototype.update_players = function(data) {
    this.player_names = data.player_names;
    this.players = data.players;
    this.overlay.clear();
    this.draw_players();
};

// Handle card value updates
game.ClientBoard.prototype.update_cards = function(data) {
    this.clear();
    Object.keys(data).forEach(function(key) {
        this.cards[key].value = data[key];
    }, this);
    this.draw();
};

/*
*/

game.ClientBoard.prototype.spot_helpers_clear = function() {
    this.spots.forEach(function(spot) {
        spot.clear_helper();
    }, this);
};

game.ClientBoard.prototype.spot_helpers_draw = function(from) {
    // If some cards are unknown at the time, we show all possible spots
    var show_all = from.drag_stack.filter(function(card) {
        return card.value === 0;
    }).length > 0;
    this.spots.forEach(function(spot) {
        if (show_all || spot.accept_drop(from, from.drag_stack)) {
            spot.draw_helper();
        }
    });
};

game.ClientBoard.prototype.clear = function() {
    this.spots.forEach(function(spot) {
        spot.stack.clear();
    }, this);
    this.spots.forEach(function(spot) {
        spot.drag_stack.clear();
    }, this);
};

game.ClientBoard.prototype.draw = function() {
    this.spots.forEach(function(spot) {
        spot.stack.draw();
    }, this);
    this.spots.forEach(function(spot) {
        spot.drag_stack.draw();
    }, this);
};

game.ClientBoard.prototype.draw_players = function() {
    var max = this.players.length;
    for (var i = 0; i < max; i++) {
        if (this.online(i)) {
            var matrix = new Transform();
            matrix.translate(50, 50);
            matrix.rotate(2*Math.PI/max*(this.player-i));
            matrix.translate(-50, -50);
            var color = this.can_play(i) ? 'rgba(0, 192, 0, 0.3)' : 'rgba(255, 255, 255, 0.5)';
            var tb = new game.TextBox([45, 96, 10, 4], color, this.get_name(i));
            tb.parent = this.overlay;
            tb.matrix = matrix;
            tb.draw();
        }
    }
}

// Show a message on the overlay
game.ClientBoard.prototype.ui_message = function(data) {
    this.message_textbox = new game.TextBox([0, (100-8)/2, 100, 8], 'rgba(255, 0, 0, 0.4)', data.message, 'white');
    this.message_textbox.parent = this.overlay;
    this.message_textbox.draw();
    if (data.duration > 0) {
        var fun = this.message_textbox.clear.bind(this.message_textbox);
        window.setTimeout(fun, data.duration);
    }
};

// Handle pong event, refresh ping display
game.ClientBoard.prototype.pong = function(time) {
    if (time > -1) {
        var color = time < 200 ? 'green' : 'orange';
        this.ping_textbox = new game.TextBox([2, 2, 10, 4], null, time.toString()+'ms', color);
    } else {
        this.ping_textbox = new game.TextBox([2, 2, 10, 4], null, 'error', 'red');
        this.ui_message({ message: 'Disconnected, press F5 to retry.', duration: 2000 });
    }
    this.ping_textbox.parent = this.overlay;
    this.ping_textbox.draw();
};

game.ClientBoard.prototype.resize = function() {
    this.foreground.autoscale();
    this.foreground.rotate(this.orientation);
    this.background.autoscale();
    this.background.rotate(this.orientation);
    this.draw();
    this.overlay.autoscale();
    this.draw_players();
};

/*
Event handlers
Methods prefixed with do_ are used by pointer events handlers and server events handlers alike
*/

game.ClientBoard.prototype.do_drag = function(spot, matches, draw_helpers) {
    draw_helpers = typeof draw_helpers === 'undefined' ? false : draw_helpers;
    this.clear();
    spot.set_drag_stack(matches);
    spot.drag_stack.parent = this.foreground;
    spot.drag_stack.draw();
    if (draw_helpers) this.spot_helpers_draw(spot);
    this.draw();
};

game.ClientBoard.prototype.canvas_drag_handler = function(x, y) {
    if (this.mouse_spot === null) {
        this.spots.some(function(spot) { // some() will stop when callback returns true, so we allow dragging only from one spot at a time
            var original_matches = spot.get_matches(x, y);
            var matches = spot.filter_drag(original_matches);
            if (matches.length > 0) {
                this.mouse_spot = spot; // Only this spot will be controlled by mouse events
                this.server_drag(spot, original_matches, matches); // Server verification and commit
                matches.forEach(function(card) {
                    card.set_drag_origin(x, y); // Initialize dragging (save offset)
                });
                this.do_drag(spot, matches, true);
                return true;
            } else {
                return false;
            }
        }, this);
    }
};

game.ClientBoard.prototype.do_move = function(spot, x, y) { // Spot which drag_stack contains cards to move
    spot.drag_stack.clear();
    spot.drag_stack.forEach(function(card) {
        card.move(x, y);
    });
    spot.drag_stack.draw();
};

game.ClientBoard.prototype.canvas_move_handler = function(x, y) {
    if (this.mouse_spot !== null) {
        if (this.mouse_spot.drag_stack.length > 0) {
            this.server_move(this.mouse_spot, x, y);
            this.do_move(this.mouse_spot, x, y);
        }
        if (this.force_drop) {
            this.canvas_drop_handler(x, y);
        }
    } else {
        this.spots.forEach(function(spot) {
            spot.stack.some(function(card) {
                var matches = spot.get_matches(x, y);
                // Disabled for now...
                if (0 && matches.length > 0) {
                    var msg = matches.map(function(card) {
                        return card.name();
                    }).join(', ');
                    if (typeof this.card_textbox !== 'undefined') this.card_textbox.clear();
                    this.card_textbox = new game.TextBox([90, 2, 10, 4], null, msg, '#999');
                    this.card_textbox.parent = this.overlay;
                    this.card_textbox.draw();
                }
                var focus = matches.top();
                if (spot.filter_drag(matches).indexOf(focus) > -1) {
                    spot.stack.clear();
                    spot.update_layout(focus);
                    spot.stack.draw();
                    return true;
                }
                return false;
            }, this);
        }, this);
    }
};

game.ClientBoard.prototype.do_drop = function(from, to, clear_helpers) {
    clear_helpers = typeof clear_helpers === 'undefined' ? false : clear_helpers;
    if (clear_helpers) this.spot_helpers_clear();
    this.clear();
    from.drag_stack.parent = this.background;
    to.stack.clear();
    from.transfer_drag_stack(to);
    this.draw();
};

game.ClientBoard.prototype.canvas_drop_handler = function(x, y) {
    if (this.mouse_spot !== null) {
        var done = false;
        var spot = this.mouse_spot;
        var drag_stack = spot.drag_stack;
        if (drag_stack.length > 0) { // If something is being dragged from spot
            this.spots.some(function(drop_spot) { // Find one drop_spot to drop to (multi drop not supported)
                if (drop_spot.is_inside(x, y) && drop_spot.accept_drop(spot, drag_stack)) {
                    this.server_drop(spot, drop_spot);
                    spot.drag_stack.forEach(function(card) {
                        card.drag = null;
                    });
                    this.do_drop(spot, drop_spot, true);
                    this.mouse_spot = null;
                    done = true;
                    return true;
                }
                return false;
            }, this);
        }
        this.force_drop = !done;
    }
};

/*
Server communication: handlers and senders
*/

game.ClientBoard.prototype.server_drag = function(spot, original_matches, matches) {
    this.socket.emit('client_drag', { spot: spot.id, original_matches: original_matches.ids(), matches: matches.ids() });
};

game.ClientBoard.prototype.drag_handler = function(data) {
    var spot = this.spots[data.spot];
    var matches = this.ids_to_cards(data.matches);
    this.do_drag(spot, matches);
};

game.ClientBoard.prototype.server_move = function(spot, x, y) {
    // Spot information is enough: cards from its drag_stack are those to be moved
    var now = Date.now();
    if (now - this.move_last > this.move_interv) { // Limit 'move' events
        var coords = spot.convert_coords(x, y);
        this.socket.emit('client_move', { spot: spot.id, x: coords[0], y: coords[1] });
        this.move_last = now;
    }
};

game.ClientBoard.prototype.move_handler = function(data) {
    var spot = this.spots[data.spot];
    var coords = spot.convert_coords(data.x, data.y, false);
    this.do_move(spot, coords[0], coords[1]);
};

game.ClientBoard.prototype.server_drop = function(spot, drop_spot) {
    this.socket.emit('client_drop', { from: spot.id, to: drop_spot.id });
};

game.ClientBoard.prototype.drop_handler = function(data) {
    var from = this.spots[data.from];
    var to = this.spots[data.to];
    this.do_drop(from, to);
};

// Move initiated by server
game.ClientBoard.prototype.server_move_handler = function(data) {
    this.server_move_queue.push(data);
    if (this.server_move_queue.length === 1) {
        this.server_move_dequeue();
    }
};

game.ClientBoard.prototype.server_move_dequeue = function() {

    var data = this.server_move_queue[0];

    var from = this.spots[data.from], to = this.spots[data.to], stack = this.ids_to_cards(data.stack);
    this.do_drag(from, stack);

    var fps = 30;
    var init = from.convert_coords(from.x, from.y, false), final = to.convert_coords(to.x, to.y, false);
    var x0 = init[0], y0 = init[1];
    var xf = final[0], yf = final[1];
    var dist = Math.sqrt(Math.pow(xf-x0, 2) + Math.pow(yf-y0, 2));
    var speed = 0.075;
    var time = dist/speed;

    var f = function(amplitude, steepness, step) {
        return amplitude*(1-Math.exp(-step*steepness));
    };
    var fx = f.bind(null, xf-x0, 1/10);
    var fy = f.bind(null, yf-y0, 1/10);

    var step = 0;
    var total = Math.floor(time*fps/1000);
    var id = window.setInterval((function() {
        if (step === total) {
            window.clearInterval(id);
            this.do_drop(from, to);
            this.server_move_queue.splice(0, 1);
            if (this.server_move_queue.length > 0) {
                this.server_move_dequeue();
            }
            return;
        } else {
            var x = x0 + fx(step);
            var y = y0 + fy(step);
            this.do_move(from, x, y);
        }
        step++;
    }).bind(this), fps/1000);

};