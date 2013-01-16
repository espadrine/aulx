// Generic helpers.
//

var esprima = esprima || exports;
var global = this;

// Get the identifier just behind the position of the cursor, as a list of
// strings.
//
// For instance, `foo.bar.baz` (with the caret at the end of baz, even if after
// whitespace) will return `["foo", "bar", "baz"]`.
//
// If we cannot get an identifier, returns `null`.
function getIdentifier(source, caret) {
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
        return suckIdentifier(tokens, tokIndex, caret);
      } else if (caret.ch <= range[0]) {
        highIndex = tokIndex;
      } else if (range[1] < caret.ch) {
        lowIndex = tokIndex;
      }
    }
    tokIndex = ((highIndex + lowIndex) / 2) | 0;
  }
  return suckIdentifier(tokens, tokIndex, caret);
}
exports.getIdentifier = getIdentifier;

function inRange(index, range) {
  return index > range[0] && index <= range[1];
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



// Sandbox-based analysis.
//

// Return an object with the following fields:
//  - candidates: A list of the matches to a possible completion.
//  - completions: A list of the associated completion to a candidate.
function identifierLookup(global, identifier) {
  // TODO
  return {
    candidates: [],
    completions: []
  };
}




// Static analysis helper functions.
//

var staticCandidates;   // We keep the previous candidates around.


/**
 * Get all the variables in a JS script at a certain position.
 * This gathers variable (and argument) names by means of a static analysis
 * which it performs on a parse tree of the code.
 *
 * This static scope system is inflexible. If it can't parse the code, it won't
 * give you anything.
 *
 * @param string aScript
 *        The JS script to parse.
 * @param number aLine
 *        The line in the script from which we want the scope.
 * @param number aColumn
 *        The column in the script from which we want the scope.
 * @param object aStore
 *        (Optional) The object we return. Use to avoid allocation.
 * @param number aDepth
 *        (Optional) A starting point for indicating how deeply nested variables
 *        are.
 *
 * @return Map|null
 *         A map from all variable names to a number reflecting how deeply
 *         nested in the scope the variable was. A bigger number reflects a more
 *         deeply nested variable.
 *         We return null if we could not parse the code.
 */
function getStaticScope(aScript, aLine, aColumn, aStore, aDepth) {
  aStore = aStore || new Map();
  aDepth = aDepth || 0;

  var tree;
  try {
    tree = esprima.parse(aScript);
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
          aStore.set(subnode.id.name, stack.length - 1);
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
          aStore.set(subnode.id.name, stack.length);
        }
        if (caretInBlock(subnode, aLine, aColumn)) {
          // Parameters are one level deeper than the function's name itself.
          argumentNames(subnode.params, aStore, stack.length + 1);
        }
      }
      deeper = nestedNodes(subnode, aLine, aColumn);
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

  return aStore;
}

/**
 * Find a parse node to iterate over.
 * @param mixed aNode
 *        JS parse tree node.
 * @param number aLine
 *        Line on which the caret is.
 * @param number aColumn
 *        Column on which the caret is.
 * @return array
 *         The node's array. Can also return null if it gets unhappy.
 */
function nestedNodes(aNode, aLine, aColumn) {
  var body = null;
  var newScope = true;  // Whether we enter a new scope.
  if (aNode.body) {
    if (aNode.body.body) {
      // Function declaration has a body in a body.
      body = aNode.body.body;
    } else {
      body = aNode.body;
    }
  } else if (aNode.consequent) {
    body = aNode.consequent.body;  // If statements.
  } else if (aNode.alternate) {
    body = aNode.alternate.body;   // If/else statements.
  } else if (aNode.block) {
    body = aNode.block.body;       // Try statements.
  } else if (aNode.handlers) {     // Try/catch.
    body = aNode.handlers.body.body;
  } else if (aNode.finalizer) {
    body = aNode.finalizer.body;   // Try/catch/finally.
  } else if (aNode.declarations) {
    body = aNode.declarations;     // Variable declarations.
    newScope = false;
  } else if (aNode.arguments) {
    body = aNode.arguments;   // Function calls, eg, f(function(){…});
  } else if (aNode.properties) {
    body = aNode.properties;  // Objects, eg, ({f: function(){…}});
  } else if (aNode.elements) {
    body = aNode.elements;    // Array, eg, [function(){…}]
  }
  if (!body ||
      // No need to parse a scope in which the caret is not.
      (newScope && !caretInBlock(aNode, aLine, aColumn))) {
    return null;
  }
  return body;
}

/**
 * @param mixed aNode
 *        The parse tree node in which the caret might be.
 * @param number aLine
 *        The line where the caret is (starts with 1).
 * @param number aColumn
 *        The column where the caret is (starts with 0).
 * @return boolean
 *         Whether the caret is in the piece of code represented by the node.
 */
function caretInBlock(aNode, aLine, aColumn) {
  return (
    // The aNode starts before the cursor.
    (aNode.loc.start.line < aLine ||
     (aNode.loc.start.line === aLine &&
      aNode.loc.start.column <= aColumn)) &&
    // The aNode ends after the cursor.
    (aLine < aNode.loc.end.line ||
     (aNode.loc.end.line === aLine &&
      aColumn <= aNode.loc.end.column)));
}

/**
 * Get the argument names of a function.
 * @param array aNode
 *        The "params" property of a FunctionExpression.
 * @param Map aStore
 *        Where to store the information that an identifier exists and has the
 *        given weight.
 * @param number aWeight
 *        A measure of how deeply nested the node is. The deeper, the bigger.
 */
function argumentNames(aNode, aStore, aWeight) {
  var aNode = aNode;
  var aStore = aStore;
  var aWeight = aWeight;
  for (var i = 0; i < aNode.length; i++) {
    aStore.set(aNode[i].name, aWeight);
  }
}

