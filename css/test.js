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
caret = {line:1, ch:7};
t.eq(aulx.css(source, caret).candidates,
     [{display:"max-height", prefix:"max-h", score:0}],
     "CSS property autocompletion with one suggestion.");

source = 'foo \n{ max-h: baz; }';
caret = {line:1, ch:5};
t.eq(aulx.css(source, caret).candidates,
     [{display:"max-height", prefix:"max", score:0},
      {"display":"max-width","prefix":"max","score":0}],
     "CSS property autocompletion with cursor not at end of partial property " +
     "name giving rise to 2 suggestions instead of one.");

source = 'foo \n{ max-h: baz; }';
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


// Values
source = 'foo \n{ max-height: i';
caret = {line:1, ch:15};
t.eq(aulx.css(source, caret).candidates,
     [{display:"inherit", prefix:"i", score:0}],
     "CSS Value completion with one suggestion.");

source = 'foo \n{ display: inherit';
caret = {line:1, ch:12};
t.eq(aulx.css(source, caret).candidates,
     [{display:"inherit", prefix:"i", score:0},
      {display:"inline", prefix:"i", score:0},
      {display:"inline-block", prefix:"i", score:0},
      {display:"inline-flex", prefix:"i", score:0},
      {display:"inline-table", prefix:"i", score:0}],
     "CSS Value autocompletion with cursor not at end of partial property " +
     "name giving rise to 2 suggestions instead of one.");

source = 'foo \n{ display: inline';
caret = {line:1, ch:17};
t.eq(aulx.css(source, caret).candidates,
     [{display:"inline", prefix:"inline", score:0},
      {display:"inline-block", prefix:"inline", score:0},
      {display:"inline-flex", prefix:"inline", score:0},
      {display:"inline-table", prefix:"inline", score:0}],
     "CSS value autocompletion with more than one suggestions.");

source = 'foo \n{ displ: inline';
caret = {line:1, ch:15};
t.eq(aulx.css(source, caret).candidates, [],
     "CSS value completion with invalid property name.");

source = 'foo \n{ max-height: baz;\n display: inline }';
caret = {line:2, ch:16};
t.eq(aulx.css(source, caret).candidates,
     [{display:"inline", prefix:"inline", score:0},
      {display:"inline-block", prefix:"inline", score:0},
      {display:"inline-flex", prefix:"inline", score:0},
      {display:"inline-table", prefix:"inline", score:0}],
     "CSS value autocompletion in second line and incomplete CSS.");

source = 'baz#foo.bar > .foobar{\n max-height: i; }';
caret = {line:1, ch:14};
t.eq(aulx.css(source, caret).candidates,
     [{display:"inherit", prefix:"i", score:0}],
     "CSS value autocompletion with a complex selector.");

source = '@media screen only {\n foo \n{  max-height: baz;\n  display: i';
caret = {line:3, ch:12};
t.eq(aulx.css(source, caret).candidates,
     [{display:"inherit", prefix:"i", score:0},
      {display:"inline", prefix:"i", score:0},
      {display:"inline-block", prefix:"i", score:0},
      {display:"inline-flex", prefix:"i", score:0},
      {display:"inline-table", prefix:"i", score:0}],
     "CSS value autocompletion with a media tag.");

source = 'foo \n{ max-height: baz; }\n @keyframs {\n from {\n  color:   r';
caret = {line:4, ch:12};
t.eq(aulx.css(source, caret).candidates,
     [{display:"red", prefix:"r", score:0},
      {"display":"rgb","prefix":"r","score":0},
      {"display":"rgba","prefix":"r","score":0},
      {"display":"rosybrown","prefix":"r","score":0},
      {"display":"royalblue","prefix":"r","score":0}],
     "CSS property autocompletion inside a keyframe's frame.");

// The End.

t.tldr();
t.exit();
