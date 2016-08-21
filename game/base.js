var rfr = require('rfr');
var common = rfr('lib/common');
var server = rfr('lib/server');

exports.FooBar = function(io, name, max_players) {

    this.on('drop', this.on_drop.bind(this));
    this.on('start', this.on_start.bind(this));

    server.ServerBoard.call(this, io, name, max_players);
    this.next_turn();

};

exports.main = exports.FooBar;
exports.FooBar.prototype = Object.create(server.ServerBoard.prototype);

exports.FooBar.prototype.on_drop = function(player, from, to, stack) {};
exports.FooBar.prototype.on_start = function() {};