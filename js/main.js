/**
 * Get a list of completions we can have, based on the state of the editor.
 * Autocompletion happens based on the following factors
 * (with increasing relevance):
 *
 * Level 0 = JS keywords.
 * Level 1 = dynamic lookup of available properties.
 * Level 2 = static analysis of the code.
 *
 * Use candidates for UI purposes, and completions when inserting the completion
 * in the editor.
 *
 * Parameters:
 *  - source: String of the source code.
 *  - caret: Object containing two fields:
 *    * line: the line number of the caret, starting with zero.
 *    * ch: the column of the caret, starting with zero.
 *  - options: Object containing optional parameters:
 *    * line: String of the current line (which the editor may provide
 *      more efficiently than the default way.
 *    * global: global object. Can be used to perform level 1 (see above).
 *    * fireStaticAnalysis: A Boolean to run the (possibly expensive) static
 *      analysis. Recommendation: run it at every newline.
 *
 * Return an object with the following fields:
 *  - candidates: A list of the matches to a possible completion.
 *  - completions: A list of the associated completion to a candidate.
 */
function jsCompleter(source, caret, options) {
  options = options || {};
  var candidates = [];
  var completions = [];

  // We use a primitive sorting algorithm.
  // The candidates are simply concatenated, level after level.
  // We assume that Level 0 < Level 1 < etc.
  // FIXME: implement a score-based system that adjusts its weights based on
  // statistics from what the user actually selects.

  var identifier = getIdentifier(source, caret);

  // Static analysis (Level 2).

  // Only do this (possibly expensive) operation once every new line.
  if (staticCandidates == null || options.fireStaticAnalysis) {
    staticCandidates = getStaticScope(source, caret.line + 1, caret.ch)
        || staticCandidates;   // If it fails, use the previous version.
  }
  var allStaticCandidates = staticCandidates;
  // Right now, we can only complete variables.
  if (identifier.length === 1 && allStaticCandidates != null) {
    var varName = identifier[0];
    var staticCandidates = [];
    for (var i = 0; i < allStaticCandidates.length; i++) {
      var candidate = allStaticCandidates[i][0];
      var weight = allStaticCandidates[i][1];
      // The candidate must match and have something to add!
      if (candidate.indexOf(varName) == 0
          && candidate.length > varName.length) {
        staticCandidates.push(candidate);
      }
    }
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
    var sandboxCompletion = identifierLookup(options.global, identifier);
    if (sandboxCompletion) {
      sandboxCompletion.matches = sandboxCompletion.matches
        .filter(function(candidate) {
          // We are removing candidates from level 2.
          if (allStaticCandidates == null)  return true;
          return !allStaticCandidates.has(candidate);
      });
      candidates = candidates.concat(sandboxCompletion.matches);
      completions = completions.concat(sandboxCompletion.matches
        .map(function(candidate) {
          return candidate.slice(sandboxCompletion.matchProp.length);
        }));
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
  // This autocompletion is not meaningful when we type a property…
  if (identifier.indexOf(".") == -1 && identifier.indexOf("[") == -1 &&
      identifier.length !== 0) {
    for (var i = 0; i < keywords.length; i++) {
      var keyword = keywords[i];
      // The keyword must match and have something to add!
      if (keyword.indexOf(identifier) == 0
          && keyword.length > identifier.length) {
        candidates.push(keyword);
        completions.push(keyword.slice(identifier.length));
      }
    }
  }

  return {
    candidates: candidates,
    completions: completions,
  };
}
