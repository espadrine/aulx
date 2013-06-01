// Sandbox-based analysis.
//

// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * postfix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
// Parameters:
//  - global: an Object in which to search.
//  - context: {completion: number, data: array}
//    We assume completion to be either identifier or property.
//    See ./main.js.
function identifierLookup(global, context, options) {
  var matchProp = '';
  var completion = new Completion();

  var value = global;
  var symbols;
  var store = staticCandidates;
  if (context.completing === Completing.identifier ||  // foo.ba|
      context.completing === Completing.property) {    // foo.|
    symbols = context.data;
    if (context.completing === Completing.identifier) {
      symbols = context.data.slice(0, -1);
      matchProp = context.data[context.data.length - 1];
    }
    for (var i = 0; i < symbols.length; i++) {
      var descriptor = getPropertyDescriptor(value, symbols[i]);
      if (descriptor && descriptor.get) {
        // This is a getter / setter.
        // We might trigger a side-effect by going deeper.
        // We must stop before the world blows up in a Michael Bay manner.
        value = null;
        break;
      } else {
        // We need to go deeper. One property deeper.
        value = value[symbols[i]];
        if (value == null) { break; }
      }
    }
    dynAnalysisFromType(completion, symbols, global, matchProp);

  } else if (context.completing === Completing.string) {
    // "foo".|
    value = global.String.prototype;
  } else if (context.completing === Completing.regex) {
    // /foo/.|
    value = global.RegExp.prototype;
  }

  if (value != null) {
    completionFromValue(completion, value, matchProp);
  }
  return completion;
}


// completion: a Completion object,
// symbols: a list of strings of properties.
// global: a JS global object.
// matchProp: the start of the property name to complete.
function dynAnalysisFromType(completion, symbols, global, matchProp) {
  var store = staticCandidates;
  for (var i = 0; i < symbols.length; i++) {
    store = store.properties.get(symbols[i]);
  }
  // Get the type of this property.
  if (!!store) {
    store.type.forEach(function(sourceIndices, funcName) {
      // The element is an instance of that class (source index = 0).
      if (sourceIndices.indexOf(0) >= 0 && global[funcName]) {
        completionFromValue(completion, global[funcName].prototype, matchProp);
      }
    });
  }
}

// completion: a Completion object,
// value: a JS object
// matchProp: a string of the start of the property to complete.
function completionFromValue(completion, value, matchProp) {
  var matchedProps = getMatchedProps(value, { matchProp: matchProp });
  for (var prop in matchedProps) {
    // It needs to be a valid property: this is dot completion.
    try {
      var tokens = esprima.tokenize(prop);
      if (tokens.length === 1 && tokens[0].type === "Identifier") {
        completion.insert(
            new Candidate(prop, prop.slice(matchProp.length), -1));
      }
    } catch (e) {} // Definitely not a valid property.
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
