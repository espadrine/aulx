//
// Get a list of completions we can have, based on the state of the editor.
// Autocompletion happens based on the following factors
// (with increasing relevance):
//
// Level 0 = CSS properties.
// Level 1 = dynamic lookup of available ids.
// Level 2 = static analysis of the code (useful for variables).
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
function cssCompleter(source, caret, options) {
  options = options || {};
  var completion = new Completion();

  // Getting the context from the caret position.
  var context = getContext(source, caret);
  if (!context) {
    // We couldn't get the context, we won't be able to complete.
    return completion;
  }

  // If it is a property completion, we can do something about it.
  if (context.completing === CSS_STATES.property) {
    completion.meld(completeProperties(context.data[0]));
  }

  return completion;
}

exports.css = cssCompleter;


// Autocompletion types.

var CSS_STATES = {
  property: 0,       // foo { bar|: … }
  // TODO: Split the value state into multiple states
  value: 1,          // foo {bar: baz|}
  // TODO: Split the selector state into multiple states. This should be easy
  // once selectors-search is integrated in Aulx.CSS
  selector: 2,       // f| {bar: baz}
  media: 3,          // @med| , or , @media scr| { }
  keyframe: 4,       // @keyf|
  frame: 5,          // @keyframs foobar { t|
  "null": null
};

// Get the context.
//
// This uses Tab Atkins' CSS tokenizer.
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
function getContext(source, caret) {
  var tokens = stripWhitespace(cssCompleter.tokenize(source, {loc:true}));
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
        return stateFromToken(tokens, tokIndex, caret);
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
  return stateFromToken(tokens, tokIndex, caret);
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
function stateFromToken(tokens, tokIndex) {
  // _state can be one of CSS_STATES;
  var _state = CSS_STATES.null;
  var cursor = 0;
  // This will maintain a stack of paired elements like { & }, @m & }, : & ; etc
  var scopeStack = [];
  var token = null;
  while (cursor <= tokIndex && (token = tokens[cursor++])) {
    switch (_state) {
      case CSS_STATES.property:
        // From CSS_STATES.property, we can either go to CSS_STATES.value state
        // when we hit the first ':' or CSS_STATES.selector if "}" is reached.
        switch(token.tokenType) {
          case ":":
            scopeStack.push(":");
            _state = CSS_STATES.value;
            break;

          case "}":
            if (/[{f]/.test(scopeStack.slice(-1)[0])) {
              var popped = scopeStack.pop();
              _state = popped == "f" ? CSS_STATES.frame
                                     : CSS_STATES.selector;
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
            if (/[:]/.test(scopeStack.slice(-1)[0])) {
              scopeStack.pop();
            }
            if (/[{f]/.test(scopeStack.slice(-1)[0])) {
              var popped = scopeStack.pop();
              _state = popped == "f" ? CSS_STATES.frame
                                     : CSS_STATES.selector;
            }
            else if (scopeStack.slice(-1) == "@m") {
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
        break;

      case CSS_STATES.null:
        // From CSS_STATES.null state, we can go to either CSS_STATES.media or
        // CSS_STATES.selector.
        switch(token.tokenType) {
          case "AT-KEYWORD":
            _state = token.value == "media" ? CSS_STATES.media
                                            : CSS_STATES.keyframe;
            break;
          case "HASH":
          case "IDENT":
          case "DELIM":
            _state = CSS_STATES.selector;
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
          if (scopeStack.slice(-1) == "@k") {
            scopeStack.pop();
          }
          _state = CSS_STATES.selector;
        }
        break;
    }
  }
  return {
    completing: _state,
    data: [token.value]  // TODO: This should also contain information like what
                         // property's value is being completed etc.
  }
};

function stripWhitespace(tokens) {
  return tokens.filter(function(token) {
    return token.tokenType !== 'WHITESPACE';
  });
}
