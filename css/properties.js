// Keyword-based completion.
//

// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * postfix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
// Parameters:
//  - startProp: the start of a CSS property, as a String.
function completeProperties(startProp) {
  var completion = new Completion();
  for (var prop in properties) {
    if (prop.indexOf(startProp) === 0) {
      completion.insert(new Candidate(prop, prop.slice(startProp.length), 0));
    }
  }
  return completion;
};

// FIXME: put the associated parameters somehow.
// FIXME: give properties a score proportional to frequency in common code.
//
// List of CSS properties fetched using the following command:
//
//      curl 'www.w3.org/TR/CSS21/propidx.html' \
//      | grep -e '^<tr><td><a href=".*">.*</a>$' \
//      | grep -oE "'(.*)'" \
//      | sed "s/'//g" > properties
//
var properties = {
  "azimuth": [],
  "background-attachment": [],
  "background-color": [],
  "background-image": [],
  "background-position": [],
  "background-repeat": [],
  "background": [],
  "border-collapse": [],
  "border-color": [],
  "border-spacing": [],
  "border-style": [],
  "border-top": [],
  "border-top-color": [],
  "border-top-style": [],
  "border-top-width": [],
  "border-width": [],
  "border": [],
  "bottom": [],
  "caption-side": [],
  "clear": [],
  "clip": [],
  "color": [],
  "content": [],
  "counter-increment": [],
  "counter-reset": [],
  "cue-after": [],
  "cue-before": [],
  "cue": [],
  "cursor": [],
  "direction": [],
  "display": [],
  "elevation": [],
  "empty-cells": [],
  "float": [],
  "font-family": [],
  "font-size": [],
  "font-style": [],
  "font-variant": [],
  "font-weight": [],
  "font": [],
  "height": [],
  "left": [],
  "letter-spacing": [],
  "line-height": [],
  "list-style-image": [],
  "list-style-position": [],
  "list-style-type": [],
  "list-style": [],
  "margin-right": [],
  "margin-top": [],
  "margin": [],
  "max-height": [],
  "max-width": [],
  "min-height": [],
  "min-width": [],
  "orphans": [],
  "outline-color": [],
  "outline-style": [],
  "outline-width": [],
  "outline": [],
  "overflow": [],
  "padding-top": [],
  "padding": [],
  "page-break-after": [],
  "page-break-before": [],
  "page-break-inside": [],
  "pause-after": [],
  "pause-before": [],
  "pause": [],
  "pitch-range": [],
  "pitch": [],
  "play-during": [],
  "position": [],
  "quotes": [],
  "richness": [],
  "right": [],
  "speak-header": [],
  "speak-numeral": [],
  "speak-punctuation": [],
  "speak": [],
  "speech-rate": [],
  "stress": [],
  "table-layout": [],
  "text-align": [],
  "text-decoration": [],
  "text-indent": [],
  "text-transform": [],
  "top": [],
  "unicode-bidi": [],
  "vertical-align": [],
  "visibility": [],
  "voice-family": [],
  "volume": [],
  "white-space": [],
  "widows": [],
  "width": [],
  "word-spacing": [],
  "z-index": []
};
