// Map from language file extensions to functions that can autocomplete the
// source editor.
//
// Parameters:
//  - source: String of the source code.
//  - caret: Object containing two fields:
//    * line: the line number of the caret, starting with zero.
//    * ch: the column of the caret, starting with zero.
//  - options: Object containing optional parameters:
//    * line: String of the current line (which the editor may provide
//      more efficiently than the default way.
//
// Return an object with the following fields:
//  - candidates: A list of the matches to a possible completion.
//  - completions: A list of the associated completion to a candidate.
var completer = {
  js: jsCompleter
};

exports.completer = completer;


// Helper: Map implementation (will be removed when ES6 comes along).
//
// It is designed to be fast, but not 100% compatible with ES6.
// Notably, map.keys returns a list of keys, since you cannot iterate through a
// map in ES5 the same way you would in ES6.
//
// Note: may fail in case you unexpectedly use __proto__ as a key.

function Map() {
  // Cut off the inheritance tree.
  this.map = Object.create(null);
}

Map.prototype = {
  get: function(key) {
    return this.map[key];
  },
  has: function(key) {
    return this.map[key] !== undefined;
  },
  set: function(key, value) {
    this.map[key] = value;
  },
  delete: function(key) {
    if (this.has(key)) {
      delete this.map[key];
      return true;
    } else {
      return false;
    }
  },
  keys: function() {
    return Object.keys(this.map);
  }
};
