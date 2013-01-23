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

  // We use a primitive sorting algorithm.
  // The candidates are simply concatenated, level after level.
  // We assume that Level 0 < Level 1 < etc.
  // FIXME: implement a score-based system that adjusts its weights based on
  // statistics from what the user actually selects.

  var context = getContext(source, caret);
  if (!context) {
    // We couldn't get the context, we won't be able to complete.
    return completion;
  }

  // Static analysis (Level 2).

  // Only do this (possibly expensive) operation once every new line.
  if (staticCandidates == null || options.fireStaticAnalysis) {
    staticCandidates = getStaticScope(source, caret, {parser:options.parser})
        || staticCandidates;   // If it fails, use the previous version.
  }
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




// Generic helpers.
//



// Autocompletion types.

var Completing = {  // Examples.
  identifier: 0,    // foo.ba|
  property: 1,      // foo.|
  string: 2,        // "foo".|
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
function getContext(source, caret) {
  var tokens = esprima.tokenize(source, {loc:true});
  if (tokens[tokens.length - 1].loc.end.line - 1 < caret.line ||
     (tokens[tokens.length - 1].loc.end.line - 1 === caret.line &&
      tokens[tokens.length - 1].loc.end.column < caret.column)) {
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
  while (lowIndex < highIndex) {
    token = tokens[tokIndex];
    // Note: esprima line numbers start with 1, while caret starts with 0.
    if (token.loc.start.line - 1 < caret.line) {
      lowIndex = tokIndex;
    } else if (token.loc.start.line - 1 > caret.line) {
      highIndex = tokIndex;
    } else if (token.loc.start.line - 1 === caret.line) {
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
  var prevToken;
  if (token.type === "Punctuator" && token.value === '.') {
    if (tokens[tokIndex - 1]) {
      prevToken = tokens[tokIndex - 1];
      if (prevToken.type === "String") {
        // String completion.
        return {
          completing: Completing.string,
          data: []  // No need for data.
        };
      } else if (prevToken.type === "Identifier") {
        // Property completion.
        return {
          completing: Completing.property,
          data: suckIdentifier(tokens, tokIndex, caret)
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
}
