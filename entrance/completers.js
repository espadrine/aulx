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
// Update: the forEach implementation is flawed for now.
var Map = this.Map;
if (true /* !(Map && Map.prototype.forEach) */) {
  var Map = function Map() { this._m = Object.create(null); };

  Map.prototype = {
    get: function(key) {
      return this._m[key];
    },
    has: function(key) {
      return this._m[key] !== undefined;
    },
    set: function(key, value) {
      if (key !== '__proto__') { this._m[key] = value; }
    },
    delete: function(key) {
      if (this.has(key)) {
        delete this._m[key];
        return true;
      } else {
        return false;
      }
    },
    forEach: function(callbackfn, thisArg) {
      callbackfn = callbackfn.bind(thisArg);
      for (var i in this._m) {
        callbackfn(this._m[i], i, this);
      }
    },
    get toString() {
      return JSON.stringify(this._m);
    }
  };
}


// Completion-related data structures.
//

// The only way to distinguish two candidates is through how they are displayed.
// That's how the user can tell the difference, too.
function Candidate(display, prefix, score) {
  this.display = display;   // What the user sees.
  this.prefix = prefix;   // What is added when selected.
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
