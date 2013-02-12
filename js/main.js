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
//  - options: Object containing optional parameters:
//    * contextFrom: Part of the source necessary to get the context.
//      May be a string of the current line (which the editor may provide
//      more efficiently than the default way).
//    * global: global object. Can be used to perform level 1 (see above).
//    * parser: a JS parser that is compatible with
//      https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API
//    * tokenizer: a JS tokenizer that is compatible with Esprima.
//    * fireStaticAnalysis: A Boolean to run the (possibly expensive) static
//      analysis. Recommendation: run it at every change of line.
//
// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * postfix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
function jsCompleter(source, caret, options) {
  options = options || {};
  var completion = new Completion();

  // Caching the result of a static analysis for perf purposes.
  // Only do this (possibly expensive) operation when required.
  if (staticCandidates == null || options.fireStaticAnalysis) {
    updateStaticCache(source, caret, options.parser);
  }

  // We use a primitive sorting algorithm.
  // The candidates are simply concatenated, level after level.
  // We assume that Level 0 < Level 1 < etc.
  // FIXME: implement a score-based system that adjusts its weights based on
  // statistics from what the user actually selects.

  var context = getContext(options.contextFrom || source, caret,
      options.tokenizer);
  if (!context) {
    // We couldn't get the context, we won't be able to complete.
    return completion;
  }

  // Static analysis (Level 2).

  var staticCompletion = new Completion();
  // Right now, we can only complete variables.
  if ((context.completing === Completing.identifier ||
       context.completing === Completing.property) &&
      context.data.length === 1 && staticCandidates != null) {
    var varName = context.data[0];
    staticCandidates.forEach(function (weight, display) {
      // They have a positive score.
      if (display.indexOf(varName) == 0
          && display.length > varName.length) {
        // The candidate must match and have something to add!
        staticCompletion.insert(new Candidate(display,
            display.slice(varName.length), weight));
      }
    });
    completion.meld(staticCompletion);
  }

  // Sandbox-based candidates (Level 1).

  if (options.global !== undefined) {
    // They have a score of -1.
    var sandboxCompletion = identifierLookup(options.global, context);
    if (sandboxCompletion) {
      completion.meld(sandboxCompletion);
    }
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
              keyword.slice(context.data[0].length),
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

exports.js = jsCompleter;



// Cache in use for static analysis.
var staticCandidates;   // We keep the previous candidates around.

function updateStaticCache(source, caret, parser) {
  staticCandidates = getStaticScope(source, caret, {parser:parser})
      || staticCandidates;   // If it fails, use the previous version.
}

exports.updateStaticCache = updateStaticCache;





// Generic helpers.
//



// Autocompletion types.

var Completing = {  // Examples.
  identifier: 0,    // foo.ba|
  property: 1,      // foo.|
  string: 2,        // "foo".|
  regex: 3          // /foo/.|
};
jsCompleter.Completing = Completing;

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
function getContext(source, caret, tokenize) {
  tokenize = tokenize || esprima.tokenize;
  var reduction = reduceContext('' + source, caret);
  if (reduction === null) { return null; }
  caret = reduction[1];
  var tokens = tokenize(reduction[0], {loc:true});

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
jsCompleter.getContext = getContext;

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
      if (prevToken.type === "Identifier") {
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
         (token.type === "Punctuator" && token.value === '.')) {
    if (token.type === "Identifier") {
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
      newSpot = skipStringLiteral(source, i, line, column);
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
// It returns the following object:
// - index: of the character after the end.
// - line: line number at the end of the string.
// - column: column number of the character after the end.
function skipStringLiteral(source, index, lineNumber, column) {
    var quote, ch, code, restore;
    var length = source.length;
    var indexAtStartOfLine = index - 1;

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
