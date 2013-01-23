// The weight comes from keyword frequency data at
// http://ariya.ofilabs.com/2012/03/most-popular-javascript-keywords.html

var JSKeywords = (function(keywords) {
  var keywordWeights = {};
  for (var i = 0; i < keywords.length; i++) {
    // The first keyword has a weight of -2,
    // the second one of -3, etc.
    keywordWeights[keywords[i]] = - i - 2;
  }
  return keywordWeights;
}([
  "this",
  "function",
  "if",
  "return",
  "var",
  "let",
  "else",
  "for",
  "new",
  "in",
  "typeof",
  "while",
  "case",
  "break",
  "try",
  "catch",
  "delete",
  "throw",
  "switch",
  "continue",
  "default",
  "instanceof",
  "do",
  "void",
  "finally",

  // We do not have information about the following.
  // Also, true, false, null and undefined are not keywords stricto sensu,
  // but autocompleting them seems nicer.
  "true",
  "false",
  "null",
  "undefined",
  "class",
  "super",
  "import",
  "export",
  "get",
  "of",
  "set",
  "const",
  "with",
  "debugger"
]));
