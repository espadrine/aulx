// Map from language file extensions to functions that can autocomplete the
// source editor.
//
// Parameters:
//  - source: String of the source code.
//  - caret: Object containing two fields:
//    * line: the line number of the caret, starting with zero.
//    * ch: the column of the caret, starting with zero.
//  - options: Object containing optional parameters.
//
// Return an object with the following fields:
//  - candidates: A list of the matches to a possible completion.
//  - completions: A list of the associated completion to a candidate.
var completer = {};

exports = completer;


// Helper: Map implementation (will be removed when ES6 comes along).
//
// It is designed to be fast, but not 100% compatible with ES6.
// Notably, map.getKeys returns a list of keys, since you cannot iterate
// through a map in ES5 the same way you would in ES6.
//
// Note: may fail in case you unexpectedly use __proto__ as a key.

// Firefox landed Maps without forEach, hence the odd check for that.
var Map = this.Map;
if (!(Map && Map.prototype.forEach)) {
  var Map = function Map() {
    // Cut off the inheritance tree.
    this.map = Object.create(null);
  };

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
    forEach: function(callbackfn, thisArg) {
      callbackfn = callbackfn.bind(thisArg);
      for (var i in this.map) {
        callbackfn(this.map[i], i, this);
      }
    }
  };
}



// Completion-related data structures.
//

// The only way to distinguish two candidates is through how they are displayed.
// That's how the user can tell the difference, too.
function Candidate(display, postfix, score) {
  this.display = display;   // What the user sees.
  this.postfix = postfix;   // What is added when selected.
  this.score = score|0;     // Its score.
}

function Completion() {
  this.candidateFromDisplay = new Map();
  this.candidates = [];
}

Completion.prototype = {
  insert: function(candidate) {
    this.candidateFromDisplay.set(candidate.display, candidate);
    this.candidates.push(candidate);
  },
  meld: function(completion) {
    for (var i = 0; i < completion.candidates.length; i++) {
      var candidate = completion.candidates[i];
      if (!this.candidateFromDisplay.has(candidate.display)) {
        // We do not already have this candidate.
        this.insert(candidate);
      }
    }
  },
  sort: function() {
    this.candidates.sort(function(a, b) {
      // A huge score comes first.
      return b.score - a.score;
    });
  }
};



// Shared function: inRange.
// Detect whether an index is within a range.
function inRange(index, range) {
  return index > range[0] && index <= range[1];
}
