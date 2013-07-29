// Testing files in this directory.
//

var Test = require('../entrance/test');
var t = new Test();
var aulx = require('../aulx');

var source;
var caret;

// Testing main.js

// Properties.
source = 'foo \n{ max-h: baz; }';
caret = {line:1, ch:5};
t.eq(aulx.css(source, caret).candidates,
     [{display:"max-height", prefix:"max-h", score:0}],
     "CSS property autocompletion with one suggestion.");

source = 'foo \n{ max: baz; }';
caret = {line:1, ch:5};
t.eq(aulx.css(source, caret).candidates,
     [{display:"max-height", prefix:"max", score:0},
      {display:"max-width", prefix:"max", score:0}],
     "CSS property autocompletion with more than one suggestions.");

source = 'foo \n{ max-height: baz;\n dis }';
caret = {line:2, ch:4};
t.eq(aulx.css(source, caret).candidates,
     [{display:"display", prefix:"dis", score:0}],
     "CSS property autocompletion in second line and incomplete CSS.");

source = 'baz#foo.bar > .foobar{\n max-h: baz; }';
caret = {line:1, ch:6};
t.eq(aulx.css(source, caret).candidates,
     [{display:"max-height", prefix:"max-h", score:0}],
     "CSS property autocompletion with a complex selector.");

source = '@media screen only {\n foo \n{  max-height: baz;\n  di';
caret = {line:3, ch:4};
t.eq(aulx.css(source, caret).candidates,
     [{display:"direction", prefix:"di", score:0},
      {display:"display", prefix:"di", score:0}],
     "CSS property autocompletion with a media tag.");

source = 'foo \n{ max-height: baz; }\n @keyframs {\n from {\n  col';
caret = {line:4, ch:5};
t.eq(aulx.css(source, caret).candidates,
     [{display:"color", prefix:"col", score:0},
      {"display":"color-interpolation","prefix":"col","score":0},
      {"display":"color-interpolation-filters","prefix":"col","score":0}],
     "CSS property autocompletion inside a keyframe's frame.");

// The End.

t.tldr();
t.exit();
