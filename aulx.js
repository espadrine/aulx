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
var Map = this.Map;
if (!(Map && Map.prototype.forEach)) {
  var Map = function Map() {};

  Map.prototype = Object.create(null, {
    get: {
      enumerable: false,
      value: function(key) {
        return this[key];
      }
    },
    has: {
      enumerable: false,
      value: function(key) {
        return this[key] !== undefined;
      }
    },
    set: {
      enumerable: false,
      value: function(key, value) {
        this[key] = value;
      }
    },
    delete: {
      enumerable: false,
      value: function(key) {
        if (this.has(key)) {
          delete this[key];
          return true;
        } else {
          return false;
        }
      }
    },
    forEach: {
      enumerable: false,
      value: function(callbackfn, thisArg) {
        callbackfn = callbackfn.bind(thisArg);
        for (var i in this) {
          callbackfn(this[i], i, this);
        }
      }
    },
  });
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
        this.staticCandidates.properties[this.options.globalIdentifier]) {
      // Add properties like `window.|`.
      this.staticCandidates.properties[this.options.globalIdentifier].properties
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
        for (var i = 0; i < store.type[funcName].length; i++) {
          var sourceIndex = store.type[funcName][i];
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
function typeFromAssignment(store, symbols, node, weight) {
  var property, i, substore, nextSubstore, lastSymbol;
  lastSymbol = symbols[symbols.length - 1];
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

return exports;
}));
