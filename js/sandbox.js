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
