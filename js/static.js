// Return a Completion instance, or undefined.
function staticAnalysis(context) {
  var staticCompletion = new Completion();
  // Right now, we can only complete variables.
  if (context.completing === Completing.identifier &&
      context.data.length === 1) {
    var varName = context.data[0];
    // They have a positive score.
    staticCandidates.weights.forEach(function (weight, display) {
      if (display.indexOf(varName) == 0
          && display.length > varName.length) {
        // The candidate must match and have something to add!
        staticCompletion.insert(new Candidate(display,
            display.slice(varName.length), weight));
      }
    });

  } else if (context.completing === Completing.identifier ||
             context.completing === Completing.property) {
    // They have a zero score.
    // We don't use staticCandidates.weight at all here.
    var typeStore = staticCandidates.types;
    for (var i = 0; i < context.data.length - 1; i++) {
      typeStore = typeStore.properties.get(context.data[i]);
      if (!typeStore) { return; }
    }
    if (context.completing === Completing.identifier) {
      var varName = context.data[i];
      typeStore.properties.forEach(function (store, display) {
        if (display.indexOf(varName) == 0
            && display.length > varName.length) {
          // The candidate must match and have something to add!
          staticCompletion.insert(new Candidate(display,
              display.slice(varName.length), 0));
        }
      });
    } else if (context.completing === Completing.property) {
      typeStore = typeStore.properties.get(context.data[i]);
      typeStore.properties.forEach(function (store, display) {
        staticCompletion.insert(new Candidate(display, display, 0));
      });
    }
  }
  return staticCompletion;
}


// Static analysis helper functions.
//


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
// - options:
//   * store: The object we return. Use to avoid allocation.
//   * parser: A JS parser that conforms to
//     https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API
//
function getStaticScope(source, caret, options) {
  options = options || {};
  options.store = options.store || new Map();
  options.parse = options.parse || esprima.parse;
  var typeStore = new TypeInferred();   // Represents the global object.

  var tree;
  try {
    tree = options.parse(source, {loc:true});
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
          options.store.set(subnode.id.name, stack.length - 1);
          if (!!subnode.init) {
            subnode = subnode.init;
          }
          else break;
        }
        if (subnode.type == "ExpressionStatement") {
          subnode = subnode.expression;  // Parenthesized expression.
        }
        if (subnode.type == "AssignmentExpression") {
          if (subnode.left.type === "MemberExpression") {
            typeFromMember(typeStore, subnode.left);
          }
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
          options.store.set(subnode.id.name, stack.length);
        }
        if (caretInBlock(subnode, caret)) {
          // Parameters are one level deeper than the function's name itself.
          argumentNames(subnode.params, options.store, stack.length + 1);
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

  return {weights: options.store, types: typeStore};
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



//
// Type inference.

// Types. FIXME: use them.
var FunctionType    = 0x01 | 0;
var ArrayType       = 0x02 | 0;
var StringType      = 0x04 | 0;
var BooleanType     = 0x08 | 0;
var NumberType      = 0x10 | 0;
var DateType        = 0x20 | 0;
var RegExpType      = 0x40 | 0;

// A type inference instance maps symbols to an object of the following form:
// - properties: a Map from symbols to TypeInferred.
// - type: a number, the bitwise OR of the types it may have.
function TypeInferred() {
  this.properties = new Map();
  this.type = 0|0;
}

TypeInferred.prototype = {
  addType: function(type) {
    this.type |= type;
  },
  isType: function(type) {
    return (this.type & type) === type;
  },
  addProperty: function(symbol) {
    if (!this.properties.has(symbol)) {
      this.properties.set(symbol, new TypeInferred());
    }
  }
};

// Store is a TypeInferred instance,
// node is a MemberExpression.
function typeFromMember(store, node) {
  var symbols = [],
      symbol = '';
  while (node.object.type !== "Identifier" &&
         node.object.type !== "ThisExpression") {
    symbols.push(node.property.name);
    node = node.object;
  }
  // FIXME: use this.property assignment.
  symbols.push(node.property.name);
  symbols.push(node.object.name);  // At this point, node is an identifier.

  // Now that we have the symbols, put them in the store.
  while (symbols.length > 0) {
    symbol = symbols.pop();
    store.addProperty(symbol);
    store = store.properties.get(symbol);
  }
}
