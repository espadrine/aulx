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


// Static analysis helper functions.
//

var staticCandidates;   // We keep the previous candidates around.


//
// Get all the variables in a JS script at a certain position.
// This gathers variable (and argument) names by means of a static analysis
// which it performs on a parse tree of the code.
//
// Returns a map from all variable names to a number reflecting how deeply
// nested in the scope the variable was. A bigger number reflects a more
// deeply nested variable.
// We return null if we could not parse the code.
//
// This static scope system is inflexible. If it can't parse the code, it won't
// give you anything.
//
// Parameters:
// - source: The JS script to parse.
// - caret: {line:0, ch:0} The line and column in the script from which we want the scope.
// - store:
//   (Optional) The object we return. Use to avoid allocation.
// - depth:
//   (Optional, defaults to 0.) A starting point for indicating how deeply
//   nested variables are.
//
function getStaticScope(source, caret, store, depth) {
  store = store || new Map();
  depth = depth || 0;

  var tree;
  try {
    tree = esprima.parse(source, {loc:true});
  } catch (e) { return null; }

  var node = tree.body;
  var stack = [];
  var index = 0;
  var indices = [];
  var deeper = null;
  do {
    deeper = null;
    for (; index < node.length; index++) {
      var subnode = node[index];
      while (["ReturnStatement", "VariableDeclarator", "ExpressionStatement",
              "AssignmentExpression", "Property"].indexOf(subnode.type) >= 0) {
        if (subnode.type == "ReturnStatement") {
          subnode = subnode.argument;
        }
        if (subnode.type == "VariableDeclarator") {
          // Variable names go one level too deep.
          store.set(subnode.id.name, stack.length - 1);
          if (!!subnode.init) {
            subnode = subnode.init;
          }
          else break;
        }
        if (subnode.type == "ExpressionStatement") {
          subnode = subnode.expression;  // Parenthesized expression.
        }
        if (subnode.type == "AssignmentExpression") {
          subnode = subnode.right;       // f.g = function(){…};
        }
        if (subnode.type == "Property") {
          subnode = subnode.value;       // {f: function(){…}};
        }
      }
      if (subnode.type == "FunctionDeclaration" ||
          subnode.type == "FunctionExpression" ||
          // Expressions, eg, (function(){…}());
          (subnode.callee && subnode.callee.type == "FunctionExpression")) {
        if (subnode.callee) {
          subnode = subnode.callee;
        }
        if (subnode.id) {
          store.set(subnode.id.name, stack.length);
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
    body = node.consequent.body;  // If statements.
  } else if (node.alternate) {
    body = node.alternate.body;   // If/else statements.
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
    store.set(node[i].name, weight);
  }
}

// Sandbox-based analysis.
//

// Return an object with the following fields:
//  - candidates: A list of the matches to a possible completion.
//  - completions: A list of the associated completion to a candidate.
//
// Parameters:
//  - global: an Object in which to search.
//  - context: {completion: number, data: array}
//    We assume completion to be either identifier or property.
//    See ./main.js.
function identifierLookup(global, context) {
  var matchProp = '';

  var value = global;
  if (context.completion === Completion.identifier) {
    // foo.ba|
    for (var i = 0; i < context.data.length - 1; i++) {
      var descriptor = getPropertyDescriptor(value, context.data[i]);
      if (descriptor.get) {
        // This is a getter / setter.
        // We might trigger a side-effect by going deeper.
        // We must stop before the world blows up in a Michael Bay manner.
        value = null;
        break;
      } else {
        // We need to go deeper. One property deeper.
        value = value[context.data[i]];
      }
    }
    if (value != null) {
      matchProp = context.data[context.data.length - 1];
    }

  } else if (context.completion === Completion.property) {
    // foo.|
    for (var i = 0; i < context.data.length; i++) {
      var descriptor = getPropertyDescriptor(value, context.data[i]);
      if (descriptor.get) {
        // This is a getter / setter.
        // We might trigger a side-effect by going deeper.
        // We must stop before the world blows up in a Michael Bay manner.
        value = null;
        break;
      } else {
        // We need to go deeper. One property deeper.
        value = value[context.data[i]];
      }
    }
  }

  var result = {candidates: [], completions: []};
  if (value != null) {
    var matchedProps = getMatchedProps(value, { matchProp: matchProp });
    result.candidates = Object.keys(matchedProps);
    result.completions = result.candidates.map(function (prop) {
      return prop.slice(matchProp.length);
    });
    return result;

  } else {
    // We cannot give any completion.
    return result;  // empty result.
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
//      more efficiently than the default way.
//    * global: global object. Can be used to perform level 1 (see above).
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
    staticCandidates = getStaticScope(source, caret)
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
exports.Completion = Completion;

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
exports.getContext = getContext;

function inRange(index, range) {
  return index > range[0] && index <= range[1];
}

function contextFromToken(tokens, tokIndex, caret) {
  var token = tokens[tokIndex];
  if (token.type === esprima.Token.Punctuator &&
      token.value === '.') {
    // Property completion.
    return {
      completion: Completion.property,
      data: suckIdentifier(tokens, tokIndex, caret)
    };
  } else if (token.type === esprima.Token.Identifier) {
    // Identifier completion.
    return {
      completion: Completion.identifier,
      data: suckIdentifier(tokens, tokIndex, caret)
    };
  } else {
    return null;
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
// Map from language file extensions to functions that can autocomplete the
// source editor.
//
// Parameters:
//  - source: String of the source code.
//  - caret: Object containing two fields:
//    * line: the line number of the caret, starting with zero.
//    * ch: the column of the caret, starting with zero.
//  - options: Object containing optional parameters:
//    * line: String of the current line (which the editor may provide
//      more efficiently than the default way.
//
// Return an object with the following fields:
//  - candidates: A list of the matches to a possible completion.
//  - completions: A list of the associated completion to a candidate.
var completer = {
  js: jsCompleter
};

exports.completer = completer;


// Helper: Map implementation (will be removed when ES6 comes along).
//
// It is designed to be fast, but not 100% compatible with ES6.
// Notably, map.getKeys returns a list of keys, since you cannot iterate
// through a map in ES5 the same way you would in ES6.
//
// Note: may fail in case you unexpectedly use __proto__ as a key.

function Map() {
  // Cut off the inheritance tree.
  this.map = Object.create(null);
}

Map.prototype = {
  get: function(key) {
    return this.map[key];
  },
  has: function(key) {
    return this.map[key] !== undefined;
  },
  set: function(key, value) {
    this.map[key] = value;
  },
  delete: function(key) {
    if (this.has(key)) {
      delete this.map[key];
      return true;
    } else {
      return false;
    }
  },
  forEach: function(callbackfn, thisArg) {
    callbackfn = callbackfn.bind(thisArg);
    for (var i in this.map) {
      callbackfn(this.map[i], i, this);
    }
  }
};

return exports;
}));
