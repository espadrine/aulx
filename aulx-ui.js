(function (global, factory) {
  // Universal Module Definition (UMD) to support AMD, Node.js,
  // and plain browser loading.
  if (typeof exports === 'object') {
    module.exports = factory(require('esprima'));
  } else if (typeof define === 'function' && define.amd) {
    define(['esprima'], factory);
  } else {
    global.Aulx = factory(global.esprima);
  }
}(this, function (esprima) {
var exports = {};


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
(function(exports) {
//
// Instantiate an Aulx object for JS autocompletion.
//
// Parameters:
//  - options: Object containing optional parameters:
//    * contextFrom: Part of the source necessary to get the context.
//      May be a string of the current line (which the editor may provide
//      more efficiently than the default way).
//      Use this if you know that reduceContext() is too slow for you.
//    * global: global object. Can be used to perform level 1 (see above).
//    * parse: a JS parser that is compatible with
//      https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API
//    * parserContinuation: boolean. If true, the parser has a callback argument
//      which is called with the AST.
//    * globalIdentifier: A String to identify the symbol representing the
//      JS global object, such as 'window' (the default), for static analysis
//      purposes.
//
function JS(options) {
  this.options = options || {};
  this.options.parse = this.options.parse ||
                       (this.options.parserContinuation = false, esprima.parse);
  this.options.globalIdentifier = this.options.globalIdentifier || 'window';
  this.staticCandidates = null;
}

//
// Get a list of completions we can have, based on the state of the editor.
// Autocompletion happens based on the following factors
// (with increasing relevance):
//
// Level 0 = JS keywords.
// Level 1 = dynamic lookup of available properties.
// Level 2 = static analysis of the code.
//
// Use candidates for UI purposes, and completions when inserting the completion
// in the editor.
//
// Parameters:
//  - source: String of the source code.
//  - caret: Object containing two fields:
//    * line: the line number of the caret, starting with zero.
//    * ch: the column of the caret, starting with zero.
//
// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * prefix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
function jsCompleter(source, caret) {
  var completion = new Completion();

  // Caching the result of a static analysis for perf purposes.
  if (!this.staticCandidates) {
    this.updateStaticCache(source, caret,
        { parse: this.options.parse,
          parserContinuation: this.options.parserContinuation });
  }

  // We use a primitive sorting algorithm.
  // The candidates are simply concatenated, level after level.
  // We assume that Level 0 < Level 1 < etc.
  // FIXME: implement a score-based system that adjusts its weights based on
  // statistics from what the user actually selects.

  var context = getContext(this.options.contextFrom || source, caret);
  if (!context) {
    // We couldn't get the context, we won't be able to complete.
    return completion;
  }

  // Static analysis (Level 2).

  if (this.staticCandidates) {
    // They have a non-negative score.
    var staticCompletion = this.staticAnalysis(context,
        {globalIdentifier: this.options.globalIdentifier});
    if (!!staticCompletion) { completion.meld(staticCompletion); }
  }

  // Sandbox-based candidates (Level 1).

  if (this.options.global !== undefined) {
    // They have a score of -1.
    var sandboxCompletion = this.identifierLookup(this.options.global, context);
    if (!!sandboxCompletion) { completion.meld(sandboxCompletion); }
  }

  // Keyword-based candidates (Level 0).

  // This autocompletion is only meaningful with identifiers.
  if (context.completing === Completing.identifier &&
      context.data.length === 1) {
    var keywordCompletion = new Completion();
    for (var keyword in JSKeywords) {
      // The keyword must match and have something to add!
      if (keyword.indexOf(context.data[0]) == 0
          && keyword.length > context.data[0].length) {
        keywordCompletion.insert(new Candidate(
              keyword,
              context.data[0],
              JSKeywords[keyword]));
        // The score depends on the frequency of the keyword.
        // See keyword.js
      }
    }
    completion.meld(keywordCompletion);
  }

  completion.sort();
  return completion;
}

JS.prototype.complete = jsCompleter;

function fireStaticAnalysis(source, caret) {
  this.updateStaticCache(source, caret,
      { parse: this.options.parse,
        parserContinuation: this.options.parserContinuation });
}

JS.prototype.fireStaticAnalysis = fireStaticAnalysis;

// Same as `(new aulx.JS(options)).complete(source, caret)`.
function js(source, caret, options) {
  return (new JS(options)).complete(source, caret);
}

exports.js = js;
exports.JS = JS;


// Generic helpers.
//

// Autocompletion types.

var Completing = {  // Examples.
  identifier: 0,    // foo.ba|
  property: 1,      // foo.|
  string: 2,        // "foo".|
  regex: 3          // /foo/.|
};
js.Completing = Completing;

// Fetch data from the position of the caret in a source.
// The data is an object containing the following:
//  - completing: a number from the Completing enumeration.
//  - data: information about the context. Ideally, a list of strings.
//
// For instance, `foo.bar.baz|`
// (with the caret at the end of baz, even if after whitespace)
// will return `{completing:0, data:["foo", "bar", "baz"]}`.
//
// If we cannot get an identifier, returns `null`.
//
// Parameters:
//  - source: a string of JS code.
//  - caret: an object {line: 0-indexed line, ch: 0-indexed column}.
function getContext(source, caret) {
  var reduction = reduceContext('' + source, caret);
  if (reduction === null) { return null; }
  caret = reduction[1];
  var tokens = esprima.tokenize(reduction[0], {loc:true});

  // At this point, we know we were able to tokenize it.
  // Find the token just before the caret.
  // In order to do that, we use dichotomy.
  var lowIndex = 0;
  var highIndex = tokens.length - 1;
  var tokIndex = (tokens.length / 2) | 0;   // Truncating to an integer.
  var tokIndexPrevValue = tokIndex;
  var lastCall = false;
  var token;
  while (lowIndex <= highIndex) {
    token = tokens[tokIndex];
    if (!token) { return null; }
    // Note: The caret is on the first line (as a result of reduceContext).
    // Also, Esprima lines start with 1.
    if (token.loc.start.line > 1) {
      highIndex = tokIndex;
    } else {
      // Now, we need the correct column.
      var range = [
        token.loc.start.column,
        token.loc.end.column
      ];
      if (inRange(caret.ch, range)) {
        // We're done. We've found the token in which the cursor is.
        return contextFromToken(tokens, tokIndex, caret);
      } else if (caret.ch <= range[0]) {
        highIndex = tokIndex;
      } else if (range[1] < caret.ch) {
        lowIndex = tokIndex + 1;
      }
    }
    tokIndex = (highIndex + lowIndex) >>> 1;
    if (lastCall) { break; }
    if (tokIndex === tokIndexPrevValue) {
      tokIndex++;
      lastCall = true;
    } else { tokIndexPrevValue = tokIndex; }
  }
  return contextFromToken(tokens, tokIndex, caret);
};
js.getContext = getContext;

// Either
//
//  {
//    completing: Completing.<type of completion>,
//    data: <Array of string>
//  }
//
// or undefined.
//
// Parameters:
//  - tokens: list of tokens.
//  - tokIndex: index of the token where the caret is.
//  - caret: {line:0, ch:0}, position of the caret.
function contextFromToken(tokens, tokIndex, caret) {
  var token = tokens[tokIndex];
  var prevToken = tokens[tokIndex - 1];
  if (!token) { return; }
  if (token.type === "Punctuator" && token.value === '.') {
    if (prevToken) {
      if (prevToken.type === "Identifier" ||
         (prevToken.type === "Keyword" && prevToken.value === "this")) {
        // Property completion.
        return {
          completing: Completing.property,
          data: suckIdentifier(tokens, tokIndex, caret)
        };
      } else if (prevToken.type === "String") {
        // String completion.
        return {
          completing: Completing.string,
          data: []  // No need for data.
        };
      } else if (prevToken.type === "RegularExpression") {
        // Regex completion.
        return {
          completing: Completing.regex,
          data: []  // No need for data.
        };
      }
    }
  } else if (token.type === "Identifier") {
    // Identifier completion.
    return {
      completing: Completing.identifier,
      data: suckIdentifier(tokens, tokIndex, caret)
    };
  }
};

// suckIdentifier aggregates the whole identifier into a list of strings, taking
// only the part before the caret.
//
// This function assumes that the caret is on the token designated by `tokIndex`
// (which is its index in the `tokens` array).
//
// For instance, `foo.bar.ba|z` gives `['foo','bar','ba']`.
function suckIdentifier(tokens, tokIndex, caret) {
  var token = tokens[tokIndex];
  if (token.type !== "Identifier" &&
      token.type !== "Punctuator") {
    // Nothing to suck. Nothing to complete.
    return null;
  }

  // We now know there is something to suck into identifier.
  var identifier = [];
  while (token.type === "Identifier" ||
         (token.type === "Punctuator" && token.value === '.') ||
         (token.type === "Keyword" && token.value === "this")) {
    if (token.type === "Identifier" ||
        token.type === "Keyword") {
      var endCh = token.loc.end.column;
      var tokValue;
      if (caret.ch < endCh) {
        tokValue = token.value.slice(0, endCh - caret.ch + 1);
      } else {
        tokValue = token.value;
      }
      identifier.unshift(tokValue);
    }
    if (tokIndex > 0) {
      tokIndex--;
      token = tokens[tokIndex];
    } else {
      return identifier;
    }
  }
  return identifier;
};



// Reduce the amount of source code to contextualize,
// and the re-positionned caret in this smaller source code.
//
// For instance, `foo\nfoo.bar.baz|`
// will return `['foo.bar.baz', {line:0, ch:11}]`.
//
// If we cannot get an identifier, returns `null`.
//
// Parameters:
//  - source: a string of JS code.
//  - caret: an object {line: 0-indexed line, ch: 0-indexed column}.
function reduceContext(source, caret) {
  var line = 0;
  var column = 0;
  var fakeCaret = {line: caret.line, ch: caret.ch};

  // Find the position of the previous line terminator.
  var iLT = 0;
  var newSpot;
  var changedLine = false;
  var haveSkipped = false;

  var i = 0;
  var ch;
  var nextch;
  while ((line < caret.line
          || (line === caret.line && column < caret.ch))
         && i < source.length) {
    ch = source.charCodeAt(i);

    // Count the lines.
    if (isLineTerminator(ch)) {
      line++;
      column = 0;
      i++;
      iLT = i;
      continue;
    } else {
      column++;
    }

    if (ch === 34 || ch === 39) {
      // Single / double quote: starts a string.
      newSpot = skipStringLiteral(source, i, iLT - 1, line, column);
      haveSkipped = true;
      changedLine = line < newSpot.line;

      i = newSpot.index;
      line = newSpot.line;
      column = newSpot.column;
    } else if (ch === 47) {
      // Slash.
      nextch = source.charCodeAt(i + 1);
      prevch = source.charCodeAt(i - 1);
      if (nextch === 42 && prevch !== 92) {
        // Star: we have a multiline comment.
        // Not a backslash before: it isn't in a regex.
        newSpot = skipMultilineComment(source, i, line, column);
        haveSkipped = true;
        changedLine = line < newSpot.line;

        i = newSpot.index;
        line = newSpot.line;
        column = newSpot.column;
      } else if (nextch === 47) {
        // Two consecutive slashes: we have a single-line comment.
        i++;
        while (!isLineTerminator(ch) && i < source.length) {
          ch = source.charCodeAt(i);
          i++;
          column++;
        }
        // `i` is on a line terminator.
        i -= 2;
      }
    }

    if (haveSkipped && isLineTerminator(source.charCodeAt(i))) {
      haveSkipped = false;
      continue;
    }
    if (changedLine) {
      // Have we gone too far?
      if (line > caret.line || line === caret.line && column > caret.ch + 1) {
        return null;
      } else if (line === caret.line) {
        iLT = i;
        // We need to reset the fake caret's position.
        column = 0;
      }
      changedLine = false;
    } else {
      i++;
    }
  }

  fakeCaret.line = 0;
  fakeCaret.ch = column;
  // We can limit tokenization between beginning of line
  // to position of the caret.
  return [source.slice(iLT, iLT + column + 1), fakeCaret];
}

// Useful functions stolen from Esprima.


// Invisible characters.

// 7.2 White Space

function isWhiteSpace(ch) {
    return (ch === 32) ||  // space
        (ch === 9) ||      // tab
        (ch === 0xB) ||
        (ch === 0xC) ||
        (ch === 0xA0) ||
        (ch >= 0x1680 && '\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\uFEFF'.indexOf(String.fromCharCode(ch)) > 0);
}

// 7.3 Line Terminators

function isLineTerminator(ch) {
    return (ch === 10) || (ch === 13) || (ch === 0x2028) || (ch === 0x2029);
}


// Strings.

// 7.8.4 String Literals

// This Esprima algorithm was heavily modified for my purposes.
//
// Parameters:
// - source: code
// - index: position of the opening quote.
// - indexAtStartOfLine: position of the first character of the current line,
//   minus one.
// - lineNumber: starting from 0.
// - column: number.
//
// It returns the following object:
// - index: of the character after the end.
// - line: line number at the end of the string.
// - column: column number of the character after the end.
function skipStringLiteral(source, index, indexAtStartOfLine,
      lineNumber, column) {
    var quote, ch, code, restore;
    var length = source.length;

    quote = source[index];
    ++index;

    while (index < length) {
        ch = source[index++];

        if (ch === quote) {
            break;
        } else if (ch === '\\') {
            ch = source[index++];
            if (!ch || !isLineTerminator(ch.charCodeAt(0))) {
                switch (ch) {
                case 'n': break;
                case 'r': break;
                case 't': break;
                case 'u':
                case 'x':
                    restore = index;
                    index = scanHexEscape(source, index, ch);
                    if (index < 0) {
                        index = restore;
                    }
                    break;
                case 'b': break;
                case 'f': break;
                case 'v': break;

                default:
                    if (isOctalDigit(ch)) {
                        code = '01234567'.indexOf(ch);

                        if (index < length && isOctalDigit(source[index])) {
                            code = code * 8 + '01234567'.indexOf(source[index++]);

                            // 3 digits are only allowed when string starts
                            // with 0, 1, 2, 3
                            if ('0123'.indexOf(ch) >= 0 &&
                                    index < length &&
                                    isOctalDigit(source[index])) {
                                code = code * 8 + '01234567'.indexOf(source[index++]);
                            }
                        }
                    }
                    break;
                }
            } else {
                ++lineNumber;
                if (ch ===  '\r' && source[index] === '\n') {
                    ++index;
                }
                indexAtStartOfLine = index;
            }
        } else if (isLineTerminator(ch.charCodeAt(0))) {
            ++lineNumber;
            indexAtStartOfLine = index;
            break;
        }
    }

    return {
      index: index,
      line: lineNumber,
      column: index - indexAtStartOfLine
    };
}

function scanHexEscape(source, index, prefix) {
    var i, len, ch, code = 0;

    len = (prefix === 'u') ? 4 : 2;
    for (i = 0; i < len; ++i) {
        if (index < source.length && isHexDigit(source[index])) {
            ch = source[index++];
            code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
        } else {
            return -1;
        }
    }
    return index;
}

function isOctalDigit(ch) {
    return '01234567'.indexOf(ch) >= 0;
}

function isHexDigit(ch) {
    return '0123456789abcdefABCDEF'.indexOf(ch) >= 0;
}

// The following function is not from Esprima.
// The index must be positioned in the source on a slash
// that starts a multiline comment.
//
// It returns the following object:
// - index: of the character after the end.
// - line: line number at the end of the comment.
// - column: column number of the character after the end.
function skipMultilineComment(source, index, line, targetLine, column) {
  var ch = 47;
  while (index < source.length) {
    ch = source[index].charCodeAt(0);
    if (ch == 42) {
      // Current character is a star.
      if (index === source.length - 1) {
        break;
      }
      if (source[index + 1].charCodeAt(0) === 47) {
        // Next character is a slash.
        index += 2;
        column += 2;
        break;
      }
    }

    index++;
    if (isLineTerminator(ch)) {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  return {
    index: index,
    line: line,
    column: column
  };
}
// Return a Completion instance, or undefined.
// Parameters:
// - context: result of the getContext function.
function staticAnalysis(context) {
  var staticCompletion = new Completion();
  var completingIdentifier = (context.completing === Completing.identifier);
  var completingProperty = (context.completing === Completing.property);

  var varName;   // Each will modify this to the start of the variable name.
  var eachProperty = function eachProperty(store, display) {
    if (display.indexOf(varName) == 0
        && display.length > varName.length) {
      // The candidate must match and have something to add!
      try {
        var tokens = esprima.tokenize(display);
        if (tokens.length === 1 && tokens[0].type === "Identifier") {
          staticCompletion.insert(new Candidate(display,
              varName, store.weight));
        }
      } catch (e) {} // Definitely not a valid property.
    }
  };

  if (completingIdentifier && context.data.length === 1) {
    varName = context.data[0];
    // They have a positive score.
    this.staticCandidates.properties.forEach(eachProperty);
    if (this.options.globalIdentifier &&
        this.staticCandidates.properties.get(this.options.globalIdentifier)) {
      // Add properties like `window.|`.
      this.staticCandidates.properties.get(this.options.globalIdentifier).properties
        .forEach(eachProperty);
    }

  } else if (completingIdentifier || completingProperty) {
    var store = this.staticCandidates;
    for (var i = 0; i < context.data.length - 1; i++) {
      store = store.properties.get(context.data[i]);
      if (!store) { return; }
    }

    varName = context.data[i];
    if (completingProperty) {
      store = store.properties.get(varName);
      if (!store) { return; }
      varName = '';  // This will cause the indexOf check to succeed.
    }
    store.properties.forEach(eachProperty);

    // Seek data from its type.
    if (!!store.type) {
      store.type.forEach(function(sourceIndices, funcName) {
        funcStore = this.staticCandidates.properties.get(funcName);
        if (!funcStore) { return; }
        for (var i = 0; i < store.type.get(funcName).length; i++) {
          var sourceIndex = store.type.get(funcName)[i];
          // Each sourceIndex corresponds to a source,
          // and the `sources` property is that source.
          if (funcStore.sources) {
            funcStore.sources[sourceIndex].properties.forEach(eachProperty);
            if (sourceIndex === 0) {
              // This was a constructor.
              var protostore = funcStore.properties.get('prototype');
              if (!protostore) { return; }
              protostore.properties.forEach(eachProperty);
            }
          }
        }
      }.bind(this));
    }
  }
  return staticCompletion;
}

JS.prototype.staticAnalysis = staticAnalysis;

// Static analysis helper functions.

//
// Get all the variables in a JS script at a certain position.
// This gathers variable (and argument) names by means of a static analysis
// which it performs on a parse tree of the code.
//
// Returns a TypeStore object. See below.
// We return null if we could not parse the code.
//
// This static scope system is inflexible. If it can't parse the code, it won't
// give you anything.
//
// Parameters:
// - source: The JS script to parse.
// - caret: {line:0, ch:0} The line and column in the scrip
//   from which we want the scope.
//
function updateStaticCache(source, caret) {
  this.options.store = this.options.store || new TypeStore();
  try {
    if (!!this.options.parserContinuation) {
      this.options.parse(source, {loc:true}, function(tree) {
        this.staticCandidates = getStaticScope(tree.body, caret)
            || this.staticCandidates;  // If it fails, use the previous version.
      }.bind(this));
    } else {
      var tree = this.options.parse(source, {loc:true});
      this.staticCandidates = getStaticScope(tree.body, caret)
          || this.staticCandidates;   // If it fails, use the previous version.
    }
  } catch (e) { return null; }
}

JS.prototype.updateStaticCache = updateStaticCache;

function getStaticScope(tree, caret) {
  var subnode, symbols;
  var store = new TypeStore();

  var node = tree;
  var stack = [];
  var index = 0;
  var indices = [];
  var deeper = null;
  do {
    deeper = null;
    for (; index < node.length; index++) {
      subnode = node[index];
      while (["ReturnStatement", "VariableDeclarator", "ExpressionStatement",
              "AssignmentExpression", "Property"].indexOf(subnode.type) >= 0) {
        if (subnode.type == "ReturnStatement") {
          subnode = subnode.argument;
        }
        if (subnode.type == "VariableDeclarator") {
          // var foo = something;
          // Variable names go one level too deep.
          typeFromAssignment(store, [subnode.id.name], subnode.init,
              stack.length);  // weight
          if (!!subnode.init) {
            subnode = subnode.init;
          }
          else break;
        }
        if (subnode.type == "ExpressionStatement") {
          subnode = subnode.expression;  // Parenthesized expression.
        }
        if (subnode.type == "AssignmentExpression") {
          // foo.bar = something;
          if (subnode.left.type === "MemberExpression") {
            symbols = typeFromMember(store, subnode.left);
          } else { symbols = [subnode.left.name]; }
          typeFromAssignment(store, symbols, subnode.right, stack.length);
          subnode = subnode.right;       // f.g = function(){…};
        }
        if (subnode.type == "Property") {
          subnode = subnode.value;       // {f: function(){…}};
        }
      }
      if (subnode.type == "CallExpression") {
        typeFromCall(store, subnode, stack.length);
      }
      if (subnode.type == "FunctionDeclaration" ||
          subnode.type == "FunctionExpression" ||
          // Expressions, eg, (function(){…}());
          (subnode.callee && subnode.callee.type == "FunctionExpression")) {
        if (subnode.callee) {
          subnode = subnode.callee;
        }
        if (subnode.id) {
          store.addProperty(subnode.id.name,
              { name: 'Function', index: 0 },
              stack.length);
          readFun(store, subnode);
        }
        if (caretInBlock(subnode, caret)) {
          // Parameters are one level deeper than the function's name itself.
          argumentNames(subnode.params, store, stack.length + 1);
        }
      }
      deeper = nestedNodes(subnode, caret);
      if (!!deeper) {
        // We need to go deeper.
        stack.push(node);
        node = deeper;
        indices.push(index + 1);
        index = 0;
        break;
      } else deeper = null;
    }
    if (!deeper) {
      node = stack.pop();
      index = indices.pop();
    }
  } while (stack.length > 0 || (node && index < node.length) || !!deeper);

  return store;
}

//
// Find a parse node to iterate over, as the node's array.
// Can also return null if it gets unhappy.
//
// Parameters:
// - node: an AST parse tree node.
// - caret: an object {line:0, ch:0} containing the 0-indexed position of the
//   line and column of the caret.
//
function nestedNodes(node, caret) {
  var body = null;
  var newScope = true;  // Whether we enter a new scope.
  if (node.body) {
    if (node.body.body) {
      // Function declaration has a body in a body.
      body = node.body.body;
    } else {
      body = node.body;
    }
  } else if (node.consequent) {
    body = fakeIfNodeList(node);  // If statements.
  } else if (node.block) {
    body = node.block.body;       // Try statements.
  } else if (node.handlers) {     // Try/catch.
    body = node.handlers.body.body;
  } else if (node.finalizer) {
    body = node.finalizer.body;   // Try/catch/finally.
  } else if (node.declarations) {
    body = node.declarations;     // Variable declarations.
    newScope = false;
  } else if (node.arguments) {
    body = node.arguments;   // Function calls, eg, f(function(){…});
  } else if (node.properties) {
    body = node.properties;  // Objects, eg, ({f: function(){…}});
  } else if (node.elements) {
    body = node.elements;    // Array, eg, [function(){…}]
  }
  if (!body ||
      // No need to parse a scope in which the caret is not.
      (newScope && !caretInBlock(node, caret))) {
    return null;
  }
  return body;
}

//
// Construct a list of nodes to go through based on the sequence of ifs and else
// ifs and elses.
//
// Parameters:
// - node: an AST node of type IfStatement.
function fakeIfNodeList(node) {
  var body = [node.consequent];
  if (node.alternate) {
    if (node.alternate.type === "IfStatement") {
      body = body.concat(fakeIfNodeList(node.alternate));
    } else if (node.alternate.type === "BlockStatement") {
      body.push(node.alternate);
    }
  }
  return body;
}

//
// Whether the caret is in the piece of code represented by the node.
//
// Parameters:
//  - node: the parse tree node in which the caret might be.
//  - caret: the line and column where the caret is (both 0-indexed).
//
function caretInBlock(node, caret) {
  // Note that the AST's line number is 1-indexed.
  var astStartLine = node.loc.start.line - 1;
  var astEndLine = node.loc.end.line - 1;
  return (
    // The node starts before the cursor.
    (astStartLine - 1 < caret.line ||
     (astStartLine === caret.line &&
      node.loc.start.column <= caret.ch)) &&
    // The node ends after the cursor.
    (caret.line < astEndLine ||
     (astEndLine === caret.line &&
      caret.ch <= node.loc.end.column)));
}

//
// Get the argument names of a function.
//
// Parameters:
// - node: the "params" property of a FunctionExpression.
// - store: a Map where we store the information that an identifier exists and
//   has the given weight.
// - weight: an integer measure of how deeply nested the node is. The deeper,
//   the bigger.
//
function argumentNames(node, store, weight) {
  for (var i = 0; i < node.length; i++) {
    store.addProperty(node[i].name, null, weight);
  }
}



//
// Type inference.

// A type is a list of sources.
//
// *Sources* can be either:
//
// - The result of a `new Constructor()` call.
// - The result of a function.
// - A parameter to a function.
//
// Each function stores information in the TypeStore about all possible sources
// it can give, as a list of sources (aka typestores to all properties):
//
//     [`this` properties, return properties, param1, param2, etc.]
//
// Each instance stores information about the list of sources it may come from.
// Inferred information about the properties of each instance comes from the
// aggregated properties of each source.
// The type is therefore a map of the following form.
//
//      { "name of the original function": [list of indices of source] }
//
// We may represent atomic type outside a compound type as the following:
//
//      { name: "name of the origin", index: source index }
//

// A type inference instance maps symbols to an object of the following form:
//  - properties: a Map from property symbols to typeStores for its properties,
//  - type: a structural type (ie, not atomic) (see above).
//  - weight: integer, relevance of the symbol,
function TypeStore(type, weight) {
  this.properties = new Map();
  this.type = type || new Map();
  this.weight = weight|0;
  if (this.type.has("Function")) {
    // The sources for properties on `this` and on the return object.
    this.sources = [new TypeStore(), new TypeStore()];
  }
}

TypeStore.prototype = {
  // Add a property named `symbol` typed from the atomic type `atype`.
  // `atype` and `weight` may not be present.
  addProperty: function(symbol, atype, weight) {
    if (!this.properties.has(symbol)) {
      if (atype != null) {
        var newType = new Map();
        var typeSources = [atype.index];
        newType.set(atype.name, typeSources);
      }
      this.properties.set(symbol, new TypeStore(newType, weight));
    } else {
      // The weight is proportional to the frequency.
      var p = this.properties.get(symbol);
      p.weight++;   // FIXME: this increment is questionnable.
      if (atype != null) {
        p.addType(atype);
      }
    }
  },

  // Get a property. If inexistent, creates it.
  // Same parameters as `addProperty`.
  getOrSet: function(prop, atype, weight) {
    if (!this.properties.has(prop)) {
      this.addProperty(prop, atype, weight);
    } else if (!!atype) {
      this.properties.get(prop).addType(atype);
    }
    return this.properties.get(prop);
  },

  // Given an atomic type (name, index), is this one?
  hasType: function(atype) {
    if (!this.type.has(atype.name)) { return false; }
    return this.type.get(atype.name).indexOf(atype.index) >= 0;
  },

  // We can add an atomic type (a combination of the name of the original
  // function and the source index) to an existing compound type.
  addType: function(atype) {
    if (atype.name === "Function") {
      // The sources for properties on `this` and on the return object.
      this.sources = this.sources || [new TypeStore(), new TypeStore()];
    }
    if (this.type.has(atype.name)) {
      // The original function name is already known.
      var sourceIndices = this.type.get(atype.name);
      if (sourceIndices.indexOf(atype.index) === -1) {
        sourceIndices.push(atype.index);
      }
    } else {
      // New original function name (common case).
      var sourceIndices = [];
      sourceIndices.push(atype.index);
      this.type.set(atype.name, sourceIndices);
    }
  },

  // Add a compound type.
  // type: { "Constructor": [0] } (a Map).
  addTypes: function(type) {
    var that = this;
    type.forEach(function(value, key) {
      for (var i = 0; i < value.length; i++) {
        that.addType({ name: key, index: value[i] });
      }
    });
  }
};

// funcStore is the typeStore of the containing function.
// node is a MemberExpression.
// Returns a list of identifier elements.
function typeFromThis(funcStore, node) {
  var symbols, symbol, i;
  symbols = [];
  symbol = '';
  while (node.object &&   // `foo()` doesn't have a `.object`.
         node.object.type !== "Identifier" &&
         node.object.type !== "ThisExpression") {
    symbols.push(node.property.name);
    node = node.object;
  }
  if (node.property === undefined) { return []; }
  symbols.push(node.property.name);
  if (node.object.type === "ThisExpression") {
    // Add the `this` properties to the function's generic properties.
    for (i = symbols.length - 1; i >= 0; i--) {
      symbol = symbols[i];
      funcStore.sources[0].addProperty(symbol,
          {name:"Object", index:0}, funcStore.weight);
      funcStore = funcStore.properties.get(symbol);
    }
    return symbols;
  }
}

// Store is a TypeStore instance,
// node is a MemberExpression.
function typeFromMember(store, node) {
  var symbols, symbol, i;
  symbols = [];
  symbol = '';
  while (node.object &&   // `foo()` doesn't have a `.object`.
         node.object.type !== "Identifier" &&
         node.object.type !== "ThisExpression") {
    symbols.push(node.property.name);
    node = node.object;
  }
  if (node.property === undefined) { return []; }
  symbols.push(node.property.name);
  if (node.object.type !== "ThisExpression") {
    symbols.push(node.object.name);  // At this point, node is an identifier.
  } else {
    // Treat `this` as a variable inside the function.
    symbols.push("this");
  }

  // Now that we have the symbols, put them in the store.
  symbols.reverse();
  for (i = 0; i < symbols.length; i++) {
    symbol = symbols[i];
    store.addProperty(symbol);
    store = store.properties.get(symbol);
  }
  return symbols;
}

// Store is a TypeStore instance,
// node is a Literal or an ObjectExpression.
function typeFromLiteral(store, symbols, node) {
  var property, i, substore, nextSubstore;
  substore = store;
  // Find the substore insertion point.
  for (i = 0; i < symbols.length; i++) {
    nextSubstore = substore.properties.get(symbols[i]);
    if (!nextSubstore) {
      // It really should exist.
      substore.addProperty(symbols[i]);
      nextSubstore = substore.properties.get(symbols[i]);
    }
    substore = nextSubstore;
  }
  // Add the symbols.
  var constructor = "Object";
  if (node.type === "ObjectExpression") {
    for (i = 0; i < node.properties.length; i++) {
      property = node.properties[i];
      var propname = property.key.name? property.key.name
                           : property.key.value;
      substore.addProperty(propname);
      if (property.value.type === "ObjectExpression") {
        // We can recursively complete the object tree.
        typeFromLiteral(store, symbols.concat(propname), property.value);
      }
    }
  } else if (node.type === "ArrayExpression") {
    constructor = 'Array';
  } else if (node.value instanceof RegExp) {
    constructor = 'RegExp';
  } else if (typeof node.value === "number") {
    constructor = 'Number';
  } else if (typeof node.value === "string") {
    constructor = 'String';
  } else if (typeof node.value === "boolean") {
    constructor = 'Boolean';
  }
  substore.addType({ name: constructor, index: 0 });
}

// store: a TypeStore
// symbols: a list of Strings representing the assignee,
//          eg. `foo.bar` → ['foo','bar']
// node: the AST node representing the assigned. May be null.
// weight: a Number, representing the depth of the scope.
// FIXME: deal with assignments like `foo().bar = baz`
// (requires a modification in `symbols`' generators).
function typeFromAssignment(store, symbols, node, weight) {
  var property, i, substore, nextSubstore, lastSymbol;
  lastSymbol = symbols[symbols.length - 1];
  if (lastSymbol === undefined) { return; }
  substore = store;
  // Find the substore insertion point.
  // The last symbol will be added separately.
  for (i = 0; i < symbols.length - 1; i++) {
    nextSubstore = substore.properties.get(symbols[i]);
    if (!nextSubstore) {
      // It really should exist.
      substore.addProperty(symbols[i]);
      nextSubstore = substore.properties.get(symbols[i]);
    }
    substore = nextSubstore;
  }
  // What is on the right?
  if (!node) {
    // nothing.
    store.addProperty(lastSymbol, null, weight);
    return;
  }
  if (node.type === "NewExpression") {
    substore.addProperty(lastSymbol,    // property name
        { name: node.callee.name,       // atomic type
          index: 0 },                   // created from `new C()`
        weight);                        // weight
    // FIXME: the following might be inaccurate if the constructor isn't global
    store.addProperty(node.callee.name, { name: 'Function', index: 0 });
  } else if (node.type === "Literal" ||
             node.type === "ObjectExpression" ||
             node.type === "ArrayExpression") {
    // FIXME substore gets computed twice (once more in typeFromLiteral).
    typeFromLiteral(store, symbols, node);
    substore.properties.get(lastSymbol).weight = weight;
  } else if (node.type === "CallExpression") {
    typeFromCall(store, node, weight, lastSymbol, substore);
  } else if (node.type === "FunctionExpression") {
    // `var foo = function ?() {}`.
    var typeFunc = new Map;
    typeFunc.set("Function", [0]);
    var funcStore = new TypeStore(typeFunc);
    funcType(store, node, funcStore);
    store.properties.set(lastSymbol, funcStore);
  } else {
    // Simple object.
    store.addProperty(lastSymbol, null, weight);
  }
}

// Process a call expression.
// `node` is that AST CallExpression.
// `store` is the TypeStore to put it in.
// If that call is set to a property, `setstore` refers to the TypeStore wherein
// to put the type information, and `setsymbol` to the symbol set to that.
function typeFromCall(store, node, weight, setsymbol, setstore) {
  if (node.callee.name) {  // var foo = bar()
    store.addProperty(node.callee.name,
        { name: 'Function', index: 0 },
        weight);
    // Parameters
    for (var i = 0; i < node.arguments.length; i++) {
      store.getOrSet(node.arguments[i].name,
          { name: node.callee.name, index: 2 + i },
          weight);
    }
    if (setstore) {
      // Return type (eg, var foo = bar())
      setstore.addProperty(setsymbol,
          { name: node.callee.name,     // bar
            index: 1 },                 // created from `bar()`
          weight);
    }
  } else if (!node.callee.body) {  // f.g()
    typeFromMember(store, node.callee);
    // FIXME: make the last one (eg, `g`) a function.
  } else if (node.callee.type === "FunctionExpression") {
    // var foo = function(){} ()
    var typeFunc = new Map();
    typeFunc.set("Function", [0]);
    var funcStore = new TypeStore(typeFunc);
    funcType(store, node.callee, funcStore);
    // Its type is that of the return type of the function called.
    if (setstore) {
      // FIXME: don't override, add the properties.
      setstore.properties.set(setsymbol, funcStore.sources[1]);
    }
  }
}


//
// Assumes that the function has an explicit name (node.id.name).
//
// node is a named function declaration / expression.
function readFun(store, node) {
  var funcStore = store.properties.get(node.id.name);
  funcType(store, node, funcStore);
}

// node is a named function declaration / expression.
function funcType(store, node, funcStore) {
  var statements = node.body.body;
  var returnStore, returnCaret;
  for (var i = 0; i < statements.length; i++) {
    if (statements[i].expression &&
        statements[i].expression.type === "AssignmentExpression" &&
        statements[i].expression.left.type === "MemberExpression") {
      // Member expression like `this.bar = …`.
      typeFromThis(funcStore, statements[i].expression.left);

    } else if (statements[i].type === "ReturnStatement") {
      // Return statement, like `return {foo:bar}`.

      if (statements[i].argument.type === "Literal" ||
          statements[i].argument.type === "ObjectExpression") {
        // The source at index 1 is that for the returned object.
        typeFromLiteral(funcStore.sources[1], [], statements[i].argument);

      } else if (statements[i].argument.type === "Identifier") {
        // Put a caret after the return statement and get the scope.
        returnCaret = { line: statements[i].loc.end.line - 1,
                        ch: statements[i].loc.end.column };
        returnStore = getStaticScope(node.body.body, returnCaret);
        var returnEl = returnStore.properties.get(statements[i].argument.name);
        if (returnEl) {
          returnEl.properties.forEach(function(value, key) {
            funcStore.sources[1].properties.set(key, value);
          });
          funcStore.sources[1].addTypes(returnEl.type);
        }
      }
    }
  }
  if (returnStore === undefined) {
    // There was no return statement. Therefore, no store either.
    returnStore = new TypeStore();
    if (statements.length > 0) {
      returnCaret = { line: statements[statements.length-1].loc.end.line - 1,
                      ch: statements[statements.length-1].loc.end.column };
    } else {
      returnCaret = { line: node.body.loc.end.line - 1,
                      ch: node.body.loc.end.column };
    }
    returnStore = getStaticScope(node.body.body, returnCaret);
  }
  for (var i = 0; i < node.params.length; i++) {
    if (node.params[i].name) {
      funcStore.sources[2 + i] =
        returnStore.properties.get(node.params[i].name);
    }
  }
}
// Sandbox-based analysis.
//

// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * prefix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
// Parameters:
//  - global: an Object in which to search.
//  - context: {completion: number, data: array}
//    We assume completion to be either identifier or property.
//    See ./main.js.
function identifierLookup(global, context) {
  var matchProp = '';
  var completion = new Completion();

  var value = global;
  var symbols;
  if (context.completing === Completing.identifier ||  // foo.ba|
      context.completing === Completing.property) {    // foo.|
    symbols = context.data;
    if (context.completing === Completing.identifier) {
      symbols = context.data.slice(0, -1);
      matchProp = context.data[context.data.length - 1];
    }
    for (var i = 0; i < symbols.length; i++) {
      var descriptor = getPropertyDescriptor(value, symbols[i]);
      if (descriptor && descriptor.get) {
        // This is a getter / setter.
        // We might trigger a side-effect by going deeper.
        // We must stop before the world blows up in a Michael Bay manner.
        value = null;
        break;
      } else {
        // We need to go deeper. One property deeper.
        value = value[symbols[i]];
        if (value == null) { break; }
      }
    }
    this.dynAnalysisFromType(completion, symbols, global, matchProp);

  } else if (context.completing === Completing.string) {
    // "foo".|
    value = global.String.prototype;
  } else if (context.completing === Completing.regex) {
    // /foo/.|
    value = global.RegExp.prototype;
  }

  if (value != null) {
    completionFromValue(completion, value, matchProp);
  }
  return completion;
}

JS.prototype.identifierLookup = identifierLookup;

// completion: a Completion object,
// symbols: a list of strings of properties.
// global: a JS global object.
// matchProp: the start of the property name to complete.
function dynAnalysisFromType(completion, symbols, global, matchProp) {
  var store = this.staticCandidates;
  for (var i = 0; i < symbols.length; i++) {
    if (!store) { return; }
    store = store.properties.get(symbols[i]);
  }
  // Get the type of this property.
  if (!!store) {
    store.type.forEach(function(sourceIndices, funcName) {
      // The element is an instance of that class (source index = 0).
      if (sourceIndices.indexOf(0) >= 0 && global[funcName]) {
        completionFromValue(completion, global[funcName].prototype, matchProp);
      }
    });
  }
}

JS.prototype.dynAnalysisFromType = dynAnalysisFromType;

// completion: a Completion object,
// value: a JS object
// matchProp: a string of the start of the property to complete.
function completionFromValue(completion, value, matchProp) {
  var matchedProps = getMatchedProps(value, { matchProp: matchProp });
  for (var prop in matchedProps) {
    // It needs to be a valid property: this is dot completion.
    try {
      var tokens = esprima.tokenize(prop);
      if (tokens.length === 1 && tokens[0].type === "Identifier") {
        completion.insert(
            new Candidate(prop, matchProp, -1));
      }
    } catch (e) {} // Definitely not a valid property.
  }
}


// Get all accessible properties on this JS value, as an Object.
// Filter those properties by name.
// Take only a certain number of those.
//
// Parameters:
//  - obj: JS value whose properties we want to collect.
//  - options: Options that the algorithm takes.
//    * matchProp (string): Filter for properties that match this one.
//      Defaults to the empty string (which always matches).
//    * max (number): Limit the number of properties.
function getMatchedProps(obj, options) {
  // Argument defaults.
  options = options || {};
  options.matchProp = options.matchProp || "";
  options.max = options.max || Infinity;

  if (obj == null) {
    return {};
  }

  try {
    Object.getPrototypeOf(obj);
  } catch(e) {
    obj = obj.constructor.prototype;
  }
  var c = options.max;
  var names = Object.create(null);   // Using an Object to avoid duplicates.

  // We need to go up the prototype chain.
  var ownNames = null;
  while (obj !== null) {
    ownNames = Object.getOwnPropertyNames(obj);
    for (var i = 0; i < ownNames.length; i++) {
      // Filtering happens here.
      // If we already have it in, no need to append it.
      if (ownNames[i].indexOf(options.matchProp) != 0 ||
          ownNames[i] in names) {
        continue;
      }
      c--;
      if (c < 0) {
        return names;
      }
      // If it is an array index, we can't take it.
      // This uses a trick: converting a string to a number yields NaN if
      // the operation failed, and NaN is not equal to itself.
      if (+ownNames[i] != +ownNames[i]) {
        names[ownNames[i]] = true;
      }
    }
    obj = Object.getPrototypeOf(obj);
  }

  return names;
}

// Just like Object.getOwnPropertyDescriptor,
// but walks up the prototype tree.
function getPropertyDescriptor(obj, name) {
  try {
    Object.getPrototypeOf(obj);
  } catch(e) {
    obj = obj.constructor.prototype;
  }

  var descriptor;
  while (obj !== null) {
    descriptor = Object.getOwnPropertyDescriptor(obj, name);
    if (descriptor !== undefined) {
      return descriptor;
    }
    obj = Object.getPrototypeOf(obj);
  }
}
// The weight comes from keyword frequency data at
// http://ariya.ofilabs.com/2012/03/most-popular-javascript-keywords.html

var JSKeywords = (function(keywords) {
  var keywordWeights = {};
  for (var i = 0; i < keywords.length; i++) {
    // The first keyword has a weight of -2,
    // the second one of -3, etc.
    keywordWeights[keywords[i]] = - i - 2;
  }
  return keywordWeights;
}([
  "this",
  "function",
  "if",
  "return",
  "var",
  "let",
  "else",
  "for",
  "new",
  "in",
  "typeof",
  "while",
  "case",
  "break",
  "try",
  "catch",
  "delete",
  "throw",
  "switch",
  "continue",
  "default",
  "instanceof",
  "do",
  "void",
  "finally",

  // We do not have information about the following.
  // Also, true, false, null and undefined are not keywords stricto sensu,
  // but autocompleting them seems nicer.
  "true",
  "false",
  "null",
  "undefined",
  "class",
  "super",
  "import",
  "export",
  "get",
  "of",
  "set",
  "const",
  "with",
  "debugger"
]));
}(completer));
(function(exports) {
//
// Instantiate an Aulx object for CSS autocompletion.
//
// Parameters:
//  - options: Object containing optional parameters:
//    * global: global object. Will be used to do querySelectorAll and
//    * getElementsByTagNames
//    * maxEntries: Maximum selectors suggestions to display
//
function CSS(options) {
  this.options = options || {};
  this.global = this.options.global;
  this.maxEntries = this.options.maxEntries;
}

//
// Get a list of completions we can have, based on the state of the editor.
// CSS Autocompletion can happen at three places:
//  - CSS property name completion.
//  - CSS value completion (to some extent).
//  - CSS selector suggestions based on DOM structure of the global provided.
//
//
// Use candidates for UI purposes, and completions when inserting the completion
// in the editor.
//
// Parameters:
//  - source: String of the source code.
//  - caret: Object containing two fields:
//    * line: the line number of the caret, starting with zero.
//    * ch: the column of the caret, starting with zero.
//
// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * prefix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
function cssCompleter(source, caret) {
  var completion = new Completion();

  // Getting the context from the caret position.
  if (!this.resolveContext(source, caret)) {
    // We couldn't resolve the context, we won't be able to complete.
    return completion;
  }

  // If it is a property completion, we can do something about it.
  switch(this.state) {
    case CSS_STATES.property:
      completion.meld(completeProperties(this.completing));
      break;

    case CSS_STATES.value:
      completion.meld(completeValues(this.propertyName, this.completing));
      break;

    case CSS_STATES.selector:
      completion.meld(this.suggestSelectors());
      break;

    case CSS_STATES.media:
    case CSS_STATES.keyframe:
      if ("media".indexOf(this.completing) == 0) {
        completion.insert(new Candidate("media", this.completing, 0));
      }
      else if ("keyframes".indexOf(this.completing) == 0) {
        completion.insert(new Candidate("keyframes", this.completing, 0));
      }
      break;
  }

  return completion;
}

CSS.prototype.complete = cssCompleter;

function fireStaticAnalysis(source, caret) {
  // TODO: Should do something similar to the one in Aulx.JS
}

CSS.prototype.fireStaticAnalysis = fireStaticAnalysis;

// Get the context.
//
// This uses Tab Atkins' CSS tokenizer.
// See https://github.com/tabatkins/css-parser
//
// Fetch data from the position of the caret in the source.
// The data is an object containing the following:
//  - completing: a number from the Completing enumeration.
//  - data: information about the context. Ideally, a list of strings.
//
// For example, `foo {bar|` will return
// `{completing:0, data:["bar"]}`.
//
// If we cannot get any contextual information, returns `null`.
//
// Parameters:
//  - source: a string of CSS code.
//  - caret: an objct {line: 0-indexed line, ch: 0-indexed column}.
function resolveContext(source, caret) {
  var tokens = CSS.tokenize(source, {loc:true});
  if (tokens[tokens.length - 1].loc.end.line < caret.line ||
     (tokens[tokens.length - 1].loc.end.line === caret.line &&
      tokens[tokens.length - 1].loc.end.column < caret.ch)) {
    // If the last token is not an EOF, we didn't tokenize it correctly.
    // This special case is handled in case we couldn't tokenize, but the last
    // token that *could be tokenized* was an identifier.
    return null;
  }

  // At this point, we know we were able to tokenize it.
  // Find the token just before the caret.
  // In order to do that, we use dichotomy.
  var lowIndex = 0;
  var highIndex = tokens.length - 1;
  var tokIndex = (tokens.length / 2) | 0;   // Truncating to an integer.
  var tokIndexPrevValue = tokIndex;
  var lastCall = false;
  var token;
  while (lowIndex <= highIndex) {
    token = tokens[tokIndex];
    // Note: esprima line numbers start with 1, while caret starts with 0.
    if (token.loc.start.line < caret.line) {
      lowIndex = tokIndex;
    } else if (token.loc.start.line > caret.line) {
      highIndex = tokIndex;
    } else if (token.loc.start.line === caret.line) {
      // Now, we need the correct column.
      var range = [
        token.loc.start.column,
        token.loc.end.column
      ];
      if (inRange(caret.ch, range)) {
        // We're done. We've found the token in which the cursor is.
        return this.resolveState(tokens, tokIndex, caret);
      } else if (caret.ch <= range[0]) {
        highIndex = tokIndex;
      } else if (range[1] < caret.ch) {
        lowIndex = tokIndex + 1;
      }
    }
    tokIndex = (highIndex + lowIndex) >>> 1;
    if (lastCall) { break; }
    if (tokIndex === tokIndexPrevValue) {
      tokIndex++;
      lastCall = true;
    } else { tokIndexPrevValue = tokIndex; }
  }
  return this.resolveState(tokens, tokIndex, caret);
};

CSS.prototype.resolveContext = resolveContext;

// Same as `(new aulx.CSS(options)).complete(source, caret)`.
function css(source, caret, options) {
  return (new CSS(options)).complete(source, caret);
}

exports.css = css;
exports.CSS = CSS;

// Autocompletion types.

var CSS_STATES = {
  "null": 0,
  property: 1,       // foo { bar|: … }
  value: 2,          // foo {bar: baz|}
  // TODO: Split the selector state into multiple states. This should be easy
  // once selectors-search is integrated in Aulx.CSS
  selector: 3,       // f| {bar: baz}
  media: 4,          // @med| , or , @media scr| { }
  keyframe: 5,       // @keyf|
  frame: 6,          // @keyframs foobar { t|
};

var SELECTOR_STATES = {
  "null": 0,
  id: 1,             // #f|
  class: 2,          // #foo.b|
  tag: 3,            // fo|
  pseudo: 4,         // foo:|
  attribute: 5,      // foo[b|
  value: 6,          // foo[bar=b|
};

// Note: This method assumes that the CSS is syntactically correct.
// TODO: Fix the above assumption.
//  {
//    completing: CSS_STATES.<type of completion>,
//    data: <Array of string>
//  }
//
// Parameters:
//  - tokens: list of tokens.
//  - tokIndex: index of the token where the caret is.
function resolveState(tokens, tokIndex, caret) {
  // _state can be one of CSS_STATES;
  var _state = CSS_STATES.null;
  var cursor = 0;
  // This will maintain a stack of paired elements like { & }, @m & }, : & ; etc
  var scopeStack = [];
  var token = null;
  var propertyName = null;
  var selector = null;
  var selectorState = SELECTOR_STATES.null;
  while (cursor <= tokIndex && (token = tokens[cursor++])) {
    switch (_state) {
      case CSS_STATES.property:
        // From CSS_STATES.property, we can either go to CSS_STATES.value state
        // when we hit the first ':' or CSS_STATES.selector if "}" is reached.
        switch(token.tokenType) {
          case ":":
            scopeStack.push(":");
            propertyName = tokens[cursor - 2].value;
            _state = CSS_STATES.value;
            break;

          case "}":
            if (/[{f]/.test(scopeStack.slice(-1)[0])) {
              var popped = scopeStack.pop();
              _state = popped == "f" ? CSS_STATES.frame
                                     : (selector = "",
                                        selectorState = SELECTOR_STATES.null,
                                        CSS_STATES.selector);
            }
            break;
        }
        break;

      case CSS_STATES.value:
        // From CSS_STATES.value, we can go to one of CSS_STATES.property,
        // CSS_STATES.frame, CSS_STATES.selector and CSS_STATES.null
        switch(token.tokenType) {
          case ";":
            if (/[:]/.test(scopeStack.slice(-1)[0])) {
              scopeStack.pop();
              _state = CSS_STATES.property;
            }
            break;

          case "}":
            if (scopeStack.slice(-1)[0] == ":") {
              scopeStack.pop();
            }
            if (/[{f]/.test(scopeStack.slice(-1)[0])) {
              var popped = scopeStack.pop();
              _state = popped == "f" ? CSS_STATES.frame
                                     : (selector = "",
                                        selectorState = SELECTOR_STATES.null,
                                        CSS_STATES.selector);
            }
            else if (scopeStack.slice(-1)[0] == "@m") {
              scopeStack.pop();
              _state = CSS_STATES.null;
            }
            break;
        }
        break;

      case CSS_STATES.selector:
        // From CSS_STATES.selector, we can only go to CSS_STATES.property when
        // we hit "{"
        if (token.tokenType == "{") {
          scopeStack.push("{");
          _state = CSS_STATES.property;
        }
        else {
          switch(selectorState) {
            case SELECTOR_STATES.id:
            case SELECTOR_STATES.class:
            case SELECTOR_STATES.tag:
              switch(token.tokenType) {
                case "HASH":
                  selectorState = SELECTOR_STATES.id;
                  selector += token.value;
                  break;

                case "DELIM":
                  if (token.value == ".") {
                    selectorState = SELECTOR_STATES.class;
                    selector += ".";
                    if (cursor <= tokIndex &&
                        tokens[cursor].tokenType == "IDENT") {
                      token = tokens[cursor++];
                      selector += token.value;
                    }
                  }
                  else if (/[>~+]/.test(token.value)) {
                    selectorState = SELECTOR_STATES.null;
                    selector += token.value;
                  }
                  else if (token.value == ",") {
                    selectorState = SELECTOR_STATES.null;
                    selector = "";
                  }
                  break;

                case ":":
                  selectorState = SELECTOR_STATES.pseudo;
                  selector += ":";
                  if (cursor > tokIndex) {
                    break;
                  }
                  token = tokens[cursor++];
                  switch(token.tokenType) {
                    case "FUNCTION":
                      selectorState = SELECTOR_STATES.null;
                      selector += token.value + "(";
                      scopeStack.push("(");
                      break;

                    case "IDENT":
                      selector += token.value;
                      break;
                  }
                  break;

                case "[":
                  selectorState = SELECTOR_STATES.attribute;
                  scopeStack.push("[");
                  selector += "[";
                  break;

                case ")":
                  if (scopeStack.slice(-1)[0] == "(") {
                    scopeStack.pop();
                  }
                  break;

                case "WHITESPACE":
                  selectorState = SELECTOR_STATES.null;
                  selector += " ";
                  break;
              }
              break;

            case SELECTOR_STATES.null:
              // From SELECTOR_STATES.null state, we can go to one of
              // SELECTOR_STATES.id, SELECTOR_STATES.class or SELECTOR_STATES.tag
              switch(token.tokenType) {
                case "HASH":
                  selectorState = SELECTOR_STATES.id;
                  selector += token.value;
                  break;

                case "IDENT":
                  selectorState = SELECTOR_STATES.tag;
                  selector += token.value;
                  break;

                case "DELIM":
                  if (token.value == ".") {
                    selectorState = SELECTOR_STATES.class;
                    selector += ".";
                    if (cursor <= tokIndex &&
                        tokens[cursor].tokenType == "IDENT") {
                      token = tokens[cursor++];
                      selector += token.value;
                    }
                  }
                  else if (token.value == "*") {
                    selectorState = SELECTOR_STATES.tag;
                    selector += "*";
                  }
                  else if (/[>~+]/.test(token.value)) {
                    selector += token.value;
                  }
                  else if (token.value == ",") {
                    selectorState = SELECTOR_STATES.null;
                    selector = "";
                  }
                  break;

                case "WHITESPACE":
                  selector += " ";
                  break;
              }
              break;

            case SELECTOR_STATES.pseudo:
              switch(token.tokenType) {
                case "DELIM":
                  if (/[>~+]/.test(token.value)) {
                    selectorState = SELECTOR_STATES.null;
                    selector += token.value;
                  }
                  else if (token.value == ",") {
                    selectorState = SELECTOR_STATES.null;
                    selector = "";
                  }
                  break;

                case ":":
                  selectorState = SELECTOR_STATES.pseudo;
                  selector += ":";
                  if (cursor > tokIndex) {
                    break;
                  }
                  token = tokens[cursor++];
                  switch(token.tokenType) {
                    case "FUNCTION":
                      selectorState = SELECTOR_STATES.null;
                      selector += token.value + "(";
                      scopeStack.push("(");
                      break;

                    case "IDENT":
                      selector += token.value;
                      break;
                  }
                  break;

                case "[":
                  selectorState = SELECTOR_STATES.attribute;
                  scopeStack.push("[");
                  selector += "[";
                  break;

                case "WHITESPACE":
                  selectorState = SELECTOR_STATES.null;
                  selector += " ";
                  break;
              }
              break;

            case SELECTOR_STATES.attribute:
              switch(token.tokenType) {
                case "DELIM":
                  if (/[~|^$*]/.test(token.value)) {
                    selector += token.value;
                    token = tokens[cursor++];
                  }
                  if(token.value == "=") {
                    selectorState = SELECTOR_STATES.value;
                    selector += token.value;
                  }
                  break;

                case "STRING":
                case "IDENT":
                  selector += token.value;
                  break;

                case "]":
                  if (scopeStack.slice(-1)[0] == "[") {
                    scopeStack.pop();
                  }
                  selectorState = SELECTOR_STATES.id;
                  selector += "]";
                  break;

                case "WHITESPACE":
                  selectorState = SELECTOR_STATES.null;
                  selector += " ";
                  break;
              }
              break;

            case SELECTOR_STATES.value:
              switch(token.tokenType) {
                case "STRING":
                case "IDENT":
                  selector += token.value;
                  break;

                case "]":
                  if (scopeStack.slice(-1)[0] == "[") {
                    scopeStack.pop();
                  }
                  selectorState = SELECTOR_STATES.id;
                  selector += "]";
                  break;

                case "WHITESPACE":
                  selectorState = SELECTOR_STATES.null;
                  selector += " ";
                  break;
              }
              break;
          }
        }
        break;

      case CSS_STATES.null:
        // From CSS_STATES.null state, we can go to either CSS_STATES.media or
        // CSS_STATES.selector.
        switch(token.tokenType) {
          case "HASH":
            selectorState = SELECTOR_STATES.id;
            selector = token.value;
            _state = CSS_STATES.selector;
            break;

          case "IDENT":
            selectorState = SELECTOR_STATES.tag;
            selector = token.value;
            _state = CSS_STATES.selector;
            break;

          case "DELIM":
            if (token.value == ".") {
              selectorState = SELECTOR_STATES.class;
              selector = ".";
              _state = CSS_STATES.selector;
            }
            else if (token.value == "*") {
              selectorState = SELECTOR_STATES.tag;
              selector = "*";
              _state = CSS_STATES.selector;
            }
            break;

          case "AT-KEYWORD":
            selector = "@" + token.value;
            _state = token.value.indexOf("m") == 0 ? CSS_STATES.media
                                                   : CSS_STATES.keyframe;
            break;
        }
        break;

      case CSS_STATES.media:
        // From CSS_STATES.media, we can only go to CSS_STATES.null state when
        // we hit the first '{'
        if (token.tokenType == "{") {
          scopeStack.push("@m");
          _state = CSS_STATES.null;
        }
        break;

      case CSS_STATES.keyframe:
        // From CSS_STATES.keyframe, we can only go to CSS_STATES.frame state
        // when we hit the first '{'
        if (token.tokenType == "{") {
          scopeStack.push("@k");
          _state = CSS_STATES.frame;
        }
        break;

      case CSS_STATES.frame:
        // From CSS_STATES.frame, we can either go to CSS_STATES.property state
        // when we hit the first '{' or to CSS_STATES.selector when we hit '}'
        if (token.tokenType == "{") {
          scopeStack.push("f");
          _state = CSS_STATES.property;
        }
        else if (token.tokenType == "}") {
          if (scopeStack.slice(-1)[0] == "@k") {
            scopeStack.pop();
          }
          _state = CSS_STATES.selector;
          selector = "";
          selectorState = SELECTOR_STATES.null;
        }
        break;
    }
  }
  this.state = _state;
  this.completing = (token.value || token.tokenType)
                      .slice(0, caret.ch - token.loc.start.column);
  this.propertyName = _state == CSS_STATES.value ? propertyName : null;
  selector = selector.slice(0, selector.length + token.loc.end.column - caret.ch);
  this.selector = _state == CSS_STATES.selector ? selector : null;
  this.selectorState = _state == CSS_STATES.selector ? selectorState : null;
  return _state;
}

CSS.prototype.resolveState = resolveState;
//
// The possible completions to a ':' with added score to give certain values
// some preference.
//
var PSEUDO_SUGGESTIONS = [
  [":active", 1],
  [":hover", 1],
  [":focus", 1],
  [":visited", 0],
  [":link", 0],
  [":first-letter", 0],
  [":first-child", 2],
  [":before", 2],
  [":after", 2],
  [":lang(", 0],
  [":not(", 3],
  [":first-of-type", 0],
  [":last-of-type", 0],
  [":only-of-type", 0],
  [":only-child", 2],
  [":nth-child(", 3],
  [":nth-last-child(", 0],
  [":nth-of-type(", 0],
  [":nth-last-of-type(", 0],
  [":last-child", 2],
  [":root", 0],
  [":empty", 0],
  [":target", 0],
  [":enabled", 0],
  [":disabled", 0],
  [":checked", 1],
  ["::selection", 0]
];


//
// Searches and suggests selector completion based on input selector
//
function suggestSelectors() {
  var completion = new Completion();
  var doc = this.global;
  if (!doc.querySelectorAll || !doc.getElementsByTagName) {
    return completion;
  }
  var query = this.selector;
  // Even though the selector matched atleast one node, there is still
  // possibility of suggestions.
  switch(this.selectorState) {
    case SELECTOR_STATES.null:
      query += "*";
      break;

    case SELECTOR_STATES.id:
    case SELECTOR_STATES.tag:
      query = query.slice(0, -1 * this.completing.length);
      break;

    case SELECTOR_STATES.class:
    case SELECTOR_STATES.pseudo:
      if (/^[.:]$/.test(this.completing)) {
        query = query.slice(0, -1 * this.completing.length);
      }
      else {
        query = query.slice(0, -1 * this.completing.length - 1);
      }
      break;
  }

  if (/[\s+>~]$/.test(query) &&
      this.selectorState != SELECTOR_STATES.attribute &&
      this.selectorState != SELECTOR_STATES.value) {
    query += "*";
  }

  this._suggestions = {
    ids: {},
    classes: {},
    tags: {},
  };

  switch(this.selectorState) {
    case SELECTOR_STATES.null:
    case SELECTOR_STATES.id:
    case SELECTOR_STATES.tag:
    case SELECTOR_STATES.class:
      if (!query) {
        var nodes = null, node, className, len, len2, i, j, classes;
        if (this.selectorState == SELECTOR_STATES.class) {
          nodes = doc.querySelectorAll("[class]");
          len = nodes.length;
          for (i = 0; i < len; i++) {
            node = nodes[i];
            classes = node.classList ||
                      node.className.split(" ").filter(function(item) {
                        return item.length;
                      });
            len2 = classes.length;
            for (j = 0; j < len2; j++) {
              className = classes[j];
              this._suggestions.classes[className] =
                (this._suggestions.classes[className] || 0) + 1;
            }
          }
        }
        else if (this.selectorState == SELECTOR_STATES.id) {
          nodes = doc.querySelectorAll("[id]");
          len = nodes.length;
          for (i = 0; i < len; i++) {
            node = nodes[i];
            this._suggestions.ids[node.id] = 1;
          }
        }
        else if (this.selectorState == SELECTOR_STATES.tag) {
          nodes = doc.getElementsByTagName("*");
          len = nodes.length;
          for (i = 0; i < len; i++) {
            node = nodes[i];
            this._suggestions.tags[node.tagName] =
              (this._suggestions.tags[node.tagName] || 0) + 1;
          }
        }
      }
      else {
        this._suggestions = {
          ids: {},
          classes: {},
          tags: {}
        };

        var nodes = [], node, len, className, len2, classes;
        try {
          nodes = doc.querySelectorAll(query);
        } catch (ex) {}
        len = nodes.length;
        for (var i = 0; i < len; i++) {
          node = nodes[i];
          classes = node.classList ||
                    node.className.split(" ").filter(function(item) {
                      return item.length;
                    });
          len2 = classes.length;
          this._suggestions.ids[node.id] = 1;
          this._suggestions.tags[node.tagName] =
            (this._suggestions.tags[node.tagName] || 0) + 1;
          for (var j = 0; j < len2; j++) {
            className = classes[j];
            this._suggestions.classes[className] =
              (this._suggestions.classes[className] || 0) + 1;
          }
        }
      }
      break;
  }

  // Filter the suggestions based on search box value.
  var result = [],
      firstPart = "";
  query = this.selector;
  if (this.selectorState == SELECTOR_STATES.tag) {
    // gets the tag that is being completed. For ex. 'div.foo > s' returns 's',
    // 'di' returns 'di' and likewise.
    firstPart = (query.match(/[\s>+~]?([a-zA-Z]*)$/) || ["",query])[1];
    for (var tag in this._suggestions.tags) {
      if (tag.toLowerCase().indexOf(firstPart.toLowerCase()) == 0) {
        result.push([tag, this._suggestions.tags[tag]]);
      }
    }
  }
  else if (this.selectorState == SELECTOR_STATES.class) {
    // gets the class that is being completed. For ex. '.foo.b' returns 'b'
    firstPart = query.match(/\.([^\.]*)$/)[1];
    for (var className in this._suggestions.classes) {
      if (className.indexOf(firstPart) == 0) {
        result.push(["." + className, this._suggestions.classes[className]]);
      }
    }
  }
  else if (this.selectorState == SELECTOR_STATES.id) {
    // gets the id that is being completed. For ex. '.foo#b' returns 'b'
    firstPart = query.match(/#([^#]*)$/)[1];
    for (var id in this._suggestions.ids) {
      if (id.indexOf(firstPart) == 0) {
        result.push(["#" + id, 1]);
      }
    }
  }
  else if (this.selectorState == SELECTOR_STATES.pseudo) {
    result = PSEUDO_SUGGESTIONS.filter(function(item) {
      return item[0].indexOf(":" + this.completing) == 0;
    }.bind(this))
  }

  // Sort alphabetically in increaseing order.
  result = result.sort();
  // Sort based on count in decreasing order.
  result = result.sort(function(a, b) {
    return b[1] - a[1];
  });

  var total = 0;
  var value, len = result.length;
  for (var i = 0; i < len; i++) {
    value = result[i][0];
    switch(this.selectorState) {
      case SELECTOR_STATES.pseudo:
        // make the score 0 since it doesn't actually mean anything here.
        result[i][1] = 0;
      case SELECTOR_STATES.class:
      if (/^[.:]$/.test(this.completing)) {
          value = query.slice(0, -1 * this.completing.length) + value;
        }
        else {
          value = query.slice(0, -1 * this.completing.length - 1) + value;
        }
        break;

      case SELECTOR_STATES.tag:
        value = value.toLowerCase();
      default:
       value = query.slice(0, -1 * this.completing.length) + value;
    }
    completion.insert(new Candidate(value, query, result[i][1]));
    if (++total > this.maxEntries - 1) {
      break;
    }
  }
  return completion;
}

CSS.prototype.suggestSelectors = suggestSelectors;
(function(exports) {
(function (root, factory) {
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
    // Rhino, and plain browser loading.
    if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else if (typeof exports !== 'undefined') {
        factory(exports);
    } else {
        factory(root);
    }
}(this, function (exports) {

var between = function (num, first, last) { return num >= first && num <= last; }
function digit(code) { return between(code, 0x30,0x39); }
function hexdigit(code) { return digit(code) || between(code, 0x41,0x46) || between(code, 0x61,0x66); }
function uppercaseletter(code) { return between(code, 0x41,0x5a); }
function lowercaseletter(code) { return between(code, 0x61,0x7a); }
function letter(code) { return uppercaseletter(code) || lowercaseletter(code); }
function nonascii(code) { return code >= 0xa0; }
function namestartchar(code) { return letter(code) || nonascii(code) || code == 0x5f; }
function namechar(code) { return namestartchar(code) || digit(code) || code == 0x2d; }
function nonprintable(code) { return between(code, 0,8) || between(code, 0xe,0x1f) || between(code, 0x7f,0x9f); }
function newline(code) { return code == 0xa || code == 0xc; }
function whitespace(code) { return newline(code) || code == 9 || code == 0x20; }
function badescape(code) { return newline(code) || isNaN(code); }

// Note: I'm not yet acting smart enough to actually handle astral characters.
var maximumallowedcodepoint = 0x10ffff;

function tokenize(str, options) {
	if(options == undefined) options = {transformFunctionWhitespace:false, scientificNotation:false};
	var i = -1;
	var tokens = [];
	var state = "data";
	var code;
	var currtoken;

	// Line number information.
	var line = 0;
	var column = 0;
	// The only use of lastLineLength is in reconsume().
	var lastLineLength = 0;
	var incrLineno = function() {
		line += 1;
		lastLineLength = column;
		column = 0;
	};
	var locStart = {line:line, column:column};

	var next = function(num) { if(num === undefined) num = 1; return str.charCodeAt(i+num); };
	var consume = function(num) {
		if(num === undefined)
			num = 1;
		i += num;
		code = str.charCodeAt(i);
		if (newline(code)) incrLineno();
		else column += num;
		//console.log('Consume '+i+' '+String.fromCharCode(code) + ' 0x' + code.toString(16));
		return true;
	};
	var reconsume = function() {
		i -= 1;
		if (newline(code)) {
			line -= 1;
			column = lastLineLength;
		} else {
			column -= 1;
		}
		locStart.line = line;
		locStart.column = column;
		return true;
	};
	var eof = function() { return i >= str.length; };
	var donothing = function() {};
	var emit = function(token) {
		if(token) {
			token.finish();
		} else {
			token = currtoken.finish();
		}
		if (options.loc === true) {
			token.loc = {};
			token.loc.start = {line:locStart.line, column:locStart.column};
			locStart = {line: line, column: column};
			token.loc.end = locStart;
		}
		tokens.push(token);
		//console.log('Emitting ' + token);
		currtoken = undefined;
		return true;
	};
	var create = function(token) { currtoken = token; return true; };
	var parseerror = function() { console.log("Parse error at index " + i + ", processing codepoint 0x" + code.toString(16) + " in state " + state + ".");return true; };
	var switchto = function(newstate) {
		state = newstate;
		//console.log('Switching to ' + state);
		return true;
	};
	var consumeEscape = function() {
		// Assume the the current character is the \
		consume();
		if(hexdigit(code)) {
			// Consume 1-6 hex digits
			var digits = [];
			for(var total = 0; total < 6; total++) {
				if(hexdigit(code)) {
					digits.push(code);
					consume();
				} else { break; }
			}
			var value = parseInt(digits.map(String.fromCharCode).join(''), 16);
			if( value > maximumallowedcodepoint ) value = 0xfffd;
			// If the current char is whitespace, cool, we'll just eat it.
			// Otherwise, put it back.
			if(!whitespace(code)) reconsume();
			return value;
		} else {
			return code;
		}
	};

	for(;;) {
		if(i > str.length*2) return "I'm infinite-looping!";
		consume();
		switch(state) {
		case "data":
			if(whitespace(code)) {
				emit(new WhitespaceToken);
				while(whitespace(next())) consume();
			}
			else if(code == 0x22) switchto("double-quote-string");
			else if(code == 0x23) switchto("hash");
			else if(code == 0x27) switchto("single-quote-string");
			else if(code == 0x28) emit(new OpenParenToken);
			else if(code == 0x29) emit(new CloseParenToken);
			else if(code == 0x2b) {
				if(digit(next()) || (next() == 0x2e && digit(next(2)))) switchto("number") && reconsume();
				else emit(new DelimToken(code));
			}
			else if(code == 0x2d) {
				if(next(1) == 0x2d && next(2) == 0x3e) consume(2) && emit(new CDCToken);
				else if(digit(next()) || (next(1) == 0x2e && digit(next(2)))) switchto("number") && reconsume();
				else if(namestartchar(next())) switchto("identifier") && reconsume();
				else emit(new DelimToken(code));
			}
			else if(code == 0x2e) {
				if(digit(next())) switchto("number") && reconsume();
				else emit(new DelimToken(code));
			}
			else if(code == 0x2f) {
				if(next() == 0x2a) switchto("comment");
				else emit(new DelimToken(code));
			}
			else if(code == 0x3a) emit(new ColonToken);
			else if(code == 0x3b) emit(new SemicolonToken);
			else if(code == 0x3c) {
				if(next(1) == 0x21 && next(2) == 0x2d && next(3) == 0x2d) consume(3) && emit(new CDOToken);
				else emit(new DelimToken(code));
			}
			else if(code == 0x40) switchto("at-keyword");
			else if(code == 0x5b) emit(new OpenSquareToken);
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && emit(new DelimToken(code));
				else switchto("identifier") && reconsume();
			}
			else if(code == 0x5d) emit(new CloseSquareToken);
			else if(code == 0x7b) emit(new OpenCurlyToken);
			else if(code == 0x7d) emit(new CloseCurlyToken);
			else if(digit(code)) switchto("number") && reconsume();
			else if(code == 0x55 || code == 0x75) {
				if(next(1) == 0x2b && hexdigit(next(2))) consume() && switchto("unicode-range");
				else if((next(1) == 0x52 || next(1) == 0x72) && (next(2) == 0x4c || next(2) == 0x6c) && (next(3) == 0x28)) consume(3) && switchto("url");
				else switchto("identifier") && reconsume();
			}
			else if(namestartchar(code)) switchto("identifier") && reconsume();
			else if(eof()) { emit(new EOFToken); return tokens; }
			else emit(new DelimToken(code));
			break;

		case "double-quote-string":
			if(currtoken == undefined) create(new StringToken);

			if(code == 0x22) emit() && switchto("data");
			else if(eof()) parseerror() && emit() && switchto("data");
			else if(newline(code)) parseerror() && emit(new BadStringToken) && switchto("data") && reconsume();
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && emit(new BadStringToken) && switchto("data");
				else if(newline(next())) consume();
				else currtoken.append(consumeEscape());
			}
			else currtoken.append(code);
			break;

		case "single-quote-string":
			if(currtoken == undefined) create(new StringToken);

			if(code == 0x27) emit() && switchto("data");
			else if(eof()) parseerror() && emit() && switchto("data");
			else if(newline(code)) parseerror() && emit(new BadStringToken) && switchto("data") && reconsume();
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && emit(new BadStringToken) && switchto("data");
				else if(newline(next())) consume();
				else currtoken.append(consumeEscape());
			}
			else currtoken.append(code);
			break;

		case "hash":
			if(namechar(code)) create(new HashToken(code)) && switchto("hash-rest");
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && emit(new DelimToken(0x23)) && switchto("data") && reconsume();
				else create(new HashToken(consumeEscape())) && switchto('hash-rest');
			}
			else emit(new DelimToken(0x23)) && switchto('data') && reconsume();
			break;

		case "hash-rest":
			if(namechar(code)) currtoken.append(code);
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && emit(new DelimToken(0x23)) && switchto("data") && reconsume();
				else currtoken.append(consumeEscape());
			}
			else emit() && switchto('data') && reconsume();
			break;

		case "comment":
			if(code == 0x2a) {
				if(next() == 0x2f) consume() && switchto('data');
				else donothing();
			}
			else if(eof()) parseerror() && switchto('data') && reconsume();
			else donothing();
			break;

		case "at-keyword":
			if(code == 0x2d) {
				if(namestartchar(next())) consume() && create(new AtKeywordToken([0x40,code])) && switchto('at-keyword-rest');
				else emit(new DelimToken(0x40)) && switchto('data') && reconsume();
			}
			else if(namestartchar(code)) create(new AtKeywordToken(code)) && switchto('at-keyword-rest');
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && emit(new DelimToken(0x23)) && switchto("data") && reconsume();
				else create(new AtKeywordToken(consumeEscape())) && switchto('at-keyword-rest');
			}
			else emit(new DelimToken(0x40)) && switchto('data') && reconsume();
			break;

		case "at-keyword-rest":
			if(namechar(code)) currtoken.append(code);
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && emit() && switchto("data") && reconsume();
				else currtoken.append(consumeEscape());
			}
			else emit() && switchto('data') && reconsume();
			break;

		case "identifier":
			if(code == 0x2d) {
				if(namestartchar(next())) create(new IdentifierToken(code)) && switchto('identifier-rest');
				else switchto('data') && reconsume();
			}
			else if(namestartchar(code)) create(new IdentifierToken(code)) && switchto('identifier-rest');
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && switchto("data") && reconsume();
				else create(new IdentifierToken(consumeEscape())) && switchto('identifier-rest');
			}
			else switchto('data') && reconsume();
			break;

		case "identifier-rest":
			if(namechar(code)) currtoken.append(code);
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && emit() && switchto("data") && reconsume();
				else currtoken.append(consumeEscape());
			}
			else if(code == 0x28) emit(new FunctionToken(currtoken)) && switchto('data');
			else if(whitespace(code) && options.transformFunctionWhitespace) switchto('transform-function-whitespace');
			else emit() && switchto('data') && reconsume();
			break;

		case "transform-function-whitespace":
			if(whitespace(code)) donothing();
			else if(code == 0x28) emit(new FunctionToken(currtoken)) && switchto('data');
			else emit() && switchto('data') && reconsume();
			break;

		case "number":
			create(new NumberToken());

			if(code == 0x2d) {
				if(digit(next())) consume() && currtoken.append([0x2d,code]) && switchto('number-rest');
				else if(next(1) == 0x2e && digit(next(2))) consume(2) && currtoken.append([0x2d,0x2e,code]) && switchto('number-fraction');
				else switchto('data') && reconsume();
			}
			else if(code == 0x2b) {
				if(digit(next())) consume() && currtoken.append([0x2b,code]) && switchto('number-rest');
				else if(next(1) == 0x2e && digit(next(2))) consume(2) && currtoken.append([0x2b,0x2e,code]) && switchto('number-fraction');
				else switchto('data') && reconsume();
			}
			else if(digit(code)) currtoken.append(code) && switchto('number-rest');
			else if(code == 0x2e) {
				if(digit(next())) consume() && currtoken.append([0x2e,code]) && switchto('number-fraction');
				else switchto('data') && reconsume();
			}
			else switchto('data') && reconsume();
			break;

		case "number-rest":
			if(digit(code)) currtoken.append(code);
			else if(code == 0x2e) {
				if(digit(next())) consume() && currtoken.append([0x2e,code]) && switchto('number-fraction');
				else emit() && switchto('data') && reconsume();
			}
			else if(code == 0x25) emit(new PercentageToken(currtoken)) && switchto('data') && reconsume();
			else if(code == 0x45 || code == 0x65) {
				if(!options.scientificNotation) create(new DimensionToken(currtoken,code)) && switchto('dimension');
				else if(digit(next())) consume() && currtoken.append([0x25,code]) && switchto('sci-notation');
				else if((next(1) == 0x2b || next(1) == 0x2d) && digit(next(2))) currtoken.append([0x25,next(1),next(2)]) && consume(2) && switchto('sci-notation');
				else create(new DimensionToken(currtoken,code)) && switchto('dimension');
			}
			else if(code == 0x2d) {
				if(namestartchar(next())) consume() && create(new DimensionToken(currtoken,[0x2d,code])) && switchto('dimension');
				else if(next(1) == 0x5c && badescape(next(2))) parseerror() && emit() && switchto('data') && reconsume();
				else if(next(1) == 0x5c) consume() && create(new DimensionToken(currtoken, [0x2d,consumeEscape()])) && switchto('dimension');
				else emit() && switchto('data') && reconsume();
			}
			else if(namestartchar(code)) create(new DimensionToken(currtoken, code)) && switchto('dimension');
			else if(code == 0x5c) {
				if(badescape(next)) emit() && switchto('data') && reconsume();
				else create(new DimensionToken(currtoken,consumeEscape)) && switchto('dimension');
			}
			else emit() && switchto('data') && reconsume();
			break;

		case "number-fraction":
			currtoken.type = "number";

			if(digit(code)) currtoken.append(code);
			else if(code == 0x2e) emit() && switchto('data') && reconsume();
			else if(code == 0x25) emit(new PercentageToken(currtoken)) && switchto('data') && reconsume();
			else if(code == 0x45 || code == 0x65) {
				if(!options.scientificNotation) create(new DimensionToken(currtoken,code)) && switchto('dimension');
				else if(digit(next())) consume() && currtoken.append([0x25,code]) && switchto('sci-notation');
				else if((next(1) == 0x2b || next(1) == 0x2d) && digit(next(2))) currtoken.append([0x25,next(1),next(2)]) && consume(2) && switchto('sci-notation');
				else create(new DimensionToken(currtoken,code)) && switchto('dimension');
			}
			else if(code == 0x2d) {
				if(namestartchar(next())) consume() && create(new DimensionToken(currtoken,[0x2d,code])) && switchto('dimension');
				else if(next(1) == 0x5c && badescape(next(2))) parseerror() && emit() && switchto('data') && reconsume();
				else if(next(1) == 0x5c) consume() && create(new DimensionToken(currtoken, [0x2d,consumeEscape()])) && switchto('dimension');
				else emit() && switchto('data') && reconsume();
			}
			else if(namestartchar(code)) create(new DimensionToken(currtoken, code)) && switchto('dimension');
			else if(code == 0x5c) {
				if(badescape(next)) emit() && switchto('data') && reconsume();
				else create(new DimensionToken(currtoken,consumeEscape)) && switchto('dimension');
			}
			else emit() && switchto('data') && reconsume();
			break;

		case "dimension":
			if(namechar(code)) currtoken.append(code);
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && emit() && switchto('data') && reconsume();
				else currtoken.append(consumeEscape());
			}
			else emit() && switchto('data') && reconsume();
			break;

		case "sci-notation":
			if(digit(code)) currtoken.append(code);
			else emit() && switchto('data') && reconsume();
			break;

		case "url":
			if(code == 0x22) switchto('url-double-quote');
			else if(code == 0x27) switchto('url-single-quote');
			else if(code == 0x29) emit(new URLToken) && switchto('data');
			else if(whitespace(code)) donothing();
			else switchto('url-unquoted') && reconsume();
			break;

		case "url-double-quote":
			if(currtoken == undefined) create(new URLToken);

			if(code == 0x22) switchto('url-end');
			else if(newline(code)) parseerror() && switchto('bad-url');
			else if(code == 0x5c) {
				if(newline(next())) consume();
				else if(badescape(next())) parseerror() && emit(new BadURLToken) && switchto('data') && reconsume();
				else currtoken.append(consumeEscape());
			}
			else currtoken.append(code);
			break;

		case "url-single-quote":
			if(currtoken == undefined) create(new URLToken);

			if(code == 0x27) switchto('url-end');
			else if(newline(code)) parseerror() && switchto('bad-url');
			else if(code == 0x5c) {
				if(newline(next())) consume();
				else if(badescape(next())) parseerror() && emit(new BadURLToken) && switchto('data') && reconsume();
				else currtoken.append(consumeEscape());
			}
			else currtoken.append(code);
			break;

		case "url-end":
			if(whitespace(code)) donothing();
			else if(code == 0x29) emit() && switchto('data');
			else parseerror() && switchto('bad-url') && reconsume();
			break;

		case "url-unquoted":
			if(currtoken == undefined) create(new URLToken);

			if(whitespace(code)) switchto('url-end');
			else if(code == 0x29) emit() && switchto('data');
			else if(code == 0x22 || code == 0x27 || code == 0x28 || nonprintable(code)) parseerror() && switchto('bad-url');
			else if(code == 0x5c) {
				if(badescape(next())) parseerror() && switchto('bad-url');
				else currtoken.append(consumeEscape());
			}
			else currtoken.append(code);
			break;

		case "bad-url":
			if(code == 0x29) emit(new BadURLToken) && switchto('data');
			else if(code == 0x5c) {
				if(badescape(next())) donothing();
				else consumeEscape()
			}
			else donothing();
			break;

		case "unicode-range":
			// We already know that the current code is a hexdigit.

			var start = [code], end = [code];

			for(var total = 1; total < 6; total++) {
				if(hexdigit(next())) {
					consume();
					start.push(code);
					end.push(code);
				}
				else break;
			}

			if(next() == 0x3f) {
				for(;total < 6; total++) {
					if(next() == 0x3f) {
						consume();
						start.push("0".charCodeAt(0));
						end.push("f".charCodeAt(0));
					}
					else break;
				}
				emit(new UnicodeRangeToken(start,end)) && switchto('data');
			}
			else if(next(1) == 0x2d && hexdigit(next(2))) {
				consume();
				consume();
				end = [code];
				for(var total = 1; total < 6; total++) {
					if(hexdigit(next())) {
						consume();
						end.push(code);
					}
					else break;
				}
				emit(new UnicodeRangeToken(start,end)) && switchto('data');
			}
			else emit(new UnicodeRangeToken(start)) && switchto('data');
			break;

		default:
			console.log("Unknown state '" + state + "'");
		}
	}
}

function stringFromCodeArray(arr) {
	return String.fromCharCode.apply(null,arr.filter(function(e){return e;}));
}

function CSSParserToken(options) { return this; }
CSSParserToken.prototype.finish = function() { return this; }
CSSParserToken.prototype.toString = function() { return this.tokenType; }
CSSParserToken.prototype.toJSON = function() { return this.toString(); }

function BadStringToken() { return this; }
BadStringToken.prototype = new CSSParserToken;
BadStringToken.prototype.tokenType = "BADSTRING";

function BadURLToken() { return this; }
BadURLToken.prototype = new CSSParserToken;
BadURLToken.prototype.tokenType = "BADURL";

function WhitespaceToken() { return this; }
WhitespaceToken.prototype = new CSSParserToken;
WhitespaceToken.prototype.tokenType = "WHITESPACE";
WhitespaceToken.prototype.toString = function() { return "WS"; }

function CDOToken() { return this; }
CDOToken.prototype = new CSSParserToken;
CDOToken.prototype.tokenType = "CDO";

function CDCToken() { return this; }
CDCToken.prototype = new CSSParserToken;
CDCToken.prototype.tokenType = "CDC";

function ColonToken() { return this; }
ColonToken.prototype = new CSSParserToken;
ColonToken.prototype.tokenType = ":";

function SemicolonToken() { return this; }
SemicolonToken.prototype = new CSSParserToken;
SemicolonToken.prototype.tokenType = ";";

function OpenCurlyToken() { return this; }
OpenCurlyToken.prototype = new CSSParserToken;
OpenCurlyToken.prototype.tokenType = "{";

function CloseCurlyToken() { return this; }
CloseCurlyToken.prototype = new CSSParserToken;
CloseCurlyToken.prototype.tokenType = "}";

function OpenSquareToken() { return this; }
OpenSquareToken.prototype = new CSSParserToken;
OpenSquareToken.prototype.tokenType = "[";

function CloseSquareToken() { return this; }
CloseSquareToken.prototype = new CSSParserToken;
CloseSquareToken.prototype.tokenType = "]";

function OpenParenToken() { return this; }
OpenParenToken.prototype = new CSSParserToken;
OpenParenToken.prototype.tokenType = "(";

function CloseParenToken() { return this; }
CloseParenToken.prototype = new CSSParserToken;
CloseParenToken.prototype.tokenType = ")";

function EOFToken() { return this; }
EOFToken.prototype = new CSSParserToken;
EOFToken.prototype.tokenType = "EOF";

function DelimToken(code) {
	this.value = String.fromCharCode(code);
	return this;
}
DelimToken.prototype = new CSSParserToken;
DelimToken.prototype.tokenType = "DELIM";
DelimToken.prototype.toString = function() { return "DELIM("+this.value+")"; }

function StringValuedToken() { return this; }
StringValuedToken.prototype = new CSSParserToken;
StringValuedToken.prototype.append = function(val) {
	if(val instanceof Array) {
		for(var i = 0; i < val.length; i++) {
			this.value.push(val[i]);
		}
	} else {
		this.value.push(val);
	}
	return true;
}
StringValuedToken.prototype.finish = function() {
	this.value = stringFromCodeArray(this.value);
	return this;
}

function IdentifierToken(val) {
	this.value = [];
	this.append(val);
}
IdentifierToken.prototype = new StringValuedToken;
IdentifierToken.prototype.tokenType = "IDENT";
IdentifierToken.prototype.toString = function() { return "IDENT("+this.value+")"; }

function FunctionToken(val) {
	// These are always constructed by passing an IdentifierToken
	this.value = val.finish().value;
}
FunctionToken.prototype = new CSSParserToken;
FunctionToken.prototype.tokenType = "FUNCTION";
FunctionToken.prototype.toString = function() { return "FUNCTION("+this.value+")"; }

function AtKeywordToken(val) {
	this.value = [];
	this.append(val);
}
AtKeywordToken.prototype = new StringValuedToken;
AtKeywordToken.prototype.tokenType = "AT-KEYWORD";
AtKeywordToken.prototype.toString = function() { return "AT("+this.value+")"; }

function HashToken(val) {
	this.value = [];
	this.append(val);
}
HashToken.prototype = new StringValuedToken;
HashToken.prototype.tokenType = "HASH";
HashToken.prototype.toString = function() { return "HASH("+this.value+")"; }

function StringToken(val) {
	this.value = [];
	this.append(val);
}
StringToken.prototype = new StringValuedToken;
StringToken.prototype.tokenType = "STRING";
StringToken.prototype.toString = function() { return "\""+this.value+"\""; }

function URLToken(val) {
	this.value = [];
	this.append(val);
}
URLToken.prototype = new StringValuedToken;
URLToken.prototype.tokenType = "URL";
URLToken.prototype.toString = function() { return "URL("+this.value+")"; }

function NumberToken(val) {
	this.value = [];
	this.append(val);
	this.type = "integer";
}
NumberToken.prototype = new StringValuedToken;
NumberToken.prototype.tokenType = "NUMBER";
NumberToken.prototype.toString = function() {
	if(this.type == "integer")
		return "INT("+this.value+")";
	return "NUMBER("+this.value+")";
}
NumberToken.prototype.finish = function() {
	this.repr = stringFromCodeArray(this.value);
	this.value = this.repr * 1;
	if(Math.abs(this.value) % 1 != 0) this.type = "number";
	return this;
}

function PercentageToken(val) {
	// These are always created by passing a NumberToken as val
	val.finish();
	this.value = val.value;
	this.repr = val.repr;
}
PercentageToken.prototype = new CSSParserToken;
PercentageToken.prototype.tokenType = "PERCENTAGE";
PercentageToken.prototype.toString = function() { return "PERCENTAGE("+this.value+")"; }

function DimensionToken(val,unit) {
	// These are always created by passing a NumberToken as the val
	val.finish();
	this.num = val.value;
	this.unit = [];
	this.repr = val.repr;
	this.append(unit);
}
DimensionToken.prototype = new CSSParserToken;
DimensionToken.prototype.tokenType = "DIMENSION";
DimensionToken.prototype.toString = function() { return "DIM("+this.num+","+this.unit+")"; }
DimensionToken.prototype.append = function(val) {
	if(val instanceof Array) {
		for(var i = 0; i < val.length; i++) {
			this.unit.push(val[i]);
		}
	} else {
		this.unit.push(val);
	}
	return true;
}
DimensionToken.prototype.finish = function() {
	this.unit = stringFromCodeArray(this.unit);
	this.repr += this.unit;
	return this;
}

function UnicodeRangeToken(start,end) {
	// start and end are array of char codes, completely finished
	start = parseInt(stringFromCodeArray(start),16);
	if(end === undefined) end = start + 1;
	else end = parseInt(stringFromCodeArray(end),16);

	if(start > maximumallowedcodepoint) end = start;
	if(end < start) end = start;
	if(end > maximumallowedcodepoint) end = maximumallowedcodepoint;

	this.start = start;
	this.end = end;
	return this;
}
UnicodeRangeToken.prototype = new CSSParserToken;
UnicodeRangeToken.prototype.tokenType = "UNICODE-RANGE";
UnicodeRangeToken.prototype.toString = function() {
	if(this.start+1 == this.end)
		return "UNICODE-RANGE("+this.start.toString(16).toUpperCase()+")";
	if(this.start < this.end)
		return "UNICODE-RANGE("+this.start.toString(16).toUpperCase()+"-"+this.end.toString(16).toUpperCase()+")";
	return "UNICODE-RANGE()";
}
UnicodeRangeToken.prototype.contains = function(code) {
	return code >= this.start && code < this.end;
}


// Exportation.
// TODO: also export the various tokens objects?
exports.tokenize = tokenize;

}));
}(exports.CSS));

// Keyword-based completion.
//

// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * prefix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
// Parameters:
//  - startProp: the start of a CSS property, as a String.
function completeProperties(startProp) {
  var completion = new Completion();
  for (var prop in properties) {
    if (prop.indexOf(startProp) === 0) {
      completion.insert(new Candidate(prop, startProp, 0));
    }
  }
  return completion;
};

// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * prefix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
// Parameters:
//  - propName: the property name for which value is being completed.
//  - startProp: the start of the CSS value, as a String.
function completeValues(propName, startValue) {
  var completion = new Completion();
  (properties[propName] || []).forEach(function(prop) {
    if (prop.indexOf(startValue) === 0) {
      completion.insert(new Candidate(prop, startValue, 0));
    }
  });
  return completion;
};

// FIXME: give properties a score proportional to frequency in common code.
//
// Property value pair obtained from https://gist.github.com/scrapmac/6106409
// On top of which some optimization is done to club similar values.
//
var AU = "auto";
var CA = "calc";
var HI = "hidden"
var INH = "inherit";
var NO = "none";
var BORDER = ["aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", CA, "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "dashed", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "dotted", "double", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "groove", HI, "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "inset", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "medium", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", NO, "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "outset", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "rgb", "rgba", "ridge", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "solid", "springgreen", "steelblue", "tan", "teal", "thick", "thin", "thistle", "tomato", "transparent", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"];
var COLORS = ["aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "rgb", "rgba", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "transparent", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"];
var properties = {
  "align-items": ["baseline", "center", "flex-end", "flex-start", INH, "stretch"],
  "align-self": [AU, "baseline", "center", "flex-end", "flex-start", INH, "stretch"],
  "animation": ["alternate", "alternate-reverse", "backwards", "both", "cubic-bezier", "ease", "ease-in", "ease-in-out", "ease-out", "forwards", "infinite", INH, "linear", NO, "normal", "reverse", "step-end", "step-start", "steps"],
  "animation-delay": [INH],
  "animation-direction": ["alternate", "alternate-reverse", INH, "normal", "reverse"],
  "animation-duration": [INH],
  "animation-fill-mode": ["backwards", "both", "forwards", INH, NO],
  "animation-iteration-count": ["infinite", INH],
  "animation-name": [INH, NO],
  "animation-play-state": [INH, "paused", "running"],
  "animation-timing-function": ["cubic-bezier", "ease", "ease-in", "ease-in-out", "ease-out", INH, "linear", "step-end", "step-start", "steps"],
  "backface-visibility": [HI, INH, "visible"],
  "background": ["aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "border-box", "bottom", "brown", "burlywood", "cadetblue", "center", "chartreuse", "chocolate", "contain", "content-box", "coral", "cornflowerblue", "cornsilk", "cover", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "fixed", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "left", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "local", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "no-repeat", NO, "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "padding-box", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "repeat", "repeat-x", "repeat-y", "rgb", "rgba", "right", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "scroll", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "top", "transparent", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"],
  "background-attachment": ["fixed", INH, "local", "scroll"],
  "background-clip": ["border-box", "content-box", INH, "padding-box"],
  "background-color": COLORS,
  "background-image": [INH, NO],
  "background-origin": ["border-box", "content-box", INH, "padding-box"],
  "background-position": ["bottom", "center", INH, "left", "right", "top"],
  "background-repeat": [INH, "no-repeat", "repeat", "repeat-x", "repeat-y"],
  "background-size": ["contain", "cover", INH],
  "border": BORDER,
  "border-bottom": BORDER,
  "border-bottom-color": COLORS,
  "border-bottom-left-radius": [INH],
  "border-bottom-right-radius": [INH],
  "border-bottom-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-bottom-width": [CA, INH, "medium", "thick", "thin"],
  "border-collapse": ["collapse", INH, "separate"],
  "border-color": COLORS,
  "border-image": ["fill", INH, NO, "repeat", "round", "stretch"],
  "border-image-outset": [INH],
  "border-image-repeat": [INH, "repeat", "round", "stretch"],
  "border-image-slice": ["fill", INH],
  "border-image-source": [INH, NO],
  "border-image-width": [INH],
  "border-left": BORDER,
  "border-left-color": COLORS,
  "border-left-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-left-width": [CA, INH, "medium", "thick", "thin"],
  "border-radius": [INH],
  "border-right": BORDER,
  "border-right-color": COLORS,
  "border-right-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-right-width": [CA, INH, "medium", "thick", "thin"],
  "border-spacing": [INH],
  "border-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-top": BORDER,
  "border-top-color": COLORS,
  "border-top-left-radius": [INH],
  "border-top-right-radius": [INH],
  "border-top-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-top-width": [CA, INH, "medium", "thick", "thin"],
  "border-width": [CA, INH, "medium", "thick", "thin"],
  "bottom": [AU, CA, INH],
  "box-shadow": [INH, "inset"],
  "caption-side": ["bottom", "bottom-outside", INH, "left", "right", "top", "top-outside"],
  "clear": ["both", INH, "left", NO, "right"],
  "clip": [INH],
  "clip-path": [INH, NO],
  "clip-rule": ["evenodd", INH, "nonzero"],
  "color": COLORS,
  "color-interpolation": [AU, INH, "linearrgb", "srgb"],
  "color-interpolation-filters": [AU, INH, "linearrgb", "srgb"],
  "content": ["close-quote", INH, "no-close-quote", "no-open-quote", "open-quote"],
  "counter-increment": [INH],
  "counter-reset": [INH],
  "cursor": ["alias", "all-scroll", AU, "cell", "col-resize", "context-menu", "copy", "crosshair", "default", "e-resize", "ew-resize", "help", INH, "move", "n-resize", "ne-resize", "nesw-resize", "no-drop", NO, "not-allowed", "ns-resize", "nw-resize", "nwse-resize", "pointer", "progress", "row-resize", "s-resize", "se-resize", "sw-resize", "text", "vertical-text", "w-resize", "wait", "zoom-in", "zoom-out"],
  "direction": [INH, "ltr", "rtl"],
  "display": ["block", "flex", INH, "inline", "inline-block", "inline-flex", "inline-table", "list-item", NO, "table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row", "table-row-group"],
  "dominant-baseline": ["alphabetic", AU, "central", "hanging", "ideographic", INH, "mathematical", "middle", "no-change", "reset-size", "text-after-edge", "text-before-edge", "use-script"],
  "empty-cells": ["hide", INH, "show"],
  "fill": [INH],
  "fill-opacity": [INH],
  "fill-rule": ["evenodd", INH, "nonzero"],
  "filter": [INH],
  "flex": [AU, CA, INH],
  "flex-basis": [AU, CA, INH],
  "flex-direction": ["column", "column-reverse", INH, "row", "row-reverse"],
  "flex-grow": [INH],
  "flex-shrink": [INH],
  "float": [INH, "left", NO, "right"],
  "flood-color": COLORS,
  "flood-opacity": [INH],
  "font": ["all-petite-caps", "all-small-caps", AU, "bold", "bolder", CA, "caption", "common-ligatures", "condensed", "contextual", "diagonal-fractions", "discretionary-ligatures", "expanded", "extra-condensed", "extra-expanded", "full-width", "historical-forms", "historical-ligatures", "icon", INH, "italic", "jis04", "jis78", "jis83", "jis90", "large", "larger", "lighter", "lining-nums", "medium", "menu", "message-box", "no-common-ligatures", "no-contextual", "no-discretionary-ligatures", "no-historical-ligatures", NO, "normal", "oblique", "oldstyle-nums", "ordinal", "petite-caps", "proportional-nums", "proportional-width", "ruby", "semi-condensed", "semi-expanded", "simplified", "slashed-zero", "small", "small-caps", "small-caption", "smaller", "stacked-fractions", "status-bar", "style", "sub", "super", "tabular-nums", "titling-caps", "traditional", "ultra-condensed", "ultra-expanded", "unicase", "weight", "x-large", "x-small", "xx-large", "xx-small"],
  "font-family": [INH],
  "font-feature-settings": [INH],
  "font-kerning": [AU, INH, NO, "normal"],
  "font-language-override": [INH, "normal"],
  "font-size": [CA, INH, "large", "larger", "medium", "small", "smaller", "x-large", "x-small", "xx-large", "xx-small"],
  "font-size-adjust": [INH, NO],
  "font-stretch": ["condensed", "expanded", "extra-condensed", "extra-expanded", INH, "normal", "semi-condensed", "semi-expanded", "ultra-condensed", "ultra-expanded"],
  "font-style": [INH, "italic", "normal", "oblique"],
  "font-synthesis": [INH, "style", "weight"],
  "font-variant": [INH, "normal", "small-caps"],
  "font-variant-alternates": ["historical-forms", INH],
  "font-variant-caps": ["all-petite-caps", "all-small-caps", INH, "normal", "petite-caps", "small-caps", "titling-caps", "unicase"],
  "font-variant-east-asian": ["full-width", INH, "jis04", "jis78", "jis83", "jis90", "proportional-width", "ruby", "simplified", "traditional"],
  "font-variant-ligatures": ["common-ligatures", "contextual", "discretionary-ligatures", "historical-ligatures", INH, "no-common-ligatures", "no-contextual", "no-discretionary-ligatures", "no-historical-ligatures"],
  "font-variant-numeric": ["diagonal-fractions", INH, "lining-nums", "oldstyle-nums", "ordinal", "proportional-nums", "slashed-zero", "stacked-fractions", "tabular-nums"],
  "font-variant-position": [INH, "normal", "sub", "super"],
  "font-weight": ["bold", "bolder", INH, "lighter", "normal"],
  "height": [AU, CA, INH],
  "image-rendering": [AU, INH, "optimizequality", "optimizespeed"],
  "ime-mode": ["active", AU, "disabled", "inactive", INH, "normal"],
  "justify-content": ["center", "flex-end", "flex-start", INH, "space-around", "space-between"],
  "left": [AU, CA, INH],
  "letter-spacing": [CA, INH, "normal"],
  "lighting-color": COLORS,
  "line-height": [INH, "normal"],
  "list-style": ["armenian", "circle", "cjk-ideographic", "decimal", "decimal-leading-zero", "disc", "georgian", "hebrew", "hiragana", "hiragana-iroha", INH, "inside", "katakana", "katakana-iroha", "lower-alpha", "lower-greek", "lower-latin", "lower-roman", NO, "outside", "square", "upper-alpha", "upper-latin", "upper-roman"],
  "list-style-image": [INH, NO],
  "list-style-position": [INH, "inside", "outside"],
  "list-style-type": ["armenian", "circle", "cjk-ideographic", "decimal", "decimal-leading-zero", "disc", "georgian", "hebrew", "hiragana", "hiragana-iroha", INH, "katakana", "katakana-iroha", "lower-alpha", "lower-greek", "lower-latin", "lower-roman", NO, "square", "upper-alpha", "upper-latin", "upper-roman"],
  "margin": [AU, CA, INH],
  "margin-bottom": [AU, CA, INH],
  "margin-left": [AU, CA, INH],
  "margin-right": [AU, CA, INH],
  "margin-top": [AU, CA, INH],
  "marker": [INH, NO],
  "marker-end": [INH, NO],
  "marker-mid": [INH, NO],
  "marker-offset": [AU, CA, INH],
  "marker-start": [INH, NO],
  "marks": ["crop", "cross", INH, NO],
  "mask": [INH, NO],
  "mask-type": ["alpha", INH, "luminance"],
  "max-height": [CA, INH, NO],
  "max-width": [CA, INH, NO],
  "min-height": [CA, INH],
  "min-width": [CA, INH],
  "opacity": [INH],
  "order": [INH],
  "orphans": [INH],
  "outline": ["aliceblue", "antiquewhite", "aqua", "aquamarine", AU, "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", CA, "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "dashed", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "dotted", "double", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "groove", "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "inset", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "medium", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", NO, "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "outset", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "rgb", "rgba", "ridge", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "solid", "springgreen", "steelblue", "tan", "teal", "thick", "thin", "thistle", "tomato", "transparent", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"],
  "outline-color": COLORS,
  "outline-offset": [CA, INH],
  "outline-style": [AU, "dashed", "dotted", "double", "groove", INH, "inset", NO, "outset", "ridge", "solid"],
  "outline-width": [CA, INH, "medium", "thick", "thin"],
  "overflow": [AU, HI, INH, "scroll", "visible"],
  "overflow-x": [AU, HI, INH, "scroll", "visible"],
  "overflow-y": [AU, HI, INH, "scroll", "visible"],
  "padding": [CA, INH],
  "padding-bottom": [CA, INH],
  "padding-left": [CA, INH],
  "padding-right": [CA, INH],
  "padding-top": [CA, INH],
  "page": [AU, INH],
  "page-break-after": ["always", AU, "avoid", INH, "left", "right"],
  "page-break-before": ["always", AU, "avoid", INH, "left", "right"],
  "page-break-inside": [AU, "avoid", INH],
  "paint-order": [INH],
  "perspective": [INH, NO],
  "perspective-origin": ["bottom", "center", INH, "left", "right", "top"],
  "pointer-events": ["all", AU, "fill", INH, NO, "painted", "stroke", "visible", "visiblefill", "visiblepainted", "visiblestroke"],
  "position": ["absolute", "fixed", INH, "relative", "static"],
  "quotes": [INH],
  "resize": ["both", "horizontal", INH, NO, "vertical"],
  "right": [AU, CA, INH],
  "shape-rendering": [AU, "crispedges", "geometricprecision", INH, "optimizespeed"],
  "size": [INH, "landscape", "portrait"],
  "stop-color": COLORS,
  "stop-opacity": [INH],
  "stroke": [INH],
  "stroke-dasharray": [INH],
  "stroke-dashoffset": [INH],
  "stroke-linecap": ["butt", INH, "round", "square"],
  "stroke-linejoin": ["bevel", INH, "miter", "round"],
  "stroke-miterlimit": [INH],
  "stroke-opacity": [INH],
  "stroke-width": [INH],
  "table-layout": [AU, "fixed", INH],
  "text-align": ["center", "end", INH, "justify", "left", "right", "start"],
  "text-anchor": ["end", INH, "middle", "start"],
  "text-decoration": ["aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blink", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "dashed", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "dotted", "double", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "line-through", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", NO, NO, "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "overline", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "rgb", "rgba", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "solid", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "transparent", "turquoise", "underline", "violet", "wavy", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"],
  "text-indent": [CA, INH],
  "text-overflow": ["clip", "ellipsis", INH],
  "text-rendering": [AU, "geometricprecision", INH, "optimizelegibility", "optimizespeed"],
  "text-shadow": [INH],
  "text-transform": ["capitalize", "full-width", INH, "lowercase", NO, "uppercase"],
  "top": [AU, CA, INH],
  "transform": ["block", "flex", INH, "inline", "inline-block", "inline-flex", "inline-table", "list-item", NO, "table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row", "table-row-group"],
  "transform-origin": ["bottom", "center", INH, "left", "right", "top"],
  "transform-style": ["flat", INH, "preserve-3d"],
  "transition": ["all", "cubic-bezier", "ease", "ease-in", "ease-in-out", "ease-out", INH, "linear", NO, "step-end", "step-start", "steps"],
  "transition-delay": [INH],
  "transition-duration": [INH],
  "transition-property": ["all", INH, NO],
  "transition-timing-function": ["cubic-bezier", "ease", "ease-in", "ease-in-out", "ease-out", INH, "linear", "step-end", "step-start", "steps"],
  "unicode-bidi": ["bidi-override", "embed", INH, "normal"],
  "vector-effect": [INH, "non-scaling-stroke", NO],
  "vertical-align": ["baseline", "bottom", CA, INH, "middle", "sub", "super", "text-bottom", "text-top", "top"],
  "visibility": ["collapse", HI, INH, "visible"],
  "white-space": [INH, "normal", "nowrap", "pre", "pre-line", "pre-wrap"],
  "widows": [INH],
  "width": [AU, CA, INH],
  "word-break": ["break-all", INH, "keep-all", "normal"],
  "word-spacing": [CA, INH, "normal"],
  "word-wrap": ["break-word", INH, "normal"],
  "z-index": [AU, INH]
};
}(completer));
(function(exports) {
//
// Instantiate an Aulx object for HTML autocompletion.
//
// Parameters:
//  - options: Object containing optional parameters:
//    * maxEntries: Maximum selectors suggestions to display
//
function HTML(options) {
  this.options = options || {};
  this.global = this.options.global;
  this.maxEntries = this.options.maxEntries;
}

//
// Get a list of completions we can have, based on the state of the editor.
//
// Use candidates for UI purposes, and completions when inserting the completion
// in the editor.
//
// Parameters:
//  - source: String of the source code.
//  - caret: Object containing two fields:
//    * line: the line number of the caret, starting with zero.
//    * ch: the column of the caret, starting with zero.
//
// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * prefix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
function htmlCompleter(source, caret) {
  var completion = new Completion();

  // Getting the context from the caret position.
  if (!this.resolveContext(source, caret)) {
    // We couldn't resolve the context, we won't be able to complete.
    return completion;
  }

  // If it is a property completion, we can do something about it.
  switch(this.state) {
    // TODO Use HTML_STATES
  }

  return completion;
}

HTML.prototype.complete = htmlCompleter;

function fireStaticAnalysis(source, caret) {
  // TODO: Should do something similar to the one in Aulx.JS
}

HTML.prototype.fireStaticAnalysis = fireStaticAnalysis;

// Get the context.
//
// Fetch data from the position of the caret in the source.
// The data is an object containing the following:
//  - completing: a number from the Completing enumeration.
//  - data: information about the context. Ideally, a list of strings.
//
// For example, `<html|` will return
// `{completing:0, data:["html"]}`.
//
// If we cannot get any contextual information, returns `null`.
//
// Parameters:
//  - source: a string of HTML code.
//  - caret: an objct {line: 0-indexed line, ch: 0-indexed column}.
function resolveContext(source, caret) {
  // TODO
  var tokens = HTML.tokenize(source, {loc:true});
  if (tokens[tokens.length - 1].loc.end.line < caret.line ||
     (tokens[tokens.length - 1].loc.end.line === caret.line &&
      tokens[tokens.length - 1].loc.end.column < caret.ch)) {
    // If the last token is not an EOF, we didn't tokenize it correctly.
    // This special case is handled in case we couldn't tokenize, but the last
    // token that *could be tokenized* was an identifier.
    return null;
  }

  // At this point, we know we were able to tokenize it.
  // Find the token just before the caret.
  // In order to do that, we use dichotomy.
  var lowIndex = 0;
  var highIndex = tokens.length - 1;
  var tokIndex = (tokens.length / 2) | 0;   // Truncating to an integer.
  var tokIndexPrevValue = tokIndex;
  var lastCall = false;
  var token;
  while (lowIndex <= highIndex) {
    token = tokens[tokIndex];
    // Note: esprima line numbers start with 1, while caret starts with 0.
    if (token.loc.start.line < caret.line) {
      lowIndex = tokIndex;
    } else if (token.loc.start.line > caret.line) {
      highIndex = tokIndex;
    } else if (token.loc.start.line === caret.line) {
      // Now, we need the correct column.
      var range = [
        token.loc.start.column,
        token.loc.end.column
      ];
      if (inRange(caret.ch, range)) {
        // We're done. We've found the token in which the cursor is.
        return this.resolveState(tokens, tokIndex, caret);
      } else if (caret.ch <= range[0]) {
        highIndex = tokIndex;
      } else if (range[1] < caret.ch) {
        lowIndex = tokIndex + 1;
      }
    }
    tokIndex = (highIndex + lowIndex) >>> 1;
    if (lastCall) { break; }
    if (tokIndex === tokIndexPrevValue) {
      tokIndex++;
      lastCall = true;
    } else { tokIndexPrevValue = tokIndex; }
  }
  return this.resolveState(tokens, tokIndex, caret);
};

HTML.prototype.resolveContext = resolveContext;

// Same as `(new aulx.HTML(options)).complete(source, caret)`.
function html(source, caret, options) {
  return (new HTML(options)).complete(source, caret);
}

exports.html = html;
exports.HTML = HTML;
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
  consume: function(n) {
    while (n > 0) { this.char(); n--; }
  },
  unconsume: function(n) {
    if (n == null) { n = 1; }
    // Warning: lines and columns are off. But unconsuming is an error.
    this.index -= n;
    this.col -= n;
  },
  error: function(cause) {
    this.errors.push((this.line + ":" + this.col) + ": " + cause);
  },
  startToken: function() {
    this.currentTokenStart = this.index;
    this.currentTokenStartLine = this.line;
    this.currentTokenStartCol = this.col;
  },
  emit: function(tok_type, data) {
    var tok_data = this.input.slice(this.currentTokenStart, this.index);
    var start = {line: this.currentTokenStartLine,
                 column: this.currentTokenStartCol};
    var end = {line: this.line,
               column: this.col};
    this.startToken();
    return makeToken(tok_type, data || tok_data, start, end);
  }
};


// Tokenizer.
//
// We are using the rules available for free at <http://www.whatwg.org/C>.


// Tokens.
var token = {
  eof: 0,       // End of file.
  char: 1,      // Character token.
  charRef: 2,   // Character reference &…; token.
  startTag: 3,  // Start tag <foo> token.
  commentTag: 4,// Comment tag <!-- … --> token.
};

function makeToken(type, data, start, end) {
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
  markupDeclarationOpenState: markupDeclarationOpenState,
  endTagOpenState: endTagOpenState,
  tagNameState: tagNameState,
  bogusCommentState: bogusCommentState,
};

// All state functions return the function of the next state function to be run.

// 12.2.4.1
function dataState(stream, tokens) {
  var ch = stream.char();
  console.log('stream index', stream.index);
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
  } else if (ch !== ch) {
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
    tokens.push(res);
    //tokens.push(stream.emit(token.char));
  } else {
    // Ghost token.
    tokens.push(makeToken(token.char, "&",
          {line: stream.line, column: stream.col},
          {line: stream.line, column: stream.col}));
  }
  return state.dataState;
}

// 12.2.4.8
function tagOpenState(stream, tokens) {
  var ch = stream.char();
  if (ch === 0x21) {
    // Exclamation mark (!)
    return state.markupDeclarationOpenState;
  } else if (ch === 0x2f) {
    // Solidus (/)
    return state.endTagOpenState;
  } else if (isUppercaseAscii(ch)) {
    return state.tagNameState;
  } else if (isLowercaseAscii(ch)) {
    return state.tagNameState;
  } else if (ch === 0x3f) {
    stream.error('Remove the ? at the start of the tag.');
    return state.bogusCommentState;
  } else {
    stream.error('Invalid start of tag.');
  }
}

// 12.2.4.45
function markupDeclarationOpenState(stream, tokens) {
  // TODO
}

// 12.2.4.9
function endTagOpenState(stream, tokens) {
  // TODO
}

// 12.2.4.10
function tagNameState(stream, tokens) {
  // TODO
}

// 12.2.4.44
function bogusCommentState(stream, tokens) {
  var ch = stream.char();
  while (ch !== 0x3e || ch !== ch) {
    // While not GREATER-THAN SIGN or EOF.
    ch = stream.char();
  }
  stream.emit(token.commentTag);
  return stream.dataState;
}

// 12.2.4.69
function consumeCharacterReference(stream, additionalAllowedCharacter) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20 || ch === 0x3c || ch === 0x26 || ch !== ch || ch === additionalAllowedCharacter) {
    // TAB LF FF SPACE LESS-THAN AMPERSAND EOF AdditionalAllowedCharacter
    return;
  } else if (ch === 0x23) {
    // NUMBER-SIGN
    stream.char();  // consume it.
    var numberSize = 0; // Number of digits in the number.
    var encodedNumber;  // What number is encoded.
    var nextch = stream.peek();
    if (nextch === 0x78 || nextch === 0x58) {
      // x X [ASCII hex digits]
      stream.char();    // consume it.
      var digit = stream.peek();
      if (!isHexDigit(digit)) {
        // The digit isn't a valid hex digit.
        stream.error('No digits after a &#x…; token.');
        stream.unconsume(2);    // Unconsume '#x'.
        return;
      } else {
        while (isHexDigit(stream.peek())) {
          stream.char();
          numberSize++;
        }
        // We have consumed all hex digits.
        var encodedNumberString = stream.input.slice(
            stream.index - numberSize, stream.index
            );
        number = parseInt(encodedNumberString, 16);
      }
    } else {
      // [ASCII digits]
      stream.char();    // consume it.
      var digit = stream.peek();
      if (!isDigit(digit)) {
        // The digit isn't a valid digit.
        stream.error('No digits after a &#…; token.');
        stream.unconsume();    // Unconsume '#'.
        return;
      } else {
        while (isDigit(stream.peek())) {
          stream.char();
          numberSize++;
        }
        // We have consumed all digits.
        var encodedNumberString = stream.input.slice(
            stream.index - numberSize, stream.index
            );
        number = parseInt(encodedNumberString, 10);
      }
    }
    // The next character must be a semicolon.
    if (stream.peek() === 0x3b) {
      // SEMICOLON
      stream.char();    // consume it.
      // Is the decoded number valid?
      for (var i = 0; i < consumeCharacterReferenceInvalidNumber.length; i++) {
        if (number === consumeCharacterReferenceInvalidNumber[i]) {
          // No.
          stream.error('Invalid &#…; token.');
          return makeToken(token.char,
              consumeCharacterReferenceReplaceInvalidNumber[i],
              {line: stream.line, column: stream.col},
              {line: stream.line, column: stream.col});
        }
      }
      // Other invalid possibilities!
      if (consumeCharacterReferenceFurtherInvalidNumber(number)) {
        return makeToken(token.char,
            '\ufffd',
            {line: stream.line, column: stream.col},
            {line: stream.line, column: stream.col});
      }
      // We have something valid. Good.
      return makeToken(token.char,
          String.fromCodePoint(number),
          {line: stream.line, column: stream.col},
          {line: stream.line, column: stream.col});
    } else {
      // Bah! Parse error.
      stream.error('No semicolon in an &…; token.');
      return;
    }
  } else {
    // Conventional &…; production.
    // The minimum token is '&gt', the maximum is
    // '&CounterClockwiseContourIntegral;'
    for (var i = 32; i >= 2; i--) {
      var potential = consumeCharacterReferenceTable[
        '&' + stream.input.slice(stream.index, stream.index + i)
      ];
      if (potential != null) {
        // We have a winner! eg, '&gt;' → potential = 'gt;'.
        if (potential[potential.length-1] !== ';') {
          // Slightly invalid production.
          if (/[a-zA-Z0-9]/.test(
                stream.input.slice(stream.index + i, stream.index + i + 1))) {
            return;
          } else if (stream.input
              .slice(stream.index + i, stream.index + i + 1) === '=') {
            stream.error('A &…; token without the ; has an = after it.');
            return;
          }
          stream.error('Missing a semicolon at the end of a &…; token.');
        }
        stream.consume(i - 1);
        return makeToken(token.char,
            potential,
            {line: stream.line, column: stream.col},
            {line: stream.line, column: stream.col});
      }
    }
    // Too bad, this is a mistake!
    stream.error('Unknown &…; production.');
    return;
  }
}

var consumeCharacterReferenceInvalidNumber = [
  0x0, 0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8e, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9e, 0x9f
];
var consumeCharacterReferenceReplaceInvalidNumber = [
  '\ufffd', '\u20ac', '\u201a', '\u0192', '\u201e', '\u2026', '\u2020', '\u2021', '\u02c6', '\u2030', '\u0160', '\u2039', '\u0152', '\u017d', '\u2018', '\u2019', '\u201c', '\u201d', '\u2022', '\u2013', '\u2014', '\u02dc', '\u2122', '\u0161', '\u203a', '\u0153', '\u017e', '\u0178'
];
function consumeCharacterReferenceFurtherInvalidNumber(num) {
  return ((num >= 0x1 && num <= 0x8) || (num >= 0xd && num <= 0x1f) || (num >= 0x7f && num <= 0x9f) || (num >= 0xfdd0 && num <= 0xfdef)
      || num === 0xb || num === 0xfffe || num === 0xffff || num === 0x1fffe || num === 0x1ffff || num === 0x2fffe || num === 0x2ffff || num === 0x3fffe || num === 0x3ffff || num === 0x4fffe || num === 0x4ffff || num === 0x5fffe || num === 0x5ffff || num === 0x6fffe || num === 0x6ffff || num === 0x7fffe || num === 0x7ffff || num === 0x8fffe || num === 0x8ffff || num === 0x9fffe || num === 0x9ffff || num === 0xafffe || num === 0xaffff || num === 0xbfffe || num === 0xbffff || num === 0xcfffe || num === 0xcffff || num === 0xdfffe || num === 0xdffff || num === 0xefffe || num === 0xeffff || num === 0xffffe || num === 0xfffff || num === 0x10fffe || num === 0x10ffff);
}
// <http://www.whatwg.org/specs/web-apps/current-work/multipage/entities.json>
var consumeCharacterReferenceTable = { "&Aacute;": { "codepoints": [193], "characters": "\u00C1" }, "&Aacute": { "codepoints": [193], "characters": "\u00C1" }, "&aacute;": { "codepoints": [225], "characters": "\u00E1" }, "&aacute": { "codepoints": [225], "characters": "\u00E1" }, "&Abreve;": { "codepoints": [258], "characters": "\u0102" }, "&abreve;": { "codepoints": [259], "characters": "\u0103" }, "&ac;": { "codepoints": [8766], "characters": "\u223E" }, "&acd;": { "codepoints": [8767], "characters": "\u223F" }, "&acE;": { "codepoints": [8766, 819], "characters": "\u223E\u0333" }, "&Acirc;": { "codepoints": [194], "characters": "\u00C2" }, "&Acirc": { "codepoints": [194], "characters": "\u00C2" }, "&acirc;": { "codepoints": [226], "characters": "\u00E2" }, "&acirc": { "codepoints": [226], "characters": "\u00E2" }, "&acute;": { "codepoints": [180], "characters": "\u00B4" }, "&acute": { "codepoints": [180], "characters": "\u00B4" }, "&Acy;": { "codepoints": [1040], "characters": "\u0410" }, "&acy;": { "codepoints": [1072], "characters": "\u0430" }, "&AElig;": { "codepoints": [198], "characters": "\u00C6" }, "&AElig": { "codepoints": [198], "characters": "\u00C6" }, "&aelig;": { "codepoints": [230], "characters": "\u00E6" }, "&aelig": { "codepoints": [230], "characters": "\u00E6" }, "&af;": { "codepoints": [8289], "characters": "\u2061" }, "&Afr;": { "codepoints": [120068], "characters": "\uD835\uDD04" }, "&afr;": { "codepoints": [120094], "characters": "\uD835\uDD1E" }, "&Agrave;": { "codepoints": [192], "characters": "\u00C0" }, "&Agrave": { "codepoints": [192], "characters": "\u00C0" }, "&agrave;": { "codepoints": [224], "characters": "\u00E0" }, "&agrave": { "codepoints": [224], "characters": "\u00E0" }, "&alefsym;": { "codepoints": [8501], "characters": "\u2135" }, "&aleph;": { "codepoints": [8501], "characters": "\u2135" }, "&Alpha;": { "codepoints": [913], "characters": "\u0391" }, "&alpha;": { "codepoints": [945], "characters": "\u03B1" }, "&Amacr;": { "codepoints": [256], "characters": "\u0100" }, "&amacr;": { "codepoints": [257], "characters": "\u0101" }, "&amalg;": { "codepoints": [10815], "characters": "\u2A3F" }, "&amp;": { "codepoints": [38], "characters": "\u0026" }, "&amp": { "codepoints": [38], "characters": "\u0026" }, "&AMP;": { "codepoints": [38], "characters": "\u0026" }, "&AMP": { "codepoints": [38], "characters": "\u0026" }, "&andand;": { "codepoints": [10837], "characters": "\u2A55" }, "&And;": { "codepoints": [10835], "characters": "\u2A53" }, "&and;": { "codepoints": [8743], "characters": "\u2227" }, "&andd;": { "codepoints": [10844], "characters": "\u2A5C" }, "&andslope;": { "codepoints": [10840], "characters": "\u2A58" }, "&andv;": { "codepoints": [10842], "characters": "\u2A5A" }, "&ang;": { "codepoints": [8736], "characters": "\u2220" }, "&ange;": { "codepoints": [10660], "characters": "\u29A4" }, "&angle;": { "codepoints": [8736], "characters": "\u2220" }, "&angmsdaa;": { "codepoints": [10664], "characters": "\u29A8" }, "&angmsdab;": { "codepoints": [10665], "characters": "\u29A9" }, "&angmsdac;": { "codepoints": [10666], "characters": "\u29AA" }, "&angmsdad;": { "codepoints": [10667], "characters": "\u29AB" }, "&angmsdae;": { "codepoints": [10668], "characters": "\u29AC" }, "&angmsdaf;": { "codepoints": [10669], "characters": "\u29AD" }, "&angmsdag;": { "codepoints": [10670], "characters": "\u29AE" }, "&angmsdah;": { "codepoints": [10671], "characters": "\u29AF" }, "&angmsd;": { "codepoints": [8737], "characters": "\u2221" }, "&angrt;": { "codepoints": [8735], "characters": "\u221F" }, "&angrtvb;": { "codepoints": [8894], "characters": "\u22BE" }, "&angrtvbd;": { "codepoints": [10653], "characters": "\u299D" }, "&angsph;": { "codepoints": [8738], "characters": "\u2222" }, "&angst;": { "codepoints": [197], "characters": "\u00C5" }, "&angzarr;": { "codepoints": [9084], "characters": "\u237C" }, "&Aogon;": { "codepoints": [260], "characters": "\u0104" }, "&aogon;": { "codepoints": [261], "characters": "\u0105" }, "&Aopf;": { "codepoints": [120120], "characters": "\uD835\uDD38" }, "&aopf;": { "codepoints": [120146], "characters": "\uD835\uDD52" }, "&apacir;": { "codepoints": [10863], "characters": "\u2A6F" }, "&ap;": { "codepoints": [8776], "characters": "\u2248" }, "&apE;": { "codepoints": [10864], "characters": "\u2A70" }, "&ape;": { "codepoints": [8778], "characters": "\u224A" }, "&apid;": { "codepoints": [8779], "characters": "\u224B" }, "&apos;": { "codepoints": [39], "characters": "\u0027" }, "&ApplyFunction;": { "codepoints": [8289], "characters": "\u2061" }, "&approx;": { "codepoints": [8776], "characters": "\u2248" }, "&approxeq;": { "codepoints": [8778], "characters": "\u224A" }, "&Aring;": { "codepoints": [197], "characters": "\u00C5" }, "&Aring": { "codepoints": [197], "characters": "\u00C5" }, "&aring;": { "codepoints": [229], "characters": "\u00E5" }, "&aring": { "codepoints": [229], "characters": "\u00E5" }, "&Ascr;": { "codepoints": [119964], "characters": "\uD835\uDC9C" }, "&ascr;": { "codepoints": [119990], "characters": "\uD835\uDCB6" }, "&Assign;": { "codepoints": [8788], "characters": "\u2254" }, "&ast;": { "codepoints": [42], "characters": "\u002A" }, "&asymp;": { "codepoints": [8776], "characters": "\u2248" }, "&asympeq;": { "codepoints": [8781], "characters": "\u224D" }, "&Atilde;": { "codepoints": [195], "characters": "\u00C3" }, "&Atilde": { "codepoints": [195], "characters": "\u00C3" }, "&atilde;": { "codepoints": [227], "characters": "\u00E3" }, "&atilde": { "codepoints": [227], "characters": "\u00E3" }, "&Auml;": { "codepoints": [196], "characters": "\u00C4" }, "&Auml": { "codepoints": [196], "characters": "\u00C4" }, "&auml;": { "codepoints": [228], "characters": "\u00E4" }, "&auml": { "codepoints": [228], "characters": "\u00E4" }, "&awconint;": { "codepoints": [8755], "characters": "\u2233" }, "&awint;": { "codepoints": [10769], "characters": "\u2A11" }, "&backcong;": { "codepoints": [8780], "characters": "\u224C" }, "&backepsilon;": { "codepoints": [1014], "characters": "\u03F6" }, "&backprime;": { "codepoints": [8245], "characters": "\u2035" }, "&backsim;": { "codepoints": [8765], "characters": "\u223D" }, "&backsimeq;": { "codepoints": [8909], "characters": "\u22CD" }, "&Backslash;": { "codepoints": [8726], "characters": "\u2216" }, "&Barv;": { "codepoints": [10983], "characters": "\u2AE7" }, "&barvee;": { "codepoints": [8893], "characters": "\u22BD" }, "&barwed;": { "codepoints": [8965], "characters": "\u2305" }, "&Barwed;": { "codepoints": [8966], "characters": "\u2306" }, "&barwedge;": { "codepoints": [8965], "characters": "\u2305" }, "&bbrk;": { "codepoints": [9141], "characters": "\u23B5" }, "&bbrktbrk;": { "codepoints": [9142], "characters": "\u23B6" }, "&bcong;": { "codepoints": [8780], "characters": "\u224C" }, "&Bcy;": { "codepoints": [1041], "characters": "\u0411" }, "&bcy;": { "codepoints": [1073], "characters": "\u0431" }, "&bdquo;": { "codepoints": [8222], "characters": "\u201E" }, "&becaus;": { "codepoints": [8757], "characters": "\u2235" }, "&because;": { "codepoints": [8757], "characters": "\u2235" }, "&Because;": { "codepoints": [8757], "characters": "\u2235" }, "&bemptyv;": { "codepoints": [10672], "characters": "\u29B0" }, "&bepsi;": { "codepoints": [1014], "characters": "\u03F6" }, "&bernou;": { "codepoints": [8492], "characters": "\u212C" }, "&Bernoullis;": { "codepoints": [8492], "characters": "\u212C" }, "&Beta;": { "codepoints": [914], "characters": "\u0392" }, "&beta;": { "codepoints": [946], "characters": "\u03B2" }, "&beth;": { "codepoints": [8502], "characters": "\u2136" }, "&between;": { "codepoints": [8812], "characters": "\u226C" }, "&Bfr;": { "codepoints": [120069], "characters": "\uD835\uDD05" }, "&bfr;": { "codepoints": [120095], "characters": "\uD835\uDD1F" }, "&bigcap;": { "codepoints": [8898], "characters": "\u22C2" }, "&bigcirc;": { "codepoints": [9711], "characters": "\u25EF" }, "&bigcup;": { "codepoints": [8899], "characters": "\u22C3" }, "&bigodot;": { "codepoints": [10752], "characters": "\u2A00" }, "&bigoplus;": { "codepoints": [10753], "characters": "\u2A01" }, "&bigotimes;": { "codepoints": [10754], "characters": "\u2A02" }, "&bigsqcup;": { "codepoints": [10758], "characters": "\u2A06" }, "&bigstar;": { "codepoints": [9733], "characters": "\u2605" }, "&bigtriangledown;": { "codepoints": [9661], "characters": "\u25BD" }, "&bigtriangleup;": { "codepoints": [9651], "characters": "\u25B3" }, "&biguplus;": { "codepoints": [10756], "characters": "\u2A04" }, "&bigvee;": { "codepoints": [8897], "characters": "\u22C1" }, "&bigwedge;": { "codepoints": [8896], "characters": "\u22C0" }, "&bkarow;": { "codepoints": [10509], "characters": "\u290D" }, "&blacklozenge;": { "codepoints": [10731], "characters": "\u29EB" }, "&blacksquare;": { "codepoints": [9642], "characters": "\u25AA" }, "&blacktriangle;": { "codepoints": [9652], "characters": "\u25B4" }, "&blacktriangledown;": { "codepoints": [9662], "characters": "\u25BE" }, "&blacktriangleleft;": { "codepoints": [9666], "characters": "\u25C2" }, "&blacktriangleright;": { "codepoints": [9656], "characters": "\u25B8" }, "&blank;": { "codepoints": [9251], "characters": "\u2423" }, "&blk12;": { "codepoints": [9618], "characters": "\u2592" }, "&blk14;": { "codepoints": [9617], "characters": "\u2591" }, "&blk34;": { "codepoints": [9619], "characters": "\u2593" }, "&block;": { "codepoints": [9608], "characters": "\u2588" }, "&bne;": { "codepoints": [61, 8421], "characters": "\u003D\u20E5" }, "&bnequiv;": { "codepoints": [8801, 8421], "characters": "\u2261\u20E5" }, "&bNot;": { "codepoints": [10989], "characters": "\u2AED" }, "&bnot;": { "codepoints": [8976], "characters": "\u2310" }, "&Bopf;": { "codepoints": [120121], "characters": "\uD835\uDD39" }, "&bopf;": { "codepoints": [120147], "characters": "\uD835\uDD53" }, "&bot;": { "codepoints": [8869], "characters": "\u22A5" }, "&bottom;": { "codepoints": [8869], "characters": "\u22A5" }, "&bowtie;": { "codepoints": [8904], "characters": "\u22C8" }, "&boxbox;": { "codepoints": [10697], "characters": "\u29C9" }, "&boxdl;": { "codepoints": [9488], "characters": "\u2510" }, "&boxdL;": { "codepoints": [9557], "characters": "\u2555" }, "&boxDl;": { "codepoints": [9558], "characters": "\u2556" }, "&boxDL;": { "codepoints": [9559], "characters": "\u2557" }, "&boxdr;": { "codepoints": [9484], "characters": "\u250C" }, "&boxdR;": { "codepoints": [9554], "characters": "\u2552" }, "&boxDr;": { "codepoints": [9555], "characters": "\u2553" }, "&boxDR;": { "codepoints": [9556], "characters": "\u2554" }, "&boxh;": { "codepoints": [9472], "characters": "\u2500" }, "&boxH;": { "codepoints": [9552], "characters": "\u2550" }, "&boxhd;": { "codepoints": [9516], "characters": "\u252C" }, "&boxHd;": { "codepoints": [9572], "characters": "\u2564" }, "&boxhD;": { "codepoints": [9573], "characters": "\u2565" }, "&boxHD;": { "codepoints": [9574], "characters": "\u2566" }, "&boxhu;": { "codepoints": [9524], "characters": "\u2534" }, "&boxHu;": { "codepoints": [9575], "characters": "\u2567" }, "&boxhU;": { "codepoints": [9576], "characters": "\u2568" }, "&boxHU;": { "codepoints": [9577], "characters": "\u2569" }, "&boxminus;": { "codepoints": [8863], "characters": "\u229F" }, "&boxplus;": { "codepoints": [8862], "characters": "\u229E" }, "&boxtimes;": { "codepoints": [8864], "characters": "\u22A0" }, "&boxul;": { "codepoints": [9496], "characters": "\u2518" }, "&boxuL;": { "codepoints": [9563], "characters": "\u255B" }, "&boxUl;": { "codepoints": [9564], "characters": "\u255C" }, "&boxUL;": { "codepoints": [9565], "characters": "\u255D" }, "&boxur;": { "codepoints": [9492], "characters": "\u2514" }, "&boxuR;": { "codepoints": [9560], "characters": "\u2558" }, "&boxUr;": { "codepoints": [9561], "characters": "\u2559" }, "&boxUR;": { "codepoints": [9562], "characters": "\u255A" }, "&boxv;": { "codepoints": [9474], "characters": "\u2502" }, "&boxV;": { "codepoints": [9553], "characters": "\u2551" }, "&boxvh;": { "codepoints": [9532], "characters": "\u253C" }, "&boxvH;": { "codepoints": [9578], "characters": "\u256A" }, "&boxVh;": { "codepoints": [9579], "characters": "\u256B" }, "&boxVH;": { "codepoints": [9580], "characters": "\u256C" }, "&boxvl;": { "codepoints": [9508], "characters": "\u2524" }, "&boxvL;": { "codepoints": [9569], "characters": "\u2561" }, "&boxVl;": { "codepoints": [9570], "characters": "\u2562" }, "&boxVL;": { "codepoints": [9571], "characters": "\u2563" }, "&boxvr;": { "codepoints": [9500], "characters": "\u251C" }, "&boxvR;": { "codepoints": [9566], "characters": "\u255E" }, "&boxVr;": { "codepoints": [9567], "characters": "\u255F" }, "&boxVR;": { "codepoints": [9568], "characters": "\u2560" }, "&bprime;": { "codepoints": [8245], "characters": "\u2035" }, "&breve;": { "codepoints": [728], "characters": "\u02D8" }, "&Breve;": { "codepoints": [728], "characters": "\u02D8" }, "&brvbar;": { "codepoints": [166], "characters": "\u00A6" }, "&brvbar": { "codepoints": [166], "characters": "\u00A6" }, "&bscr;": { "codepoints": [119991], "characters": "\uD835\uDCB7" }, "&Bscr;": { "codepoints": [8492], "characters": "\u212C" }, "&bsemi;": { "codepoints": [8271], "characters": "\u204F" }, "&bsim;": { "codepoints": [8765], "characters": "\u223D" }, "&bsime;": { "codepoints": [8909], "characters": "\u22CD" }, "&bsolb;": { "codepoints": [10693], "characters": "\u29C5" }, "&bsol;": { "codepoints": [92], "characters": "\u005C" }, "&bsolhsub;": { "codepoints": [10184], "characters": "\u27C8" }, "&bull;": { "codepoints": [8226], "characters": "\u2022" }, "&bullet;": { "codepoints": [8226], "characters": "\u2022" }, "&bump;": { "codepoints": [8782], "characters": "\u224E" }, "&bumpE;": { "codepoints": [10926], "characters": "\u2AAE" }, "&bumpe;": { "codepoints": [8783], "characters": "\u224F" }, "&Bumpeq;": { "codepoints": [8782], "characters": "\u224E" }, "&bumpeq;": { "codepoints": [8783], "characters": "\u224F" }, "&Cacute;": { "codepoints": [262], "characters": "\u0106" }, "&cacute;": { "codepoints": [263], "characters": "\u0107" }, "&capand;": { "codepoints": [10820], "characters": "\u2A44" }, "&capbrcup;": { "codepoints": [10825], "characters": "\u2A49" }, "&capcap;": { "codepoints": [10827], "characters": "\u2A4B" }, "&cap;": { "codepoints": [8745], "characters": "\u2229" }, "&Cap;": { "codepoints": [8914], "characters": "\u22D2" }, "&capcup;": { "codepoints": [10823], "characters": "\u2A47" }, "&capdot;": { "codepoints": [10816], "characters": "\u2A40" }, "&CapitalDifferentialD;": { "codepoints": [8517], "characters": "\u2145" }, "&caps;": { "codepoints": [8745, 65024], "characters": "\u2229\uFE00" }, "&caret;": { "codepoints": [8257], "characters": "\u2041" }, "&caron;": { "codepoints": [711], "characters": "\u02C7" }, "&Cayleys;": { "codepoints": [8493], "characters": "\u212D" }, "&ccaps;": { "codepoints": [10829], "characters": "\u2A4D" }, "&Ccaron;": { "codepoints": [268], "characters": "\u010C" }, "&ccaron;": { "codepoints": [269], "characters": "\u010D" }, "&Ccedil;": { "codepoints": [199], "characters": "\u00C7" }, "&Ccedil": { "codepoints": [199], "characters": "\u00C7" }, "&ccedil;": { "codepoints": [231], "characters": "\u00E7" }, "&ccedil": { "codepoints": [231], "characters": "\u00E7" }, "&Ccirc;": { "codepoints": [264], "characters": "\u0108" }, "&ccirc;": { "codepoints": [265], "characters": "\u0109" }, "&Cconint;": { "codepoints": [8752], "characters": "\u2230" }, "&ccups;": { "codepoints": [10828], "characters": "\u2A4C" }, "&ccupssm;": { "codepoints": [10832], "characters": "\u2A50" }, "&Cdot;": { "codepoints": [266], "characters": "\u010A" }, "&cdot;": { "codepoints": [267], "characters": "\u010B" }, "&cedil;": { "codepoints": [184], "characters": "\u00B8" }, "&cedil": { "codepoints": [184], "characters": "\u00B8" }, "&Cedilla;": { "codepoints": [184], "characters": "\u00B8" }, "&cemptyv;": { "codepoints": [10674], "characters": "\u29B2" }, "&cent;": { "codepoints": [162], "characters": "\u00A2" }, "&cent": { "codepoints": [162], "characters": "\u00A2" }, "&centerdot;": { "codepoints": [183], "characters": "\u00B7" }, "&CenterDot;": { "codepoints": [183], "characters": "\u00B7" }, "&cfr;": { "codepoints": [120096], "characters": "\uD835\uDD20" }, "&Cfr;": { "codepoints": [8493], "characters": "\u212D" }, "&CHcy;": { "codepoints": [1063], "characters": "\u0427" }, "&chcy;": { "codepoints": [1095], "characters": "\u0447" }, "&check;": { "codepoints": [10003], "characters": "\u2713" }, "&checkmark;": { "codepoints": [10003], "characters": "\u2713" }, "&Chi;": { "codepoints": [935], "characters": "\u03A7" }, "&chi;": { "codepoints": [967], "characters": "\u03C7" }, "&circ;": { "codepoints": [710], "characters": "\u02C6" }, "&circeq;": { "codepoints": [8791], "characters": "\u2257" }, "&circlearrowleft;": { "codepoints": [8634], "characters": "\u21BA" }, "&circlearrowright;": { "codepoints": [8635], "characters": "\u21BB" }, "&circledast;": { "codepoints": [8859], "characters": "\u229B" }, "&circledcirc;": { "codepoints": [8858], "characters": "\u229A" }, "&circleddash;": { "codepoints": [8861], "characters": "\u229D" }, "&CircleDot;": { "codepoints": [8857], "characters": "\u2299" }, "&circledR;": { "codepoints": [174], "characters": "\u00AE" }, "&circledS;": { "codepoints": [9416], "characters": "\u24C8" }, "&CircleMinus;": { "codepoints": [8854], "characters": "\u2296" }, "&CirclePlus;": { "codepoints": [8853], "characters": "\u2295" }, "&CircleTimes;": { "codepoints": [8855], "characters": "\u2297" }, "&cir;": { "codepoints": [9675], "characters": "\u25CB" }, "&cirE;": { "codepoints": [10691], "characters": "\u29C3" }, "&cire;": { "codepoints": [8791], "characters": "\u2257" }, "&cirfnint;": { "codepoints": [10768], "characters": "\u2A10" }, "&cirmid;": { "codepoints": [10991], "characters": "\u2AEF" }, "&cirscir;": { "codepoints": [10690], "characters": "\u29C2" }, "&ClockwiseContourIntegral;": { "codepoints": [8754], "characters": "\u2232" }, "&CloseCurlyDoubleQuote;": { "codepoints": [8221], "characters": "\u201D" }, "&CloseCurlyQuote;": { "codepoints": [8217], "characters": "\u2019" }, "&clubs;": { "codepoints": [9827], "characters": "\u2663" }, "&clubsuit;": { "codepoints": [9827], "characters": "\u2663" }, "&colon;": { "codepoints": [58], "characters": "\u003A" }, "&Colon;": { "codepoints": [8759], "characters": "\u2237" }, "&Colone;": { "codepoints": [10868], "characters": "\u2A74" }, "&colone;": { "codepoints": [8788], "characters": "\u2254" }, "&coloneq;": { "codepoints": [8788], "characters": "\u2254" }, "&comma;": { "codepoints": [44], "characters": "\u002C" }, "&commat;": { "codepoints": [64], "characters": "\u0040" }, "&comp;": { "codepoints": [8705], "characters": "\u2201" }, "&compfn;": { "codepoints": [8728], "characters": "\u2218" }, "&complement;": { "codepoints": [8705], "characters": "\u2201" }, "&complexes;": { "codepoints": [8450], "characters": "\u2102" }, "&cong;": { "codepoints": [8773], "characters": "\u2245" }, "&congdot;": { "codepoints": [10861], "characters": "\u2A6D" }, "&Congruent;": { "codepoints": [8801], "characters": "\u2261" }, "&conint;": { "codepoints": [8750], "characters": "\u222E" }, "&Conint;": { "codepoints": [8751], "characters": "\u222F" }, "&ContourIntegral;": { "codepoints": [8750], "characters": "\u222E" }, "&copf;": { "codepoints": [120148], "characters": "\uD835\uDD54" }, "&Copf;": { "codepoints": [8450], "characters": "\u2102" }, "&coprod;": { "codepoints": [8720], "characters": "\u2210" }, "&Coproduct;": { "codepoints": [8720], "characters": "\u2210" }, "&copy;": { "codepoints": [169], "characters": "\u00A9" }, "&copy": { "codepoints": [169], "characters": "\u00A9" }, "&COPY;": { "codepoints": [169], "characters": "\u00A9" }, "&COPY": { "codepoints": [169], "characters": "\u00A9" }, "&copysr;": { "codepoints": [8471], "characters": "\u2117" }, "&CounterClockwiseContourIntegral;": { "codepoints": [8755], "characters": "\u2233" }, "&crarr;": { "codepoints": [8629], "characters": "\u21B5" }, "&cross;": { "codepoints": [10007], "characters": "\u2717" }, "&Cross;": { "codepoints": [10799], "characters": "\u2A2F" }, "&Cscr;": { "codepoints": [119966], "characters": "\uD835\uDC9E" }, "&cscr;": { "codepoints": [119992], "characters": "\uD835\uDCB8" }, "&csub;": { "codepoints": [10959], "characters": "\u2ACF" }, "&csube;": { "codepoints": [10961], "characters": "\u2AD1" }, "&csup;": { "codepoints": [10960], "characters": "\u2AD0" }, "&csupe;": { "codepoints": [10962], "characters": "\u2AD2" }, "&ctdot;": { "codepoints": [8943], "characters": "\u22EF" }, "&cudarrl;": { "codepoints": [10552], "characters": "\u2938" }, "&cudarrr;": { "codepoints": [10549], "characters": "\u2935" }, "&cuepr;": { "codepoints": [8926], "characters": "\u22DE" }, "&cuesc;": { "codepoints": [8927], "characters": "\u22DF" }, "&cularr;": { "codepoints": [8630], "characters": "\u21B6" }, "&cularrp;": { "codepoints": [10557], "characters": "\u293D" }, "&cupbrcap;": { "codepoints": [10824], "characters": "\u2A48" }, "&cupcap;": { "codepoints": [10822], "characters": "\u2A46" }, "&CupCap;": { "codepoints": [8781], "characters": "\u224D" }, "&cup;": { "codepoints": [8746], "characters": "\u222A" }, "&Cup;": { "codepoints": [8915], "characters": "\u22D3" }, "&cupcup;": { "codepoints": [10826], "characters": "\u2A4A" }, "&cupdot;": { "codepoints": [8845], "characters": "\u228D" }, "&cupor;": { "codepoints": [10821], "characters": "\u2A45" }, "&cups;": { "codepoints": [8746, 65024], "characters": "\u222A\uFE00" }, "&curarr;": { "codepoints": [8631], "characters": "\u21B7" }, "&curarrm;": { "codepoints": [10556], "characters": "\u293C" }, "&curlyeqprec;": { "codepoints": [8926], "characters": "\u22DE" }, "&curlyeqsucc;": { "codepoints": [8927], "characters": "\u22DF" }, "&curlyvee;": { "codepoints": [8910], "characters": "\u22CE" }, "&curlywedge;": { "codepoints": [8911], "characters": "\u22CF" }, "&curren;": { "codepoints": [164], "characters": "\u00A4" }, "&curren": { "codepoints": [164], "characters": "\u00A4" }, "&curvearrowleft;": { "codepoints": [8630], "characters": "\u21B6" }, "&curvearrowright;": { "codepoints": [8631], "characters": "\u21B7" }, "&cuvee;": { "codepoints": [8910], "characters": "\u22CE" }, "&cuwed;": { "codepoints": [8911], "characters": "\u22CF" }, "&cwconint;": { "codepoints": [8754], "characters": "\u2232" }, "&cwint;": { "codepoints": [8753], "characters": "\u2231" }, "&cylcty;": { "codepoints": [9005], "characters": "\u232D" }, "&dagger;": { "codepoints": [8224], "characters": "\u2020" }, "&Dagger;": { "codepoints": [8225], "characters": "\u2021" }, "&daleth;": { "codepoints": [8504], "characters": "\u2138" }, "&darr;": { "codepoints": [8595], "characters": "\u2193" }, "&Darr;": { "codepoints": [8609], "characters": "\u21A1" }, "&dArr;": { "codepoints": [8659], "characters": "\u21D3" }, "&dash;": { "codepoints": [8208], "characters": "\u2010" }, "&Dashv;": { "codepoints": [10980], "characters": "\u2AE4" }, "&dashv;": { "codepoints": [8867], "characters": "\u22A3" }, "&dbkarow;": { "codepoints": [10511], "characters": "\u290F" }, "&dblac;": { "codepoints": [733], "characters": "\u02DD" }, "&Dcaron;": { "codepoints": [270], "characters": "\u010E" }, "&dcaron;": { "codepoints": [271], "characters": "\u010F" }, "&Dcy;": { "codepoints": [1044], "characters": "\u0414" }, "&dcy;": { "codepoints": [1076], "characters": "\u0434" }, "&ddagger;": { "codepoints": [8225], "characters": "\u2021" }, "&ddarr;": { "codepoints": [8650], "characters": "\u21CA" }, "&DD;": { "codepoints": [8517], "characters": "\u2145" }, "&dd;": { "codepoints": [8518], "characters": "\u2146" }, "&DDotrahd;": { "codepoints": [10513], "characters": "\u2911" }, "&ddotseq;": { "codepoints": [10871], "characters": "\u2A77" }, "&deg;": { "codepoints": [176], "characters": "\u00B0" }, "&deg": { "codepoints": [176], "characters": "\u00B0" }, "&Del;": { "codepoints": [8711], "characters": "\u2207" }, "&Delta;": { "codepoints": [916], "characters": "\u0394" }, "&delta;": { "codepoints": [948], "characters": "\u03B4" }, "&demptyv;": { "codepoints": [10673], "characters": "\u29B1" }, "&dfisht;": { "codepoints": [10623], "characters": "\u297F" }, "&Dfr;": { "codepoints": [120071], "characters": "\uD835\uDD07" }, "&dfr;": { "codepoints": [120097], "characters": "\uD835\uDD21" }, "&dHar;": { "codepoints": [10597], "characters": "\u2965" }, "&dharl;": { "codepoints": [8643], "characters": "\u21C3" }, "&dharr;": { "codepoints": [8642], "characters": "\u21C2" }, "&DiacriticalAcute;": { "codepoints": [180], "characters": "\u00B4" }, "&DiacriticalDot;": { "codepoints": [729], "characters": "\u02D9" }, "&DiacriticalDoubleAcute;": { "codepoints": [733], "characters": "\u02DD" }, "&DiacriticalGrave;": { "codepoints": [96], "characters": "\u0060" }, "&DiacriticalTilde;": { "codepoints": [732], "characters": "\u02DC" }, "&diam;": { "codepoints": [8900], "characters": "\u22C4" }, "&diamond;": { "codepoints": [8900], "characters": "\u22C4" }, "&Diamond;": { "codepoints": [8900], "characters": "\u22C4" }, "&diamondsuit;": { "codepoints": [9830], "characters": "\u2666" }, "&diams;": { "codepoints": [9830], "characters": "\u2666" }, "&die;": { "codepoints": [168], "characters": "\u00A8" }, "&DifferentialD;": { "codepoints": [8518], "characters": "\u2146" }, "&digamma;": { "codepoints": [989], "characters": "\u03DD" }, "&disin;": { "codepoints": [8946], "characters": "\u22F2" }, "&div;": { "codepoints": [247], "characters": "\u00F7" }, "&divide;": { "codepoints": [247], "characters": "\u00F7" }, "&divide": { "codepoints": [247], "characters": "\u00F7" }, "&divideontimes;": { "codepoints": [8903], "characters": "\u22C7" }, "&divonx;": { "codepoints": [8903], "characters": "\u22C7" }, "&DJcy;": { "codepoints": [1026], "characters": "\u0402" }, "&djcy;": { "codepoints": [1106], "characters": "\u0452" }, "&dlcorn;": { "codepoints": [8990], "characters": "\u231E" }, "&dlcrop;": { "codepoints": [8973], "characters": "\u230D" }, "&dollar;": { "codepoints": [36], "characters": "\u0024" }, "&Dopf;": { "codepoints": [120123], "characters": "\uD835\uDD3B" }, "&dopf;": { "codepoints": [120149], "characters": "\uD835\uDD55" }, "&Dot;": { "codepoints": [168], "characters": "\u00A8" }, "&dot;": { "codepoints": [729], "characters": "\u02D9" }, "&DotDot;": { "codepoints": [8412], "characters": "\u20DC" }, "&doteq;": { "codepoints": [8784], "characters": "\u2250" }, "&doteqdot;": { "codepoints": [8785], "characters": "\u2251" }, "&DotEqual;": { "codepoints": [8784], "characters": "\u2250" }, "&dotminus;": { "codepoints": [8760], "characters": "\u2238" }, "&dotplus;": { "codepoints": [8724], "characters": "\u2214" }, "&dotsquare;": { "codepoints": [8865], "characters": "\u22A1" }, "&doublebarwedge;": { "codepoints": [8966], "characters": "\u2306" }, "&DoubleContourIntegral;": { "codepoints": [8751], "characters": "\u222F" }, "&DoubleDot;": { "codepoints": [168], "characters": "\u00A8" }, "&DoubleDownArrow;": { "codepoints": [8659], "characters": "\u21D3" }, "&DoubleLeftArrow;": { "codepoints": [8656], "characters": "\u21D0" }, "&DoubleLeftRightArrow;": { "codepoints": [8660], "characters": "\u21D4" }, "&DoubleLeftTee;": { "codepoints": [10980], "characters": "\u2AE4" }, "&DoubleLongLeftArrow;": { "codepoints": [10232], "characters": "\u27F8" }, "&DoubleLongLeftRightArrow;": { "codepoints": [10234], "characters": "\u27FA" }, "&DoubleLongRightArrow;": { "codepoints": [10233], "characters": "\u27F9" }, "&DoubleRightArrow;": { "codepoints": [8658], "characters": "\u21D2" }, "&DoubleRightTee;": { "codepoints": [8872], "characters": "\u22A8" }, "&DoubleUpArrow;": { "codepoints": [8657], "characters": "\u21D1" }, "&DoubleUpDownArrow;": { "codepoints": [8661], "characters": "\u21D5" }, "&DoubleVerticalBar;": { "codepoints": [8741], "characters": "\u2225" }, "&DownArrowBar;": { "codepoints": [10515], "characters": "\u2913" }, "&downarrow;": { "codepoints": [8595], "characters": "\u2193" }, "&DownArrow;": { "codepoints": [8595], "characters": "\u2193" }, "&Downarrow;": { "codepoints": [8659], "characters": "\u21D3" }, "&DownArrowUpArrow;": { "codepoints": [8693], "characters": "\u21F5" }, "&DownBreve;": { "codepoints": [785], "characters": "\u0311" }, "&downdownarrows;": { "codepoints": [8650], "characters": "\u21CA" }, "&downharpoonleft;": { "codepoints": [8643], "characters": "\u21C3" }, "&downharpoonright;": { "codepoints": [8642], "characters": "\u21C2" }, "&DownLeftRightVector;": { "codepoints": [10576], "characters": "\u2950" }, "&DownLeftTeeVector;": { "codepoints": [10590], "characters": "\u295E" }, "&DownLeftVectorBar;": { "codepoints": [10582], "characters": "\u2956" }, "&DownLeftVector;": { "codepoints": [8637], "characters": "\u21BD" }, "&DownRightTeeVector;": { "codepoints": [10591], "characters": "\u295F" }, "&DownRightVectorBar;": { "codepoints": [10583], "characters": "\u2957" }, "&DownRightVector;": { "codepoints": [8641], "characters": "\u21C1" }, "&DownTeeArrow;": { "codepoints": [8615], "characters": "\u21A7" }, "&DownTee;": { "codepoints": [8868], "characters": "\u22A4" }, "&drbkarow;": { "codepoints": [10512], "characters": "\u2910" }, "&drcorn;": { "codepoints": [8991], "characters": "\u231F" }, "&drcrop;": { "codepoints": [8972], "characters": "\u230C" }, "&Dscr;": { "codepoints": [119967], "characters": "\uD835\uDC9F" }, "&dscr;": { "codepoints": [119993], "characters": "\uD835\uDCB9" }, "&DScy;": { "codepoints": [1029], "characters": "\u0405" }, "&dscy;": { "codepoints": [1109], "characters": "\u0455" }, "&dsol;": { "codepoints": [10742], "characters": "\u29F6" }, "&Dstrok;": { "codepoints": [272], "characters": "\u0110" }, "&dstrok;": { "codepoints": [273], "characters": "\u0111" }, "&dtdot;": { "codepoints": [8945], "characters": "\u22F1" }, "&dtri;": { "codepoints": [9663], "characters": "\u25BF" }, "&dtrif;": { "codepoints": [9662], "characters": "\u25BE" }, "&duarr;": { "codepoints": [8693], "characters": "\u21F5" }, "&duhar;": { "codepoints": [10607], "characters": "\u296F" }, "&dwangle;": { "codepoints": [10662], "characters": "\u29A6" }, "&DZcy;": { "codepoints": [1039], "characters": "\u040F" }, "&dzcy;": { "codepoints": [1119], "characters": "\u045F" }, "&dzigrarr;": { "codepoints": [10239], "characters": "\u27FF" }, "&Eacute;": { "codepoints": [201], "characters": "\u00C9" }, "&Eacute": { "codepoints": [201], "characters": "\u00C9" }, "&eacute;": { "codepoints": [233], "characters": "\u00E9" }, "&eacute": { "codepoints": [233], "characters": "\u00E9" }, "&easter;": { "codepoints": [10862], "characters": "\u2A6E" }, "&Ecaron;": { "codepoints": [282], "characters": "\u011A" }, "&ecaron;": { "codepoints": [283], "characters": "\u011B" }, "&Ecirc;": { "codepoints": [202], "characters": "\u00CA" }, "&Ecirc": { "codepoints": [202], "characters": "\u00CA" }, "&ecirc;": { "codepoints": [234], "characters": "\u00EA" }, "&ecirc": { "codepoints": [234], "characters": "\u00EA" }, "&ecir;": { "codepoints": [8790], "characters": "\u2256" }, "&ecolon;": { "codepoints": [8789], "characters": "\u2255" }, "&Ecy;": { "codepoints": [1069], "characters": "\u042D" }, "&ecy;": { "codepoints": [1101], "characters": "\u044D" }, "&eDDot;": { "codepoints": [10871], "characters": "\u2A77" }, "&Edot;": { "codepoints": [278], "characters": "\u0116" }, "&edot;": { "codepoints": [279], "characters": "\u0117" }, "&eDot;": { "codepoints": [8785], "characters": "\u2251" }, "&ee;": { "codepoints": [8519], "characters": "\u2147" }, "&efDot;": { "codepoints": [8786], "characters": "\u2252" }, "&Efr;": { "codepoints": [120072], "characters": "\uD835\uDD08" }, "&efr;": { "codepoints": [120098], "characters": "\uD835\uDD22" }, "&eg;": { "codepoints": [10906], "characters": "\u2A9A" }, "&Egrave;": { "codepoints": [200], "characters": "\u00C8" }, "&Egrave": { "codepoints": [200], "characters": "\u00C8" }, "&egrave;": { "codepoints": [232], "characters": "\u00E8" }, "&egrave": { "codepoints": [232], "characters": "\u00E8" }, "&egs;": { "codepoints": [10902], "characters": "\u2A96" }, "&egsdot;": { "codepoints": [10904], "characters": "\u2A98" }, "&el;": { "codepoints": [10905], "characters": "\u2A99" }, "&Element;": { "codepoints": [8712], "characters": "\u2208" }, "&elinters;": { "codepoints": [9191], "characters": "\u23E7" }, "&ell;": { "codepoints": [8467], "characters": "\u2113" }, "&els;": { "codepoints": [10901], "characters": "\u2A95" }, "&elsdot;": { "codepoints": [10903], "characters": "\u2A97" }, "&Emacr;": { "codepoints": [274], "characters": "\u0112" }, "&emacr;": { "codepoints": [275], "characters": "\u0113" }, "&empty;": { "codepoints": [8709], "characters": "\u2205" }, "&emptyset;": { "codepoints": [8709], "characters": "\u2205" }, "&EmptySmallSquare;": { "codepoints": [9723], "characters": "\u25FB" }, "&emptyv;": { "codepoints": [8709], "characters": "\u2205" }, "&EmptyVerySmallSquare;": { "codepoints": [9643], "characters": "\u25AB" }, "&emsp13;": { "codepoints": [8196], "characters": "\u2004" }, "&emsp14;": { "codepoints": [8197], "characters": "\u2005" }, "&emsp;": { "codepoints": [8195], "characters": "\u2003" }, "&ENG;": { "codepoints": [330], "characters": "\u014A" }, "&eng;": { "codepoints": [331], "characters": "\u014B" }, "&ensp;": { "codepoints": [8194], "characters": "\u2002" }, "&Eogon;": { "codepoints": [280], "characters": "\u0118" }, "&eogon;": { "codepoints": [281], "characters": "\u0119" }, "&Eopf;": { "codepoints": [120124], "characters": "\uD835\uDD3C" }, "&eopf;": { "codepoints": [120150], "characters": "\uD835\uDD56" }, "&epar;": { "codepoints": [8917], "characters": "\u22D5" }, "&eparsl;": { "codepoints": [10723], "characters": "\u29E3" }, "&eplus;": { "codepoints": [10865], "characters": "\u2A71" }, "&epsi;": { "codepoints": [949], "characters": "\u03B5" }, "&Epsilon;": { "codepoints": [917], "characters": "\u0395" }, "&epsilon;": { "codepoints": [949], "characters": "\u03B5" }, "&epsiv;": { "codepoints": [1013], "characters": "\u03F5" }, "&eqcirc;": { "codepoints": [8790], "characters": "\u2256" }, "&eqcolon;": { "codepoints": [8789], "characters": "\u2255" }, "&eqsim;": { "codepoints": [8770], "characters": "\u2242" }, "&eqslantgtr;": { "codepoints": [10902], "characters": "\u2A96" }, "&eqslantless;": { "codepoints": [10901], "characters": "\u2A95" }, "&Equal;": { "codepoints": [10869], "characters": "\u2A75" }, "&equals;": { "codepoints": [61], "characters": "\u003D" }, "&EqualTilde;": { "codepoints": [8770], "characters": "\u2242" }, "&equest;": { "codepoints": [8799], "characters": "\u225F" }, "&Equilibrium;": { "codepoints": [8652], "characters": "\u21CC" }, "&equiv;": { "codepoints": [8801], "characters": "\u2261" }, "&equivDD;": { "codepoints": [10872], "characters": "\u2A78" }, "&eqvparsl;": { "codepoints": [10725], "characters": "\u29E5" }, "&erarr;": { "codepoints": [10609], "characters": "\u2971" }, "&erDot;": { "codepoints": [8787], "characters": "\u2253" }, "&escr;": { "codepoints": [8495], "characters": "\u212F" }, "&Escr;": { "codepoints": [8496], "characters": "\u2130" }, "&esdot;": { "codepoints": [8784], "characters": "\u2250" }, "&Esim;": { "codepoints": [10867], "characters": "\u2A73" }, "&esim;": { "codepoints": [8770], "characters": "\u2242" }, "&Eta;": { "codepoints": [919], "characters": "\u0397" }, "&eta;": { "codepoints": [951], "characters": "\u03B7" }, "&ETH;": { "codepoints": [208], "characters": "\u00D0" }, "&ETH": { "codepoints": [208], "characters": "\u00D0" }, "&eth;": { "codepoints": [240], "characters": "\u00F0" }, "&eth": { "codepoints": [240], "characters": "\u00F0" }, "&Euml;": { "codepoints": [203], "characters": "\u00CB" }, "&Euml": { "codepoints": [203], "characters": "\u00CB" }, "&euml;": { "codepoints": [235], "characters": "\u00EB" }, "&euml": { "codepoints": [235], "characters": "\u00EB" }, "&euro;": { "codepoints": [8364], "characters": "\u20AC" }, "&excl;": { "codepoints": [33], "characters": "\u0021" }, "&exist;": { "codepoints": [8707], "characters": "\u2203" }, "&Exists;": { "codepoints": [8707], "characters": "\u2203" }, "&expectation;": { "codepoints": [8496], "characters": "\u2130" }, "&exponentiale;": { "codepoints": [8519], "characters": "\u2147" }, "&ExponentialE;": { "codepoints": [8519], "characters": "\u2147" }, "&fallingdotseq;": { "codepoints": [8786], "characters": "\u2252" }, "&Fcy;": { "codepoints": [1060], "characters": "\u0424" }, "&fcy;": { "codepoints": [1092], "characters": "\u0444" }, "&female;": { "codepoints": [9792], "characters": "\u2640" }, "&ffilig;": { "codepoints": [64259], "characters": "\uFB03" }, "&fflig;": { "codepoints": [64256], "characters": "\uFB00" }, "&ffllig;": { "codepoints": [64260], "characters": "\uFB04" }, "&Ffr;": { "codepoints": [120073], "characters": "\uD835\uDD09" }, "&ffr;": { "codepoints": [120099], "characters": "\uD835\uDD23" }, "&filig;": { "codepoints": [64257], "characters": "\uFB01" }, "&FilledSmallSquare;": { "codepoints": [9724], "characters": "\u25FC" }, "&FilledVerySmallSquare;": { "codepoints": [9642], "characters": "\u25AA" }, "&fjlig;": { "codepoints": [102, 106], "characters": "\u0066\u006A" }, "&flat;": { "codepoints": [9837], "characters": "\u266D" }, "&fllig;": { "codepoints": [64258], "characters": "\uFB02" }, "&fltns;": { "codepoints": [9649], "characters": "\u25B1" }, "&fnof;": { "codepoints": [402], "characters": "\u0192" }, "&Fopf;": { "codepoints": [120125], "characters": "\uD835\uDD3D" }, "&fopf;": { "codepoints": [120151], "characters": "\uD835\uDD57" }, "&forall;": { "codepoints": [8704], "characters": "\u2200" }, "&ForAll;": { "codepoints": [8704], "characters": "\u2200" }, "&fork;": { "codepoints": [8916], "characters": "\u22D4" }, "&forkv;": { "codepoints": [10969], "characters": "\u2AD9" }, "&Fouriertrf;": { "codepoints": [8497], "characters": "\u2131" }, "&fpartint;": { "codepoints": [10765], "characters": "\u2A0D" }, "&frac12;": { "codepoints": [189], "characters": "\u00BD" }, "&frac12": { "codepoints": [189], "characters": "\u00BD" }, "&frac13;": { "codepoints": [8531], "characters": "\u2153" }, "&frac14;": { "codepoints": [188], "characters": "\u00BC" }, "&frac14": { "codepoints": [188], "characters": "\u00BC" }, "&frac15;": { "codepoints": [8533], "characters": "\u2155" }, "&frac16;": { "codepoints": [8537], "characters": "\u2159" }, "&frac18;": { "codepoints": [8539], "characters": "\u215B" }, "&frac23;": { "codepoints": [8532], "characters": "\u2154" }, "&frac25;": { "codepoints": [8534], "characters": "\u2156" }, "&frac34;": { "codepoints": [190], "characters": "\u00BE" }, "&frac34": { "codepoints": [190], "characters": "\u00BE" }, "&frac35;": { "codepoints": [8535], "characters": "\u2157" }, "&frac38;": { "codepoints": [8540], "characters": "\u215C" }, "&frac45;": { "codepoints": [8536], "characters": "\u2158" }, "&frac56;": { "codepoints": [8538], "characters": "\u215A" }, "&frac58;": { "codepoints": [8541], "characters": "\u215D" }, "&frac78;": { "codepoints": [8542], "characters": "\u215E" }, "&frasl;": { "codepoints": [8260], "characters": "\u2044" }, "&frown;": { "codepoints": [8994], "characters": "\u2322" }, "&fscr;": { "codepoints": [119995], "characters": "\uD835\uDCBB" }, "&Fscr;": { "codepoints": [8497], "characters": "\u2131" }, "&gacute;": { "codepoints": [501], "characters": "\u01F5" }, "&Gamma;": { "codepoints": [915], "characters": "\u0393" }, "&gamma;": { "codepoints": [947], "characters": "\u03B3" }, "&Gammad;": { "codepoints": [988], "characters": "\u03DC" }, "&gammad;": { "codepoints": [989], "characters": "\u03DD" }, "&gap;": { "codepoints": [10886], "characters": "\u2A86" }, "&Gbreve;": { "codepoints": [286], "characters": "\u011E" }, "&gbreve;": { "codepoints": [287], "characters": "\u011F" }, "&Gcedil;": { "codepoints": [290], "characters": "\u0122" }, "&Gcirc;": { "codepoints": [284], "characters": "\u011C" }, "&gcirc;": { "codepoints": [285], "characters": "\u011D" }, "&Gcy;": { "codepoints": [1043], "characters": "\u0413" }, "&gcy;": { "codepoints": [1075], "characters": "\u0433" }, "&Gdot;": { "codepoints": [288], "characters": "\u0120" }, "&gdot;": { "codepoints": [289], "characters": "\u0121" }, "&ge;": { "codepoints": [8805], "characters": "\u2265" }, "&gE;": { "codepoints": [8807], "characters": "\u2267" }, "&gEl;": { "codepoints": [10892], "characters": "\u2A8C" }, "&gel;": { "codepoints": [8923], "characters": "\u22DB" }, "&geq;": { "codepoints": [8805], "characters": "\u2265" }, "&geqq;": { "codepoints": [8807], "characters": "\u2267" }, "&geqslant;": { "codepoints": [10878], "characters": "\u2A7E" }, "&gescc;": { "codepoints": [10921], "characters": "\u2AA9" }, "&ges;": { "codepoints": [10878], "characters": "\u2A7E" }, "&gesdot;": { "codepoints": [10880], "characters": "\u2A80" }, "&gesdoto;": { "codepoints": [10882], "characters": "\u2A82" }, "&gesdotol;": { "codepoints": [10884], "characters": "\u2A84" }, "&gesl;": { "codepoints": [8923, 65024], "characters": "\u22DB\uFE00" }, "&gesles;": { "codepoints": [10900], "characters": "\u2A94" }, "&Gfr;": { "codepoints": [120074], "characters": "\uD835\uDD0A" }, "&gfr;": { "codepoints": [120100], "characters": "\uD835\uDD24" }, "&gg;": { "codepoints": [8811], "characters": "\u226B" }, "&Gg;": { "codepoints": [8921], "characters": "\u22D9" }, "&ggg;": { "codepoints": [8921], "characters": "\u22D9" }, "&gimel;": { "codepoints": [8503], "characters": "\u2137" }, "&GJcy;": { "codepoints": [1027], "characters": "\u0403" }, "&gjcy;": { "codepoints": [1107], "characters": "\u0453" }, "&gla;": { "codepoints": [10917], "characters": "\u2AA5" }, "&gl;": { "codepoints": [8823], "characters": "\u2277" }, "&glE;": { "codepoints": [10898], "characters": "\u2A92" }, "&glj;": { "codepoints": [10916], "characters": "\u2AA4" }, "&gnap;": { "codepoints": [10890], "characters": "\u2A8A" }, "&gnapprox;": { "codepoints": [10890], "characters": "\u2A8A" }, "&gne;": { "codepoints": [10888], "characters": "\u2A88" }, "&gnE;": { "codepoints": [8809], "characters": "\u2269" }, "&gneq;": { "codepoints": [10888], "characters": "\u2A88" }, "&gneqq;": { "codepoints": [8809], "characters": "\u2269" }, "&gnsim;": { "codepoints": [8935], "characters": "\u22E7" }, "&Gopf;": { "codepoints": [120126], "characters": "\uD835\uDD3E" }, "&gopf;": { "codepoints": [120152], "characters": "\uD835\uDD58" }, "&grave;": { "codepoints": [96], "characters": "\u0060" }, "&GreaterEqual;": { "codepoints": [8805], "characters": "\u2265" }, "&GreaterEqualLess;": { "codepoints": [8923], "characters": "\u22DB" }, "&GreaterFullEqual;": { "codepoints": [8807], "characters": "\u2267" }, "&GreaterGreater;": { "codepoints": [10914], "characters": "\u2AA2" }, "&GreaterLess;": { "codepoints": [8823], "characters": "\u2277" }, "&GreaterSlantEqual;": { "codepoints": [10878], "characters": "\u2A7E" }, "&GreaterTilde;": { "codepoints": [8819], "characters": "\u2273" }, "&Gscr;": { "codepoints": [119970], "characters": "\uD835\uDCA2" }, "&gscr;": { "codepoints": [8458], "characters": "\u210A" }, "&gsim;": { "codepoints": [8819], "characters": "\u2273" }, "&gsime;": { "codepoints": [10894], "characters": "\u2A8E" }, "&gsiml;": { "codepoints": [10896], "characters": "\u2A90" }, "&gtcc;": { "codepoints": [10919], "characters": "\u2AA7" }, "&gtcir;": { "codepoints": [10874], "characters": "\u2A7A" }, "&gt;": { "codepoints": [62], "characters": "\u003E" }, "&gt": { "codepoints": [62], "characters": "\u003E" }, "&GT;": { "codepoints": [62], "characters": "\u003E" }, "&GT": { "codepoints": [62], "characters": "\u003E" }, "&Gt;": { "codepoints": [8811], "characters": "\u226B" }, "&gtdot;": { "codepoints": [8919], "characters": "\u22D7" }, "&gtlPar;": { "codepoints": [10645], "characters": "\u2995" }, "&gtquest;": { "codepoints": [10876], "characters": "\u2A7C" }, "&gtrapprox;": { "codepoints": [10886], "characters": "\u2A86" }, "&gtrarr;": { "codepoints": [10616], "characters": "\u2978" }, "&gtrdot;": { "codepoints": [8919], "characters": "\u22D7" }, "&gtreqless;": { "codepoints": [8923], "characters": "\u22DB" }, "&gtreqqless;": { "codepoints": [10892], "characters": "\u2A8C" }, "&gtrless;": { "codepoints": [8823], "characters": "\u2277" }, "&gtrsim;": { "codepoints": [8819], "characters": "\u2273" }, "&gvertneqq;": { "codepoints": [8809, 65024], "characters": "\u2269\uFE00" }, "&gvnE;": { "codepoints": [8809, 65024], "characters": "\u2269\uFE00" }, "&Hacek;": { "codepoints": [711], "characters": "\u02C7" }, "&hairsp;": { "codepoints": [8202], "characters": "\u200A" }, "&half;": { "codepoints": [189], "characters": "\u00BD" }, "&hamilt;": { "codepoints": [8459], "characters": "\u210B" }, "&HARDcy;": { "codepoints": [1066], "characters": "\u042A" }, "&hardcy;": { "codepoints": [1098], "characters": "\u044A" }, "&harrcir;": { "codepoints": [10568], "characters": "\u2948" }, "&harr;": { "codepoints": [8596], "characters": "\u2194" }, "&hArr;": { "codepoints": [8660], "characters": "\u21D4" }, "&harrw;": { "codepoints": [8621], "characters": "\u21AD" }, "&Hat;": { "codepoints": [94], "characters": "\u005E" }, "&hbar;": { "codepoints": [8463], "characters": "\u210F" }, "&Hcirc;": { "codepoints": [292], "characters": "\u0124" }, "&hcirc;": { "codepoints": [293], "characters": "\u0125" }, "&hearts;": { "codepoints": [9829], "characters": "\u2665" }, "&heartsuit;": { "codepoints": [9829], "characters": "\u2665" }, "&hellip;": { "codepoints": [8230], "characters": "\u2026" }, "&hercon;": { "codepoints": [8889], "characters": "\u22B9" }, "&hfr;": { "codepoints": [120101], "characters": "\uD835\uDD25" }, "&Hfr;": { "codepoints": [8460], "characters": "\u210C" }, "&HilbertSpace;": { "codepoints": [8459], "characters": "\u210B" }, "&hksearow;": { "codepoints": [10533], "characters": "\u2925" }, "&hkswarow;": { "codepoints": [10534], "characters": "\u2926" }, "&hoarr;": { "codepoints": [8703], "characters": "\u21FF" }, "&homtht;": { "codepoints": [8763], "characters": "\u223B" }, "&hookleftarrow;": { "codepoints": [8617], "characters": "\u21A9" }, "&hookrightarrow;": { "codepoints": [8618], "characters": "\u21AA" }, "&hopf;": { "codepoints": [120153], "characters": "\uD835\uDD59" }, "&Hopf;": { "codepoints": [8461], "characters": "\u210D" }, "&horbar;": { "codepoints": [8213], "characters": "\u2015" }, "&HorizontalLine;": { "codepoints": [9472], "characters": "\u2500" }, "&hscr;": { "codepoints": [119997], "characters": "\uD835\uDCBD" }, "&Hscr;": { "codepoints": [8459], "characters": "\u210B" }, "&hslash;": { "codepoints": [8463], "characters": "\u210F" }, "&Hstrok;": { "codepoints": [294], "characters": "\u0126" }, "&hstrok;": { "codepoints": [295], "characters": "\u0127" }, "&HumpDownHump;": { "codepoints": [8782], "characters": "\u224E" }, "&HumpEqual;": { "codepoints": [8783], "characters": "\u224F" }, "&hybull;": { "codepoints": [8259], "characters": "\u2043" }, "&hyphen;": { "codepoints": [8208], "characters": "\u2010" }, "&Iacute;": { "codepoints": [205], "characters": "\u00CD" }, "&Iacute": { "codepoints": [205], "characters": "\u00CD" }, "&iacute;": { "codepoints": [237], "characters": "\u00ED" }, "&iacute": { "codepoints": [237], "characters": "\u00ED" }, "&ic;": { "codepoints": [8291], "characters": "\u2063" }, "&Icirc;": { "codepoints": [206], "characters": "\u00CE" }, "&Icirc": { "codepoints": [206], "characters": "\u00CE" }, "&icirc;": { "codepoints": [238], "characters": "\u00EE" }, "&icirc": { "codepoints": [238], "characters": "\u00EE" }, "&Icy;": { "codepoints": [1048], "characters": "\u0418" }, "&icy;": { "codepoints": [1080], "characters": "\u0438" }, "&Idot;": { "codepoints": [304], "characters": "\u0130" }, "&IEcy;": { "codepoints": [1045], "characters": "\u0415" }, "&iecy;": { "codepoints": [1077], "characters": "\u0435" }, "&iexcl;": { "codepoints": [161], "characters": "\u00A1" }, "&iexcl": { "codepoints": [161], "characters": "\u00A1" }, "&iff;": { "codepoints": [8660], "characters": "\u21D4" }, "&ifr;": { "codepoints": [120102], "characters": "\uD835\uDD26" }, "&Ifr;": { "codepoints": [8465], "characters": "\u2111" }, "&Igrave;": { "codepoints": [204], "characters": "\u00CC" }, "&Igrave": { "codepoints": [204], "characters": "\u00CC" }, "&igrave;": { "codepoints": [236], "characters": "\u00EC" }, "&igrave": { "codepoints": [236], "characters": "\u00EC" }, "&ii;": { "codepoints": [8520], "characters": "\u2148" }, "&iiiint;": { "codepoints": [10764], "characters": "\u2A0C" }, "&iiint;": { "codepoints": [8749], "characters": "\u222D" }, "&iinfin;": { "codepoints": [10716], "characters": "\u29DC" }, "&iiota;": { "codepoints": [8489], "characters": "\u2129" }, "&IJlig;": { "codepoints": [306], "characters": "\u0132" }, "&ijlig;": { "codepoints": [307], "characters": "\u0133" }, "&Imacr;": { "codepoints": [298], "characters": "\u012A" }, "&imacr;": { "codepoints": [299], "characters": "\u012B" }, "&image;": { "codepoints": [8465], "characters": "\u2111" }, "&ImaginaryI;": { "codepoints": [8520], "characters": "\u2148" }, "&imagline;": { "codepoints": [8464], "characters": "\u2110" }, "&imagpart;": { "codepoints": [8465], "characters": "\u2111" }, "&imath;": { "codepoints": [305], "characters": "\u0131" }, "&Im;": { "codepoints": [8465], "characters": "\u2111" }, "&imof;": { "codepoints": [8887], "characters": "\u22B7" }, "&imped;": { "codepoints": [437], "characters": "\u01B5" }, "&Implies;": { "codepoints": [8658], "characters": "\u21D2" }, "&incare;": { "codepoints": [8453], "characters": "\u2105" }, "&in;": { "codepoints": [8712], "characters": "\u2208" }, "&infin;": { "codepoints": [8734], "characters": "\u221E" }, "&infintie;": { "codepoints": [10717], "characters": "\u29DD" }, "&inodot;": { "codepoints": [305], "characters": "\u0131" }, "&intcal;": { "codepoints": [8890], "characters": "\u22BA" }, "&int;": { "codepoints": [8747], "characters": "\u222B" }, "&Int;": { "codepoints": [8748], "characters": "\u222C" }, "&integers;": { "codepoints": [8484], "characters": "\u2124" }, "&Integral;": { "codepoints": [8747], "characters": "\u222B" }, "&intercal;": { "codepoints": [8890], "characters": "\u22BA" }, "&Intersection;": { "codepoints": [8898], "characters": "\u22C2" }, "&intlarhk;": { "codepoints": [10775], "characters": "\u2A17" }, "&intprod;": { "codepoints": [10812], "characters": "\u2A3C" }, "&InvisibleComma;": { "codepoints": [8291], "characters": "\u2063" }, "&InvisibleTimes;": { "codepoints": [8290], "characters": "\u2062" }, "&IOcy;": { "codepoints": [1025], "characters": "\u0401" }, "&iocy;": { "codepoints": [1105], "characters": "\u0451" }, "&Iogon;": { "codepoints": [302], "characters": "\u012E" }, "&iogon;": { "codepoints": [303], "characters": "\u012F" }, "&Iopf;": { "codepoints": [120128], "characters": "\uD835\uDD40" }, "&iopf;": { "codepoints": [120154], "characters": "\uD835\uDD5A" }, "&Iota;": { "codepoints": [921], "characters": "\u0399" }, "&iota;": { "codepoints": [953], "characters": "\u03B9" }, "&iprod;": { "codepoints": [10812], "characters": "\u2A3C" }, "&iquest;": { "codepoints": [191], "characters": "\u00BF" }, "&iquest": { "codepoints": [191], "characters": "\u00BF" }, "&iscr;": { "codepoints": [119998], "characters": "\uD835\uDCBE" }, "&Iscr;": { "codepoints": [8464], "characters": "\u2110" }, "&isin;": { "codepoints": [8712], "characters": "\u2208" }, "&isindot;": { "codepoints": [8949], "characters": "\u22F5" }, "&isinE;": { "codepoints": [8953], "characters": "\u22F9" }, "&isins;": { "codepoints": [8948], "characters": "\u22F4" }, "&isinsv;": { "codepoints": [8947], "characters": "\u22F3" }, "&isinv;": { "codepoints": [8712], "characters": "\u2208" }, "&it;": { "codepoints": [8290], "characters": "\u2062" }, "&Itilde;": { "codepoints": [296], "characters": "\u0128" }, "&itilde;": { "codepoints": [297], "characters": "\u0129" }, "&Iukcy;": { "codepoints": [1030], "characters": "\u0406" }, "&iukcy;": { "codepoints": [1110], "characters": "\u0456" }, "&Iuml;": { "codepoints": [207], "characters": "\u00CF" }, "&Iuml": { "codepoints": [207], "characters": "\u00CF" }, "&iuml;": { "codepoints": [239], "characters": "\u00EF" }, "&iuml": { "codepoints": [239], "characters": "\u00EF" }, "&Jcirc;": { "codepoints": [308], "characters": "\u0134" }, "&jcirc;": { "codepoints": [309], "characters": "\u0135" }, "&Jcy;": { "codepoints": [1049], "characters": "\u0419" }, "&jcy;": { "codepoints": [1081], "characters": "\u0439" }, "&Jfr;": { "codepoints": [120077], "characters": "\uD835\uDD0D" }, "&jfr;": { "codepoints": [120103], "characters": "\uD835\uDD27" }, "&jmath;": { "codepoints": [567], "characters": "\u0237" }, "&Jopf;": { "codepoints": [120129], "characters": "\uD835\uDD41" }, "&jopf;": { "codepoints": [120155], "characters": "\uD835\uDD5B" }, "&Jscr;": { "codepoints": [119973], "characters": "\uD835\uDCA5" }, "&jscr;": { "codepoints": [119999], "characters": "\uD835\uDCBF" }, "&Jsercy;": { "codepoints": [1032], "characters": "\u0408" }, "&jsercy;": { "codepoints": [1112], "characters": "\u0458" }, "&Jukcy;": { "codepoints": [1028], "characters": "\u0404" }, "&jukcy;": { "codepoints": [1108], "characters": "\u0454" }, "&Kappa;": { "codepoints": [922], "characters": "\u039A" }, "&kappa;": { "codepoints": [954], "characters": "\u03BA" }, "&kappav;": { "codepoints": [1008], "characters": "\u03F0" }, "&Kcedil;": { "codepoints": [310], "characters": "\u0136" }, "&kcedil;": { "codepoints": [311], "characters": "\u0137" }, "&Kcy;": { "codepoints": [1050], "characters": "\u041A" }, "&kcy;": { "codepoints": [1082], "characters": "\u043A" }, "&Kfr;": { "codepoints": [120078], "characters": "\uD835\uDD0E" }, "&kfr;": { "codepoints": [120104], "characters": "\uD835\uDD28" }, "&kgreen;": { "codepoints": [312], "characters": "\u0138" }, "&KHcy;": { "codepoints": [1061], "characters": "\u0425" }, "&khcy;": { "codepoints": [1093], "characters": "\u0445" }, "&KJcy;": { "codepoints": [1036], "characters": "\u040C" }, "&kjcy;": { "codepoints": [1116], "characters": "\u045C" }, "&Kopf;": { "codepoints": [120130], "characters": "\uD835\uDD42" }, "&kopf;": { "codepoints": [120156], "characters": "\uD835\uDD5C" }, "&Kscr;": { "codepoints": [119974], "characters": "\uD835\uDCA6" }, "&kscr;": { "codepoints": [120000], "characters": "\uD835\uDCC0" }, "&lAarr;": { "codepoints": [8666], "characters": "\u21DA" }, "&Lacute;": { "codepoints": [313], "characters": "\u0139" }, "&lacute;": { "codepoints": [314], "characters": "\u013A" }, "&laemptyv;": { "codepoints": [10676], "characters": "\u29B4" }, "&lagran;": { "codepoints": [8466], "characters": "\u2112" }, "&Lambda;": { "codepoints": [923], "characters": "\u039B" }, "&lambda;": { "codepoints": [955], "characters": "\u03BB" }, "&lang;": { "codepoints": [10216], "characters": "\u27E8" }, "&Lang;": { "codepoints": [10218], "characters": "\u27EA" }, "&langd;": { "codepoints": [10641], "characters": "\u2991" }, "&langle;": { "codepoints": [10216], "characters": "\u27E8" }, "&lap;": { "codepoints": [10885], "characters": "\u2A85" }, "&Laplacetrf;": { "codepoints": [8466], "characters": "\u2112" }, "&laquo;": { "codepoints": [171], "characters": "\u00AB" }, "&laquo": { "codepoints": [171], "characters": "\u00AB" }, "&larrb;": { "codepoints": [8676], "characters": "\u21E4" }, "&larrbfs;": { "codepoints": [10527], "characters": "\u291F" }, "&larr;": { "codepoints": [8592], "characters": "\u2190" }, "&Larr;": { "codepoints": [8606], "characters": "\u219E" }, "&lArr;": { "codepoints": [8656], "characters": "\u21D0" }, "&larrfs;": { "codepoints": [10525], "characters": "\u291D" }, "&larrhk;": { "codepoints": [8617], "characters": "\u21A9" }, "&larrlp;": { "codepoints": [8619], "characters": "\u21AB" }, "&larrpl;": { "codepoints": [10553], "characters": "\u2939" }, "&larrsim;": { "codepoints": [10611], "characters": "\u2973" }, "&larrtl;": { "codepoints": [8610], "characters": "\u21A2" }, "&latail;": { "codepoints": [10521], "characters": "\u2919" }, "&lAtail;": { "codepoints": [10523], "characters": "\u291B" }, "&lat;": { "codepoints": [10923], "characters": "\u2AAB" }, "&late;": { "codepoints": [10925], "characters": "\u2AAD" }, "&lates;": { "codepoints": [10925, 65024], "characters": "\u2AAD\uFE00" }, "&lbarr;": { "codepoints": [10508], "characters": "\u290C" }, "&lBarr;": { "codepoints": [10510], "characters": "\u290E" }, "&lbbrk;": { "codepoints": [10098], "characters": "\u2772" }, "&lbrace;": { "codepoints": [123], "characters": "\u007B" }, "&lbrack;": { "codepoints": [91], "characters": "\u005B" }, "&lbrke;": { "codepoints": [10635], "characters": "\u298B" }, "&lbrksld;": { "codepoints": [10639], "characters": "\u298F" }, "&lbrkslu;": { "codepoints": [10637], "characters": "\u298D" }, "&Lcaron;": { "codepoints": [317], "characters": "\u013D" }, "&lcaron;": { "codepoints": [318], "characters": "\u013E" }, "&Lcedil;": { "codepoints": [315], "characters": "\u013B" }, "&lcedil;": { "codepoints": [316], "characters": "\u013C" }, "&lceil;": { "codepoints": [8968], "characters": "\u2308" }, "&lcub;": { "codepoints": [123], "characters": "\u007B" }, "&Lcy;": { "codepoints": [1051], "characters": "\u041B" }, "&lcy;": { "codepoints": [1083], "characters": "\u043B" }, "&ldca;": { "codepoints": [10550], "characters": "\u2936" }, "&ldquo;": { "codepoints": [8220], "characters": "\u201C" }, "&ldquor;": { "codepoints": [8222], "characters": "\u201E" }, "&ldrdhar;": { "codepoints": [10599], "characters": "\u2967" }, "&ldrushar;": { "codepoints": [10571], "characters": "\u294B" }, "&ldsh;": { "codepoints": [8626], "characters": "\u21B2" }, "&le;": { "codepoints": [8804], "characters": "\u2264" }, "&lE;": { "codepoints": [8806], "characters": "\u2266" }, "&LeftAngleBracket;": { "codepoints": [10216], "characters": "\u27E8" }, "&LeftArrowBar;": { "codepoints": [8676], "characters": "\u21E4" }, "&leftarrow;": { "codepoints": [8592], "characters": "\u2190" }, "&LeftArrow;": { "codepoints": [8592], "characters": "\u2190" }, "&Leftarrow;": { "codepoints": [8656], "characters": "\u21D0" }, "&LeftArrowRightArrow;": { "codepoints": [8646], "characters": "\u21C6" }, "&leftarrowtail;": { "codepoints": [8610], "characters": "\u21A2" }, "&LeftCeiling;": { "codepoints": [8968], "characters": "\u2308" }, "&LeftDoubleBracket;": { "codepoints": [10214], "characters": "\u27E6" }, "&LeftDownTeeVector;": { "codepoints": [10593], "characters": "\u2961" }, "&LeftDownVectorBar;": { "codepoints": [10585], "characters": "\u2959" }, "&LeftDownVector;": { "codepoints": [8643], "characters": "\u21C3" }, "&LeftFloor;": { "codepoints": [8970], "characters": "\u230A" }, "&leftharpoondown;": { "codepoints": [8637], "characters": "\u21BD" }, "&leftharpoonup;": { "codepoints": [8636], "characters": "\u21BC" }, "&leftleftarrows;": { "codepoints": [8647], "characters": "\u21C7" }, "&leftrightarrow;": { "codepoints": [8596], "characters": "\u2194" }, "&LeftRightArrow;": { "codepoints": [8596], "characters": "\u2194" }, "&Leftrightarrow;": { "codepoints": [8660], "characters": "\u21D4" }, "&leftrightarrows;": { "codepoints": [8646], "characters": "\u21C6" }, "&leftrightharpoons;": { "codepoints": [8651], "characters": "\u21CB" }, "&leftrightsquigarrow;": { "codepoints": [8621], "characters": "\u21AD" }, "&LeftRightVector;": { "codepoints": [10574], "characters": "\u294E" }, "&LeftTeeArrow;": { "codepoints": [8612], "characters": "\u21A4" }, "&LeftTee;": { "codepoints": [8867], "characters": "\u22A3" }, "&LeftTeeVector;": { "codepoints": [10586], "characters": "\u295A" }, "&leftthreetimes;": { "codepoints": [8907], "characters": "\u22CB" }, "&LeftTriangleBar;": { "codepoints": [10703], "characters": "\u29CF" }, "&LeftTriangle;": { "codepoints": [8882], "characters": "\u22B2" }, "&LeftTriangleEqual;": { "codepoints": [8884], "characters": "\u22B4" }, "&LeftUpDownVector;": { "codepoints": [10577], "characters": "\u2951" }, "&LeftUpTeeVector;": { "codepoints": [10592], "characters": "\u2960" }, "&LeftUpVectorBar;": { "codepoints": [10584], "characters": "\u2958" }, "&LeftUpVector;": { "codepoints": [8639], "characters": "\u21BF" }, "&LeftVectorBar;": { "codepoints": [10578], "characters": "\u2952" }, "&LeftVector;": { "codepoints": [8636], "characters": "\u21BC" }, "&lEg;": { "codepoints": [10891], "characters": "\u2A8B" }, "&leg;": { "codepoints": [8922], "characters": "\u22DA" }, "&leq;": { "codepoints": [8804], "characters": "\u2264" }, "&leqq;": { "codepoints": [8806], "characters": "\u2266" }, "&leqslant;": { "codepoints": [10877], "characters": "\u2A7D" }, "&lescc;": { "codepoints": [10920], "characters": "\u2AA8" }, "&les;": { "codepoints": [10877], "characters": "\u2A7D" }, "&lesdot;": { "codepoints": [10879], "characters": "\u2A7F" }, "&lesdoto;": { "codepoints": [10881], "characters": "\u2A81" }, "&lesdotor;": { "codepoints": [10883], "characters": "\u2A83" }, "&lesg;": { "codepoints": [8922, 65024], "characters": "\u22DA\uFE00" }, "&lesges;": { "codepoints": [10899], "characters": "\u2A93" }, "&lessapprox;": { "codepoints": [10885], "characters": "\u2A85" }, "&lessdot;": { "codepoints": [8918], "characters": "\u22D6" }, "&lesseqgtr;": { "codepoints": [8922], "characters": "\u22DA" }, "&lesseqqgtr;": { "codepoints": [10891], "characters": "\u2A8B" }, "&LessEqualGreater;": { "codepoints": [8922], "characters": "\u22DA" }, "&LessFullEqual;": { "codepoints": [8806], "characters": "\u2266" }, "&LessGreater;": { "codepoints": [8822], "characters": "\u2276" }, "&lessgtr;": { "codepoints": [8822], "characters": "\u2276" }, "&LessLess;": { "codepoints": [10913], "characters": "\u2AA1" }, "&lesssim;": { "codepoints": [8818], "characters": "\u2272" }, "&LessSlantEqual;": { "codepoints": [10877], "characters": "\u2A7D" }, "&LessTilde;": { "codepoints": [8818], "characters": "\u2272" }, "&lfisht;": { "codepoints": [10620], "characters": "\u297C" }, "&lfloor;": { "codepoints": [8970], "characters": "\u230A" }, "&Lfr;": { "codepoints": [120079], "characters": "\uD835\uDD0F" }, "&lfr;": { "codepoints": [120105], "characters": "\uD835\uDD29" }, "&lg;": { "codepoints": [8822], "characters": "\u2276" }, "&lgE;": { "codepoints": [10897], "characters": "\u2A91" }, "&lHar;": { "codepoints": [10594], "characters": "\u2962" }, "&lhard;": { "codepoints": [8637], "characters": "\u21BD" }, "&lharu;": { "codepoints": [8636], "characters": "\u21BC" }, "&lharul;": { "codepoints": [10602], "characters": "\u296A" }, "&lhblk;": { "codepoints": [9604], "characters": "\u2584" }, "&LJcy;": { "codepoints": [1033], "characters": "\u0409" }, "&ljcy;": { "codepoints": [1113], "characters": "\u0459" }, "&llarr;": { "codepoints": [8647], "characters": "\u21C7" }, "&ll;": { "codepoints": [8810], "characters": "\u226A" }, "&Ll;": { "codepoints": [8920], "characters": "\u22D8" }, "&llcorner;": { "codepoints": [8990], "characters": "\u231E" }, "&Lleftarrow;": { "codepoints": [8666], "characters": "\u21DA" }, "&llhard;": { "codepoints": [10603], "characters": "\u296B" }, "&lltri;": { "codepoints": [9722], "characters": "\u25FA" }, "&Lmidot;": { "codepoints": [319], "characters": "\u013F" }, "&lmidot;": { "codepoints": [320], "characters": "\u0140" }, "&lmoustache;": { "codepoints": [9136], "characters": "\u23B0" }, "&lmoust;": { "codepoints": [9136], "characters": "\u23B0" }, "&lnap;": { "codepoints": [10889], "characters": "\u2A89" }, "&lnapprox;": { "codepoints": [10889], "characters": "\u2A89" }, "&lne;": { "codepoints": [10887], "characters": "\u2A87" }, "&lnE;": { "codepoints": [8808], "characters": "\u2268" }, "&lneq;": { "codepoints": [10887], "characters": "\u2A87" }, "&lneqq;": { "codepoints": [8808], "characters": "\u2268" }, "&lnsim;": { "codepoints": [8934], "characters": "\u22E6" }, "&loang;": { "codepoints": [10220], "characters": "\u27EC" }, "&loarr;": { "codepoints": [8701], "characters": "\u21FD" }, "&lobrk;": { "codepoints": [10214], "characters": "\u27E6" }, "&longleftarrow;": { "codepoints": [10229], "characters": "\u27F5" }, "&LongLeftArrow;": { "codepoints": [10229], "characters": "\u27F5" }, "&Longleftarrow;": { "codepoints": [10232], "characters": "\u27F8" }, "&longleftrightarrow;": { "codepoints": [10231], "characters": "\u27F7" }, "&LongLeftRightArrow;": { "codepoints": [10231], "characters": "\u27F7" }, "&Longleftrightarrow;": { "codepoints": [10234], "characters": "\u27FA" }, "&longmapsto;": { "codepoints": [10236], "characters": "\u27FC" }, "&longrightarrow;": { "codepoints": [10230], "characters": "\u27F6" }, "&LongRightArrow;": { "codepoints": [10230], "characters": "\u27F6" }, "&Longrightarrow;": { "codepoints": [10233], "characters": "\u27F9" }, "&looparrowleft;": { "codepoints": [8619], "characters": "\u21AB" }, "&looparrowright;": { "codepoints": [8620], "characters": "\u21AC" }, "&lopar;": { "codepoints": [10629], "characters": "\u2985" }, "&Lopf;": { "codepoints": [120131], "characters": "\uD835\uDD43" }, "&lopf;": { "codepoints": [120157], "characters": "\uD835\uDD5D" }, "&loplus;": { "codepoints": [10797], "characters": "\u2A2D" }, "&lotimes;": { "codepoints": [10804], "characters": "\u2A34" }, "&lowast;": { "codepoints": [8727], "characters": "\u2217" }, "&lowbar;": { "codepoints": [95], "characters": "\u005F" }, "&LowerLeftArrow;": { "codepoints": [8601], "characters": "\u2199" }, "&LowerRightArrow;": { "codepoints": [8600], "characters": "\u2198" }, "&loz;": { "codepoints": [9674], "characters": "\u25CA" }, "&lozenge;": { "codepoints": [9674], "characters": "\u25CA" }, "&lozf;": { "codepoints": [10731], "characters": "\u29EB" }, "&lpar;": { "codepoints": [40], "characters": "\u0028" }, "&lparlt;": { "codepoints": [10643], "characters": "\u2993" }, "&lrarr;": { "codepoints": [8646], "characters": "\u21C6" }, "&lrcorner;": { "codepoints": [8991], "characters": "\u231F" }, "&lrhar;": { "codepoints": [8651], "characters": "\u21CB" }, "&lrhard;": { "codepoints": [10605], "characters": "\u296D" }, "&lrm;": { "codepoints": [8206], "characters": "\u200E" }, "&lrtri;": { "codepoints": [8895], "characters": "\u22BF" }, "&lsaquo;": { "codepoints": [8249], "characters": "\u2039" }, "&lscr;": { "codepoints": [120001], "characters": "\uD835\uDCC1" }, "&Lscr;": { "codepoints": [8466], "characters": "\u2112" }, "&lsh;": { "codepoints": [8624], "characters": "\u21B0" }, "&Lsh;": { "codepoints": [8624], "characters": "\u21B0" }, "&lsim;": { "codepoints": [8818], "characters": "\u2272" }, "&lsime;": { "codepoints": [10893], "characters": "\u2A8D" }, "&lsimg;": { "codepoints": [10895], "characters": "\u2A8F" }, "&lsqb;": { "codepoints": [91], "characters": "\u005B" }, "&lsquo;": { "codepoints": [8216], "characters": "\u2018" }, "&lsquor;": { "codepoints": [8218], "characters": "\u201A" }, "&Lstrok;": { "codepoints": [321], "characters": "\u0141" }, "&lstrok;": { "codepoints": [322], "characters": "\u0142" }, "&ltcc;": { "codepoints": [10918], "characters": "\u2AA6" }, "&ltcir;": { "codepoints": [10873], "characters": "\u2A79" }, "&lt;": { "codepoints": [60], "characters": "\u003C" }, "&lt": { "codepoints": [60], "characters": "\u003C" }, "&LT;": { "codepoints": [60], "characters": "\u003C" }, "&LT": { "codepoints": [60], "characters": "\u003C" }, "&Lt;": { "codepoints": [8810], "characters": "\u226A" }, "&ltdot;": { "codepoints": [8918], "characters": "\u22D6" }, "&lthree;": { "codepoints": [8907], "characters": "\u22CB" }, "&ltimes;": { "codepoints": [8905], "characters": "\u22C9" }, "&ltlarr;": { "codepoints": [10614], "characters": "\u2976" }, "&ltquest;": { "codepoints": [10875], "characters": "\u2A7B" }, "&ltri;": { "codepoints": [9667], "characters": "\u25C3" }, "&ltrie;": { "codepoints": [8884], "characters": "\u22B4" }, "&ltrif;": { "codepoints": [9666], "characters": "\u25C2" }, "&ltrPar;": { "codepoints": [10646], "characters": "\u2996" }, "&lurdshar;": { "codepoints": [10570], "characters": "\u294A" }, "&luruhar;": { "codepoints": [10598], "characters": "\u2966" }, "&lvertneqq;": { "codepoints": [8808, 65024], "characters": "\u2268\uFE00" }, "&lvnE;": { "codepoints": [8808, 65024], "characters": "\u2268\uFE00" }, "&macr;": { "codepoints": [175], "characters": "\u00AF" }, "&macr": { "codepoints": [175], "characters": "\u00AF" }, "&male;": { "codepoints": [9794], "characters": "\u2642" }, "&malt;": { "codepoints": [10016], "characters": "\u2720" }, "&maltese;": { "codepoints": [10016], "characters": "\u2720" }, "&Map;": { "codepoints": [10501], "characters": "\u2905" }, "&map;": { "codepoints": [8614], "characters": "\u21A6" }, "&mapsto;": { "codepoints": [8614], "characters": "\u21A6" }, "&mapstodown;": { "codepoints": [8615], "characters": "\u21A7" }, "&mapstoleft;": { "codepoints": [8612], "characters": "\u21A4" }, "&mapstoup;": { "codepoints": [8613], "characters": "\u21A5" }, "&marker;": { "codepoints": [9646], "characters": "\u25AE" }, "&mcomma;": { "codepoints": [10793], "characters": "\u2A29" }, "&Mcy;": { "codepoints": [1052], "characters": "\u041C" }, "&mcy;": { "codepoints": [1084], "characters": "\u043C" }, "&mdash;": { "codepoints": [8212], "characters": "\u2014" }, "&mDDot;": { "codepoints": [8762], "characters": "\u223A" }, "&measuredangle;": { "codepoints": [8737], "characters": "\u2221" }, "&MediumSpace;": { "codepoints": [8287], "characters": "\u205F" }, "&Mellintrf;": { "codepoints": [8499], "characters": "\u2133" }, "&Mfr;": { "codepoints": [120080], "characters": "\uD835\uDD10" }, "&mfr;": { "codepoints": [120106], "characters": "\uD835\uDD2A" }, "&mho;": { "codepoints": [8487], "characters": "\u2127" }, "&micro;": { "codepoints": [181], "characters": "\u00B5" }, "&micro": { "codepoints": [181], "characters": "\u00B5" }, "&midast;": { "codepoints": [42], "characters": "\u002A" }, "&midcir;": { "codepoints": [10992], "characters": "\u2AF0" }, "&mid;": { "codepoints": [8739], "characters": "\u2223" }, "&middot;": { "codepoints": [183], "characters": "\u00B7" }, "&middot": { "codepoints": [183], "characters": "\u00B7" }, "&minusb;": { "codepoints": [8863], "characters": "\u229F" }, "&minus;": { "codepoints": [8722], "characters": "\u2212" }, "&minusd;": { "codepoints": [8760], "characters": "\u2238" }, "&minusdu;": { "codepoints": [10794], "characters": "\u2A2A" }, "&MinusPlus;": { "codepoints": [8723], "characters": "\u2213" }, "&mlcp;": { "codepoints": [10971], "characters": "\u2ADB" }, "&mldr;": { "codepoints": [8230], "characters": "\u2026" }, "&mnplus;": { "codepoints": [8723], "characters": "\u2213" }, "&models;": { "codepoints": [8871], "characters": "\u22A7" }, "&Mopf;": { "codepoints": [120132], "characters": "\uD835\uDD44" }, "&mopf;": { "codepoints": [120158], "characters": "\uD835\uDD5E" }, "&mp;": { "codepoints": [8723], "characters": "\u2213" }, "&mscr;": { "codepoints": [120002], "characters": "\uD835\uDCC2" }, "&Mscr;": { "codepoints": [8499], "characters": "\u2133" }, "&mstpos;": { "codepoints": [8766], "characters": "\u223E" }, "&Mu;": { "codepoints": [924], "characters": "\u039C" }, "&mu;": { "codepoints": [956], "characters": "\u03BC" }, "&multimap;": { "codepoints": [8888], "characters": "\u22B8" }, "&mumap;": { "codepoints": [8888], "characters": "\u22B8" }, "&nabla;": { "codepoints": [8711], "characters": "\u2207" }, "&Nacute;": { "codepoints": [323], "characters": "\u0143" }, "&nacute;": { "codepoints": [324], "characters": "\u0144" }, "&nang;": { "codepoints": [8736, 8402], "characters": "\u2220\u20D2" }, "&nap;": { "codepoints": [8777], "characters": "\u2249" }, "&napE;": { "codepoints": [10864, 824], "characters": "\u2A70\u0338" }, "&napid;": { "codepoints": [8779, 824], "characters": "\u224B\u0338" }, "&napos;": { "codepoints": [329], "characters": "\u0149" }, "&napprox;": { "codepoints": [8777], "characters": "\u2249" }, "&natural;": { "codepoints": [9838], "characters": "\u266E" }, "&naturals;": { "codepoints": [8469], "characters": "\u2115" }, "&natur;": { "codepoints": [9838], "characters": "\u266E" }, "&nbsp;": { "codepoints": [160], "characters": "\u00A0" }, "&nbsp": { "codepoints": [160], "characters": "\u00A0" }, "&nbump;": { "codepoints": [8782, 824], "characters": "\u224E\u0338" }, "&nbumpe;": { "codepoints": [8783, 824], "characters": "\u224F\u0338" }, "&ncap;": { "codepoints": [10819], "characters": "\u2A43" }, "&Ncaron;": { "codepoints": [327], "characters": "\u0147" }, "&ncaron;": { "codepoints": [328], "characters": "\u0148" }, "&Ncedil;": { "codepoints": [325], "characters": "\u0145" }, "&ncedil;": { "codepoints": [326], "characters": "\u0146" }, "&ncong;": { "codepoints": [8775], "characters": "\u2247" }, "&ncongdot;": { "codepoints": [10861, 824], "characters": "\u2A6D\u0338" }, "&ncup;": { "codepoints": [10818], "characters": "\u2A42" }, "&Ncy;": { "codepoints": [1053], "characters": "\u041D" }, "&ncy;": { "codepoints": [1085], "characters": "\u043D" }, "&ndash;": { "codepoints": [8211], "characters": "\u2013" }, "&nearhk;": { "codepoints": [10532], "characters": "\u2924" }, "&nearr;": { "codepoints": [8599], "characters": "\u2197" }, "&neArr;": { "codepoints": [8663], "characters": "\u21D7" }, "&nearrow;": { "codepoints": [8599], "characters": "\u2197" }, "&ne;": { "codepoints": [8800], "characters": "\u2260" }, "&nedot;": { "codepoints": [8784, 824], "characters": "\u2250\u0338" }, "&NegativeMediumSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&NegativeThickSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&NegativeThinSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&NegativeVeryThinSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&nequiv;": { "codepoints": [8802], "characters": "\u2262" }, "&nesear;": { "codepoints": [10536], "characters": "\u2928" }, "&nesim;": { "codepoints": [8770, 824], "characters": "\u2242\u0338" }, "&NestedGreaterGreater;": { "codepoints": [8811], "characters": "\u226B" }, "&NestedLessLess;": { "codepoints": [8810], "characters": "\u226A" }, "&NewLine;": { "codepoints": [10], "characters": "\u000A" }, "&nexist;": { "codepoints": [8708], "characters": "\u2204" }, "&nexists;": { "codepoints": [8708], "characters": "\u2204" }, "&Nfr;": { "codepoints": [120081], "characters": "\uD835\uDD11" }, "&nfr;": { "codepoints": [120107], "characters": "\uD835\uDD2B" }, "&ngE;": { "codepoints": [8807, 824], "characters": "\u2267\u0338" }, "&nge;": { "codepoints": [8817], "characters": "\u2271" }, "&ngeq;": { "codepoints": [8817], "characters": "\u2271" }, "&ngeqq;": { "codepoints": [8807, 824], "characters": "\u2267\u0338" }, "&ngeqslant;": { "codepoints": [10878, 824], "characters": "\u2A7E\u0338" }, "&nges;": { "codepoints": [10878, 824], "characters": "\u2A7E\u0338" }, "&nGg;": { "codepoints": [8921, 824], "characters": "\u22D9\u0338" }, "&ngsim;": { "codepoints": [8821], "characters": "\u2275" }, "&nGt;": { "codepoints": [8811, 8402], "characters": "\u226B\u20D2" }, "&ngt;": { "codepoints": [8815], "characters": "\u226F" }, "&ngtr;": { "codepoints": [8815], "characters": "\u226F" }, "&nGtv;": { "codepoints": [8811, 824], "characters": "\u226B\u0338" }, "&nharr;": { "codepoints": [8622], "characters": "\u21AE" }, "&nhArr;": { "codepoints": [8654], "characters": "\u21CE" }, "&nhpar;": { "codepoints": [10994], "characters": "\u2AF2" }, "&ni;": { "codepoints": [8715], "characters": "\u220B" }, "&nis;": { "codepoints": [8956], "characters": "\u22FC" }, "&nisd;": { "codepoints": [8954], "characters": "\u22FA" }, "&niv;": { "codepoints": [8715], "characters": "\u220B" }, "&NJcy;": { "codepoints": [1034], "characters": "\u040A" }, "&njcy;": { "codepoints": [1114], "characters": "\u045A" }, "&nlarr;": { "codepoints": [8602], "characters": "\u219A" }, "&nlArr;": { "codepoints": [8653], "characters": "\u21CD" }, "&nldr;": { "codepoints": [8229], "characters": "\u2025" }, "&nlE;": { "codepoints": [8806, 824], "characters": "\u2266\u0338" }, "&nle;": { "codepoints": [8816], "characters": "\u2270" }, "&nleftarrow;": { "codepoints": [8602], "characters": "\u219A" }, "&nLeftarrow;": { "codepoints": [8653], "characters": "\u21CD" }, "&nleftrightarrow;": { "codepoints": [8622], "characters": "\u21AE" }, "&nLeftrightarrow;": { "codepoints": [8654], "characters": "\u21CE" }, "&nleq;": { "codepoints": [8816], "characters": "\u2270" }, "&nleqq;": { "codepoints": [8806, 824], "characters": "\u2266\u0338" }, "&nleqslant;": { "codepoints": [10877, 824], "characters": "\u2A7D\u0338" }, "&nles;": { "codepoints": [10877, 824], "characters": "\u2A7D\u0338" }, "&nless;": { "codepoints": [8814], "characters": "\u226E" }, "&nLl;": { "codepoints": [8920, 824], "characters": "\u22D8\u0338" }, "&nlsim;": { "codepoints": [8820], "characters": "\u2274" }, "&nLt;": { "codepoints": [8810, 8402], "characters": "\u226A\u20D2" }, "&nlt;": { "codepoints": [8814], "characters": "\u226E" }, "&nltri;": { "codepoints": [8938], "characters": "\u22EA" }, "&nltrie;": { "codepoints": [8940], "characters": "\u22EC" }, "&nLtv;": { "codepoints": [8810, 824], "characters": "\u226A\u0338" }, "&nmid;": { "codepoints": [8740], "characters": "\u2224" }, "&NoBreak;": { "codepoints": [8288], "characters": "\u2060" }, "&NonBreakingSpace;": { "codepoints": [160], "characters": "\u00A0" }, "&nopf;": { "codepoints": [120159], "characters": "\uD835\uDD5F" }, "&Nopf;": { "codepoints": [8469], "characters": "\u2115" }, "&Not;": { "codepoints": [10988], "characters": "\u2AEC" }, "&not;": { "codepoints": [172], "characters": "\u00AC" }, "&not": { "codepoints": [172], "characters": "\u00AC" }, "&NotCongruent;": { "codepoints": [8802], "characters": "\u2262" }, "&NotCupCap;": { "codepoints": [8813], "characters": "\u226D" }, "&NotDoubleVerticalBar;": { "codepoints": [8742], "characters": "\u2226" }, "&NotElement;": { "codepoints": [8713], "characters": "\u2209" }, "&NotEqual;": { "codepoints": [8800], "characters": "\u2260" }, "&NotEqualTilde;": { "codepoints": [8770, 824], "characters": "\u2242\u0338" }, "&NotExists;": { "codepoints": [8708], "characters": "\u2204" }, "&NotGreater;": { "codepoints": [8815], "characters": "\u226F" }, "&NotGreaterEqual;": { "codepoints": [8817], "characters": "\u2271" }, "&NotGreaterFullEqual;": { "codepoints": [8807, 824], "characters": "\u2267\u0338" }, "&NotGreaterGreater;": { "codepoints": [8811, 824], "characters": "\u226B\u0338" }, "&NotGreaterLess;": { "codepoints": [8825], "characters": "\u2279" }, "&NotGreaterSlantEqual;": { "codepoints": [10878, 824], "characters": "\u2A7E\u0338" }, "&NotGreaterTilde;": { "codepoints": [8821], "characters": "\u2275" }, "&NotHumpDownHump;": { "codepoints": [8782, 824], "characters": "\u224E\u0338" }, "&NotHumpEqual;": { "codepoints": [8783, 824], "characters": "\u224F\u0338" }, "&notin;": { "codepoints": [8713], "characters": "\u2209" }, "&notindot;": { "codepoints": [8949, 824], "characters": "\u22F5\u0338" }, "&notinE;": { "codepoints": [8953, 824], "characters": "\u22F9\u0338" }, "&notinva;": { "codepoints": [8713], "characters": "\u2209" }, "&notinvb;": { "codepoints": [8951], "characters": "\u22F7" }, "&notinvc;": { "codepoints": [8950], "characters": "\u22F6" }, "&NotLeftTriangleBar;": { "codepoints": [10703, 824], "characters": "\u29CF\u0338" }, "&NotLeftTriangle;": { "codepoints": [8938], "characters": "\u22EA" }, "&NotLeftTriangleEqual;": { "codepoints": [8940], "characters": "\u22EC" }, "&NotLess;": { "codepoints": [8814], "characters": "\u226E" }, "&NotLessEqual;": { "codepoints": [8816], "characters": "\u2270" }, "&NotLessGreater;": { "codepoints": [8824], "characters": "\u2278" }, "&NotLessLess;": { "codepoints": [8810, 824], "characters": "\u226A\u0338" }, "&NotLessSlantEqual;": { "codepoints": [10877, 824], "characters": "\u2A7D\u0338" }, "&NotLessTilde;": { "codepoints": [8820], "characters": "\u2274" }, "&NotNestedGreaterGreater;": { "codepoints": [10914, 824], "characters": "\u2AA2\u0338" }, "&NotNestedLessLess;": { "codepoints": [10913, 824], "characters": "\u2AA1\u0338" }, "&notni;": { "codepoints": [8716], "characters": "\u220C" }, "&notniva;": { "codepoints": [8716], "characters": "\u220C" }, "&notnivb;": { "codepoints": [8958], "characters": "\u22FE" }, "&notnivc;": { "codepoints": [8957], "characters": "\u22FD" }, "&NotPrecedes;": { "codepoints": [8832], "characters": "\u2280" }, "&NotPrecedesEqual;": { "codepoints": [10927, 824], "characters": "\u2AAF\u0338" }, "&NotPrecedesSlantEqual;": { "codepoints": [8928], "characters": "\u22E0" }, "&NotReverseElement;": { "codepoints": [8716], "characters": "\u220C" }, "&NotRightTriangleBar;": { "codepoints": [10704, 824], "characters": "\u29D0\u0338" }, "&NotRightTriangle;": { "codepoints": [8939], "characters": "\u22EB" }, "&NotRightTriangleEqual;": { "codepoints": [8941], "characters": "\u22ED" }, "&NotSquareSubset;": { "codepoints": [8847, 824], "characters": "\u228F\u0338" }, "&NotSquareSubsetEqual;": { "codepoints": [8930], "characters": "\u22E2" }, "&NotSquareSuperset;": { "codepoints": [8848, 824], "characters": "\u2290\u0338" }, "&NotSquareSupersetEqual;": { "codepoints": [8931], "characters": "\u22E3" }, "&NotSubset;": { "codepoints": [8834, 8402], "characters": "\u2282\u20D2" }, "&NotSubsetEqual;": { "codepoints": [8840], "characters": "\u2288" }, "&NotSucceeds;": { "codepoints": [8833], "characters": "\u2281" }, "&NotSucceedsEqual;": { "codepoints": [10928, 824], "characters": "\u2AB0\u0338" }, "&NotSucceedsSlantEqual;": { "codepoints": [8929], "characters": "\u22E1" }, "&NotSucceedsTilde;": { "codepoints": [8831, 824], "characters": "\u227F\u0338" }, "&NotSuperset;": { "codepoints": [8835, 8402], "characters": "\u2283\u20D2" }, "&NotSupersetEqual;": { "codepoints": [8841], "characters": "\u2289" }, "&NotTilde;": { "codepoints": [8769], "characters": "\u2241" }, "&NotTildeEqual;": { "codepoints": [8772], "characters": "\u2244" }, "&NotTildeFullEqual;": { "codepoints": [8775], "characters": "\u2247" }, "&NotTildeTilde;": { "codepoints": [8777], "characters": "\u2249" }, "&NotVerticalBar;": { "codepoints": [8740], "characters": "\u2224" }, "&nparallel;": { "codepoints": [8742], "characters": "\u2226" }, "&npar;": { "codepoints": [8742], "characters": "\u2226" }, "&nparsl;": { "codepoints": [11005, 8421], "characters": "\u2AFD\u20E5" }, "&npart;": { "codepoints": [8706, 824], "characters": "\u2202\u0338" }, "&npolint;": { "codepoints": [10772], "characters": "\u2A14" }, "&npr;": { "codepoints": [8832], "characters": "\u2280" }, "&nprcue;": { "codepoints": [8928], "characters": "\u22E0" }, "&nprec;": { "codepoints": [8832], "characters": "\u2280" }, "&npreceq;": { "codepoints": [10927, 824], "characters": "\u2AAF\u0338" }, "&npre;": { "codepoints": [10927, 824], "characters": "\u2AAF\u0338" }, "&nrarrc;": { "codepoints": [10547, 824], "characters": "\u2933\u0338" }, "&nrarr;": { "codepoints": [8603], "characters": "\u219B" }, "&nrArr;": { "codepoints": [8655], "characters": "\u21CF" }, "&nrarrw;": { "codepoints": [8605, 824], "characters": "\u219D\u0338" }, "&nrightarrow;": { "codepoints": [8603], "characters": "\u219B" }, "&nRightarrow;": { "codepoints": [8655], "characters": "\u21CF" }, "&nrtri;": { "codepoints": [8939], "characters": "\u22EB" }, "&nrtrie;": { "codepoints": [8941], "characters": "\u22ED" }, "&nsc;": { "codepoints": [8833], "characters": "\u2281" }, "&nsccue;": { "codepoints": [8929], "characters": "\u22E1" }, "&nsce;": { "codepoints": [10928, 824], "characters": "\u2AB0\u0338" }, "&Nscr;": { "codepoints": [119977], "characters": "\uD835\uDCA9" }, "&nscr;": { "codepoints": [120003], "characters": "\uD835\uDCC3" }, "&nshortmid;": { "codepoints": [8740], "characters": "\u2224" }, "&nshortparallel;": { "codepoints": [8742], "characters": "\u2226" }, "&nsim;": { "codepoints": [8769], "characters": "\u2241" }, "&nsime;": { "codepoints": [8772], "characters": "\u2244" }, "&nsimeq;": { "codepoints": [8772], "characters": "\u2244" }, "&nsmid;": { "codepoints": [8740], "characters": "\u2224" }, "&nspar;": { "codepoints": [8742], "characters": "\u2226" }, "&nsqsube;": { "codepoints": [8930], "characters": "\u22E2" }, "&nsqsupe;": { "codepoints": [8931], "characters": "\u22E3" }, "&nsub;": { "codepoints": [8836], "characters": "\u2284" }, "&nsubE;": { "codepoints": [10949, 824], "characters": "\u2AC5\u0338" }, "&nsube;": { "codepoints": [8840], "characters": "\u2288" }, "&nsubset;": { "codepoints": [8834, 8402], "characters": "\u2282\u20D2" }, "&nsubseteq;": { "codepoints": [8840], "characters": "\u2288" }, "&nsubseteqq;": { "codepoints": [10949, 824], "characters": "\u2AC5\u0338" }, "&nsucc;": { "codepoints": [8833], "characters": "\u2281" }, "&nsucceq;": { "codepoints": [10928, 824], "characters": "\u2AB0\u0338" }, "&nsup;": { "codepoints": [8837], "characters": "\u2285" }, "&nsupE;": { "codepoints": [10950, 824], "characters": "\u2AC6\u0338" }, "&nsupe;": { "codepoints": [8841], "characters": "\u2289" }, "&nsupset;": { "codepoints": [8835, 8402], "characters": "\u2283\u20D2" }, "&nsupseteq;": { "codepoints": [8841], "characters": "\u2289" }, "&nsupseteqq;": { "codepoints": [10950, 824], "characters": "\u2AC6\u0338" }, "&ntgl;": { "codepoints": [8825], "characters": "\u2279" }, "&Ntilde;": { "codepoints": [209], "characters": "\u00D1" }, "&Ntilde": { "codepoints": [209], "characters": "\u00D1" }, "&ntilde;": { "codepoints": [241], "characters": "\u00F1" }, "&ntilde": { "codepoints": [241], "characters": "\u00F1" }, "&ntlg;": { "codepoints": [8824], "characters": "\u2278" }, "&ntriangleleft;": { "codepoints": [8938], "characters": "\u22EA" }, "&ntrianglelefteq;": { "codepoints": [8940], "characters": "\u22EC" }, "&ntriangleright;": { "codepoints": [8939], "characters": "\u22EB" }, "&ntrianglerighteq;": { "codepoints": [8941], "characters": "\u22ED" }, "&Nu;": { "codepoints": [925], "characters": "\u039D" }, "&nu;": { "codepoints": [957], "characters": "\u03BD" }, "&num;": { "codepoints": [35], "characters": "\u0023" }, "&numero;": { "codepoints": [8470], "characters": "\u2116" }, "&numsp;": { "codepoints": [8199], "characters": "\u2007" }, "&nvap;": { "codepoints": [8781, 8402], "characters": "\u224D\u20D2" }, "&nvdash;": { "codepoints": [8876], "characters": "\u22AC" }, "&nvDash;": { "codepoints": [8877], "characters": "\u22AD" }, "&nVdash;": { "codepoints": [8878], "characters": "\u22AE" }, "&nVDash;": { "codepoints": [8879], "characters": "\u22AF" }, "&nvge;": { "codepoints": [8805, 8402], "characters": "\u2265\u20D2" }, "&nvgt;": { "codepoints": [62, 8402], "characters": "\u003E\u20D2" }, "&nvHarr;": { "codepoints": [10500], "characters": "\u2904" }, "&nvinfin;": { "codepoints": [10718], "characters": "\u29DE" }, "&nvlArr;": { "codepoints": [10498], "characters": "\u2902" }, "&nvle;": { "codepoints": [8804, 8402], "characters": "\u2264\u20D2" }, "&nvlt;": { "codepoints": [60, 8402], "characters": "\u003C\u20D2" }, "&nvltrie;": { "codepoints": [8884, 8402], "characters": "\u22B4\u20D2" }, "&nvrArr;": { "codepoints": [10499], "characters": "\u2903" }, "&nvrtrie;": { "codepoints": [8885, 8402], "characters": "\u22B5\u20D2" }, "&nvsim;": { "codepoints": [8764, 8402], "characters": "\u223C\u20D2" }, "&nwarhk;": { "codepoints": [10531], "characters": "\u2923" }, "&nwarr;": { "codepoints": [8598], "characters": "\u2196" }, "&nwArr;": { "codepoints": [8662], "characters": "\u21D6" }, "&nwarrow;": { "codepoints": [8598], "characters": "\u2196" }, "&nwnear;": { "codepoints": [10535], "characters": "\u2927" }, "&Oacute;": { "codepoints": [211], "characters": "\u00D3" }, "&Oacute": { "codepoints": [211], "characters": "\u00D3" }, "&oacute;": { "codepoints": [243], "characters": "\u00F3" }, "&oacute": { "codepoints": [243], "characters": "\u00F3" }, "&oast;": { "codepoints": [8859], "characters": "\u229B" }, "&Ocirc;": { "codepoints": [212], "characters": "\u00D4" }, "&Ocirc": { "codepoints": [212], "characters": "\u00D4" }, "&ocirc;": { "codepoints": [244], "characters": "\u00F4" }, "&ocirc": { "codepoints": [244], "characters": "\u00F4" }, "&ocir;": { "codepoints": [8858], "characters": "\u229A" }, "&Ocy;": { "codepoints": [1054], "characters": "\u041E" }, "&ocy;": { "codepoints": [1086], "characters": "\u043E" }, "&odash;": { "codepoints": [8861], "characters": "\u229D" }, "&Odblac;": { "codepoints": [336], "characters": "\u0150" }, "&odblac;": { "codepoints": [337], "characters": "\u0151" }, "&odiv;": { "codepoints": [10808], "characters": "\u2A38" }, "&odot;": { "codepoints": [8857], "characters": "\u2299" }, "&odsold;": { "codepoints": [10684], "characters": "\u29BC" }, "&OElig;": { "codepoints": [338], "characters": "\u0152" }, "&oelig;": { "codepoints": [339], "characters": "\u0153" }, "&ofcir;": { "codepoints": [10687], "characters": "\u29BF" }, "&Ofr;": { "codepoints": [120082], "characters": "\uD835\uDD12" }, "&ofr;": { "codepoints": [120108], "characters": "\uD835\uDD2C" }, "&ogon;": { "codepoints": [731], "characters": "\u02DB" }, "&Ograve;": { "codepoints": [210], "characters": "\u00D2" }, "&Ograve": { "codepoints": [210], "characters": "\u00D2" }, "&ograve;": { "codepoints": [242], "characters": "\u00F2" }, "&ograve": { "codepoints": [242], "characters": "\u00F2" }, "&ogt;": { "codepoints": [10689], "characters": "\u29C1" }, "&ohbar;": { "codepoints": [10677], "characters": "\u29B5" }, "&ohm;": { "codepoints": [937], "characters": "\u03A9" }, "&oint;": { "codepoints": [8750], "characters": "\u222E" }, "&olarr;": { "codepoints": [8634], "characters": "\u21BA" }, "&olcir;": { "codepoints": [10686], "characters": "\u29BE" }, "&olcross;": { "codepoints": [10683], "characters": "\u29BB" }, "&oline;": { "codepoints": [8254], "characters": "\u203E" }, "&olt;": { "codepoints": [10688], "characters": "\u29C0" }, "&Omacr;": { "codepoints": [332], "characters": "\u014C" }, "&omacr;": { "codepoints": [333], "characters": "\u014D" }, "&Omega;": { "codepoints": [937], "characters": "\u03A9" }, "&omega;": { "codepoints": [969], "characters": "\u03C9" }, "&Omicron;": { "codepoints": [927], "characters": "\u039F" }, "&omicron;": { "codepoints": [959], "characters": "\u03BF" }, "&omid;": { "codepoints": [10678], "characters": "\u29B6" }, "&ominus;": { "codepoints": [8854], "characters": "\u2296" }, "&Oopf;": { "codepoints": [120134], "characters": "\uD835\uDD46" }, "&oopf;": { "codepoints": [120160], "characters": "\uD835\uDD60" }, "&opar;": { "codepoints": [10679], "characters": "\u29B7" }, "&OpenCurlyDoubleQuote;": { "codepoints": [8220], "characters": "\u201C" }, "&OpenCurlyQuote;": { "codepoints": [8216], "characters": "\u2018" }, "&operp;": { "codepoints": [10681], "characters": "\u29B9" }, "&oplus;": { "codepoints": [8853], "characters": "\u2295" }, "&orarr;": { "codepoints": [8635], "characters": "\u21BB" }, "&Or;": { "codepoints": [10836], "characters": "\u2A54" }, "&or;": { "codepoints": [8744], "characters": "\u2228" }, "&ord;": { "codepoints": [10845], "characters": "\u2A5D" }, "&order;": { "codepoints": [8500], "characters": "\u2134" }, "&orderof;": { "codepoints": [8500], "characters": "\u2134" }, "&ordf;": { "codepoints": [170], "characters": "\u00AA" }, "&ordf": { "codepoints": [170], "characters": "\u00AA" }, "&ordm;": { "codepoints": [186], "characters": "\u00BA" }, "&ordm": { "codepoints": [186], "characters": "\u00BA" }, "&origof;": { "codepoints": [8886], "characters": "\u22B6" }, "&oror;": { "codepoints": [10838], "characters": "\u2A56" }, "&orslope;": { "codepoints": [10839], "characters": "\u2A57" }, "&orv;": { "codepoints": [10843], "characters": "\u2A5B" }, "&oS;": { "codepoints": [9416], "characters": "\u24C8" }, "&Oscr;": { "codepoints": [119978], "characters": "\uD835\uDCAA" }, "&oscr;": { "codepoints": [8500], "characters": "\u2134" }, "&Oslash;": { "codepoints": [216], "characters": "\u00D8" }, "&Oslash": { "codepoints": [216], "characters": "\u00D8" }, "&oslash;": { "codepoints": [248], "characters": "\u00F8" }, "&oslash": { "codepoints": [248], "characters": "\u00F8" }, "&osol;": { "codepoints": [8856], "characters": "\u2298" }, "&Otilde;": { "codepoints": [213], "characters": "\u00D5" }, "&Otilde": { "codepoints": [213], "characters": "\u00D5" }, "&otilde;": { "codepoints": [245], "characters": "\u00F5" }, "&otilde": { "codepoints": [245], "characters": "\u00F5" }, "&otimesas;": { "codepoints": [10806], "characters": "\u2A36" }, "&Otimes;": { "codepoints": [10807], "characters": "\u2A37" }, "&otimes;": { "codepoints": [8855], "characters": "\u2297" }, "&Ouml;": { "codepoints": [214], "characters": "\u00D6" }, "&Ouml": { "codepoints": [214], "characters": "\u00D6" }, "&ouml;": { "codepoints": [246], "characters": "\u00F6" }, "&ouml": { "codepoints": [246], "characters": "\u00F6" }, "&ovbar;": { "codepoints": [9021], "characters": "\u233D" }, "&OverBar;": { "codepoints": [8254], "characters": "\u203E" }, "&OverBrace;": { "codepoints": [9182], "characters": "\u23DE" }, "&OverBracket;": { "codepoints": [9140], "characters": "\u23B4" }, "&OverParenthesis;": { "codepoints": [9180], "characters": "\u23DC" }, "&para;": { "codepoints": [182], "characters": "\u00B6" }, "&para": { "codepoints": [182], "characters": "\u00B6" }, "&parallel;": { "codepoints": [8741], "characters": "\u2225" }, "&par;": { "codepoints": [8741], "characters": "\u2225" }, "&parsim;": { "codepoints": [10995], "characters": "\u2AF3" }, "&parsl;": { "codepoints": [11005], "characters": "\u2AFD" }, "&part;": { "codepoints": [8706], "characters": "\u2202" }, "&PartialD;": { "codepoints": [8706], "characters": "\u2202" }, "&Pcy;": { "codepoints": [1055], "characters": "\u041F" }, "&pcy;": { "codepoints": [1087], "characters": "\u043F" }, "&percnt;": { "codepoints": [37], "characters": "\u0025" }, "&period;": { "codepoints": [46], "characters": "\u002E" }, "&permil;": { "codepoints": [8240], "characters": "\u2030" }, "&perp;": { "codepoints": [8869], "characters": "\u22A5" }, "&pertenk;": { "codepoints": [8241], "characters": "\u2031" }, "&Pfr;": { "codepoints": [120083], "characters": "\uD835\uDD13" }, "&pfr;": { "codepoints": [120109], "characters": "\uD835\uDD2D" }, "&Phi;": { "codepoints": [934], "characters": "\u03A6" }, "&phi;": { "codepoints": [966], "characters": "\u03C6" }, "&phiv;": { "codepoints": [981], "characters": "\u03D5" }, "&phmmat;": { "codepoints": [8499], "characters": "\u2133" }, "&phone;": { "codepoints": [9742], "characters": "\u260E" }, "&Pi;": { "codepoints": [928], "characters": "\u03A0" }, "&pi;": { "codepoints": [960], "characters": "\u03C0" }, "&pitchfork;": { "codepoints": [8916], "characters": "\u22D4" }, "&piv;": { "codepoints": [982], "characters": "\u03D6" }, "&planck;": { "codepoints": [8463], "characters": "\u210F" }, "&planckh;": { "codepoints": [8462], "characters": "\u210E" }, "&plankv;": { "codepoints": [8463], "characters": "\u210F" }, "&plusacir;": { "codepoints": [10787], "characters": "\u2A23" }, "&plusb;": { "codepoints": [8862], "characters": "\u229E" }, "&pluscir;": { "codepoints": [10786], "characters": "\u2A22" }, "&plus;": { "codepoints": [43], "characters": "\u002B" }, "&plusdo;": { "codepoints": [8724], "characters": "\u2214" }, "&plusdu;": { "codepoints": [10789], "characters": "\u2A25" }, "&pluse;": { "codepoints": [10866], "characters": "\u2A72" }, "&PlusMinus;": { "codepoints": [177], "characters": "\u00B1" }, "&plusmn;": { "codepoints": [177], "characters": "\u00B1" }, "&plusmn": { "codepoints": [177], "characters": "\u00B1" }, "&plussim;": { "codepoints": [10790], "characters": "\u2A26" }, "&plustwo;": { "codepoints": [10791], "characters": "\u2A27" }, "&pm;": { "codepoints": [177], "characters": "\u00B1" }, "&Poincareplane;": { "codepoints": [8460], "characters": "\u210C" }, "&pointint;": { "codepoints": [10773], "characters": "\u2A15" }, "&popf;": { "codepoints": [120161], "characters": "\uD835\uDD61" }, "&Popf;": { "codepoints": [8473], "characters": "\u2119" }, "&pound;": { "codepoints": [163], "characters": "\u00A3" }, "&pound": { "codepoints": [163], "characters": "\u00A3" }, "&prap;": { "codepoints": [10935], "characters": "\u2AB7" }, "&Pr;": { "codepoints": [10939], "characters": "\u2ABB" }, "&pr;": { "codepoints": [8826], "characters": "\u227A" }, "&prcue;": { "codepoints": [8828], "characters": "\u227C" }, "&precapprox;": { "codepoints": [10935], "characters": "\u2AB7" }, "&prec;": { "codepoints": [8826], "characters": "\u227A" }, "&preccurlyeq;": { "codepoints": [8828], "characters": "\u227C" }, "&Precedes;": { "codepoints": [8826], "characters": "\u227A" }, "&PrecedesEqual;": { "codepoints": [10927], "characters": "\u2AAF" }, "&PrecedesSlantEqual;": { "codepoints": [8828], "characters": "\u227C" }, "&PrecedesTilde;": { "codepoints": [8830], "characters": "\u227E" }, "&preceq;": { "codepoints": [10927], "characters": "\u2AAF" }, "&precnapprox;": { "codepoints": [10937], "characters": "\u2AB9" }, "&precneqq;": { "codepoints": [10933], "characters": "\u2AB5" }, "&precnsim;": { "codepoints": [8936], "characters": "\u22E8" }, "&pre;": { "codepoints": [10927], "characters": "\u2AAF" }, "&prE;": { "codepoints": [10931], "characters": "\u2AB3" }, "&precsim;": { "codepoints": [8830], "characters": "\u227E" }, "&prime;": { "codepoints": [8242], "characters": "\u2032" }, "&Prime;": { "codepoints": [8243], "characters": "\u2033" }, "&primes;": { "codepoints": [8473], "characters": "\u2119" }, "&prnap;": { "codepoints": [10937], "characters": "\u2AB9" }, "&prnE;": { "codepoints": [10933], "characters": "\u2AB5" }, "&prnsim;": { "codepoints": [8936], "characters": "\u22E8" }, "&prod;": { "codepoints": [8719], "characters": "\u220F" }, "&Product;": { "codepoints": [8719], "characters": "\u220F" }, "&profalar;": { "codepoints": [9006], "characters": "\u232E" }, "&profline;": { "codepoints": [8978], "characters": "\u2312" }, "&profsurf;": { "codepoints": [8979], "characters": "\u2313" }, "&prop;": { "codepoints": [8733], "characters": "\u221D" }, "&Proportional;": { "codepoints": [8733], "characters": "\u221D" }, "&Proportion;": { "codepoints": [8759], "characters": "\u2237" }, "&propto;": { "codepoints": [8733], "characters": "\u221D" }, "&prsim;": { "codepoints": [8830], "characters": "\u227E" }, "&prurel;": { "codepoints": [8880], "characters": "\u22B0" }, "&Pscr;": { "codepoints": [119979], "characters": "\uD835\uDCAB" }, "&pscr;": { "codepoints": [120005], "characters": "\uD835\uDCC5" }, "&Psi;": { "codepoints": [936], "characters": "\u03A8" }, "&psi;": { "codepoints": [968], "characters": "\u03C8" }, "&puncsp;": { "codepoints": [8200], "characters": "\u2008" }, "&Qfr;": { "codepoints": [120084], "characters": "\uD835\uDD14" }, "&qfr;": { "codepoints": [120110], "characters": "\uD835\uDD2E" }, "&qint;": { "codepoints": [10764], "characters": "\u2A0C" }, "&qopf;": { "codepoints": [120162], "characters": "\uD835\uDD62" }, "&Qopf;": { "codepoints": [8474], "characters": "\u211A" }, "&qprime;": { "codepoints": [8279], "characters": "\u2057" }, "&Qscr;": { "codepoints": [119980], "characters": "\uD835\uDCAC" }, "&qscr;": { "codepoints": [120006], "characters": "\uD835\uDCC6" }, "&quaternions;": { "codepoints": [8461], "characters": "\u210D" }, "&quatint;": { "codepoints": [10774], "characters": "\u2A16" }, "&quest;": { "codepoints": [63], "characters": "\u003F" }, "&questeq;": { "codepoints": [8799], "characters": "\u225F" }, "&quot;": { "codepoints": [34], "characters": "\u0022" }, "&quot": { "codepoints": [34], "characters": "\u0022" }, "&QUOT;": { "codepoints": [34], "characters": "\u0022" }, "&QUOT": { "codepoints": [34], "characters": "\u0022" }, "&rAarr;": { "codepoints": [8667], "characters": "\u21DB" }, "&race;": { "codepoints": [8765, 817], "characters": "\u223D\u0331" }, "&Racute;": { "codepoints": [340], "characters": "\u0154" }, "&racute;": { "codepoints": [341], "characters": "\u0155" }, "&radic;": { "codepoints": [8730], "characters": "\u221A" }, "&raemptyv;": { "codepoints": [10675], "characters": "\u29B3" }, "&rang;": { "codepoints": [10217], "characters": "\u27E9" }, "&Rang;": { "codepoints": [10219], "characters": "\u27EB" }, "&rangd;": { "codepoints": [10642], "characters": "\u2992" }, "&range;": { "codepoints": [10661], "characters": "\u29A5" }, "&rangle;": { "codepoints": [10217], "characters": "\u27E9" }, "&raquo;": { "codepoints": [187], "characters": "\u00BB" }, "&raquo": { "codepoints": [187], "characters": "\u00BB" }, "&rarrap;": { "codepoints": [10613], "characters": "\u2975" }, "&rarrb;": { "codepoints": [8677], "characters": "\u21E5" }, "&rarrbfs;": { "codepoints": [10528], "characters": "\u2920" }, "&rarrc;": { "codepoints": [10547], "characters": "\u2933" }, "&rarr;": { "codepoints": [8594], "characters": "\u2192" }, "&Rarr;": { "codepoints": [8608], "characters": "\u21A0" }, "&rArr;": { "codepoints": [8658], "characters": "\u21D2" }, "&rarrfs;": { "codepoints": [10526], "characters": "\u291E" }, "&rarrhk;": { "codepoints": [8618], "characters": "\u21AA" }, "&rarrlp;": { "codepoints": [8620], "characters": "\u21AC" }, "&rarrpl;": { "codepoints": [10565], "characters": "\u2945" }, "&rarrsim;": { "codepoints": [10612], "characters": "\u2974" }, "&Rarrtl;": { "codepoints": [10518], "characters": "\u2916" }, "&rarrtl;": { "codepoints": [8611], "characters": "\u21A3" }, "&rarrw;": { "codepoints": [8605], "characters": "\u219D" }, "&ratail;": { "codepoints": [10522], "characters": "\u291A" }, "&rAtail;": { "codepoints": [10524], "characters": "\u291C" }, "&ratio;": { "codepoints": [8758], "characters": "\u2236" }, "&rationals;": { "codepoints": [8474], "characters": "\u211A" }, "&rbarr;": { "codepoints": [10509], "characters": "\u290D" }, "&rBarr;": { "codepoints": [10511], "characters": "\u290F" }, "&RBarr;": { "codepoints": [10512], "characters": "\u2910" }, "&rbbrk;": { "codepoints": [10099], "characters": "\u2773" }, "&rbrace;": { "codepoints": [125], "characters": "\u007D" }, "&rbrack;": { "codepoints": [93], "characters": "\u005D" }, "&rbrke;": { "codepoints": [10636], "characters": "\u298C" }, "&rbrksld;": { "codepoints": [10638], "characters": "\u298E" }, "&rbrkslu;": { "codepoints": [10640], "characters": "\u2990" }, "&Rcaron;": { "codepoints": [344], "characters": "\u0158" }, "&rcaron;": { "codepoints": [345], "characters": "\u0159" }, "&Rcedil;": { "codepoints": [342], "characters": "\u0156" }, "&rcedil;": { "codepoints": [343], "characters": "\u0157" }, "&rceil;": { "codepoints": [8969], "characters": "\u2309" }, "&rcub;": { "codepoints": [125], "characters": "\u007D" }, "&Rcy;": { "codepoints": [1056], "characters": "\u0420" }, "&rcy;": { "codepoints": [1088], "characters": "\u0440" }, "&rdca;": { "codepoints": [10551], "characters": "\u2937" }, "&rdldhar;": { "codepoints": [10601], "characters": "\u2969" }, "&rdquo;": { "codepoints": [8221], "characters": "\u201D" }, "&rdquor;": { "codepoints": [8221], "characters": "\u201D" }, "&rdsh;": { "codepoints": [8627], "characters": "\u21B3" }, "&real;": { "codepoints": [8476], "characters": "\u211C" }, "&realine;": { "codepoints": [8475], "characters": "\u211B" }, "&realpart;": { "codepoints": [8476], "characters": "\u211C" }, "&reals;": { "codepoints": [8477], "characters": "\u211D" }, "&Re;": { "codepoints": [8476], "characters": "\u211C" }, "&rect;": { "codepoints": [9645], "characters": "\u25AD" }, "&reg;": { "codepoints": [174], "characters": "\u00AE" }, "&reg": { "codepoints": [174], "characters": "\u00AE" }, "&REG;": { "codepoints": [174], "characters": "\u00AE" }, "&REG": { "codepoints": [174], "characters": "\u00AE" }, "&ReverseElement;": { "codepoints": [8715], "characters": "\u220B" }, "&ReverseEquilibrium;": { "codepoints": [8651], "characters": "\u21CB" }, "&ReverseUpEquilibrium;": { "codepoints": [10607], "characters": "\u296F" }, "&rfisht;": { "codepoints": [10621], "characters": "\u297D" }, "&rfloor;": { "codepoints": [8971], "characters": "\u230B" }, "&rfr;": { "codepoints": [120111], "characters": "\uD835\uDD2F" }, "&Rfr;": { "codepoints": [8476], "characters": "\u211C" }, "&rHar;": { "codepoints": [10596], "characters": "\u2964" }, "&rhard;": { "codepoints": [8641], "characters": "\u21C1" }, "&rharu;": { "codepoints": [8640], "characters": "\u21C0" }, "&rharul;": { "codepoints": [10604], "characters": "\u296C" }, "&Rho;": { "codepoints": [929], "characters": "\u03A1" }, "&rho;": { "codepoints": [961], "characters": "\u03C1" }, "&rhov;": { "codepoints": [1009], "characters": "\u03F1" }, "&RightAngleBracket;": { "codepoints": [10217], "characters": "\u27E9" }, "&RightArrowBar;": { "codepoints": [8677], "characters": "\u21E5" }, "&rightarrow;": { "codepoints": [8594], "characters": "\u2192" }, "&RightArrow;": { "codepoints": [8594], "characters": "\u2192" }, "&Rightarrow;": { "codepoints": [8658], "characters": "\u21D2" }, "&RightArrowLeftArrow;": { "codepoints": [8644], "characters": "\u21C4" }, "&rightarrowtail;": { "codepoints": [8611], "characters": "\u21A3" }, "&RightCeiling;": { "codepoints": [8969], "characters": "\u2309" }, "&RightDoubleBracket;": { "codepoints": [10215], "characters": "\u27E7" }, "&RightDownTeeVector;": { "codepoints": [10589], "characters": "\u295D" }, "&RightDownVectorBar;": { "codepoints": [10581], "characters": "\u2955" }, "&RightDownVector;": { "codepoints": [8642], "characters": "\u21C2" }, "&RightFloor;": { "codepoints": [8971], "characters": "\u230B" }, "&rightharpoondown;": { "codepoints": [8641], "characters": "\u21C1" }, "&rightharpoonup;": { "codepoints": [8640], "characters": "\u21C0" }, "&rightleftarrows;": { "codepoints": [8644], "characters": "\u21C4" }, "&rightleftharpoons;": { "codepoints": [8652], "characters": "\u21CC" }, "&rightrightarrows;": { "codepoints": [8649], "characters": "\u21C9" }, "&rightsquigarrow;": { "codepoints": [8605], "characters": "\u219D" }, "&RightTeeArrow;": { "codepoints": [8614], "characters": "\u21A6" }, "&RightTee;": { "codepoints": [8866], "characters": "\u22A2" }, "&RightTeeVector;": { "codepoints": [10587], "characters": "\u295B" }, "&rightthreetimes;": { "codepoints": [8908], "characters": "\u22CC" }, "&RightTriangleBar;": { "codepoints": [10704], "characters": "\u29D0" }, "&RightTriangle;": { "codepoints": [8883], "characters": "\u22B3" }, "&RightTriangleEqual;": { "codepoints": [8885], "characters": "\u22B5" }, "&RightUpDownVector;": { "codepoints": [10575], "characters": "\u294F" }, "&RightUpTeeVector;": { "codepoints": [10588], "characters": "\u295C" }, "&RightUpVectorBar;": { "codepoints": [10580], "characters": "\u2954" }, "&RightUpVector;": { "codepoints": [8638], "characters": "\u21BE" }, "&RightVectorBar;": { "codepoints": [10579], "characters": "\u2953" }, "&RightVector;": { "codepoints": [8640], "characters": "\u21C0" }, "&ring;": { "codepoints": [730], "characters": "\u02DA" }, "&risingdotseq;": { "codepoints": [8787], "characters": "\u2253" }, "&rlarr;": { "codepoints": [8644], "characters": "\u21C4" }, "&rlhar;": { "codepoints": [8652], "characters": "\u21CC" }, "&rlm;": { "codepoints": [8207], "characters": "\u200F" }, "&rmoustache;": { "codepoints": [9137], "characters": "\u23B1" }, "&rmoust;": { "codepoints": [9137], "characters": "\u23B1" }, "&rnmid;": { "codepoints": [10990], "characters": "\u2AEE" }, "&roang;": { "codepoints": [10221], "characters": "\u27ED" }, "&roarr;": { "codepoints": [8702], "characters": "\u21FE" }, "&robrk;": { "codepoints": [10215], "characters": "\u27E7" }, "&ropar;": { "codepoints": [10630], "characters": "\u2986" }, "&ropf;": { "codepoints": [120163], "characters": "\uD835\uDD63" }, "&Ropf;": { "codepoints": [8477], "characters": "\u211D" }, "&roplus;": { "codepoints": [10798], "characters": "\u2A2E" }, "&rotimes;": { "codepoints": [10805], "characters": "\u2A35" }, "&RoundImplies;": { "codepoints": [10608], "characters": "\u2970" }, "&rpar;": { "codepoints": [41], "characters": "\u0029" }, "&rpargt;": { "codepoints": [10644], "characters": "\u2994" }, "&rppolint;": { "codepoints": [10770], "characters": "\u2A12" }, "&rrarr;": { "codepoints": [8649], "characters": "\u21C9" }, "&Rrightarrow;": { "codepoints": [8667], "characters": "\u21DB" }, "&rsaquo;": { "codepoints": [8250], "characters": "\u203A" }, "&rscr;": { "codepoints": [120007], "characters": "\uD835\uDCC7" }, "&Rscr;": { "codepoints": [8475], "characters": "\u211B" }, "&rsh;": { "codepoints": [8625], "characters": "\u21B1" }, "&Rsh;": { "codepoints": [8625], "characters": "\u21B1" }, "&rsqb;": { "codepoints": [93], "characters": "\u005D" }, "&rsquo;": { "codepoints": [8217], "characters": "\u2019" }, "&rsquor;": { "codepoints": [8217], "characters": "\u2019" }, "&rthree;": { "codepoints": [8908], "characters": "\u22CC" }, "&rtimes;": { "codepoints": [8906], "characters": "\u22CA" }, "&rtri;": { "codepoints": [9657], "characters": "\u25B9" }, "&rtrie;": { "codepoints": [8885], "characters": "\u22B5" }, "&rtrif;": { "codepoints": [9656], "characters": "\u25B8" }, "&rtriltri;": { "codepoints": [10702], "characters": "\u29CE" }, "&RuleDelayed;": { "codepoints": [10740], "characters": "\u29F4" }, "&ruluhar;": { "codepoints": [10600], "characters": "\u2968" }, "&rx;": { "codepoints": [8478], "characters": "\u211E" }, "&Sacute;": { "codepoints": [346], "characters": "\u015A" }, "&sacute;": { "codepoints": [347], "characters": "\u015B" }, "&sbquo;": { "codepoints": [8218], "characters": "\u201A" }, "&scap;": { "codepoints": [10936], "characters": "\u2AB8" }, "&Scaron;": { "codepoints": [352], "characters": "\u0160" }, "&scaron;": { "codepoints": [353], "characters": "\u0161" }, "&Sc;": { "codepoints": [10940], "characters": "\u2ABC" }, "&sc;": { "codepoints": [8827], "characters": "\u227B" }, "&sccue;": { "codepoints": [8829], "characters": "\u227D" }, "&sce;": { "codepoints": [10928], "characters": "\u2AB0" }, "&scE;": { "codepoints": [10932], "characters": "\u2AB4" }, "&Scedil;": { "codepoints": [350], "characters": "\u015E" }, "&scedil;": { "codepoints": [351], "characters": "\u015F" }, "&Scirc;": { "codepoints": [348], "characters": "\u015C" }, "&scirc;": { "codepoints": [349], "characters": "\u015D" }, "&scnap;": { "codepoints": [10938], "characters": "\u2ABA" }, "&scnE;": { "codepoints": [10934], "characters": "\u2AB6" }, "&scnsim;": { "codepoints": [8937], "characters": "\u22E9" }, "&scpolint;": { "codepoints": [10771], "characters": "\u2A13" }, "&scsim;": { "codepoints": [8831], "characters": "\u227F" }, "&Scy;": { "codepoints": [1057], "characters": "\u0421" }, "&scy;": { "codepoints": [1089], "characters": "\u0441" }, "&sdotb;": { "codepoints": [8865], "characters": "\u22A1" }, "&sdot;": { "codepoints": [8901], "characters": "\u22C5" }, "&sdote;": { "codepoints": [10854], "characters": "\u2A66" }, "&searhk;": { "codepoints": [10533], "characters": "\u2925" }, "&searr;": { "codepoints": [8600], "characters": "\u2198" }, "&seArr;": { "codepoints": [8664], "characters": "\u21D8" }, "&searrow;": { "codepoints": [8600], "characters": "\u2198" }, "&sect;": { "codepoints": [167], "characters": "\u00A7" }, "&sect": { "codepoints": [167], "characters": "\u00A7" }, "&semi;": { "codepoints": [59], "characters": "\u003B" }, "&seswar;": { "codepoints": [10537], "characters": "\u2929" }, "&setminus;": { "codepoints": [8726], "characters": "\u2216" }, "&setmn;": { "codepoints": [8726], "characters": "\u2216" }, "&sext;": { "codepoints": [10038], "characters": "\u2736" }, "&Sfr;": { "codepoints": [120086], "characters": "\uD835\uDD16" }, "&sfr;": { "codepoints": [120112], "characters": "\uD835\uDD30" }, "&sfrown;": { "codepoints": [8994], "characters": "\u2322" }, "&sharp;": { "codepoints": [9839], "characters": "\u266F" }, "&SHCHcy;": { "codepoints": [1065], "characters": "\u0429" }, "&shchcy;": { "codepoints": [1097], "characters": "\u0449" }, "&SHcy;": { "codepoints": [1064], "characters": "\u0428" }, "&shcy;": { "codepoints": [1096], "characters": "\u0448" }, "&ShortDownArrow;": { "codepoints": [8595], "characters": "\u2193" }, "&ShortLeftArrow;": { "codepoints": [8592], "characters": "\u2190" }, "&shortmid;": { "codepoints": [8739], "characters": "\u2223" }, "&shortparallel;": { "codepoints": [8741], "characters": "\u2225" }, "&ShortRightArrow;": { "codepoints": [8594], "characters": "\u2192" }, "&ShortUpArrow;": { "codepoints": [8593], "characters": "\u2191" }, "&shy;": { "codepoints": [173], "characters": "\u00AD" }, "&shy": { "codepoints": [173], "characters": "\u00AD" }, "&Sigma;": { "codepoints": [931], "characters": "\u03A3" }, "&sigma;": { "codepoints": [963], "characters": "\u03C3" }, "&sigmaf;": { "codepoints": [962], "characters": "\u03C2" }, "&sigmav;": { "codepoints": [962], "characters": "\u03C2" }, "&sim;": { "codepoints": [8764], "characters": "\u223C" }, "&simdot;": { "codepoints": [10858], "characters": "\u2A6A" }, "&sime;": { "codepoints": [8771], "characters": "\u2243" }, "&simeq;": { "codepoints": [8771], "characters": "\u2243" }, "&simg;": { "codepoints": [10910], "characters": "\u2A9E" }, "&simgE;": { "codepoints": [10912], "characters": "\u2AA0" }, "&siml;": { "codepoints": [10909], "characters": "\u2A9D" }, "&simlE;": { "codepoints": [10911], "characters": "\u2A9F" }, "&simne;": { "codepoints": [8774], "characters": "\u2246" }, "&simplus;": { "codepoints": [10788], "characters": "\u2A24" }, "&simrarr;": { "codepoints": [10610], "characters": "\u2972" }, "&slarr;": { "codepoints": [8592], "characters": "\u2190" }, "&SmallCircle;": { "codepoints": [8728], "characters": "\u2218" }, "&smallsetminus;": { "codepoints": [8726], "characters": "\u2216" }, "&smashp;": { "codepoints": [10803], "characters": "\u2A33" }, "&smeparsl;": { "codepoints": [10724], "characters": "\u29E4" }, "&smid;": { "codepoints": [8739], "characters": "\u2223" }, "&smile;": { "codepoints": [8995], "characters": "\u2323" }, "&smt;": { "codepoints": [10922], "characters": "\u2AAA" }, "&smte;": { "codepoints": [10924], "characters": "\u2AAC" }, "&smtes;": { "codepoints": [10924, 65024], "characters": "\u2AAC\uFE00" }, "&SOFTcy;": { "codepoints": [1068], "characters": "\u042C" }, "&softcy;": { "codepoints": [1100], "characters": "\u044C" }, "&solbar;": { "codepoints": [9023], "characters": "\u233F" }, "&solb;": { "codepoints": [10692], "characters": "\u29C4" }, "&sol;": { "codepoints": [47], "characters": "\u002F" }, "&Sopf;": { "codepoints": [120138], "characters": "\uD835\uDD4A" }, "&sopf;": { "codepoints": [120164], "characters": "\uD835\uDD64" }, "&spades;": { "codepoints": [9824], "characters": "\u2660" }, "&spadesuit;": { "codepoints": [9824], "characters": "\u2660" }, "&spar;": { "codepoints": [8741], "characters": "\u2225" }, "&sqcap;": { "codepoints": [8851], "characters": "\u2293" }, "&sqcaps;": { "codepoints": [8851, 65024], "characters": "\u2293\uFE00" }, "&sqcup;": { "codepoints": [8852], "characters": "\u2294" }, "&sqcups;": { "codepoints": [8852, 65024], "characters": "\u2294\uFE00" }, "&Sqrt;": { "codepoints": [8730], "characters": "\u221A" }, "&sqsub;": { "codepoints": [8847], "characters": "\u228F" }, "&sqsube;": { "codepoints": [8849], "characters": "\u2291" }, "&sqsubset;": { "codepoints": [8847], "characters": "\u228F" }, "&sqsubseteq;": { "codepoints": [8849], "characters": "\u2291" }, "&sqsup;": { "codepoints": [8848], "characters": "\u2290" }, "&sqsupe;": { "codepoints": [8850], "characters": "\u2292" }, "&sqsupset;": { "codepoints": [8848], "characters": "\u2290" }, "&sqsupseteq;": { "codepoints": [8850], "characters": "\u2292" }, "&square;": { "codepoints": [9633], "characters": "\u25A1" }, "&Square;": { "codepoints": [9633], "characters": "\u25A1" }, "&SquareIntersection;": { "codepoints": [8851], "characters": "\u2293" }, "&SquareSubset;": { "codepoints": [8847], "characters": "\u228F" }, "&SquareSubsetEqual;": { "codepoints": [8849], "characters": "\u2291" }, "&SquareSuperset;": { "codepoints": [8848], "characters": "\u2290" }, "&SquareSupersetEqual;": { "codepoints": [8850], "characters": "\u2292" }, "&SquareUnion;": { "codepoints": [8852], "characters": "\u2294" }, "&squarf;": { "codepoints": [9642], "characters": "\u25AA" }, "&squ;": { "codepoints": [9633], "characters": "\u25A1" }, "&squf;": { "codepoints": [9642], "characters": "\u25AA" }, "&srarr;": { "codepoints": [8594], "characters": "\u2192" }, "&Sscr;": { "codepoints": [119982], "characters": "\uD835\uDCAE" }, "&sscr;": { "codepoints": [120008], "characters": "\uD835\uDCC8" }, "&ssetmn;": { "codepoints": [8726], "characters": "\u2216" }, "&ssmile;": { "codepoints": [8995], "characters": "\u2323" }, "&sstarf;": { "codepoints": [8902], "characters": "\u22C6" }, "&Star;": { "codepoints": [8902], "characters": "\u22C6" }, "&star;": { "codepoints": [9734], "characters": "\u2606" }, "&starf;": { "codepoints": [9733], "characters": "\u2605" }, "&straightepsilon;": { "codepoints": [1013], "characters": "\u03F5" }, "&straightphi;": { "codepoints": [981], "characters": "\u03D5" }, "&strns;": { "codepoints": [175], "characters": "\u00AF" }, "&sub;": { "codepoints": [8834], "characters": "\u2282" }, "&Sub;": { "codepoints": [8912], "characters": "\u22D0" }, "&subdot;": { "codepoints": [10941], "characters": "\u2ABD" }, "&subE;": { "codepoints": [10949], "characters": "\u2AC5" }, "&sube;": { "codepoints": [8838], "characters": "\u2286" }, "&subedot;": { "codepoints": [10947], "characters": "\u2AC3" }, "&submult;": { "codepoints": [10945], "characters": "\u2AC1" }, "&subnE;": { "codepoints": [10955], "characters": "\u2ACB" }, "&subne;": { "codepoints": [8842], "characters": "\u228A" }, "&subplus;": { "codepoints": [10943], "characters": "\u2ABF" }, "&subrarr;": { "codepoints": [10617], "characters": "\u2979" }, "&subset;": { "codepoints": [8834], "characters": "\u2282" }, "&Subset;": { "codepoints": [8912], "characters": "\u22D0" }, "&subseteq;": { "codepoints": [8838], "characters": "\u2286" }, "&subseteqq;": { "codepoints": [10949], "characters": "\u2AC5" }, "&SubsetEqual;": { "codepoints": [8838], "characters": "\u2286" }, "&subsetneq;": { "codepoints": [8842], "characters": "\u228A" }, "&subsetneqq;": { "codepoints": [10955], "characters": "\u2ACB" }, "&subsim;": { "codepoints": [10951], "characters": "\u2AC7" }, "&subsub;": { "codepoints": [10965], "characters": "\u2AD5" }, "&subsup;": { "codepoints": [10963], "characters": "\u2AD3" }, "&succapprox;": { "codepoints": [10936], "characters": "\u2AB8" }, "&succ;": { "codepoints": [8827], "characters": "\u227B" }, "&succcurlyeq;": { "codepoints": [8829], "characters": "\u227D" }, "&Succeeds;": { "codepoints": [8827], "characters": "\u227B" }, "&SucceedsEqual;": { "codepoints": [10928], "characters": "\u2AB0" }, "&SucceedsSlantEqual;": { "codepoints": [8829], "characters": "\u227D" }, "&SucceedsTilde;": { "codepoints": [8831], "characters": "\u227F" }, "&succeq;": { "codepoints": [10928], "characters": "\u2AB0" }, "&succnapprox;": { "codepoints": [10938], "characters": "\u2ABA" }, "&succneqq;": { "codepoints": [10934], "characters": "\u2AB6" }, "&succnsim;": { "codepoints": [8937], "characters": "\u22E9" }, "&succsim;": { "codepoints": [8831], "characters": "\u227F" }, "&SuchThat;": { "codepoints": [8715], "characters": "\u220B" }, "&sum;": { "codepoints": [8721], "characters": "\u2211" }, "&Sum;": { "codepoints": [8721], "characters": "\u2211" }, "&sung;": { "codepoints": [9834], "characters": "\u266A" }, "&sup1;": { "codepoints": [185], "characters": "\u00B9" }, "&sup1": { "codepoints": [185], "characters": "\u00B9" }, "&sup2;": { "codepoints": [178], "characters": "\u00B2" }, "&sup2": { "codepoints": [178], "characters": "\u00B2" }, "&sup3;": { "codepoints": [179], "characters": "\u00B3" }, "&sup3": { "codepoints": [179], "characters": "\u00B3" }, "&sup;": { "codepoints": [8835], "characters": "\u2283" }, "&Sup;": { "codepoints": [8913], "characters": "\u22D1" }, "&supdot;": { "codepoints": [10942], "characters": "\u2ABE" }, "&supdsub;": { "codepoints": [10968], "characters": "\u2AD8" }, "&supE;": { "codepoints": [10950], "characters": "\u2AC6" }, "&supe;": { "codepoints": [8839], "characters": "\u2287" }, "&supedot;": { "codepoints": [10948], "characters": "\u2AC4" }, "&Superset;": { "codepoints": [8835], "characters": "\u2283" }, "&SupersetEqual;": { "codepoints": [8839], "characters": "\u2287" }, "&suphsol;": { "codepoints": [10185], "characters": "\u27C9" }, "&suphsub;": { "codepoints": [10967], "characters": "\u2AD7" }, "&suplarr;": { "codepoints": [10619], "characters": "\u297B" }, "&supmult;": { "codepoints": [10946], "characters": "\u2AC2" }, "&supnE;": { "codepoints": [10956], "characters": "\u2ACC" }, "&supne;": { "codepoints": [8843], "characters": "\u228B" }, "&supplus;": { "codepoints": [10944], "characters": "\u2AC0" }, "&supset;": { "codepoints": [8835], "characters": "\u2283" }, "&Supset;": { "codepoints": [8913], "characters": "\u22D1" }, "&supseteq;": { "codepoints": [8839], "characters": "\u2287" }, "&supseteqq;": { "codepoints": [10950], "characters": "\u2AC6" }, "&supsetneq;": { "codepoints": [8843], "characters": "\u228B" }, "&supsetneqq;": { "codepoints": [10956], "characters": "\u2ACC" }, "&supsim;": { "codepoints": [10952], "characters": "\u2AC8" }, "&supsub;": { "codepoints": [10964], "characters": "\u2AD4" }, "&supsup;": { "codepoints": [10966], "characters": "\u2AD6" }, "&swarhk;": { "codepoints": [10534], "characters": "\u2926" }, "&swarr;": { "codepoints": [8601], "characters": "\u2199" }, "&swArr;": { "codepoints": [8665], "characters": "\u21D9" }, "&swarrow;": { "codepoints": [8601], "characters": "\u2199" }, "&swnwar;": { "codepoints": [10538], "characters": "\u292A" }, "&szlig;": { "codepoints": [223], "characters": "\u00DF" }, "&szlig": { "codepoints": [223], "characters": "\u00DF" }, "&Tab;": { "codepoints": [9], "characters": "\u0009" }, "&target;": { "codepoints": [8982], "characters": "\u2316" }, "&Tau;": { "codepoints": [932], "characters": "\u03A4" }, "&tau;": { "codepoints": [964], "characters": "\u03C4" }, "&tbrk;": { "codepoints": [9140], "characters": "\u23B4" }, "&Tcaron;": { "codepoints": [356], "characters": "\u0164" }, "&tcaron;": { "codepoints": [357], "characters": "\u0165" }, "&Tcedil;": { "codepoints": [354], "characters": "\u0162" }, "&tcedil;": { "codepoints": [355], "characters": "\u0163" }, "&Tcy;": { "codepoints": [1058], "characters": "\u0422" }, "&tcy;": { "codepoints": [1090], "characters": "\u0442" }, "&tdot;": { "codepoints": [8411], "characters": "\u20DB" }, "&telrec;": { "codepoints": [8981], "characters": "\u2315" }, "&Tfr;": { "codepoints": [120087], "characters": "\uD835\uDD17" }, "&tfr;": { "codepoints": [120113], "characters": "\uD835\uDD31" }, "&there4;": { "codepoints": [8756], "characters": "\u2234" }, "&therefore;": { "codepoints": [8756], "characters": "\u2234" }, "&Therefore;": { "codepoints": [8756], "characters": "\u2234" }, "&Theta;": { "codepoints": [920], "characters": "\u0398" }, "&theta;": { "codepoints": [952], "characters": "\u03B8" }, "&thetasym;": { "codepoints": [977], "characters": "\u03D1" }, "&thetav;": { "codepoints": [977], "characters": "\u03D1" }, "&thickapprox;": { "codepoints": [8776], "characters": "\u2248" }, "&thicksim;": { "codepoints": [8764], "characters": "\u223C" }, "&ThickSpace;": { "codepoints": [8287, 8202], "characters": "\u205F\u200A" }, "&ThinSpace;": { "codepoints": [8201], "characters": "\u2009" }, "&thinsp;": { "codepoints": [8201], "characters": "\u2009" }, "&thkap;": { "codepoints": [8776], "characters": "\u2248" }, "&thksim;": { "codepoints": [8764], "characters": "\u223C" }, "&THORN;": { "codepoints": [222], "characters": "\u00DE" }, "&THORN": { "codepoints": [222], "characters": "\u00DE" }, "&thorn;": { "codepoints": [254], "characters": "\u00FE" }, "&thorn": { "codepoints": [254], "characters": "\u00FE" }, "&tilde;": { "codepoints": [732], "characters": "\u02DC" }, "&Tilde;": { "codepoints": [8764], "characters": "\u223C" }, "&TildeEqual;": { "codepoints": [8771], "characters": "\u2243" }, "&TildeFullEqual;": { "codepoints": [8773], "characters": "\u2245" }, "&TildeTilde;": { "codepoints": [8776], "characters": "\u2248" }, "&timesbar;": { "codepoints": [10801], "characters": "\u2A31" }, "&timesb;": { "codepoints": [8864], "characters": "\u22A0" }, "&times;": { "codepoints": [215], "characters": "\u00D7" }, "&times": { "codepoints": [215], "characters": "\u00D7" }, "&timesd;": { "codepoints": [10800], "characters": "\u2A30" }, "&tint;": { "codepoints": [8749], "characters": "\u222D" }, "&toea;": { "codepoints": [10536], "characters": "\u2928" }, "&topbot;": { "codepoints": [9014], "characters": "\u2336" }, "&topcir;": { "codepoints": [10993], "characters": "\u2AF1" }, "&top;": { "codepoints": [8868], "characters": "\u22A4" }, "&Topf;": { "codepoints": [120139], "characters": "\uD835\uDD4B" }, "&topf;": { "codepoints": [120165], "characters": "\uD835\uDD65" }, "&topfork;": { "codepoints": [10970], "characters": "\u2ADA" }, "&tosa;": { "codepoints": [10537], "characters": "\u2929" }, "&tprime;": { "codepoints": [8244], "characters": "\u2034" }, "&trade;": { "codepoints": [8482], "characters": "\u2122" }, "&TRADE;": { "codepoints": [8482], "characters": "\u2122" }, "&triangle;": { "codepoints": [9653], "characters": "\u25B5" }, "&triangledown;": { "codepoints": [9663], "characters": "\u25BF" }, "&triangleleft;": { "codepoints": [9667], "characters": "\u25C3" }, "&trianglelefteq;": { "codepoints": [8884], "characters": "\u22B4" }, "&triangleq;": { "codepoints": [8796], "characters": "\u225C" }, "&triangleright;": { "codepoints": [9657], "characters": "\u25B9" }, "&trianglerighteq;": { "codepoints": [8885], "characters": "\u22B5" }, "&tridot;": { "codepoints": [9708], "characters": "\u25EC" }, "&trie;": { "codepoints": [8796], "characters": "\u225C" }, "&triminus;": { "codepoints": [10810], "characters": "\u2A3A" }, "&TripleDot;": { "codepoints": [8411], "characters": "\u20DB" }, "&triplus;": { "codepoints": [10809], "characters": "\u2A39" }, "&trisb;": { "codepoints": [10701], "characters": "\u29CD" }, "&tritime;": { "codepoints": [10811], "characters": "\u2A3B" }, "&trpezium;": { "codepoints": [9186], "characters": "\u23E2" }, "&Tscr;": { "codepoints": [119983], "characters": "\uD835\uDCAF" }, "&tscr;": { "codepoints": [120009], "characters": "\uD835\uDCC9" }, "&TScy;": { "codepoints": [1062], "characters": "\u0426" }, "&tscy;": { "codepoints": [1094], "characters": "\u0446" }, "&TSHcy;": { "codepoints": [1035], "characters": "\u040B" }, "&tshcy;": { "codepoints": [1115], "characters": "\u045B" }, "&Tstrok;": { "codepoints": [358], "characters": "\u0166" }, "&tstrok;": { "codepoints": [359], "characters": "\u0167" }, "&twixt;": { "codepoints": [8812], "characters": "\u226C" }, "&twoheadleftarrow;": { "codepoints": [8606], "characters": "\u219E" }, "&twoheadrightarrow;": { "codepoints": [8608], "characters": "\u21A0" }, "&Uacute;": { "codepoints": [218], "characters": "\u00DA" }, "&Uacute": { "codepoints": [218], "characters": "\u00DA" }, "&uacute;": { "codepoints": [250], "characters": "\u00FA" }, "&uacute": { "codepoints": [250], "characters": "\u00FA" }, "&uarr;": { "codepoints": [8593], "characters": "\u2191" }, "&Uarr;": { "codepoints": [8607], "characters": "\u219F" }, "&uArr;": { "codepoints": [8657], "characters": "\u21D1" }, "&Uarrocir;": { "codepoints": [10569], "characters": "\u2949" }, "&Ubrcy;": { "codepoints": [1038], "characters": "\u040E" }, "&ubrcy;": { "codepoints": [1118], "characters": "\u045E" }, "&Ubreve;": { "codepoints": [364], "characters": "\u016C" }, "&ubreve;": { "codepoints": [365], "characters": "\u016D" }, "&Ucirc;": { "codepoints": [219], "characters": "\u00DB" }, "&Ucirc": { "codepoints": [219], "characters": "\u00DB" }, "&ucirc;": { "codepoints": [251], "characters": "\u00FB" }, "&ucirc": { "codepoints": [251], "characters": "\u00FB" }, "&Ucy;": { "codepoints": [1059], "characters": "\u0423" }, "&ucy;": { "codepoints": [1091], "characters": "\u0443" }, "&udarr;": { "codepoints": [8645], "characters": "\u21C5" }, "&Udblac;": { "codepoints": [368], "characters": "\u0170" }, "&udblac;": { "codepoints": [369], "characters": "\u0171" }, "&udhar;": { "codepoints": [10606], "characters": "\u296E" }, "&ufisht;": { "codepoints": [10622], "characters": "\u297E" }, "&Ufr;": { "codepoints": [120088], "characters": "\uD835\uDD18" }, "&ufr;": { "codepoints": [120114], "characters": "\uD835\uDD32" }, "&Ugrave;": { "codepoints": [217], "characters": "\u00D9" }, "&Ugrave": { "codepoints": [217], "characters": "\u00D9" }, "&ugrave;": { "codepoints": [249], "characters": "\u00F9" }, "&ugrave": { "codepoints": [249], "characters": "\u00F9" }, "&uHar;": { "codepoints": [10595], "characters": "\u2963" }, "&uharl;": { "codepoints": [8639], "characters": "\u21BF" }, "&uharr;": { "codepoints": [8638], "characters": "\u21BE" }, "&uhblk;": { "codepoints": [9600], "characters": "\u2580" }, "&ulcorn;": { "codepoints": [8988], "characters": "\u231C" }, "&ulcorner;": { "codepoints": [8988], "characters": "\u231C" }, "&ulcrop;": { "codepoints": [8975], "characters": "\u230F" }, "&ultri;": { "codepoints": [9720], "characters": "\u25F8" }, "&Umacr;": { "codepoints": [362], "characters": "\u016A" }, "&umacr;": { "codepoints": [363], "characters": "\u016B" }, "&uml;": { "codepoints": [168], "characters": "\u00A8" }, "&uml": { "codepoints": [168], "characters": "\u00A8" }, "&UnderBar;": { "codepoints": [95], "characters": "\u005F" }, "&UnderBrace;": { "codepoints": [9183], "characters": "\u23DF" }, "&UnderBracket;": { "codepoints": [9141], "characters": "\u23B5" }, "&UnderParenthesis;": { "codepoints": [9181], "characters": "\u23DD" }, "&Union;": { "codepoints": [8899], "characters": "\u22C3" }, "&UnionPlus;": { "codepoints": [8846], "characters": "\u228E" }, "&Uogon;": { "codepoints": [370], "characters": "\u0172" }, "&uogon;": { "codepoints": [371], "characters": "\u0173" }, "&Uopf;": { "codepoints": [120140], "characters": "\uD835\uDD4C" }, "&uopf;": { "codepoints": [120166], "characters": "\uD835\uDD66" }, "&UpArrowBar;": { "codepoints": [10514], "characters": "\u2912" }, "&uparrow;": { "codepoints": [8593], "characters": "\u2191" }, "&UpArrow;": { "codepoints": [8593], "characters": "\u2191" }, "&Uparrow;": { "codepoints": [8657], "characters": "\u21D1" }, "&UpArrowDownArrow;": { "codepoints": [8645], "characters": "\u21C5" }, "&updownarrow;": { "codepoints": [8597], "characters": "\u2195" }, "&UpDownArrow;": { "codepoints": [8597], "characters": "\u2195" }, "&Updownarrow;": { "codepoints": [8661], "characters": "\u21D5" }, "&UpEquilibrium;": { "codepoints": [10606], "characters": "\u296E" }, "&upharpoonleft;": { "codepoints": [8639], "characters": "\u21BF" }, "&upharpoonright;": { "codepoints": [8638], "characters": "\u21BE" }, "&uplus;": { "codepoints": [8846], "characters": "\u228E" }, "&UpperLeftArrow;": { "codepoints": [8598], "characters": "\u2196" }, "&UpperRightArrow;": { "codepoints": [8599], "characters": "\u2197" }, "&upsi;": { "codepoints": [965], "characters": "\u03C5" }, "&Upsi;": { "codepoints": [978], "characters": "\u03D2" }, "&upsih;": { "codepoints": [978], "characters": "\u03D2" }, "&Upsilon;": { "codepoints": [933], "characters": "\u03A5" }, "&upsilon;": { "codepoints": [965], "characters": "\u03C5" }, "&UpTeeArrow;": { "codepoints": [8613], "characters": "\u21A5" }, "&UpTee;": { "codepoints": [8869], "characters": "\u22A5" }, "&upuparrows;": { "codepoints": [8648], "characters": "\u21C8" }, "&urcorn;": { "codepoints": [8989], "characters": "\u231D" }, "&urcorner;": { "codepoints": [8989], "characters": "\u231D" }, "&urcrop;": { "codepoints": [8974], "characters": "\u230E" }, "&Uring;": { "codepoints": [366], "characters": "\u016E" }, "&uring;": { "codepoints": [367], "characters": "\u016F" }, "&urtri;": { "codepoints": [9721], "characters": "\u25F9" }, "&Uscr;": { "codepoints": [119984], "characters": "\uD835\uDCB0" }, "&uscr;": { "codepoints": [120010], "characters": "\uD835\uDCCA" }, "&utdot;": { "codepoints": [8944], "characters": "\u22F0" }, "&Utilde;": { "codepoints": [360], "characters": "\u0168" }, "&utilde;": { "codepoints": [361], "characters": "\u0169" }, "&utri;": { "codepoints": [9653], "characters": "\u25B5" }, "&utrif;": { "codepoints": [9652], "characters": "\u25B4" }, "&uuarr;": { "codepoints": [8648], "characters": "\u21C8" }, "&Uuml;": { "codepoints": [220], "characters": "\u00DC" }, "&Uuml": { "codepoints": [220], "characters": "\u00DC" }, "&uuml;": { "codepoints": [252], "characters": "\u00FC" }, "&uuml": { "codepoints": [252], "characters": "\u00FC" }, "&uwangle;": { "codepoints": [10663], "characters": "\u29A7" }, "&vangrt;": { "codepoints": [10652], "characters": "\u299C" }, "&varepsilon;": { "codepoints": [1013], "characters": "\u03F5" }, "&varkappa;": { "codepoints": [1008], "characters": "\u03F0" }, "&varnothing;": { "codepoints": [8709], "characters": "\u2205" }, "&varphi;": { "codepoints": [981], "characters": "\u03D5" }, "&varpi;": { "codepoints": [982], "characters": "\u03D6" }, "&varpropto;": { "codepoints": [8733], "characters": "\u221D" }, "&varr;": { "codepoints": [8597], "characters": "\u2195" }, "&vArr;": { "codepoints": [8661], "characters": "\u21D5" }, "&varrho;": { "codepoints": [1009], "characters": "\u03F1" }, "&varsigma;": { "codepoints": [962], "characters": "\u03C2" }, "&varsubsetneq;": { "codepoints": [8842, 65024], "characters": "\u228A\uFE00" }, "&varsubsetneqq;": { "codepoints": [10955, 65024], "characters": "\u2ACB\uFE00" }, "&varsupsetneq;": { "codepoints": [8843, 65024], "characters": "\u228B\uFE00" }, "&varsupsetneqq;": { "codepoints": [10956, 65024], "characters": "\u2ACC\uFE00" }, "&vartheta;": { "codepoints": [977], "characters": "\u03D1" }, "&vartriangleleft;": { "codepoints": [8882], "characters": "\u22B2" }, "&vartriangleright;": { "codepoints": [8883], "characters": "\u22B3" }, "&vBar;": { "codepoints": [10984], "characters": "\u2AE8" }, "&Vbar;": { "codepoints": [10987], "characters": "\u2AEB" }, "&vBarv;": { "codepoints": [10985], "characters": "\u2AE9" }, "&Vcy;": { "codepoints": [1042], "characters": "\u0412" }, "&vcy;": { "codepoints": [1074], "characters": "\u0432" }, "&vdash;": { "codepoints": [8866], "characters": "\u22A2" }, "&vDash;": { "codepoints": [8872], "characters": "\u22A8" }, "&Vdash;": { "codepoints": [8873], "characters": "\u22A9" }, "&VDash;": { "codepoints": [8875], "characters": "\u22AB" }, "&Vdashl;": { "codepoints": [10982], "characters": "\u2AE6" }, "&veebar;": { "codepoints": [8891], "characters": "\u22BB" }, "&vee;": { "codepoints": [8744], "characters": "\u2228" }, "&Vee;": { "codepoints": [8897], "characters": "\u22C1" }, "&veeeq;": { "codepoints": [8794], "characters": "\u225A" }, "&vellip;": { "codepoints": [8942], "characters": "\u22EE" }, "&verbar;": { "codepoints": [124], "characters": "\u007C" }, "&Verbar;": { "codepoints": [8214], "characters": "\u2016" }, "&vert;": { "codepoints": [124], "characters": "\u007C" }, "&Vert;": { "codepoints": [8214], "characters": "\u2016" }, "&VerticalBar;": { "codepoints": [8739], "characters": "\u2223" }, "&VerticalLine;": { "codepoints": [124], "characters": "\u007C" }, "&VerticalSeparator;": { "codepoints": [10072], "characters": "\u2758" }, "&VerticalTilde;": { "codepoints": [8768], "characters": "\u2240" }, "&VeryThinSpace;": { "codepoints": [8202], "characters": "\u200A" }, "&Vfr;": { "codepoints": [120089], "characters": "\uD835\uDD19" }, "&vfr;": { "codepoints": [120115], "characters": "\uD835\uDD33" }, "&vltri;": { "codepoints": [8882], "characters": "\u22B2" }, "&vnsub;": { "codepoints": [8834, 8402], "characters": "\u2282\u20D2" }, "&vnsup;": { "codepoints": [8835, 8402], "characters": "\u2283\u20D2" }, "&Vopf;": { "codepoints": [120141], "characters": "\uD835\uDD4D" }, "&vopf;": { "codepoints": [120167], "characters": "\uD835\uDD67" }, "&vprop;": { "codepoints": [8733], "characters": "\u221D" }, "&vrtri;": { "codepoints": [8883], "characters": "\u22B3" }, "&Vscr;": { "codepoints": [119985], "characters": "\uD835\uDCB1" }, "&vscr;": { "codepoints": [120011], "characters": "\uD835\uDCCB" }, "&vsubnE;": { "codepoints": [10955, 65024], "characters": "\u2ACB\uFE00" }, "&vsubne;": { "codepoints": [8842, 65024], "characters": "\u228A\uFE00" }, "&vsupnE;": { "codepoints": [10956, 65024], "characters": "\u2ACC\uFE00" }, "&vsupne;": { "codepoints": [8843, 65024], "characters": "\u228B\uFE00" }, "&Vvdash;": { "codepoints": [8874], "characters": "\u22AA" }, "&vzigzag;": { "codepoints": [10650], "characters": "\u299A" }, "&Wcirc;": { "codepoints": [372], "characters": "\u0174" }, "&wcirc;": { "codepoints": [373], "characters": "\u0175" }, "&wedbar;": { "codepoints": [10847], "characters": "\u2A5F" }, "&wedge;": { "codepoints": [8743], "characters": "\u2227" }, "&Wedge;": { "codepoints": [8896], "characters": "\u22C0" }, "&wedgeq;": { "codepoints": [8793], "characters": "\u2259" }, "&weierp;": { "codepoints": [8472], "characters": "\u2118" }, "&Wfr;": { "codepoints": [120090], "characters": "\uD835\uDD1A" }, "&wfr;": { "codepoints": [120116], "characters": "\uD835\uDD34" }, "&Wopf;": { "codepoints": [120142], "characters": "\uD835\uDD4E" }, "&wopf;": { "codepoints": [120168], "characters": "\uD835\uDD68" }, "&wp;": { "codepoints": [8472], "characters": "\u2118" }, "&wr;": { "codepoints": [8768], "characters": "\u2240" }, "&wreath;": { "codepoints": [8768], "characters": "\u2240" }, "&Wscr;": { "codepoints": [119986], "characters": "\uD835\uDCB2" }, "&wscr;": { "codepoints": [120012], "characters": "\uD835\uDCCC" }, "&xcap;": { "codepoints": [8898], "characters": "\u22C2" }, "&xcirc;": { "codepoints": [9711], "characters": "\u25EF" }, "&xcup;": { "codepoints": [8899], "characters": "\u22C3" }, "&xdtri;": { "codepoints": [9661], "characters": "\u25BD" }, "&Xfr;": { "codepoints": [120091], "characters": "\uD835\uDD1B" }, "&xfr;": { "codepoints": [120117], "characters": "\uD835\uDD35" }, "&xharr;": { "codepoints": [10231], "characters": "\u27F7" }, "&xhArr;": { "codepoints": [10234], "characters": "\u27FA" }, "&Xi;": { "codepoints": [926], "characters": "\u039E" }, "&xi;": { "codepoints": [958], "characters": "\u03BE" }, "&xlarr;": { "codepoints": [10229], "characters": "\u27F5" }, "&xlArr;": { "codepoints": [10232], "characters": "\u27F8" }, "&xmap;": { "codepoints": [10236], "characters": "\u27FC" }, "&xnis;": { "codepoints": [8955], "characters": "\u22FB" }, "&xodot;": { "codepoints": [10752], "characters": "\u2A00" }, "&Xopf;": { "codepoints": [120143], "characters": "\uD835\uDD4F" }, "&xopf;": { "codepoints": [120169], "characters": "\uD835\uDD69" }, "&xoplus;": { "codepoints": [10753], "characters": "\u2A01" }, "&xotime;": { "codepoints": [10754], "characters": "\u2A02" }, "&xrarr;": { "codepoints": [10230], "characters": "\u27F6" }, "&xrArr;": { "codepoints": [10233], "characters": "\u27F9" }, "&Xscr;": { "codepoints": [119987], "characters": "\uD835\uDCB3" }, "&xscr;": { "codepoints": [120013], "characters": "\uD835\uDCCD" }, "&xsqcup;": { "codepoints": [10758], "characters": "\u2A06" }, "&xuplus;": { "codepoints": [10756], "characters": "\u2A04" }, "&xutri;": { "codepoints": [9651], "characters": "\u25B3" }, "&xvee;": { "codepoints": [8897], "characters": "\u22C1" }, "&xwedge;": { "codepoints": [8896], "characters": "\u22C0" }, "&Yacute;": { "codepoints": [221], "characters": "\u00DD" }, "&Yacute": { "codepoints": [221], "characters": "\u00DD" }, "&yacute;": { "codepoints": [253], "characters": "\u00FD" }, "&yacute": { "codepoints": [253], "characters": "\u00FD" }, "&YAcy;": { "codepoints": [1071], "characters": "\u042F" }, "&yacy;": { "codepoints": [1103], "characters": "\u044F" }, "&Ycirc;": { "codepoints": [374], "characters": "\u0176" }, "&ycirc;": { "codepoints": [375], "characters": "\u0177" }, "&Ycy;": { "codepoints": [1067], "characters": "\u042B" }, "&ycy;": { "codepoints": [1099], "characters": "\u044B" }, "&yen;": { "codepoints": [165], "characters": "\u00A5" }, "&yen": { "codepoints": [165], "characters": "\u00A5" }, "&Yfr;": { "codepoints": [120092], "characters": "\uD835\uDD1C" }, "&yfr;": { "codepoints": [120118], "characters": "\uD835\uDD36" }, "&YIcy;": { "codepoints": [1031], "characters": "\u0407" }, "&yicy;": { "codepoints": [1111], "characters": "\u0457" }, "&Yopf;": { "codepoints": [120144], "characters": "\uD835\uDD50" }, "&yopf;": { "codepoints": [120170], "characters": "\uD835\uDD6A" }, "&Yscr;": { "codepoints": [119988], "characters": "\uD835\uDCB4" }, "&yscr;": { "codepoints": [120014], "characters": "\uD835\uDCCE" }, "&YUcy;": { "codepoints": [1070], "characters": "\u042E" }, "&yucy;": { "codepoints": [1102], "characters": "\u044E" }, "&yuml;": { "codepoints": [255], "characters": "\u00FF" }, "&yuml": { "codepoints": [255], "characters": "\u00FF" }, "&Yuml;": { "codepoints": [376], "characters": "\u0178" }, "&Zacute;": { "codepoints": [377], "characters": "\u0179" }, "&zacute;": { "codepoints": [378], "characters": "\u017A" }, "&Zcaron;": { "codepoints": [381], "characters": "\u017D" }, "&zcaron;": { "codepoints": [382], "characters": "\u017E" }, "&Zcy;": { "codepoints": [1047], "characters": "\u0417" }, "&zcy;": { "codepoints": [1079], "characters": "\u0437" }, "&Zdot;": { "codepoints": [379], "characters": "\u017B" }, "&zdot;": { "codepoints": [380], "characters": "\u017C" }, "&zeetrf;": { "codepoints": [8488], "characters": "\u2128" }, "&ZeroWidthSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&Zeta;": { "codepoints": [918], "characters": "\u0396" }, "&zeta;": { "codepoints": [950], "characters": "\u03B6" }, "&zfr;": { "codepoints": [120119], "characters": "\uD835\uDD37" }, "&Zfr;": { "codepoints": [8488], "characters": "\u2128" }, "&ZHcy;": { "codepoints": [1046], "characters": "\u0416" }, "&zhcy;": { "codepoints": [1078], "characters": "\u0436" }, "&zigrarr;": { "codepoints": [8669], "characters": "\u21DD" }, "&zopf;": { "codepoints": [120171], "characters": "\uD835\uDD6B" }, "&Zopf;": { "codepoints": [8484], "characters": "\u2124" }, "&Zscr;": { "codepoints": [119989], "characters": "\uD835\uDCB5" }, "&zscr;": { "codepoints": [120015], "characters": "\uD835\uDCCF" }, "&zwj;": { "codepoints": [8205], "characters": "\u200D" }, "&zwnj;": { "codepoints": [8204], "characters": "\u200C" } };

// Helper functions.
//

function isDigit(ch) {
  // From '0' to '9'.
  return ch >= 0x30 && ch <= 0x39;
}

function isHexDigit(ch) {
  // 0..9, A..F, a..f
  return isDigit(ch) || (ch >= 0x41 && ch <= 0x46) || (ch >= 0x61 && ch >= 0x66);
}

function isUppercaseAscii(ch) {
  // A-Z
  return ch >= 0x41 && ch <= 0x5a;
}

function isLowercaseAscii(ch) {
  // a-z
  return ch >= 0x61 && ch <= 0x7a;
}

if (!String.fromCodePoint) {
    /*!
    * ES6 Unicode Shims 0.1
    * © 2012 Steven Levithan <http://slevithan.com/>
    * MIT License
    */
    String.fromCodePoint = function fromCodePoint () {
        var chars = [], point, offset, units, i;
        for (i = 0; i < arguments.length; ++i) {
            point = arguments[i];
            offset = point - 0x10000;
            units = point > 0xFFFF ? [0xD800 + (offset >> 10), 
                                      0xDC00 + (offset & 0x3FF)] : [point];
            chars.push(String.fromCharCode.apply(null, units));
        }
        return chars.join("");
    }
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
}(completer));

return exports;
}));
(function (global, factory) {
  // Universal Module Definition (UMD) to support AMD, Node.js,
  // and plain browser loading.
  if (typeof exports === 'object') {
    module.exports = factory(global);
  } else if (typeof define === 'function' && define.amd) {
    define(['global'], factory);
  } else {
    global.AulxUI = factory(global);
  }
}(this, function (global) {
var exports = {};
var parserWorker = null;

// Wrapper around the parser (which is located inside a worker).
// We don't actually use options,
// but we know to set loc to true inside the worker.
function parseCont(source, options, cb) {
  parserWorker.onmessage = function parserWorkerMessageListener(event) {
    cb(event.data);
  };
  parserWorker.postMessage(source);
}

var NUM_VISIBLE_COMPLETIONS = 10;
var DELAYED_POPUP = 0;
var EDITOR_MODES = {
  JAVASCRIPT: 0,
  CSS: 1,
  HTML: 2,
};

// AulxUI object.
// This constructor handles the popup and creates the necessary methods so that
// other objects can inherit this object to create text editor specific
// implementations.
//
// Parameters:
// - aEditor: The Source Editor instance to target.
//   It should have a `.focus()` method.
// - aOptions: Properties for tuning certain defaults:
//   - numVisibleCompletions (defaults to NUM_VISIBLE_COMPLETIONS): number
//     of visible completions with respect to all possible completions.
//   - cssClass (defaults to "autocomplete"): CSS class used to style the
//     autocompletion popup.
//   - mode (defaults to EDITOR_MODES.JAVASCRIPT): The mode (or language) of the
//     editor.
//
//  See NUM_VISIBLE_COMPLETIONS
function AulxUI(aEditor, aOptions) {
  aOptions = aOptions || {};
  this.editor = aEditor;
  this.document = global.document;

  this.mode = aOptions.mode;
  if (this.mode == EDITOR_MODES.JAVASCRIPT) {
    // Initiate Aulx in JS mode.
    if (aOptions.parserWorker) {
      try {
        parserWorker = new Worker(aOptions.parserWorker);
        this.aulx = new Aulx.JS({
          global: global,
          parse: parseCont,
          parserContinuation: true,
          maxEntries : aOptions.numVisibleCompletions || NUM_VISIBLE_COMPLETIONS
        });
      } catch(e) {
        console.error('Aulx tried to use a parser Web Worker.');
        throw e;
      }
    } else {
      // If parser is not available somehow, fallback to sync parsing version of
      // Aulx.JS()
      this.aulx = new Aulx.JS({
        global: global,
        parse: esprima.parse
      });
    }
  } else if (this.mode == EDITOR_MODES.CSS) {
    this.aulx = new Aulx.CSS({
      global: global
    });
  }

  // Bind!
  this._onUp = this._onUp.bind(this);
  this._onDown = this._onDown.bind(this);
  this._onLeft = this._onLeft.bind(this);
  this._onRight = this._onRight.bind(this);
  this._onEsc = this._onEsc.bind(this);
  this._onTab = this._onTab.bind(this);
  this._onShiftTab = this._onShiftTab.bind(this);
  this._onEditorKeyPress = this._onEditorKeyPress.bind(this);
  this._onEditorSelection = this._onEditorSelection.bind(this);
  // Create the popup.
  var options = {
    fontSize: 14,
    autoSelect: true,
    noFocus: true,
    position: "below",
    className: aOptions.cssClass,
    maxVisibleRows: aOptions.numVisibleCompletions || NUM_VISIBLE_COMPLETIONS,
    onClick: this._completionClick.bind(this),
    onSelect: this._completionClick.bind(this)
  };
  this.popup = new Popup(this.document, options);
}

AulxUI.prototype = {

  // The following are useful DOM elements.
  editor: null,
  document: null,
  popup: null,

  // While in the process of autocompleting, we are inserting text (this
  // variable is used to avoid race conditions.
  _insertingText: 0,
  // This lets us know if we should cycle on tab press or only insert the first
  // time.
  _insertedOnce: false,

  _completion: null,
  _line: 0,
  _start: null,
  _end: null,

  _delayedPopup: null,

  runCompleters: function AUI_runCompleters() {
    this._completion = this.aulx.complete(this.getValue(), this.getCursor());
  },

  // Show the completions that are asked for.
  displayCompletion: function AUI_displayCompletion() {
    if (this._completion == null) {
      this.runCompleters();
    }
    var completions = this._completion.candidates;

    // Show the popup.
    // We don't complete on a selection of text.
    // We don't show the completion popup without any completion.
    if (this.isSomethingSelected() || completions.length < 1) {
      this.hidePopup();
      return;
    }

    // Set the items in the popup
    this.popup.setItems(completions);

    // Get the coordinates to open the popup at
    var pos = this.getCursorPosition();
    pos.left -= (completions[0].prefix.length * (this.getCharWidth()|0) + 4);
    this.popup.openPopup(pos.left, pos.top);
  },

  // Specific autocompletion-only keys.
  _onUp: function AUI__onUp() {
    // ↑ key.
    if (this.popup.isOpen()) {
      this.popup.selectPreviousItem();
      this._UpDown = true;
      this._insertedOnce = false;
    }
    else {
      this.doDefaultAction("Up");
    }
  },
  _onDown: function AUI__onDown() {
    // ↓ key.
    if (this.popup.isOpen()) {
      this.popup.selectNextItem();
      this._UpDown = true;
      this._insertedOnce = false;
    }
    else {
      this.doDefaultAction("Down");
    }
  },
  _onLeft: function AUI__onLeft() {
    // ← key.
    this.hidePopup();
    this.doDefaultAction("Left");
  },
  _onRight: function AUI__onRight() {
    // → key.
    this.hidePopup();
    this.doDefaultAction("Right");
  },
  _onEsc: function AUI__onEsc() {
    // ESC key.
    if (this.popup.isOpen()) {
      this.removeCompletion();
      this.hidePopup();
    }
    else {
      this.doDefaultAction("Esc");
    }
  },
  _onTab: function AUI__onTab() {
    // Tab key.
    if (!this._insertedOnce && this.popup.isOpen()) {
      this._UpDown = false;
      this.insert(this.popup.getSelectedItem());
      if (this.popup.itemCount() == 1) {
        this.hidePopup();
      }
      return;
    }
    if (!this.isSomethingSelected() && this.popup.isOpen()) {
      this._UpDown = false;
      this.popup.inverted ? this.popup.selectPreviousItem()
                          : this.popup.selectNextItem();
      this.insert(this.popup.getSelectedItem());
    }
    else {
      this.doDefaultAction("Tab");
    }
  },
  _onShiftTab: function AUI__onShiftTab() {
    // Shift+Tab key.
    if (!this.isSomethingSelected() && this.popup.isOpen()) {
      this.popup.inverted ? this.popup.selectNextItem()
                          : this.popup.selectPreviousItem();
      this.insert(this.popup.getSelectedItem());
      if (this.popup.itemCount() == 1) {
        this.hidePopup();
      }
    }
    else {
      this.doDefaultAction("ShiftTab");
    }
  },

  _onEditorKeyPress: function AUI__onEditorKeyPress(aEvent) {
    if (!this._insertingText) {
      this.hidePopup();
      clearTimeout(this._delayedPopup);
      this._delayedPopup = setTimeout(this.displayCompletion.bind(this),
                                      DELAYED_POPUP);
    } else {
      this._insertingText = false;
    }
  },

  _onEditorSelection: function AUI__onEditorSelection() {
    // If the line changed, the static analysis is worth updating.
    var lineno = this.getCursor().line;
    if (this._line !== lineno) {
      this.aulx.fireStaticAnalysis(this.getValue(), this.getCursor());
      this._line = lineno;
      this.hidePopup();
    }
  },

  _completionClick: function AUI__completionClick(e) {
    switch(e.keyCode || e.button) {
      case 14: // ENTER
      case 13: // RETURN
      case 0: // left mouse button
        e.stopPropagation();
        e.preventDefault();
        this.insert(this.popup.getSelectedItem());
        this.hidePopup();
        this.editor.focus();
    }
  },

  // Make the completion popup invisible.
  hidePopup: function AUI_hidePopup() {
    this.popup.hidePopup();
    this._completion = null;
    this._insertedOnce = false;
    this._start = null;
    this._UpDown = false;
  },

  // Insert a possible autocompletion in the editor.
  //
  // aItem: The completion item to insert inline.
  // Should be in the following format:
  //   {
  //     display: // the full string that is being inserted
  //     prefix:  // the initial part of text which will be replaced with
  //              // the display string.
  //   }
  insert: function AUI_insert(aItem) {
    this._insertingText = true;
    if (!this._insertedOnce && !this._start) {
      var temp = this.getCursor();
      this._start = {
        line: temp.line,
        ch: Math.max(temp.ch - aItem.prefix.length, 0)
      };
      this._end = {line: temp.line, ch: temp.ch};
    }
    this.replaceRange(aItem.display, this._start, this._end);
    this._insertedOnce = true && !this._UpDown;
    var numLines = 0, isol, i = 0;
    for (; i < aItem.display.length; i++) {
      if (aItem.display.charCodeAt(i) === 10) {
        // Newline
        numLines++;
        isol = i + 1;   // index of start of line.
      }
    }
    this._end.line = this._start.line + numLines;
    if (numLines > 0) {
      this._end.ch = this._start.ch + aItem.display.length - isol;
    }
    else {
      this._end.ch = this._start.ch + aItem.display.length;
    }
  },

  // Remove the inserted completion object and stores it to originally placed
  // text.
  removeCompletion: function AUI_removeCompletion() {
    if (!this._insertedOnce) {
      return;
    }
    var item = this.popup.getSelectedItem();
    this.insert({display: item.prefix, prefix: item.prefix});
    this._insertedOnce = false;
  }
};

exports.AulxUI = AulxUI;
/**
 * Initial author: Girish Sharma <scrapmachines@gmail.com>
 * https://github.com/scrapmac/snippets/blob/master/selectors.js/selectors.js
 */
// IE fix for not having addEventListener and removeEventListener
if (!window.addEventListener) {
  window.addEventListener = function (type, listener, useCapture) {
    attachEvent('on' + type, function() { listener(event) });
  }
}

if (!window.removeEventListener) {
  window.removeEventListener = function (type, listener, useCapture) {
    detachEvent('on' + type, function() { listener(event) });
  }
}

// Maximum number of selector suggestions shown in the panel.
var MAX_VISIBLE_SUGGESTIONS = 15;

/**
 * Autocomplete popup UI implementation.
 *
 * @constructor
 * @param Document aDocument
 *        The document you want the popup attached to.
 * @param Object aOptions
 *        An object consiting any of the following options:
 *        - font {String} The font that is being used in the input box.
 *        - fontSize {Number} The font size that is being used in the input box.
 *        - className {String} The class that you want the popup to have.
 *        - position {String} The preffered position of the popup (above or below).
 *        - maxVisibleRows {Number} Maximum number of visible rows.
 *        - noFocus {Boolean} true if you want the popup to never get focus.
 *        - autoSelect {Boolean} Boolean to allow the first entry of the popup
 *                     panel to be automatically selected when the popup shows.
 *        - onSelect {String} The select event handler for the popup.
 *        - onClick {String} The click event handler for the popup.
 *        - onKeypress {String} The keypress event handler for the popup.
 */
var Popup = function Popup(aDocument, aOptions) {
  this.document = aDocument;

  aOptions = aOptions || {};
  this.autoSelect = aOptions.autoSelect || false;
  this.position = aOptions.position || "above";
  this.noFocus = !!aOptions.noFocus;
  this.maxVisibleRows = aOptions.maxVisibleRows || MAX_VISIBLE_SUGGESTIONS;

  this.onSelect = aOptions.onSelect;
  this.onClick = aOptions.onClick;
  this.onKeypress = aOptions.onKeypress;
  this._onKeypress = this._onKeypress.bind(this);
  this._onClick = this._onClick.bind(this);

  var id = "selectorsPopup";
  // Reuse the existing popup elements.
  this.panel = this.document.getElementById(id);
  if (!this.panel) {
    this.panel = this.document.createElement("div");
    this.panel.setAttribute("id", id);
    this.panel.className = aOptions.className || "autocomplete";
    this.document.documentElement.appendChild(this.panel);
  }
  else {
    this.panel.className = aOptions.className || "autocomplete"
  }

  if (this.onSelect) {
    this.panel.addEventListener("select", this.onSelect, false);
  }

  this.panel.addEventListener("keydown", this._onKeypress, false);
  this.panel.addEventListener("mouseup", this._onClick, false);

  // Detecting webkit due to https://bugs.webkit.org/show_bug.cgi?id=92029 :(
  this.isWebkit = !!navigator.userAgent.match(/webkit/ig);

  if (this.isWebkit) {
    this.document.addEventListener("keydown", function(event) {
      if (!this.isOpen()) {
        return;
      }
      if (event.keyCode == 38) {
        this.selectPreviousItem();
      }
      else if (event.keyCode == 40) {
        this.selectNextItem();
      }
      else {
        return;
      }
      this.focus();
      event.preventDefault();
      event.stopPropagation();
    }.bind(this));
  }

  // creating the CSS
  var css = document.getElementById("selectorPopupCSS");
  if (!css) {
    var css = document.createElement('style');
    css.id = "selectorPopupCSS";
    css.type = 'text/css';
    document.querySelector("head").appendChild(css);
  }

  // A trick to write formatted CSS without any inturruption.
  // Using /*! to prevent this comment from getting removed after minifying.
  var styles = function() {/*!
#selectorsPopup {
  background: white;
  box-shadow: 0 0 2px 0 rgba(96,96,96,0.6);
  border: 2px solid #404040;
  position: absolute;
  z-index: 99999;
  overflow: hidden;
  visibility: collapse;
  min-width: 150px;
}
#selectorsPopup pre {
  margin: 0 !important;
}
#selectorsPopup label {
  color: #444;
  display: inline-block;
  display: flex;
  width: calc(100% - 10px);
  padding: 0px 4px;
  border: 1px solid transparent;
  font-family: %FONT%;
  font-size: %FONTSIZE%px;
}
#selectorsPopup label > pre {
  color: #000;
  font-family: inherit;
  font-size: inherit;
  font-weight:600;
}
#selectorsPopup label.pre:before {
  color: #000;
  content: attr(data-pre);
  display: inline-block;
  font-weight: 600;
}
#selectorsPopup label.count:after {
  color: #000;
  content: attr(data-count);
  float: right;
  flex: 1 1 auto;
  text-align: right;
}
#selectorsPopup input {
  opacity: 0;
  margin: -20px 0 0 0 !important;
  float: right;
  pointer-events: none;
}
#selectorsPopup label:hover:active,
#selectorsPopup input:checked + pre label {
  background: linear-gradient(#a2c0e3, #8caad5);
}
#selectorsPopup input:checked:focus + pre label,
#selectorsPopup label:hover {
  border: 1px solid #224;
}
#selectorsPopup input:checked:focus + pre label,
#selectorsPopup input:checked:focus + pre label.pre:before,
#selectorsPopup input:checked:focus + pre label.count:after {
  color: #000;
}
*/}.toString().split("\n").slice(1, -1).join('')
   .replace("%FONT%", aOptions.font || "")
   .replace("%FONTSIZE%", aOptions.fontSize || "14");

  if (css.styleSheet) {
    css.styleSheet.cssText = styles;
  }
  else {
    css.appendChild(document.createTextNode(styles));
  }
}

Popup.prototype = {
  document: null,
  panel: null,

  // Event handlers.
  onSelect: null,
  onClick: null,
  onKeypress: null,

  _open: false,
  _cachedString: "",
  values: [],
  selectedIndex: -1,
  height: null,

  /**
   * Open the autocomplete popup panel. If the space is not enough, the popup
   * will open in the opposite direction.
   *
   * @param x {Number} The x coordinate of the top left point of the input box.
   * @param y {Number} The y coordinate of the top left point of the input box.
   */
  openPopup: function(x, y) {
    // If position is above, the (x, y) point will be the bottom left point of
    // the popup, unless there is not enough space to show the popup above.
    var height = 0;
    if (this.values.length) {
      var style = this.panel.getBoundingClientRect();
      height = style.height;
    }
    var scroll = scrollY || document.documentElement.scrollTop;
    if ((this.position == "above" && y - height - scroll < 0) ||
        (this.position == "below" && y + height + 20 + scroll < innerHeight)) {
      this.panel.style.top = (y + 20  + scroll) +"px";
      this.inverted = (this.position == "above");
    }
    else {
      this.panel.style.top = (y - height + scroll) +"px";
      this.inverted = (this.position == "below");
    }
    if (this.inverted) {
      this.reversePopup();
    }
    this.panel.style.left = (x - 3) +"px";
    this.panel.style.visibility = "visible";
    this._open = true;

    if (this.autoSelect) {
      this.selectFirstItem();
    }
  },

  /**
   * Hide the autocomplete popup panel.
   */
  hidePopup: function() {
    this._open = false;
    this.panel.style.visibility = "collapse";
  },

  /**
   * Check if the autocomplete popup is open.
   */
  isOpen: function() {
    return this._open;
  },

  /**
   * Destroy the object instance.
   */
  destroy: function() {
    this.hidePopup();
    this.clearItems();

    if (this.onSelect) {
      this.panel.removeEventListener("select", this.onSelect, false);
    }

    this.panel.removeEventListener("keydown", this._onKeypress, false);
    this.panel.removeEventListener("mouseup", this._onClick, false);

    this.panel.parentNode.removeChild(this.panel);
    this.document = null;
    this.panel = null;
  },

  /**
   * Reverses the items in the popup
   */
  reversePopup: function() {
    var node = this.panel,
        parent = node.parentNode,
        next = node.nextSibling,
        frag = node.ownerDocument.createDocumentFragment();
    parent.removeChild(node);
    while(node.lastChild) {
      frag.appendChild(node.lastChild.previousSibling);
      frag.appendChild(node.lastChild);
    }
    node.appendChild(frag);
    parent.insertBefore(node, next);
  },

  /**
   * Gets the autocomplete items array.
   *
   * @param aIndex {Number} The index of the item what is wanted.
   *
   * @return {Object} The autocomplete item at index aIndex.
   */
  getItemAtIndex: function(aIndex) {
    return this.values[this.inverted ? this.itemCount() - aIndex - 1 : aIndex];
  },

  /**
   * Get the autocomplete items array.
   *
   * @return {Array} The array of autocomplete items.
   */
  getItems: function() {
    return this.values;
  },

  /**
   * Sets the autocomplete items list, in one go.
   *
   * @param {Array} aItems
   *        The list of items you want displayed in the popup list.
   */
  setItems: function(aItems) {
    this.clearItems();
    aItems.splice(this.maxVisibleRows);
    aItems.forEach(this.appendItem, this);

    this._flushItems();

    if (this.isOpen() && this.autoSelect) {
      this.selectFirstItem();
    }
  },

  /**
   * Selects the first item of the richlistbox. Note that first item here is the
   * item closes to the input element, which means that 0th index if position is
   * below, and last index if position is above.
   */
  selectFirstItem: function() {
    if (this.position.indexOf("above") > -1 ^ this.inverted) {
      this.panel.childNodes[(this.selectedIndex = this.values.length - 1)*2].checked = true;
    }
    else {
      this.panel.childNodes[this.selectedIndex = 0].checked = true;
    }
  },

  /**
   * Private method to handle keypress on the popup, update the selectedIndex
   * and then call the provided onKeypress method.
   *
   * @private
   */
  _onKeypress: function(aEvent) {
    for (var i = 0; i < this.values.length; i++) {
      if (this.panel.childNodes[i*2].checked) {
        this.selectedIndex = i;
        break;
      }
    }
    if (this.onKeypress) {
      this.onKeypress(aEvent);
    }
  },

  /**
   * Private method to handle click on the popup, update the selectedIndex and
   * then call the provided onKeypress method.
   *
   * @private
   */
  _onClick: function(aEvent) {
    for (var i = 0; i < this.values.length; i++) {
      if (this.panel.childNodes[i*2 + 1].firstChild == aEvent.target) {
        this.selectedIndex = i;
        break;
      }
    }
    if (this.onClick) {
      this.onClick(aEvent);
    }
  },

  /**
   * Clears all the items from the autocomplete list.
   */
  clearItems: function() {
    this.selectedIndex = -1;
    this._cachedString = "";
    this.values = [];
  },

  /**
   * Returns the object associated with the selected item. Note that this does
   * not return the DOM element of the selected item, but the object in the form
   * of {label, preLabe, count}.
   *
   * @return {Object} The object corresponding to the selected item.
   */
  getSelectedItem: function() {
    return this.values[this.inverted
                       ? this.itemCount() - this.selectedIndex - 1
                       : this.selectedIndex];
  },

  /**
   * Appends an item into the autocomplete list.
   *
   * @param {Object} aItem
   *        The item you want appended to the list.
   *        The item object can have the following properties:
   *        - label {String} Property which is used as the displayed value.
   *        - preLabel {String} [Optional] The String that will be displayed
   *                   before the label indicating that this is the already
   *                   present text in the input box, and label is the text
   *                   that will be auto completed. When this property is
   *                   present, |preLabel.length| starting characters will be
   *                   removed from label.
   *        - count {Number} [Optional] The number to represent the count of
   *                autocompleted label.
   */
  appendItem: function(aItem) {
    var str = this._cachedString;
    var label = aItem.label || aItem.display,
        pre = aItem.preLabel || aItem.prefix;
    str += "<input type='radio' name='autocomplete-radios' value='" + label +
           "'><pre><label";
    var cls = "", fuzzy = false;
    if (pre && label.indexOf(pre) == 0) {
      str += " data-pre='" + pre + "'";
      cls += "pre";
    }
    else if (pre) {
      fuzzy = true;
    }
    if (aItem.count && aItem.count > 1) {
      str += " data-count='" + aItem.count + "'";
      cls += " count";
    }
    if (cls) {
      str += " class='" + cls + "'";
    }
    str += " for='" + label + "'>" + (fuzzy ?
           (h = {}, label.replace(new RegExp("[" + pre + "]", "g"), function(m) {
             return !h[m] ? (h[m] = 1, "<pre>" + m + "</pre>") : m;
           })) : label.slice((pre || "").length)) + "</label></pre>";
    this._cachedString = str;
    this.values.push(aItem);
  },

  /**
   * Method to flush the generated string by the appendItems method into the
   * panel's inner HTML.
   *
   * @private
   */
  _flushItems: function() {
    this.panel.innerHTML = this._cachedString;
  },

  /**
   * Finds the label element that belongs to an item.
   *
   * @private
   *
   * @param {Object} aItem
   *        The object you want found in the list.
   *
   * @return {nsIDOMNode|null}
   *         The nsIDOMNode that belongs to the given item object. This node is
   *         the label element.
   */
  _findListItem: function(aItem) {
    var toReturn = null;
    this.values.some(function (item, i) {
      var found = true;
      for (var a in item) {
        if (item[a] != aItem[a]) {
          found = false;
        }
      }
      if (found) {
        toReturn = this.panel.childNodes[i*2];
        return true
      }
    });
    return toReturn;
  },

  /**
   * Removes an item from the popup list.
   *
   * @param {Object} aItem
   *        The item you want removed.
   */
  removeItem: function(aItem) {
    var item = this._findListItem(aItem);
    item && this.panel.removeChild(item.nextSibling) && this.panel.removeChild(item);
  },

  /**
   * Returns the number of items in the popup.
   *
   * @returns {Number} The number of items in the popup
   */
  itemCount: function() {
    return this.values.length;
  },

  /**
   * Selects the next item in the list.
   *
   * @return {Object} The newly selected item object.
   */
  selectNextItem: function() {
    if (this.selectedIndex < this.itemCount() - 1) {
      this.selectedIndex++;
    }
    else {
      this.selectedIndex = 0;
    }
    this.panel.childNodes[this.selectedIndex*2].checked = true;
    return this.getSelectedItem();
  },

  /**
   * Selects the previous item in the list.
   *
   * @return {Object} The newly selected item object.
   */
  selectPreviousItem: function() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    }
    else {
      this.selectedIndex = this.itemCount() - 1;
    }
    this.panel.childNodes[this.selectedIndex*2].checked = true;
    return this.getSelectedItem();
  },

  /**
   * Gets the next item to the selected item in the list.
   *
   * @return {Object} The next item object.
   */
  getNextItem: function() {
    return this.getItemAtIndex(this.selectedIndex + 1);
  },

  /**
   * Gets the previous item to the selected item in the list.
   *
   * @return {Object} The previous item object.
   */
  getPreviousItem: function() {
    return this.getItemAtIndex(this.selectedIndex - 1);
  },

  /**
   * Focuses the selected item in the popup.
   */
  focus: function() {
    this.panel.childNodes[this.selectedIndex*2].checked = true;
    !this.noFocus && this.panel.childNodes[this.selectedIndex*2].focus();
  },
};

exports.Popup = Popup;
// Code mirror specific implementation of AulxUI.
// We just need to inherit AulxUI object like ```this.__proto__ = new AulxUI()```
// and override the CM specific methods. That's all folks.
function AulxUICM(aEditor, aOptions) {

  aOptions = aOptions || {};

  if (!aEditor) {
    // No CodeMirror editor instance passed (or non-existant instance passed).
    console.error("No CodeMirror object or textarea string passed to AulxUI CM");
    return;
  }

  if (typeof aEditor == "string") {
    aEditor = CodeMirror.fromTextArea(aEditor);
  }

  // Inheriting from main AulxUI
  this.editor = aEditor;
  this.__proto__ = new AulxUI(aEditor, {mode: this.getMode()});

  // The following will fire the autocompletion system on each character!
  this.editor.on('cursorActivity', this._onEditorSelection);
  this.editor.on('change', this._onEditorKeyPress);

  // Those will become event listeners.
  this.editor.addKeyMap({
    Left: this._onLeft,
    Right: this._onRight,
    Tab: this._onTab,
    'Shift-Tab': this._onShiftTab,
    Esc: this._onEsc,
    fallthrough: "default"
  });

  // Overriding methods derived from AulxUI
  this.__proto__.getCursor = function() {
    return this.editor.getCursor();
  };
  this.__proto__.getCharWidth = function() {
    if (!this._charWidth) {
      this._charWidth = this.editor.charCoords({ch:2,line:1}).left -
                        this.editor.charCoords({ch:1,line:1}).left;
    }
    return this._charWidth;
  };
  this.__proto__.getValue = function() {
    return this.editor.getValue();
  };
  this.__proto__.isSomethingSelected = function() {
    return this.editor.somethingSelected();
  };
  this.__proto__.getCursorPosition = function() {
    return this.editor.cursorCoords();
  };
  this.__proto__.replaceRange = function(aText, aStart, aEnd) {
    this.editor.replaceRange(aText, aStart, aEnd);
  };
  this.__proto__.doDefaultAction = function(action) {
    switch(action) {
      case "Up":
      case "Down":
        CodeMirror.commands["goLine" + action](this.editor);
        break;
      case "Left":
      case "Right":
        CodeMirror.commands["goChar" + action](this.editor);
        break;
      case "Tab":
        CodeMirror.commands.defaultTab(this.editor);
        break;
      case "ShiftTab":
        CodeMirror.commands.indentAuto(this.editor);
    }
  };
};

AulxUICM.prototype = {
  getMode: function() {
    var mode = this.editor.getOption("mode");
    if (/javascript/.test(mode)) {  return EDITOR_MODES.JAVASCRIPT;
    } else if (/css/.test(mode)) {  return EDITOR_MODES.CSS;
    } else if (/html/.test(mode)) { return EDITOR_MODES.HTML;
    }
    return null;
  }
}
// Expose it to outside workd as AulxUI.CM constructor
exports.CM = AulxUICM;

return exports;
}));
