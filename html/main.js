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
