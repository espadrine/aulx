// Testing files in this directory.
//

var Test = require('../test');
var t = new Test();
var aulx = require('../aulx');

// Testing static.js

// getIdentifier(source, caret)
var source = 'var foo.bar;baz';
var caret = {line:0, ch:15};
t.eq(aulx.getIdentifier(source, caret),
     ['baz'],
     'getIdentifier cares for semi-colons.');
caret = {line:0, ch:11};
t.eq(aulx.getIdentifier(source, caret),
     ['foo', 'bar'],
     "getIdentifier takes all identifiers (doesn't stop with a dot).");
caret = {line:0, ch:10};
t.eq(aulx.getIdentifier(source, caret),
     ['foo', 'ba'],
     "getIdentifier cuts identifiers on the cursor.");


// The End.

t.tldr();
t.exit();
