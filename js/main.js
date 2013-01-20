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
//    * line: String of the current line (which the editor may provide
//      more efficiently than the default way).
//    * global: global object. Can be used to perform level 1 (see above).
//    * parser: a JS parser that is compatible with
//      https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API
//    * fireStaticAnalysis: A Boolean to run the (possibly expensive) static
//      analysis. Recommendation: run it at every newline.
//
// Return an object with the following fields:
//  - candidates: A list of the matches to a possible completion.
//  - completions: A list of the associated completion to a candidate.
//
function jsCompleter(source, caret, options) {
  options = options || {};
  var candidates = [];
  var completions = [];

  // We use a primitive sorting algorithm.
  // The candidates are simply concatenated, level after level.
  // We assume that Level 0 < Level 1 < etc.
  // FIXME: implement a score-based system that adjusts its weights based on
  // statistics from what the user actually selects.

  var context = getContext(source, caret);

  // Static analysis (Level 2).

  // Only do this (possibly expensive) operation once every new line.
  if (staticCandidates == null || options.fireStaticAnalysis) {
    staticCandidates = getStaticScope(source, caret, {parser:options.parser})
        || staticCandidates;   // If it fails, use the previous version.
  }
  var allStaticCandidates = staticCandidates;
  // Right now, we can only complete variables.
  if ((context.completion === Completion.identifier ||
       context.completion === Completion.property) &&
      context.data.length === 1 && allStaticCandidates != null) {
    var varName = context.data[0];
    var staticCandidates = [];
    allStaticCandidates.forEach(function (value, key) {
      var candidate = key;
      var weight = value;
      // The candidate must match and have something to add!
      if (candidate.indexOf(varName) == 0
          && candidate.length > varName.length) {
        staticCandidates.push(candidate);
      }
    });
    staticCandidates.sort(function(a, b) {
      // Sort them according to nearest scope.
      return allStaticCandidates.get(b) - allStaticCandidates.get(a);
    });
    candidates = candidates.concat(staticCandidates);
    completions = completions.concat(staticCandidates
      .map(function(candidate) {
          return candidate.slice(varName.length);
      }));
  }

  // Sandbox-based candidates (Level 1).

  if (options.global !== undefined) {
    var sandboxCompletion = identifierLookup(options.global, context);
    if (sandboxCompletion) {
      sandboxCompletion.candidates = sandboxCompletion.candidates
        .filter(function(candidate) {
          // We are removing candidates from level 2.
          if (allStaticCandidates == null)  return true;
          return !allStaticCandidates.has(candidate);
      });
      candidates = candidates.concat(sandboxCompletion.candidates);
      completions = completions.concat(sandboxCompletion.completions);
    }
  }

  // Keyword-based candidates (Level 0).

  var keywords = [
    "break", "case", "catch", "class", "continue", "debugger",
    "default", "delete", "do", "else", "export", "false", "finally", "for",
    "function", "get", "if", "import", "in", "instanceof", "let", "new",
    "null", "of", "return", "set", "super", "switch", "this", "true", "throw",
    "try", "typeof", "undefined", "var", "void", "while", "with",
  ];
  // This autocompletion is only meaningful with 
  if (context.completion === Completion.identifier &&
      context.data.length === 1) {
    for (var i = 0; i < keywords.length; i++) {
      var keyword = keywords[i];
      // The keyword must match and have something to add!
      if (keyword.indexOf(context.data) == 0
          && keyword.length > context.data.length) {
        candidates.push(keyword);
        completions.push(keyword.slice(context.data.length));
      }
    }
  }

  return {
    candidates: candidates,
    completions: completions,
  };
}



// Generic helpers.
//

var esprima = esprima || exports;

// Autocompletion types.

var Completion = {  // Examples.
  identifier: 0,    // foo.ba|
  property: 1,      // foo.|
  string: 2,        // "foo".|
};
jsCompleter.Completion = Completion;

// Fetch data from the position of the caret in a source.
// The data is an object containing the following:
//  - completion: a number from the Completion enumeration.
//  - data: information about the context. Ideally, a list of strings.
//
// For instance, `foo.bar.baz|`
// (with the caret at the end of baz, even if after whitespace)
// will return `{completion:0, data:["foo", "bar", "baz"]}`.
//
// If we cannot get an identifier, returns `null`.
//
// Parameters:
//  - source: a string of JS code.
//  - caret: an object {line: 0-indexed line, ch: 0-indexed column}.
function getContext(source, caret) {
  var tokens = esprima.tokenize(source);
  if (tokens[tokens.length - 1].type !== esprima.Token.EOF) {
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
  var token;
  while (tokIndex !== lowIndex) {
    token = tokens[tokIndex];
    // Note: esprima line numbers start with 1, while caret starts with 0.
    if (token.lineNumber - 1 < caret.line) {
      lowIndex = tokIndex;
    } else if (token.lineNumber - 1 > caret.line) {
      highIndex = tokIndex;
    } else if (token.lineNumber - 1 === caret.line) {
      // Now, we need the correct column.
      var range = [
        token.range[0] - token.lineStart,
        token.range[1] - token.lineStart,
      ];
      if (inRange(caret.ch, range)) {
        // We're done. We've found the token in which the cursor is.
        return contextFromToken(tokens, tokIndex, caret);
      } else if (caret.ch <= range[0]) {
        highIndex = tokIndex;
      } else if (range[1] < caret.ch) {
        lowIndex = tokIndex;
      }
    }
    tokIndex = ((highIndex + lowIndex) / 2) | 0;
  }
  return contextFromToken(tokens, tokIndex, caret);
}
jsCompleter.getContext = getContext;

function inRange(index, range) {
  return index > range[0] && index <= range[1];
}

// Either
//
//  {
//    completion: Completion.<type of completion>,
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
  var prevToken;
  if (token.type === esprima.Token.Punctuator &&
      token.value === '.') {
    if (tokens[tokIndex - 1]) {
      prevToken = tokens[tokIndex - 1];
      if (prevToken.type === esprima.Token.StringLiteral) {
        // String completion.
        return {
          completion: Completion.string,
          data: []  // No need for data.
        };
      } else if (prevToken.type === esprima.Token.Identifier) {
        // Property completion.
        return {
          completion: Completion.property,
          data: suckIdentifier(tokens, tokIndex, caret)
        };
      }
    }
  } else if (token.type === esprima.Token.Identifier) {
    // Identifier completion.
    return {
      completion: Completion.identifier,
      data: suckIdentifier(tokens, tokIndex, caret)
    };
  }
}

// suckIdentifier aggregates the whole identifier into a list of strings, taking
// only the part before the caret.
//
// This function assumes that the caret is on the token designated by `tokIndex`
// (which is its index in the `tokens` array).
//
// For instance, `foo.bar.ba|z` gives `['foo','bar','ba']`.
function suckIdentifier(tokens, tokIndex, caret) {
  var token = tokens[tokIndex];
  if (token.type === esprima.Token.EOF) {
    tokIndex--;
    token = tokens[tokIndex];
  }
  if (token.type !== esprima.Token.Identifier &&
      token.type !== esprima.Token.Punctuator) {
    // Nothing to suck. Nothing to complete.
    return null;
  }

  // We now know there is something to suck into identifier.
  var identifier = [];
  while (token.type === esprima.Token.Identifier ||
         (token.type === esprima.Token.Punctuator &&
          token.value === '.')) {
    if (token.type === esprima.Token.Identifier) {
      var endCh = token.range[1] - token.lineStart;
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
}
