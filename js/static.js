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

