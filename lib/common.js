(function(exports) {

    'use strict';

    /*
    Card: minimal common implementation.
    */

    exports.Card = function(value) {
        this.value = value; // 0 is a special client value that means hidden value
        this.id = null;
    };

    exports.Card.prototype.stacked = function() {
        return new exports.Stack([this]);
    };

    exports.Card.prototype.real_value = function() {
        if (this.value <= 56) {
            return (this.value-1)%14+1; // Values start at 1 (0 is special)
        } else if (this.value <= 77) {
            return this.value-56;
        } else {
            return 0;
        }
    };

    // Return the card value as read by the client (ie a number (to string), a letter...)
    exports.Card.prototype.display_value = function() {
        var value = this.real_value();
        if (this.value <= 56) {
            var table = ['J', 'C', 'Q', 'K'];
            if (value <= 10) return value.toString();
            return table[value-11];
        } else {
            return (value == 0 ? '*' : value.toString());
        }
    };

    exports.Card.prototype.name = function() {
        var value = this.real_value();
        var family = this.family();
        if (family !== 'trump') {
            var table = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Cavalier', 'Queen', 'King'];
            return table[value-1]+' of '+family[0].toUpperCase()+family.slice(1)+'s';
        } else {
            return (value == 0 ? 'Fool' : value.toString());
        }
    };

    // Return the color of a card (red, black), or trump if it does not apply
    exports.Card.prototype.color = function() {
        if (this.value <= 56) {
            var value = Math.floor((this.value-1)/28);
            return value === 0 ? 'red' : 'black';
        } else {
            return 'trump';
        }
    };

    // Return the family of a card
    exports.Card.prototype.family = function() {
        if (this.value <= 14) {
            return 'diamond';
        } else if (this.value <= 28) {
            return 'heart';
        } else if (this.value <= 42) {
            return 'spade';
        } else if (this.value <= 56) {
            return 'club';
        } else {
            return 'trump';
        }
    }

    /*
    Stack: array of Cards.
    Some Array methods won't return a Stack (or a ClientStack for that matter)!!
    */

    exports.Stack = function(arr) {
        if (typeof arr !== 'undefined' && arr.length > 0) this.push.apply(this, arr);
    };

    exports.Stack.prototype = Object.create(Array.prototype);

    exports.Stack.prototype.copy = function() {
        return new exports.Stack(this.slice());
    };

    exports.Stack.prototype.remove = function(card) {
        var index = this.indexOf(card);
        this.splice(index, 1);
    };

    exports.Stack.prototype.top = function() {
        if (this.length > 0) return this[this.length-1];
        return null;
    };

    exports.Stack.prototype.equals = function(stack) {
        if (!stack) return false;
        if (this.length != stack.length) return false;
        for (var i = 0; i < this.length; i++) {
            if (this[i] != stack[i]) {
                return false;
            }
        }
        return true;
    };

    // Return the ids of the contained cards as an array
    exports.Stack.prototype.ids = function() {
        var ids = [];
        this.forEach(function(card) {
            ids.push(card.id);
        });
        return ids;
    };

    // Return a Stack (not a ClientStack client side!) with cards matching the given $family
    exports.Stack.prototype.extract_family = function(family) {
        return new exports.Stack(this.filter(function(a) {
            return a.family() === family;
        }));
    };

    // Return a Stack (not a ClientStack client side!) with cards matching the given $color
    exports.Stack.prototype.extract_color = function(color) {
        return new exports.Stack(this.filter(function(a) {
            return a.color() === color;
        }));
    };

    exports.Stack.prototype.extract_real_value = function(value) {
        return new exports.Stack(this.filter(function(a) {
            return a.real_value() === value;
        }));
    };

    // Return the last encountered card with the maximal real value in the Stack
    exports.Stack.prototype.max_real_value = function() {
        if (this.length === 0) return null;
        return this.reduce(function(a, b) {
            return a.real_value() > b.real_value() ? a : b;
        });
    };

    // Just to be extra safe (had me debugging for hours at some point...)
    // exports.Stack.prototype.push = function(card) {
    //     if (card.id === null || this.ids().indexOf(card.id) === -1) {
    //         Array.prototype.push.call(this, card);
    //     } else {
    //         throw 'AnnoyingBugExceptionIHopeNeverToEncounterAgain';
    //     }
    // };

    /*
    Policies might need to be extended to fit a particular game, in which case an additionnal namespace (module) should be added for various below defined methods to look into.
    For instance, if module is added, then get_from_name will search in module.DragPolicy and module.DropPolicy.
    Namespaces can be added from the lib/server module (method add_namespace as well).
    */

    exports.policy_namespace = [exports];

    exports.add_namespace = function(namespace) {
        exports.policy_namespace.push(namespace);
    };

    /*
    A DragPolicy returns a subset of valid cards from $matches, which is a Stack of cards from a $spot.
    */

    exports.DragPolicy = {};

    // Return the policy matching a given (string) $name
    // See namespace notes above
    exports.DragPolicy.get_from_name = function(name) {
        var fun;
        exports.policy_namespace.some(function(namespace) {
            fun = namespace.DragPolicy[name];
            if (typeof fun !== 'undefined') return true;
        });
        return fun;
    };

    // Parse a DragPolicy string and apply to $spot, $matches
    // Syntax: policy1, policy2 (spacing optional)
    exports.DragPolicy.get_from_string = function(string, spot, matches) {
        var names = string.split(',');
        for (var i = 0; i < names.length; i++) {
            matches = (exports.DragPolicy.get_from_name(names[i].trim()))(spot, matches);
        }
        return matches;
    };

    exports.DragPolicy.match_any = function(spot, matches) {
        return matches;
    };

    exports.DragPolicy.match_none = function(spot, matches) {
        return new exports.Stack();
    };

    // Match top-most card among matches
    exports.DragPolicy.match_topmatch = function(spot, matches) {
        var stack = new exports.Stack();
        var top = matches.top();
        if (top != null) stack.push(top);
        return stack;
    };

    // If a card from the stack is hit, match top card of the WHOLE stack
    exports.DragPolicy.match_topstack = function(spot, matches) {
        var stack = new exports.Stack();
        if (matches.length > 0) {
            var top = spot.stack.top();
            if (top !== null) stack.push(top);
        }
        return stack;
    };

    // Match all cards above the top match of $matches
    exports.DragPolicy.match_above = function(spot, matches) {
        var stack = new exports.Stack();
        if (matches.length > 0) {
            var index = spot.stack.indexOf(matches.top());
            for (var i = index; i < spot.stack.length; i++) {
                stack.push(spot.stack[i]);
            }
        }
        return stack;
    };

    /*
    A DropPolicy returns a boolean indicating whether $stack from spot $from can be dropped on spot $to.
    */

    exports.DropPolicy = {};

    // Return the policy matching a given (string) $name
    // See namespace notes above
    exports.DropPolicy.get_from_name = function(name) {
        var fun;
        exports.policy_namespace.some(function(namespace) {
            fun = namespace.DropPolicy[name];
            if (typeof fun !== 'undefined') return true;
        });
        return fun;
    };

    // Apply the DropPolicy described by $string to $from, $to, $stack
    // The string has to be a valid logical expression combining multiple policy strings, for instance
    // (policy1 | policy2) & policy3 or even simply policy4
    // Policy strings are function names
    exports.DropPolicy.get_from_string = function(string, from, to, stack) {
        if (string.indexOf('(') > -1) {
            var old_pos = 0;
            var pos = -1;
            var count = 0;
            var new_string = '';
            for (var i = 0; i < string.length; i++) {
                if (string[i] === ')') count--;
                if (string[i] === '(') {
                    count++;
                    if (count === 1) pos = i+1;
                }
                if (count === 0 && pos > -1) {
                    var res = exports.DropPolicy.get_from_string(string.substring(pos, i), from, to, stack) ? '1' : '0';
                    new_string = new_string + string.substring(old_pos, pos-1) + res;
                    old_pos = i+1;
                    pos = -1;
                }
            }
            string = new_string;
        }
        var ret = false;
        string.split('|').forEach(function(substring) {
            var subret = true;
            substring.split('&').every(function(name) {
                name = name.trim();
                var invert = false;
                if (name[0] === '!') {
                    var invert = true;
                    name = name.substring(1).trim();
                }
                // Either parse a number (former sub expression) or evaluate policy
                var val = (name.match(/^\d$/) ? Boolean(parseInt(name)) : (exports.DropPolicy.get_from_name(name))(from, to, stack));
                subret = subret && (invert ? !val : val);
                return subret; // Stops if subret is false, since subsequent calls are not needed
            });
            ret = ret || subret;
        });
        return ret;
    };

    exports.DropPolicy.accept_any = function(from, to, stack) {
        return true;
    };

    exports.DropPolicy.accept_none = function(from, to, stack) {
        return false;
    };

    exports.DropPolicy.accept_desc = function(from, to, stack) {
        if (to.empty()) return true;
        var prev = to.stack.top();
        for (var i = 0; i < stack.length; i++) {
            if (prev.real_value()-stack[i].real_value() !== 1) return false;
            prev = stack[i];
        }
        return true;
    };

    exports.DropPolicy.accept_asc = function(from, to, stack) {
        if (to.empty()) return true;
        var prev = to.stack.top();
        for (var i = 0; i < stack.length; i++) {
            if (prev.real_value()-stack[i].real_value() !== -1) return false;
            prev = stack[i];
        }
        return true;
    };

    exports.DropPolicy.accept_alt_colors = function(from, to, stack) {
        if (to.empty()) return true;
        var prev = to.stack.top();
        for (var i = 0; i < stack.length; i++) {
            if (stack[i].color() === prev.color() || stack[i].family() === 'trump') return false;
            prev = stack[i];
        }
        return true;
    };

    exports.DropPolicy.not_empty = function(from, to, stack) {
        return !to.empty();
    };

    exports.DropPolicy.keep_ownership = function(from, to, stack) {
        return from.owner === to.owner;
    };

    exports.DropPolicy.keep_color = function(from, to, stack) {
        if (to.empty()) return true;
        var color = stack[0].color();
        for (var i = 0; i < stack.length; i++) {
            if (stack[i].color() !== color) return false;
        }
        return from.stack[0].color() === color;
    };

    exports.DropPolicy.keep_family = function(from, to, stack) {
        if (to.empty()) return true;
        var family = stack[0].family();
        for (var i = 0; i < stack.length; i++) {
            if (stack[i].family() !== family) return false;
        }
        return to.stack[0].family() === family;
    };

    exports.DropPolicy.first_real_value_is_one = function(from, to, stack) {
        return to.empty() && stack[0].real_value() === 1 || !to.empty();
    };

    exports.DropPolicy.accept_cancel = function(from, to, stack) {
        return from.id === to.id;
    };

    /*
    Spot: a card holder.
    Its dimensions are relative to the client's screen.
    The drag_stack is a special stack that is used when cards are being moved client-side.
    */

    exports.Spot = function(x, y, width, height) {

        // Spot hitbox
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.orientation = 0; // An angle (rotation relative to the board center)

        this.stack = new exports.Stack(); // Spots hold a stack of card
        this.drag_stack = new exports.Stack(); // Stack with cards being dragged (not dropped yet)
        this.owner = -1; // -1 is no owner
        this.id = null; // Added by register_spot server side

        // Policies are defined in a variety of contexts (player owns or does not own a spot, etc...)
        // Policies prefixed by idle mean that the owner/player is not currently playing (not his/her turn)
        this.context = 'player';
        this.policy = {
            owner: { drag: 'match_none', drop: 'accept_none' },
            player: { drag: 'match_none', drop: 'accept_none' },
            idle_owner: { drag: 'match_none', drop: 'accept_none' },
            idle_player: { drag: 'match_none', drop: 'accept_none' },
        }
        // Layout define how cards are displayed/organized for the client
        // The drop layout is applied when cards are on the spot (or dropped onto)
        // The drag layout is applied when cards are dragged from the spot
        this.layout = {
            owner: { drag: 'downside', drop: 'downside' },
            player: { drag: 'downside', drop: 'downside' },
        };

    };

    // Return a Stack including cards from both stack and drag_stack
    exports.Spot.prototype.all = function() {
        var ret = this.stack.copy();
        ret.push.apply(ret, this.drag_stack);
        return ret;
    };

    // Set appropriate context for $player, taking into account whether he/she $can_play or not
    exports.Spot.prototype.set_context = function(player, can_play) {
        this.context = (can_play ? '' : 'idle_')+(player === this.owner ? 'owner' : 'player');
    };

    // Export Spot data
    // Cards within its stack are included in data.stack as {id, value}
    exports.Spot.prototype.export = function() {

        var data = {};

        data.x = this.x;
        data.y = this.y;
        data.width = this.width;
        data.height = this.height;
        data.orientation = this.orientation;

        data.owner = this.owner;
        data.id = this.id;

        data.stack = [];
        // If the Spot hides card in regular (drop) layout, set card values to 0
        var hide = this.has_layout('drop', 'downside');
        this.stack.forEach(function(card) {
            data.stack.push({
                id: card.id,
                value: (hide ? 0 : card.value),
            });
        });

        data.context = this.context;
        data.policy = this.policy;
        data.layout = this.layout;

        return data;

    };

    // Return true if Spot.stack is empty
    exports.Spot.prototype.empty = function() {
        return this.stack.length === 0;
    };

    // Return the proper layout context (no idle for layout currently)
    exports.Spot.prototype.layout_context = function() {
        if (this.context.substring(0, 5) === 'idle_') {
            return this.context.substring(5);
        } else {
            return this.context;
        }
    };

    // Return whether this spot has the $value layout policy of given $type, in $context
    // If omitted, use currently set context (this.layout_context())
    exports.Spot.prototype.has_layout = function(type, value, context) {
        var layout = this.layout[typeof context === 'undefined' ? this.layout_context() : context][type];
        layout = layout.split(',');
        for (var i = 0; i < layout.length; i++) {
            if (layout[i].trim() === value) return true;
        }
        return false;
    };

    // Return a subset of $matches as per the drag policies
    exports.Spot.prototype.filter_drag = function(matches) {
        return new exports.Stack(exports.DragPolicy.get_from_string(this.policy[this.context].drag, this, matches));
    };

    // Return whether $stack coming from a spot $from is accepted by this spot, as per the drop policies
    exports.Spot.prototype.accept_drop = function(from, stack) {
        return exports.DropPolicy.get_from_string(this.policy[this.context].drop, from, this, stack);
    };

    // Push $card to regular stack
    exports.Spot.prototype.push = function(card) {
        this.stack.push(card);
    };

    // Remove $card from regular stack
    exports.Spot.prototype.remove = function(card) {
        this.stack.remove(card);
    };

    // Push to drag_stack (free as in free from drop_layout)
    exports.Spot.prototype.free = function(card) {
        this.stack.remove(card);
        this.drag_stack.push(card);
    };

    // Remove from drag_stack and tie to some $other_spot (or this spot if omitted)
    exports.Spot.prototype.tie = function(card, other_spot) {
        if (typeof other_spot === 'undefined') other_spot = this;
        this.drag_stack.remove(card);
        other_spot.stack.push(card);
    };

    // Tie every card from drag_stack to $other_spot
    exports.Spot.prototype.transfer_drag_stack = function(other_spot) {
        while (this.drag_stack.length > 0) {
            this.tie(this.drag_stack[0], other_spot);
        }
    };

    // Free a $substack of the stack
    exports.Spot.prototype.set_drag_stack = function(substack) {
        for (var i = 0; i < substack.length; i++) {
            this.free(substack[i]);
        }
    };

})(typeof exports === 'undefined' ? this['game'] = {} : exports); // Exported as 'game' for the client