// Keyword-based completion.
//

// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * prefix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
// Parameters:
//  - startProp: the start of a CSS property, as a String.
function completeProperties(startProp) {
  var completion = new Completion();
  for (var prop in properties) {
    if (prop.indexOf(startProp) === 0) {
      completion.insert(new Candidate(prop, startProp, 0));
    }
  }
  return completion;
};

// Return a sorted Completion (see entrance/completers.js).
//  - candidateFromDisplay: Map from display string to candidate.
//  - candidates: A list of candidates:
//    * display: a string of what the user sees.
//    * prefix: a string of what is added when the user chooses this.
//    * score: a number to grade the candidate.
//
// Parameters:
//  - propName: the property name for which value is being completed.
//  - startProp: the start of the CSS value, as a String.
function completeValues(propName, startValue) {
  var completion = new Completion();
  (properties[propName] || []).forEach(function(prop) {
    if (prop.indexOf(startValue) === 0) {
      completion.insert(new Candidate(prop, startValue, 0));
    }
  });
  return completion;
};

// FIXME: give properties a score proportional to frequency in common code.
//
// Property value pair obtained from https://gist.github.com/scrapmac/6106409
// On top of which some optimization is done to club similar values.
//
var AU = "auto";
var CA = "calc";
var HI = "hidden"
var INH = "inherit";
var NO = "none";
var BORDER = ["aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", CA, "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "dashed", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "dotted", "double", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "groove", HI, "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "inset", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "medium", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", NO, "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "outset", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "rgb", "rgba", "ridge", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "solid", "springgreen", "steelblue", "tan", "teal", "thick", "thin", "thistle", "tomato", "transparent", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"];
var COLORS = ["aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "rgb", "rgba", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "transparent", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"];
var properties = {
  "align-items": ["baseline", "center", "flex-end", "flex-start", INH, "stretch"],
  "align-self": [AU, "baseline", "center", "flex-end", "flex-start", INH, "stretch"],
  "animation": ["alternate", "alternate-reverse", "backwards", "both", "cubic-bezier", "ease", "ease-in", "ease-in-out", "ease-out", "forwards", "infinite", INH, "linear", NO, "normal", "reverse", "step-end", "step-start", "steps"],
  "animation-delay": [INH],
  "animation-direction": ["alternate", "alternate-reverse", INH, "normal", "reverse"],
  "animation-duration": [INH],
  "animation-fill-mode": ["backwards", "both", "forwards", INH, NO],
  "animation-iteration-count": ["infinite", INH],
  "animation-name": [INH, NO],
  "animation-play-state": [INH, "paused", "running"],
  "animation-timing-function": ["cubic-bezier", "ease", "ease-in", "ease-in-out", "ease-out", INH, "linear", "step-end", "step-start", "steps"],
  "backface-visibility": [HI, INH, "visible"],
  "background": ["aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "border-box", "bottom", "brown", "burlywood", "cadetblue", "center", "chartreuse", "chocolate", "contain", "content-box", "coral", "cornflowerblue", "cornsilk", "cover", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "fixed", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "left", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "local", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "no-repeat", NO, "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "padding-box", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "repeat", "repeat-x", "repeat-y", "rgb", "rgba", "right", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "scroll", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "top", "transparent", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"],
  "background-attachment": ["fixed", INH, "local", "scroll"],
  "background-clip": ["border-box", "content-box", INH, "padding-box"],
  "background-color": COLORS,
  "background-image": [INH, NO],
  "background-origin": ["border-box", "content-box", INH, "padding-box"],
  "background-position": ["bottom", "center", INH, "left", "right", "top"],
  "background-repeat": [INH, "no-repeat", "repeat", "repeat-x", "repeat-y"],
  "background-size": ["contain", "cover", INH],
  "border": BORDER,
  "border-bottom": BORDER,
  "border-bottom-color": COLORS,
  "border-bottom-left-radius": [INH],
  "border-bottom-right-radius": [INH],
  "border-bottom-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-bottom-width": [CA, INH, "medium", "thick", "thin"],
  "border-collapse": ["collapse", INH, "separate"],
  "border-color": COLORS,
  "border-image": ["fill", INH, NO, "repeat", "round", "stretch"],
  "border-image-outset": [INH],
  "border-image-repeat": [INH, "repeat", "round", "stretch"],
  "border-image-slice": ["fill", INH],
  "border-image-source": [INH, NO],
  "border-image-width": [INH],
  "border-left": BORDER,
  "border-left-color": COLORS,
  "border-left-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-left-width": [CA, INH, "medium", "thick", "thin"],
  "border-radius": [INH],
  "border-right": BORDER,
  "border-right-color": COLORS,
  "border-right-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-right-width": [CA, INH, "medium", "thick", "thin"],
  "border-spacing": [INH],
  "border-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-top": BORDER,
  "border-top-color": COLORS,
  "border-top-left-radius": [INH],
  "border-top-right-radius": [INH],
  "border-top-style": ["dashed", "dotted", "double", "groove", HI, INH, "inset", NO, "outset", "ridge", "solid"],
  "border-top-width": [CA, INH, "medium", "thick", "thin"],
  "border-width": [CA, INH, "medium", "thick", "thin"],
  "bottom": [AU, CA, INH],
  "box-shadow": [INH, "inset"],
  "caption-side": ["bottom", "bottom-outside", INH, "left", "right", "top", "top-outside"],
  "clear": ["both", INH, "left", NO, "right"],
  "clip": [INH],
  "clip-path": [INH, NO],
  "clip-rule": ["evenodd", INH, "nonzero"],
  "color": COLORS,
  "color-interpolation": [AU, INH, "linearrgb", "srgb"],
  "color-interpolation-filters": [AU, INH, "linearrgb", "srgb"],
  "content": ["close-quote", INH, "no-close-quote", "no-open-quote", "open-quote"],
  "counter-increment": [INH],
  "counter-reset": [INH],
  "cursor": ["alias", "all-scroll", AU, "cell", "col-resize", "context-menu", "copy", "crosshair", "default", "e-resize", "ew-resize", "help", INH, "move", "n-resize", "ne-resize", "nesw-resize", "no-drop", NO, "not-allowed", "ns-resize", "nw-resize", "nwse-resize", "pointer", "progress", "row-resize", "s-resize", "se-resize", "sw-resize", "text", "vertical-text", "w-resize", "wait", "zoom-in", "zoom-out"],
  "direction": [INH, "ltr", "rtl"],
  "display": ["block", "flex", INH, "inline", "inline-block", "inline-flex", "inline-table", "list-item", NO, "table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row", "table-row-group"],
  "dominant-baseline": ["alphabetic", AU, "central", "hanging", "ideographic", INH, "mathematical", "middle", "no-change", "reset-size", "text-after-edge", "text-before-edge", "use-script"],
  "empty-cells": ["hide", INH, "show"],
  "fill": [INH],
  "fill-opacity": [INH],
  "fill-rule": ["evenodd", INH, "nonzero"],
  "filter": [INH],
  "flex": [AU, CA, INH],
  "flex-basis": [AU, CA, INH],
  "flex-direction": ["column", "column-reverse", INH, "row", "row-reverse"],
  "flex-grow": [INH],
  "flex-shrink": [INH],
  "float": [INH, "left", NO, "right"],
  "flood-color": COLORS,
  "flood-opacity": [INH],
  "font": ["all-petite-caps", "all-small-caps", AU, "bold", "bolder", CA, "caption", "common-ligatures", "condensed", "contextual", "diagonal-fractions", "discretionary-ligatures", "expanded", "extra-condensed", "extra-expanded", "full-width", "historical-forms", "historical-ligatures", "icon", INH, "italic", "jis04", "jis78", "jis83", "jis90", "large", "larger", "lighter", "lining-nums", "medium", "menu", "message-box", "no-common-ligatures", "no-contextual", "no-discretionary-ligatures", "no-historical-ligatures", NO, "normal", "oblique", "oldstyle-nums", "ordinal", "petite-caps", "proportional-nums", "proportional-width", "ruby", "semi-condensed", "semi-expanded", "simplified", "slashed-zero", "small", "small-caps", "small-caption", "smaller", "stacked-fractions", "status-bar", "style", "sub", "super", "tabular-nums", "titling-caps", "traditional", "ultra-condensed", "ultra-expanded", "unicase", "weight", "x-large", "x-small", "xx-large", "xx-small"],
  "font-family": [INH],
  "font-feature-settings": [INH],
  "font-kerning": [AU, INH, NO, "normal"],
  "font-language-override": [INH, "normal"],
  "font-size": [CA, INH, "large", "larger", "medium", "small", "smaller", "x-large", "x-small", "xx-large", "xx-small"],
  "font-size-adjust": [INH, NO],
  "font-stretch": ["condensed", "expanded", "extra-condensed", "extra-expanded", INH, "normal", "semi-condensed", "semi-expanded", "ultra-condensed", "ultra-expanded"],
  "font-style": [INH, "italic", "normal", "oblique"],
  "font-synthesis": [INH, "style", "weight"],
  "font-variant": [INH, "normal", "small-caps"],
  "font-variant-alternates": ["historical-forms", INH],
  "font-variant-caps": ["all-petite-caps", "all-small-caps", INH, "normal", "petite-caps", "small-caps", "titling-caps", "unicase"],
  "font-variant-east-asian": ["full-width", INH, "jis04", "jis78", "jis83", "jis90", "proportional-width", "ruby", "simplified", "traditional"],
  "font-variant-ligatures": ["common-ligatures", "contextual", "discretionary-ligatures", "historical-ligatures", INH, "no-common-ligatures", "no-contextual", "no-discretionary-ligatures", "no-historical-ligatures"],
  "font-variant-numeric": ["diagonal-fractions", INH, "lining-nums", "oldstyle-nums", "ordinal", "proportional-nums", "slashed-zero", "stacked-fractions", "tabular-nums"],
  "font-variant-position": [INH, "normal", "sub", "super"],
  "font-weight": ["bold", "bolder", INH, "lighter", "normal"],
  "height": [AU, CA, INH],
  "image-rendering": [AU, INH, "optimizequality", "optimizespeed"],
  "ime-mode": ["active", AU, "disabled", "inactive", INH, "normal"],
  "justify-content": ["center", "flex-end", "flex-start", INH, "space-around", "space-between"],
  "left": [AU, CA, INH],
  "letter-spacing": [CA, INH, "normal"],
  "lighting-color": COLORS,
  "line-height": [INH, "normal"],
  "list-style": ["armenian", "circle", "cjk-ideographic", "decimal", "decimal-leading-zero", "disc", "georgian", "hebrew", "hiragana", "hiragana-iroha", INH, "inside", "katakana", "katakana-iroha", "lower-alpha", "lower-greek", "lower-latin", "lower-roman", NO, "outside", "square", "upper-alpha", "upper-latin", "upper-roman"],
  "list-style-image": [INH, NO],
  "list-style-position": [INH, "inside", "outside"],
  "list-style-type": ["armenian", "circle", "cjk-ideographic", "decimal", "decimal-leading-zero", "disc", "georgian", "hebrew", "hiragana", "hiragana-iroha", INH, "katakana", "katakana-iroha", "lower-alpha", "lower-greek", "lower-latin", "lower-roman", NO, "square", "upper-alpha", "upper-latin", "upper-roman"],
  "margin": [AU, CA, INH],
  "margin-bottom": [AU, CA, INH],
  "margin-left": [AU, CA, INH],
  "margin-right": [AU, CA, INH],
  "margin-top": [AU, CA, INH],
  "marker": [INH, NO],
  "marker-end": [INH, NO],
  "marker-mid": [INH, NO],
  "marker-offset": [AU, CA, INH],
  "marker-start": [INH, NO],
  "marks": ["crop", "cross", INH, NO],
  "mask": [INH, NO],
  "mask-type": ["alpha", INH, "luminance"],
  "max-height": [CA, INH, NO],
  "max-width": [CA, INH, NO],
  "min-height": [CA, INH],
  "min-width": [CA, INH],
  "opacity": [INH],
  "order": [INH],
  "orphans": [INH],
  "outline": ["aliceblue", "antiquewhite", "aqua", "aquamarine", AU, "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", CA, "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "dashed", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "dotted", "double", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "groove", "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "inset", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "medium", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", NO, "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "outset", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "rgb", "rgba", "ridge", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "solid", "springgreen", "steelblue", "tan", "teal", "thick", "thin", "thistle", "tomato", "transparent", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"],
  "outline-color": COLORS,
  "outline-offset": [CA, INH],
  "outline-style": [AU, "dashed", "dotted", "double", "groove", INH, "inset", NO, "outset", "ridge", "solid"],
  "outline-width": [CA, INH, "medium", "thick", "thin"],
  "overflow": [AU, HI, INH, "scroll", "visible"],
  "overflow-x": [AU, HI, INH, "scroll", "visible"],
  "overflow-y": [AU, HI, INH, "scroll", "visible"],
  "padding": [CA, INH],
  "padding-bottom": [CA, INH],
  "padding-left": [CA, INH],
  "padding-right": [CA, INH],
  "padding-top": [CA, INH],
  "page": [AU, INH],
  "page-break-after": ["always", AU, "avoid", INH, "left", "right"],
  "page-break-before": ["always", AU, "avoid", INH, "left", "right"],
  "page-break-inside": [AU, "avoid", INH],
  "paint-order": [INH],
  "perspective": [INH, NO],
  "perspective-origin": ["bottom", "center", INH, "left", "right", "top"],
  "pointer-events": ["all", AU, "fill", INH, NO, "painted", "stroke", "visible", "visiblefill", "visiblepainted", "visiblestroke"],
  "position": ["absolute", "fixed", INH, "relative", "static"],
  "quotes": [INH],
  "resize": ["both", "horizontal", INH, NO, "vertical"],
  "right": [AU, CA, INH],
  "shape-rendering": [AU, "crispedges", "geometricprecision", INH, "optimizespeed"],
  "size": [INH, "landscape", "portrait"],
  "stop-color": COLORS,
  "stop-opacity": [INH],
  "stroke": [INH],
  "stroke-dasharray": [INH],
  "stroke-dashoffset": [INH],
  "stroke-linecap": ["butt", INH, "round", "square"],
  "stroke-linejoin": ["bevel", INH, "miter", "round"],
  "stroke-miterlimit": [INH],
  "stroke-opacity": [INH],
  "stroke-width": [INH],
  "table-layout": [AU, "fixed", INH],
  "text-align": ["center", "end", INH, "justify", "left", "right", "start"],
  "text-anchor": ["end", INH, "middle", "start"],
  "text-decoration": ["aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blink", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "dashed", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "dotted", "double", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "hsl", "hsla", "indianred", "indigo", INH, "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "line-through", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", NO, NO, "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "overline", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "red", "rgb", "rgba", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "solid", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "transparent", "turquoise", "underline", "violet", "wavy", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"],
  "text-indent": [CA, INH],
  "text-overflow": ["clip", "ellipsis", INH],
  "text-rendering": [AU, "geometricprecision", INH, "optimizelegibility", "optimizespeed"],
  "text-shadow": [INH],
  "text-transform": ["capitalize", "full-width", INH, "lowercase", NO, "uppercase"],
  "top": [AU, CA, INH],
  "transform": ["block", "flex", INH, "inline", "inline-block", "inline-flex", "inline-table", "list-item", NO, "table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row", "table-row-group"],
  "transform-origin": ["bottom", "center", INH, "left", "right", "top"],
  "transform-style": ["flat", INH, "preserve-3d"],
  "transition": ["all", "cubic-bezier", "ease", "ease-in", "ease-in-out", "ease-out", INH, "linear", NO, "step-end", "step-start", "steps"],
  "transition-delay": [INH],
  "transition-duration": [INH],
  "transition-property": ["all", INH, NO],
  "transition-timing-function": ["cubic-bezier", "ease", "ease-in", "ease-in-out", "ease-out", INH, "linear", "step-end", "step-start", "steps"],
  "unicode-bidi": ["bidi-override", "embed", INH, "normal"],
  "vector-effect": [INH, "non-scaling-stroke", NO],
  "vertical-align": ["baseline", "bottom", CA, INH, "middle", "sub", "super", "text-bottom", "text-top", "top"],
  "visibility": ["collapse", HI, INH, "visible"],
  "white-space": [INH, "normal", "nowrap", "pre", "pre-line", "pre-wrap"],
  "widows": [INH],
  "width": [AU, CA, INH],
  "word-break": ["break-all", INH, "keep-all", "normal"],
  "word-spacing": [CA, INH, "normal"],
  "word-wrap": ["break-word", INH, "normal"],
  "z-index": [AU, INH]
};
