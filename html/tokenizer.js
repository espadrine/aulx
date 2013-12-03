// This library CC-BY-SA woven and designed by Thaddée Tyl.
(function(exports) {

// Stream.
//

function Stream(input) {
  this.line = 0;
  this.col = 0;
  this.index = 0;
  this.input = input;
  this.errors = [];
  // Token-wise.
  this.currentTokenStart = 0;
  this.currentTokenStartLine = 0;
  this.currentTokenStartCol = 0;
}
Stream.prototype = {
  peek: function() { return this.input.charCodeAt(this.index); },
  char: function() {
    var ch = this.input.charCodeAt(this.index);
    if (ch === 13) {
      // Carriage return.
      this.col = 0;
    } else if (ch === 12) {
      // Form feed.
      this.line++;
    } else if (ch === 10) {
      // New line.
      this.line++;
      this.col = 0;
    }
    this.index++;
    return ch;
  },
  error: function(cause) {
    this.errors.push((this.line + ":" + this.col) + ": " + cause);
  },
  emit: function(tok_type) {
    var tok_data = this.input.slice(this.currentTokenStart, this.index);
    var start = {line: this.currentTokenStartLine,
                 column: this.currentTokenStartCol};
    var end = {line: this.line,
               column: this.col};
    this.currentTokenStart = this.index;
    this.currentTokenStartLine = this.line;
    this.currentTokenStartCol = this.col;
    return make_token(tok_type, tok_data, start, end);
  }
};


// Tokenizer.
//
// We are using the rules available for free at <http://www.whatwg.org/C>.


// Tokens.
var token = {
  eof: 0,       // End of file.
  char: 1,      // Character token.
};

function make_token(type, data, start, end) {
  return {
    type: type,
    value: data,
    loc: {start: start, end: end}
  };
}


var state = {
  dataState: dataState,
  characterReferenceInDataState: characterReferenceInDataState,
  tagOpenState: tagOpenState,
};

// All state functions return the function of the next state function to be run.

// 12.2.4.1
function dataState(stream, tokens) {
  var ch = stream.char();
  if (ch === 0x26) {
    // Ampersand &.
    return state.characterReferenceInDataState;
  } else if (ch === 0x3c) {
    // Less-than sign.
    return state.tagOpenState;
  } else if (ch === 0x0) {
    // NULL.
    stream.error("NULL character found.");
    tokens.push(stream.emit(token.char));
    return dataState;
  } else if (ch === NaN) {
    // EOF
    tokens.push(stream.emit(token.eof));
    return null;
  } else {
    tokens.push(stream.emit(token.char));
    return dataState;
  }
}

// 12.2.4.2
function characterReferenceInDataState(stream, tokens) {
  var res = consumeCharacterReference(stream);
  if (res != null) {
    tokens.push(stream.emit(token.char));
  } else {
    // Ghost token.
    tokens.push(make_token(token.char, "&",
          {line: stream.line, column: stream.col},
          {line: stream.line, column: stream.col}));
  }
  return state.dataState;
}

// 12.2.4.8
function tagOpenState(stream, tokens) {
  // TODO
}

// 12.2.4.69
function consumeCharacterReference(stream) {
  // TODO
}

// Main entry point.
//

function html_tokenize(raw_input) {
  var stream = new Stream(raw_input);
  var tokens = [];
  var next_state = state.dataState;
  while (next_state != null) {
    next_state = next_state(stream, tokens);
  }
  return tokens;
}


exports.html_tokenize = html_tokenize;
}(this));
