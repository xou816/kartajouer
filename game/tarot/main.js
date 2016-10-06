var rfr = require('rfr');
var timers = require('timers');
var common = rfr('lib/common');
var game = rfr('lib/server');
var tarot = rfr('game/tarot/common/common');
game.add_namespace(tarot); // !!!

'use strict';

exports.options = {};
exports.options.min_players = 3;
exports.options.max_players = 5;

exports.Tarot = function(io, name, max_players) {

    this.on('drop', this.on_drop.bind(this));
    this.on('start', this.init.bind(this));

    this.counter = 0;
    this.start = 0;
    this.prop_excuse = -1;
    this.excuse = null;
    this.a_rembourser = -1;

    this.taille_chien = max_players < 5 ? 6 : 3;
    this.phase = 'Enchère';
    this.preneur = -1;
    this.attaque = [];
    this.defense = [];
    this.prise = 0;
    this.appel = -1;
    this.carte_appel = null;

    game.ServerBoard.call(this, io, name, max_players);
    if (this.max_players == 5) this.set_command('appel', this.command_appel);
    this.set_command('enchere', this.command_enchere);
    this.set_command('chien', this.command_chien);

};

exports.main = exports.Tarot;

exports.Tarot.prototype = Object.create(game.ServerBoard.prototype);

exports.Tarot.prototype.dominant = function(stack) {
    var family = stack[0].real_value() === 0 ? stack[1].family() : stack[0].family();
    if (family !== 'trump') {
        var trumps = stack.extract_family('trump');
        if (trumps.length > 1 || trumps.length === 1 && trumps[0].real_value() !== 0) family = 'trump';
    }
    return family;
};

exports.Tarot.prototype.rembourser_excuse = function() {
    if (this.a_rembourser > -1) {
        var pile = this.piles[this.prop_excuse];
        if (pile.stack.length > 0) {
            for (var i = pile.stack.length-1; i > -1; i--) {
                if (this.valeur(pile.stack[i]) === 0.5) {
                    this.move(pile, this.piles[this.a_rembourser], pile.stack[i].stacked());
                    this.a_rembourser = -1;
                    break;
                }
            }
        }
    }
};

exports.Tarot.prototype.on_drop = function(player, from, to, stack) {

    if (to.id === this.center.id && this.hands.indexOf(from) > -1 && this.phase == 'Jeu') {

        this.counter++;

        if (stack[0].real_value() === 0) { // Excuse
            this.prop_excuse = player;
            this.excuse = stack[0];
        }

        if (stack[0] === this.carte_appel) {
            var message = this.attaque.map(this.get_name.bind(this)).join(' et ')+' sont alliés!';
            this.chat_send('TarotBot', message);
        }

        if (this.counter === this.max_players) {

            var center = this.center;
            var family = this.dominant(center.stack);
            var matching = center.stack.extract_family(family);
            var max = matching.max_real_value();
            var winner = (center.stack.indexOf(max) + this.start)%this.max_players;

            if (this.excuse !== null) {
                if (winner !== this.prop_excuse) {
                    var pile = this.piles[this.prop_excuse];
                    this.move(center, pile, this.excuse.stacked());
                    this.a_rembourser = winner;
                } else {
                    this.a_rembourser = -1;
                }
            }
            this.rembourser_excuse();
            this.move(center, this.piles[winner]);

            this.counter = 0;
            this.start = winner;
            this.excuse = null;

            if (this.hands[winner].empty()) {
                this.next_turn(-1);
                this.compter_points();
            } else {
                this.next_turn(winner);
            }

        } else {

            this.next_turn();

        }

    }

};

exports.Tarot.prototype.random_card = function() {
    var i = Math.floor(Math.random()*this.all_cards.length);
    return this.all_cards.splice(i, 1)[0];
};

exports.Tarot.prototype.valeur = function(card) {
    var value = card.real_value();
    if (card.family() === 'trump') {
        if (tarot.bout(card)) return 4.5;
        return 0.5;
    } else {
        if (value > 10) return 0.5 + value - 10;
        return 0.5;
    }
};

exports.Tarot.prototype.compter_points = function() {
    var objectif = [56, 51, 41, 36];
    var points_def = 0;
    var points_att = 0;
    var bouts = 0;
    this.defense.forEach(function(player) {
        this.piles[player].stack.forEach(function(card) {
            points_def += this.valeur(card);
        }, this);
    }, this);
    this.attaque.forEach(function(player) {
        this.piles[player].stack.forEach(function(card) {
            if (tarot.bout(card)) bouts++;
            points_att += this.valeur(card);
        }, this);
    }, this);
    var diff = points_att - objectif[bouts];
    var names = this.attaque.map(this.get_name.bind(this));
    if (diff > 0) {
        this.chat_send('TarotBot', 'Victoire de '+names.join(' et ')+' de '+diff.toString()+' points!');
    } else {
        this.chat_send('TarotBot', names.join(' et ')+' ont perdu de '+(-diff).toString()+' points...');
    }
    timers.setTimeout(this.ui_show_message.bind(this, 'Nouvelle distribution!', 1000), 10000);
    timers.setTimeout(this.reset.bind(this), 11000);
};

exports.Tarot.prototype.init_player_cards = function(player) {

    var nb = Math.floor((78-this.taille_chien)/this.max_players);

    var pile = new common.Spot(110, 40, 10, 20);
    pile.owner = player;
    pile.orientation = this.player_orientation(player) + Math.PI/2;
    pile.layout.owner = 'random';
    pile.visibility.owner = {
        drop: 'upside',
        drag: 'downside',
    };
    pile.layout.player = 'random';
    pile.visibility.player = {
        drop: 'downside',
        drag: 'downside',
    };
    this.register_spot(pile);
    this.piles[player] = pile;

    var hand = new common.Spot(45, 76, 10, 20);
    hand.owner = player;
    hand.orientation = this.player_orientation(player);
    hand.layout.owner = 'gallery';
    hand.visibility.owner = {
        drop: 'upside',
        drag: 'upside',
    };
    if (this.max_players > 3) hand.layout.owner = 'hand';
    hand.layout.player = 'hand';
    hand.visibility.player = {
        drop: 'downside',
        drag: 'downside',
    };
    hand.policy.owner = hand.policy.idle_owner = {
        drop: 'accept_cancel',
        drag: 'match_topmatch',
    };
    for (var i = 0; i < nb; i++) hand.push(this.random_card());
    this.register_spot(hand);
    this.hands[player] = hand;

};

exports.Tarot.prototype.init = function() {

    this.all_cards = [];
    this.piles = [];
    this.hands = [];
    for (var i = 1; i <= 78; i++) {
        var card = new common.Card(i);
        this.all_cards.push(card);
    }

    this.phase = 'Enchère';
    this.next_turn(0);
    this.chat_send('TarotBot', 'Pour jouer, utilisez la commande /enchere.');

    var center = new common.Spot(35, 35, 30, 30);
    center.layout.player = 'random';
    center.visibility.player = {
        drop: 'downside',
        drag: 'downside',
    };
    center.policy.player = {
        drop: 'accept_none',
        drag: 'match_none',
    };
    for (var i = 0; i < this.taille_chien; i++) center.push(this.random_card());
    this.register_spot(center);
    this.center = center;

    for (var p = 0; p < this.max_players; p++) this.init_player_cards(p);

};

exports.Tarot.prototype.command_enchere = function(socket, player, args, data) {

    if (this.can_play(player) && this.phase == 'Enchère') {

        var valid = ['passer', 'petite', 'garde', 'garde sans'];
        var prise = valid.indexOf(args.join(' ').trim());
        var message = ['Je passe!', 'Petite!', 'Garde!', 'Garde sans!']

        if (prise === -1) {

            this.chat_send('TarotBot', 'Usage: /enchere ['+valid.join(', ')+']', socket);

        } else {

            if (prise !== 0 && prise <= this.prise) {
                this.chat_send('TarotBot', 'Vous devez prendre au dessus ou passer!', socket);
                return;
            }

            this.chat_send(this.get_name(player), message[prise], this.all, data.time);
            if (prise > this.prise) {
                this.preneur = player;
                this.attaque.push(player)
                this.prise = prise;
            }

            if (this.whose_turn() === this.max_players-1 && this.prise > 0) {

                if (this.max_players === 5) {
                    this.phase = 'Appel';
                    this.chat_send('TarotBot', 'Utilisez /appel pour appeler un partenaire.', this.get_socket(this.preneur));
                } else {
                    this.gerer_chien();
                }

            } else if (this.whose_turn() === this.max_players-1 && this.prise === 0) {

                this.ui_show_message('Nouvelle distribution!', 1000);
                timers.setTimeout(this.reset.bind(this), 1000);

            } else {

                this.next_turn();

            }

        }

    } else {

        this.chat_send('TarotBot', 'Erreur', socket);

    }

};

exports.Tarot.prototype.gerer_chien = function() {
    if (this.prise === 3) {
        this.donner_chien(this.preneur);
    } else {
        this.montrer_chien();
    }
};

exports.Tarot.prototype.montrer_chien = function() {

    this.phase = 'Chient visible';
    this.next_turn(-1);

    var center = this.center;
    center.owner = this.preneur;
    center.orientation = this.player_orientation(this.preneur);
    center.layout.player = center.layout.owner = 'hand';
    center.visibility.player = center.visibility.owner = {
        drop: 'upside',
        drag: 'upside',
    };
    center.update_visibility();
    this.update_spot(center);

    timers.setTimeout(this.faire_chien.bind(this), 5000);

};

exports.Tarot.prototype.faire_chien = function() {

    this.phase = 'Faire chien';
    this.next_turn(this.preneur);
    this.chat_send('TarotBot', 'Quand votre chien est prêt, tapez /chien.', this.get_socket(this.preneur));

    var center = this.center;
    center.layout.player = 'hand';
    center.visibility.player = {
        drop: 'downside',
        drag: 'downside',
    };
    center.policy.owner = {
        drop: 'tarot_chien',
        drag: 'match_topmatch',
    };
    center.update_visibility();
    this.update_spot(center);

    var hand = this.hands[this.preneur];
    hand.policy.owner.drop = 'accept_any';
    this.update_spot(hand);

};

exports.Tarot.prototype.donner_chien = function(player) {
    this.center.owner = -1;
    this.center.orientation = 0;
    this.center.layout.player = 'random';
    this.center.visibility.player = {
        drop: 'upside',
        drag: 'upside',
    };
    this.center.policy.player = {
        drop: 'tarot_jeu | accept_cancel',
        drag: 'match_above',
    };
    this.center.update_visibility();
    this.update_spot(this.center);
    this.move(this.center, this.piles[player]);
    this.phase = 'Jeu';
    this.next_turn(0);
};

exports.Tarot.prototype.command_chien = function(socket, player, args, data) {

    var center = this.center;
    var hand = this.hands[this.preneur];

    if (this.can_play(player) && this.phase == 'Faire chien') {
        if (center.stack.length === this.taille_chien && tarot.chien_valide(center.stack)) {
            this.chat_send(this.get_name(this.preneur), 'Chient fait!', this.all, data.time);
            this.donner_chien(this.preneur);
        } else {
            this.chat_send('TarotBot', 'Il faut mettre '+this.taille_chien.toString()+ ' cartes dans le chien (pas de roi, pas de bout).', socket);
        }
    } else {
        this.chat_send('TarotBot', 'Erreur!', socket);
    }

};

exports.Tarot.prototype.command_appel = function(socket, player, args) {

    if (this.preneur === player && this.phase == 'Appel') {

        var trad = {
            carreau: 'diamond',
            pique: 'spade',
            coeur: 'heart',
            trèfle: 'club',
        };

        args = args.join(' ').trim();
        if (typeof trad[args] !== 'undefined') {

            this.appel = trad[args];
            this.chat_send(this.get_name(this.preneur), 'J\'appelle à '+args+'!', this.all, data.time);

            var count = 4;
            var value = 15;
            while (count === 4) {
                value--;
                count = this.hands[this.preneur].stack.extract_real_value(value).length;
            }

            for (var p = 0; p < this.max_players; p++) {
                var stack = this.hands[p].stack.extract_real_value(value).extract_family(trad[args]);
                if (stack.length > 0 && p !== this.preneur) {
                    this.carte_appel = stack[0];
                    this.chat_send('TarotBot', 'Vous êtes appelé!', this.get_socket(p));
                    this.attaque.push(p);
                } else {
                    this.defense.push(p);
                }
            }

            this.gerer_chien();

        } else {

            this.chat_send('TarotBot', 'Usage: /appel ['+Object.keys(trad).join(', ')+']', socket);

        }

    } else {

        this.chat_send('TarotBot', 'Erreur!', socket);

    }

};