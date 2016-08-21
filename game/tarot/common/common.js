(function(exports) {

    'use strict';

    exports.bout = function(card) {
        var value = card.real_value();
        return card.family() === 'trump' && (value === 0 || value === 1 || value === 21);
    };

    exports.chien_valide = function(stack) {
        for (var i = 0; i < stack.length; i++) {
            var card = stack[i];
            if (card.real_value() === 14 && card.family() !== 'trump' || exports.bout(card)) return false;
        }
        return true;
    }

    exports.DropPolicy = (typeof exports.DropPolicy === 'undefined' ? {} : exports.DropPolicy);

    exports.DropPolicy.tarot_jeu = function(from, to, stack) {

        var the_card = stack[0];

        if (to.empty()) return true;
        if (the_card.real_value() === 0) return true; // Excuse
        if (to.stack[0].real_value() === 0) return true;

        var family = to.stack[0].real_value() === 0 ? to.stack[1].family() : to.stack[0].family();
        var board_trumps = to.stack.extract_family('trump');
        var player_trumps = from.all().extract_family('trump');
        var has_trumps = player_trumps.length > 0;
        var has_family = from.all().extract_family(family).length > 0;

        if (has_trumps && (family === 'trump' || family !== 'trump' && !has_family)) {
            var max_player = player_trumps.max_real_value().real_value();
            var max_board = board_trumps.max_real_value();
            max_board = max_board === null ? -1 : max_board.real_value();
            return (the_card.family() === 'trump' && (max_player > max_board && the_card.real_value() > max_board || max_player < max_board));
        } else if (family !== 'trump' && has_family) {
            return the_card.family() === family;
        } else {
            return true;
        }

    };

    exports.DropPolicy.tarot_chien = function(from, to, stack) {
        return exports.chien_valide(stack);
    };

})(typeof exports === 'undefined' ? this['game'] : exports);