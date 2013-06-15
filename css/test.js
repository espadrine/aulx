// Testing files in this directory.
//

var Test = require('../entrance/test');
var t = new Test();
var aulx = require('../aulx');

var source;
var caret;

// Testing main.js

// Properties.
source = 'foo \n{ azi: baz; }';
caret = {line:1, ch:5};
t.eq(aulx.css(source, caret).candidates,
     [{display:"azimuth", prefix:"azi", score:0}],
     "CSS property autocompletion.");


// The End.

t.tldr();
t.exit();
