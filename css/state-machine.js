
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
