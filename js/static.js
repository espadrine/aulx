// Return a Completion instance, or undefined.
// Parameters:
// - context: result of the getContext function.
function staticAnalysis(context) {
  var staticCompletion = new Completion();
  var completingIdentifier = (context.completing === Completing.identifier);
  var completingProperty = (context.completing === Completing.property);

  var varName;   // Each will modify this to the start of the variable name.
  var eachProperty = function eachProperty(store, display) {
    if (display.indexOf(varName) == 0
        && display.length > varName.length) {
      // The candidate must match and have something to add!
      try {
        var tokens = esprima.tokenize(display);
        if (tokens.length === 1 && tokens[0].type === "Identifier") {
          staticCompletion.insert(new Candidate(display,
              varName, store.weight));
        }
      } catch (e) {} // Definitely not a valid property.
    }
  };

  if (completingIdentifier && context.data.length === 1) {
    varName = context.data[0];
    // They have a positive score.
    this.staticCandidates.properties.forEach(eachProperty);
    if (this.options.globalIdentifier &&
        this.staticCandidates.properties.get(this.options.globalIdentifier)) {
      // Add properties like `window.|`.
      this.staticCandidates.properties.get(this.options.globalIdentifier).properties
        .forEach(eachProperty);
    }

  } else if (completingIdentifier || completingProperty) {
    var store = this.staticCandidates;
    for (var i = 0; i < context.data.length - 1; i++) {
      store = store.properties.get(context.data[i]);
      if (!store) { return; }
    }

    varName = context.data[i];
    if (completingProperty) {
      store = store.properties.get(varName);
      if (!store) { return; }
      varName = '';  // This will cause the indexOf check to succeed.
    }
    store.properties.forEach(eachProperty);

    // Seek data from its type.
    if (!!store.type) {
      store.type.forEach(function(sourceIndices, funcName) {
        funcStore = this.staticCandidates.properties.get(funcName);
        if (!funcStore) { return; }
        for (var i = 0; i < store.type.get(funcName).length; i++) {
          var sourceIndex = store.type.get(funcName)[i];
          // Each sourceIndex corresponds to a source,
          // and the `sources` property is that source.
          if (funcStore.sources) {
            funcStore.sources[sourceIndex].properties.forEach(eachProperty);
            if (sourceIndex === 0) {
              // This was a constructor.
              var protostore = funcStore.properties.get('prototype');
              if (!protostore) { return; }
              protostore.properties.forEach(eachProperty);
            }
          }
        }
      }.bind(this));
    }
  }
  return staticCompletion;
}

JS.prototype.staticAnalysis = staticAnalysis;

// Static analysis helper functions.

//
// Get all the variables in a JS script at a certain position.
// This gathers variable (and argument) names by means of a static analysis
// which it performs on a parse tree of the code.
//
// Returns a TypeStore object. See below.
// We return null if we could not parse the code.
//
// This static scope system is inflexible. If it can't parse the code, it won't
// give you anything.
//
// Parameters:
// - source: The JS script to parse.
// - caret: {line:0, ch:0} The line and column in the scrip
//   from which we want the scope.
//
function updateStaticCache(source, caret) {
  this.options.store = this.options.store || new TypeStore();
  try {
    if (!!this.options.parserContinuation) {
      this.options.parse(source, {loc:true}, function(tree) {
        this.staticCandidates = getStaticScope(tree.body, caret)
            || this.staticCandidates;  // If it fails, use the previous version.
      }.bind(this));
    } else {
      var tree = this.options.parse(source, {loc:true});
      this.staticCandidates = getStaticScope(tree.body, caret)
          || this.staticCandidates;   // If it fails, use the previous version.
    }
  } catch (e) { return null; }
}

JS.prototype.updateStaticCache = updateStaticCache;

function getStaticScope(tree, caret) {
  var subnode, symbols;
  var store = new TypeStore();

  var node = tree;
  var stack = [];
  var index = 0;
  var indices = [];
  var deeper = null;
  do {
    deeper = null;
    for (; index < node.length; index++) {
      subnode = node[index];
      while (["ReturnStatement", "VariableDeclarator", "ExpressionStatement",
              "AssignmentExpression", "Property"].indexOf(subnode.type) >= 0) {
        if (subnode.type == "ReturnStatement") {
          subnode = subnode.argument;
        }
        if (subnode.type == "VariableDeclarator") {
          // var foo = something;
          // Variable names go one level too deep.
          typeFromAssignment(store, [subnode.id.name], subnode.init,
              stack.length);  // weight
          if (!!subnode.init) {
            subnode = subnode.init;
          }
          else break;
        }
        if (subnode.type == "ExpressionStatement") {
          subnode = subnode.expression;  // Parenthesized expression.
        }
        if (subnode.type == "AssignmentExpression") {
          // foo.bar = something;
          if (subnode.left.type === "MemberExpression") {
            symbols = typeFromMember(store, subnode.left);
          } else { symbols = [subnode.left.name]; }
          typeFromAssignment(store, symbols, subnode.right, stack.length);
          subnode = subnode.right;       // f.g = function(){…};
        }
        if (subnode.type == "Property") {
          subnode = subnode.value;       // {f: function(){…}};
        }
      }
      if (subnode.type == "CallExpression") {
        typeFromCall(store, subnode, stack.length);
      }
      if (subnode.type == "FunctionDeclaration" ||
          subnode.type == "FunctionExpression" ||
          // Expressions, eg, (function(){…}());
          (subnode.callee && subnode.callee.type == "FunctionExpression")) {
        if (subnode.callee) {
          subnode = subnode.callee;
        }
        if (subnode.id) {
          store.addProperty(subnode.id.name,
              { name: 'Function', index: 0 },
              stack.length);
          readFun(store, subnode);
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
    body = fakeIfNodeList(node);  // If statements.
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
// Construct a list of nodes to go through based on the sequence of ifs and else
// ifs and elses.
//
// Parameters:
// - node: an AST node of type IfStatement.
function fakeIfNodeList(node) {
  var body = [node.consequent];
  if (node.alternate) {
    if (node.alternate.type === "IfStatement") {
      body = body.concat(fakeIfNodeList(node.alternate));
    } else if (node.alternate.type === "BlockStatement") {
      body.push(node.alternate);
    }
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
    store.addProperty(node[i].name, null, weight);
  }
}



//
// Type inference.

// A type is a list of sources.
//
// *Sources* can be either:
//
// - The result of a `new Constructor()` call.
// - The result of a function.
// - A parameter to a function.
//
// Each function stores information in the TypeStore about all possible sources
// it can give, as a list of sources (aka typestores to all properties):
//
//     [`this` properties, return properties, param1, param2, etc.]
//
// Each instance stores information about the list of sources it may come from.
// Inferred information about the properties of each instance comes from the
// aggregated properties of each source.
// The type is therefore a map of the following form.
//
//      { "name of the original function": [list of indices of source] }
//
// We may represent atomic type outside a compound type as the following:
//
//      { name: "name of the origin", index: source index }
//

// A type inference instance maps symbols to an object of the following form:
//  - properties: a Map from property symbols to typeStores for its properties,
//  - type: a structural type (ie, not atomic) (see above).
//  - weight: integer, relevance of the symbol,
function TypeStore(type, weight) {
  this.properties = new Map();
  this.type = type || new Map();
  this.weight = weight|0;
  if (this.type.has("Function")) {
    // The sources for properties on `this` and on the return object.
    this.sources = [new TypeStore(), new TypeStore()];
  }
}

TypeStore.prototype = {
  // Add a property named `symbol` typed from the atomic type `atype`.
  // `atype` and `weight` may not be present.
  addProperty: function(symbol, atype, weight) {
    if (!this.properties.has(symbol)) {
      if (atype != null) {
        var newType = new Map();
        var typeSources = [atype.index];
        newType.set(atype.name, typeSources);
      }
      this.properties.set(symbol, new TypeStore(newType, weight));
    } else {
      // The weight is proportional to the frequency.
      var p = this.properties.get(symbol);
      p.weight++;   // FIXME: this increment is questionnable.
      if (atype != null) {
        p.addType(atype);
      }
    }
  },

  // Get a property. If inexistent, creates it.
  // Same parameters as `addProperty`.
  getOrSet: function(prop, atype, weight) {
    if (!this.properties.has(prop)) {
      this.addProperty(prop, atype, weight);
    } else if (!!atype) {
      this.properties.get(prop).addType(atype);
    }
    return this.properties.get(prop);
  },

  // Given an atomic type (name, index), is this one?
  hasType: function(atype) {
    if (!this.type.has(atype.name)) { return false; }
    return this.type.get(atype.name).indexOf(atype.index) >= 0;
  },

  // We can add an atomic type (a combination of the name of the original
  // function and the source index) to an existing compound type.
  addType: function(atype) {
    if (atype.name === "Function") {
      // The sources for properties on `this` and on the return object.
      this.sources = this.sources || [new TypeStore(), new TypeStore()];
    }
    if (this.type.has(atype.name)) {
      // The original function name is already known.
      var sourceIndices = this.type.get(atype.name);
      if (sourceIndices.indexOf(atype.index) === -1) {
        sourceIndices.push(atype.index);
      }
    } else {
      // New original function name (common case).
      var sourceIndices = [];
      sourceIndices.push(atype.index);
      this.type.set(atype.name, sourceIndices);
    }
  },

  // Add a compound type.
  // type: { "Constructor": [0] } (a Map).
  addTypes: function(type) {
    var that = this;
    type.forEach(function(value, key) {
      for (var i = 0; i < value.length; i++) {
        that.addType({ name: key, index: value[i] });
      }
    });
  }
};

// funcStore is the typeStore of the containing function.
// node is a MemberExpression.
// Returns a list of identifier elements.
function typeFromThis(funcStore, node) {
  var symbols, symbol, i;
  symbols = [];
  symbol = '';
  while (node.object &&   // `foo()` doesn't have a `.object`.
         node.object.type !== "Identifier" &&
         node.object.type !== "ThisExpression") {
    symbols.push(node.property.name);
    node = node.object;
  }
  if (node.property === undefined) { return []; }
  symbols.push(node.property.name);
  if (node.object.type === "ThisExpression") {
    // Add the `this` properties to the function's generic properties.
    for (i = symbols.length - 1; i >= 0; i--) {
      symbol = symbols[i];
      funcStore.sources[0].addProperty(symbol,
          {name:"Object", index:0}, funcStore.weight);
      funcStore = funcStore.properties.get(symbol);
    }
    return symbols;
  }
}

// Store is a TypeStore instance,
// node is a MemberExpression.
function typeFromMember(store, node) {
  var symbols, symbol, i;
  symbols = [];
  symbol = '';
  while (node.object &&   // `foo()` doesn't have a `.object`.
         node.object.type !== "Identifier" &&
         node.object.type !== "ThisExpression") {
    symbols.push(node.property.name);
    node = node.object;
  }
  if (node.property === undefined) { return []; }
  symbols.push(node.property.name);
  if (node.object.type !== "ThisExpression") {
    symbols.push(node.object.name);  // At this point, node is an identifier.
  } else {
    // Treat `this` as a variable inside the function.
    symbols.push("this");
  }

  // Now that we have the symbols, put them in the store.
  symbols.reverse();
  for (i = 0; i < symbols.length; i++) {
    symbol = symbols[i];
    store.addProperty(symbol);
    store = store.properties.get(symbol);
  }
  return symbols;
}

// Store is a TypeStore instance,
// node is a Literal or an ObjectExpression.
function typeFromLiteral(store, symbols, node) {
  var property, i, substore, nextSubstore;
  substore = store;
  // Find the substore insertion point.
  for (i = 0; i < symbols.length; i++) {
    nextSubstore = substore.properties.get(symbols[i]);
    if (!nextSubstore) {
      // It really should exist.
      substore.addProperty(symbols[i]);
      nextSubstore = substore.properties.get(symbols[i]);
    }
    substore = nextSubstore;
  }
  // Add the symbols.
  var constructor = "Object";
  if (node.type === "ObjectExpression") {
    for (i = 0; i < node.properties.length; i++) {
      property = node.properties[i];
      var propname = property.key.name? property.key.name
                           : property.key.value;
      substore.addProperty(propname);
      if (property.value.type === "ObjectExpression") {
        // We can recursively complete the object tree.
        typeFromLiteral(store, symbols.concat(propname), property.value);
      }
    }
  } else if (node.type === "ArrayExpression") {
    constructor = 'Array';
  } else if (node.value instanceof RegExp) {
    constructor = 'RegExp';
  } else if (typeof node.value === "number") {
    constructor = 'Number';
  } else if (typeof node.value === "string") {
    constructor = 'String';
  } else if (typeof node.value === "boolean") {
    constructor = 'Boolean';
  }
  substore.addType({ name: constructor, index: 0 });
}

// store: a TypeStore
// symbols: a list of Strings representing the assignee,
//          eg. `foo.bar` → ['foo','bar']
// node: the AST node representing the assigned. May be null.
// weight: a Number, representing the depth of the scope.
// FIXME: deal with assignments like `foo().bar = baz`
// (requires a modification in `symbols`' generators).
function typeFromAssignment(store, symbols, node, weight) {
  var property, i, substore, nextSubstore, lastSymbol;
  lastSymbol = symbols[symbols.length - 1];
  if (lastSymbol === undefined) { return; }
  substore = store;
  // Find the substore insertion point.
  // The last symbol will be added separately.
  for (i = 0; i < symbols.length - 1; i++) {
    nextSubstore = substore.properties.get(symbols[i]);
    if (!nextSubstore) {
      // It really should exist.
      substore.addProperty(symbols[i]);
      nextSubstore = substore.properties.get(symbols[i]);
    }
    substore = nextSubstore;
  }
  // What is on the right?
  if (!node) {
    // nothing.
    store.addProperty(lastSymbol, null, weight);
    return;
  }
  if (node.type === "NewExpression") {
    substore.addProperty(lastSymbol,    // property name
        { name: node.callee.name,       // atomic type
          index: 0 },                   // created from `new C()`
        weight);                        // weight
    // FIXME: the following might be inaccurate if the constructor isn't global
    store.addProperty(node.callee.name, { name: 'Function', index: 0 });
  } else if (node.type === "Literal" ||
             node.type === "ObjectExpression" ||
             node.type === "ArrayExpression") {
    // FIXME substore gets computed twice (once more in typeFromLiteral).
    typeFromLiteral(store, symbols, node);
    substore.properties.get(lastSymbol).weight = weight;
  } else if (node.type === "CallExpression") {
    typeFromCall(store, node, weight, lastSymbol, substore);
  } else if (node.type === "FunctionExpression") {
    // `var foo = function ?() {}`.
    var typeFunc = new Map;
    typeFunc.set("Function", [0]);
    var funcStore = new TypeStore(typeFunc);
    funcType(store, node, funcStore);
    store.properties.set(lastSymbol, funcStore);
  } else {
    // Simple object.
    store.addProperty(lastSymbol, null, weight);
  }
}

// Process a call expression.
// `node` is that AST CallExpression.
// `store` is the TypeStore to put it in.
// If that call is set to a property, `setstore` refers to the TypeStore wherein
// to put the type information, and `setsymbol` to the symbol set to that.
function typeFromCall(store, node, weight, setsymbol, setstore) {
  if (node.callee.name) {  // var foo = bar()
    store.addProperty(node.callee.name,
        { name: 'Function', index: 0 },
        weight);
    // Parameters
    for (var i = 0; i < node.arguments.length; i++) {
      store.getOrSet(node.arguments[i].name,
          { name: node.callee.name, index: 2 + i },
          weight);
    }
    if (setstore) {
      // Return type (eg, var foo = bar())
      setstore.addProperty(setsymbol,
          { name: node.callee.name,     // bar
            index: 1 },                 // created from `bar()`
          weight);
    }
  } else if (!node.callee.body) {  // f.g()
    typeFromMember(store, node.callee);
    // FIXME: make the last one (eg, `g`) a function.
  } else if (node.callee.type === "FunctionExpression") {
    // var foo = function(){} ()
    var typeFunc = new Map();
    typeFunc.set("Function", [0]);
    var funcStore = new TypeStore(typeFunc);
    funcType(store, node.callee, funcStore);
    // Its type is that of the return type of the function called.
    if (setstore) {
      // FIXME: don't override, add the properties.
      setstore.properties.set(setsymbol, funcStore.sources[1]);
    }
  }
}


//
// Assumes that the function has an explicit name (node.id.name).
//
// node is a named function declaration / expression.
function readFun(store, node) {
  var funcStore = store.properties.get(node.id.name);
  funcType(store, node, funcStore);
}

// node is a named function declaration / expression.
function funcType(store, node, funcStore) {
  var statements = node.body.body;
  var returnStore, returnCaret;
  for (var i = 0; i < statements.length; i++) {
    if (statements[i].expression &&
        statements[i].expression.type === "AssignmentExpression" &&
        statements[i].expression.left.type === "MemberExpression") {
      // Member expression like `this.bar = …`.
      typeFromThis(funcStore, statements[i].expression.left);

    } else if (statements[i].type === "ReturnStatement") {
      // Return statement, like `return {foo:bar}`.

      if (statements[i].argument.type === "Literal" ||
          statements[i].argument.type === "ObjectExpression") {
        // The source at index 1 is that for the returned object.
        typeFromLiteral(funcStore.sources[1], [], statements[i].argument);

      } else if (statements[i].argument.type === "Identifier") {
        // Put a caret after the return statement and get the scope.
        returnCaret = { line: statements[i].loc.end.line - 1,
                        ch: statements[i].loc.end.column };
        returnStore = getStaticScope(node.body.body, returnCaret);
        var returnEl = returnStore.properties.get(statements[i].argument.name);
        if (returnEl) {
          returnEl.properties.forEach(function(value, key) {
            funcStore.sources[1].properties.set(key, value);
          });
          funcStore.sources[1].addTypes(returnEl.type);
        }
      }
    }
  }
  if (returnStore === undefined) {
    // There was no return statement. Therefore, no store either.
    returnStore = new TypeStore();
    if (statements.length > 0) {
      returnCaret = { line: statements[statements.length-1].loc.end.line - 1,
                      ch: statements[statements.length-1].loc.end.column };
    } else {
      returnCaret = { line: node.body.loc.end.line - 1,
                      ch: node.body.loc.end.column };
    }
    returnStore = getStaticScope(node.body.body, returnCaret);
  }
  for (var i = 0; i < node.params.length; i++) {
    if (node.params[i].name) {
      funcStore.sources[2 + i] =
        returnStore.properties.get(node.params[i].name);
    }
  }
}
