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
     "CSS property autocompletion.");


// The End.

t.tldr();
t.exit();
