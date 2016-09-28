var rfr = require('rfr');
var timers = require('timers');
var common = rfr('lib/common');
var game = rfr('lib/server');

'use strict';

exports.Crapette = function(io, name, max_players) {

    this.on('drop', this.on_drop);
    this.on('start', this.init.bind(this));

    game.ServerBoard.call(this, io, name, max_players);
    this.next_turn();

};

exports.main = exports.Crapette;

exports.Crapette.prototype = Object.create(game.ServerBoard.prototype);

exports.Crapette.prototype.on_drop = function(player, from, to, stack) {
    var pile = this.piles[player], deck = this.decks[player];
    if (from === deck && to === pile || deck.empty() && from === to && from === pile) {
        var i = to.stack.indexOf(stack[0]);
        var card1 = to.stack[i-1], card2 = stack[0];
        if ((typeof card1 !== 'undefined')
            && (card1.color() === 'black' && card2.color() === 'red' || card1.color() === 'red' && card2.color() === 'black')
            && (card1.real_value() === card2.real_value() + 1)) {
            this.ui_show_message('Suite!', 1000);
        } else {
            this.next_turn();
        }
    }
    if (deck.empty()) {
        if (pile.empty() && !this.end) {
            this.end = true;
            this.ui_show_message(this.get_name(player)+' a gagné!', 1000);
            timers.setTimeout(this.ui_show_message.bind(this, 'Nouvelle distribution!', 1000), 10000);
            timers.setTimeout(this.reset.bind(this), 11000);
        } else {
            this.move(pile, deck, new common.Stack(pile.stack.slice(0, pile.stack.length-1)));
        }
    }
};

exports.Crapette.prototype.random_card = function() {
    var i = Math.floor(Math.random()*this.all_cards.length);
    return this.all_cards.splice(i, 1)[0];
};

exports.Crapette.prototype.add_player_decks = function(player) {

    var nb = Math.floor(50/this.max_players);

    var deck = new common.Spot(30, 75, 10, 20);
    deck.owner = player;
    deck.orientation = this.player_orientation(player);

    // Owner
    deck.layout.owner = 'deck';
    deck.visibility.owner = { drop: 'downside', drag: 'upside' }
    deck.policy.owner = { drop: 'accept_none', drag: 'match_topstack' };
    // Player
    deck.layout.player = 'deck';
    deck.visibility.player = { drop: 'downside', drag: 'upside' };
    deck.policy.player = { drop: 'accept_none', drag: 'match_none' };

    for (var i = 0; i < nb; i++) deck.push(this.random_card());
    this.decks[player] = deck;
    this.register_spot(deck);

    var pile = new common.Spot(50, 75, 10, 20);
    pile.owner = player;
    pile.orientation = this.player_orientation(player);

    // Owner
    pile.layout.owner = 'random';
    pile.visibility.owner = { drop: 'upside', drag: 'upside' };
    pile.policy.owner = { drop: 'keep_ownership', drag: 'match_topstack' };
    // Player
    pile.layout.player = 'random' ;
    pile.visibility.player = { drop: 'upside', drag: 'upside' };
    pile.policy.player = { drop: 'accept_desc & accept_alt_colors & not_empty', drag: 'match_none' };
    // mdrrr
    // pile.policy.player.drop = '1 & (accept_any & !accept_none) | (accept_desc & ((accept_alt_colors & not_empty) & !accept_none))';

    this.piles[player] = pile;
    this.register_spot(pile);
};

exports.Crapette.prototype.init = function() {

    this.all_cards = [];
    this.piles = [];
    this.decks = [];
    for (var i = 1; i <= 56; i++) {
        var card = new common.Card(i);
        this.all_cards.push(card);
    }

    this.end = false;

    for (var p = 0; p < this.max_players; p++) this.add_player_decks(p);

    for (var i = 0; i < 6; i++) {
        var spot = new common.Spot(2+i*12, 40, 10, 20);
        spot.layout.player = 'offset';
        spot.visibility.player = { drop: 'upside', drag: 'upside' };
        spot.policy.player = { drop: 'accept_desc & accept_alt_colors', drag: 'match_above' };
        spot.push(this.random_card());
        this.register_spot(spot);
    }

    for (var i = 0; i < 4; i++) {
        var spot = new common.Spot(26+i*12, 0, 10, 20);
        spot.orientation = Math.PI/2;
        spot.layout.player = 'offset';
        spot.visibility.player = { drop: 'upside', drag: 'upside' };
        spot.policy.player = { drop: 'accept_asc & keep_family & first_real_value_is_one', drag: 'match_above' };
        this.register_spot(spot);
    }

};