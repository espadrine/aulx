
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
          if (scopeStack.slice(-1)[0] == "@k") {
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
}
