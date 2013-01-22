// Testing files in this directory.
//

var Test = require('../entrance/test');
var t = new Test();
var aulx = require('../aulx');
var jsCompleter = aulx.js;

var source;
var caret;

// Testing main.js

// getContext(source, caret)
source = 'var foo.bar;baz';
caret = {line:0, ch:15};
t.eq(jsCompleter.getContext(source, caret),
     { completing: jsCompleter.Completing.identifier,
       data: ['baz'] },
     'getContext cares for semi-colons.');
caret = {line:0, ch:11};
t.eq(jsCompleter.getContext(source, caret),
     { completing: jsCompleter.Completing.identifier,
       data: ['foo', 'bar'] },
     "getContext takes all identifiers (doesn't stop with a dot).");
caret = {line:0, ch:10};
t.eq(jsCompleter.getContext(source, caret),
     { completing: jsCompleter.Completing.identifier,
       data: ['foo', 'ba'] },
     "getContext cuts identifiers on the cursor.");

// Testing sandbox.js

source = 'foo.ba';
caret = {line:0, ch:source.length};
// Create a global object with no inheritance.
var global = Object.create(null);
global.foo = Object.create(null);
global.foo.bar = 0;
t.eq(jsCompleter(source, caret, {global:global}).candidates,
     [{display:"bar", postfix:"r", score:-1}],
     "The JS completer works with dynamic analysis.");

source = '"foo".';
caret = {line:0, ch:source.length};
// Fake String.prototype.
global.String = Object.create(null);
global.String.prototype = Object.create(null);
global.String.prototype.big = 1;
t.eq(jsCompleter(source, caret, {global:global}).candidates,
     [{display:"big", postfix:"big", score:-1}],
     "The JS completer does string completion.");

// Testing static.js

source = 'var foobar; foo';
caret = {line:0, ch:source.length};
t.eq(jsCompleter(source, caret, {fireStaticAnalysis:true}).candidates,
     [{display:"foobar", postfix:"bar", score:0}],
     "The JS completer works with static analysis.");

// Testing keyword completion

source = 'vo';
caret = {line:0, ch:source.length};
t.eq(jsCompleter(source, caret, {fireStaticAnalysis:true}).candidates[0].display,
     "void",
     "The JS completer knows keywords (or at least 'void').");

source = 'vo';
caret = {line:0, ch:source.length};
t.eq(jsCompleter(source, caret, {fireStaticAnalysis:true}).candidates[0].postfix,
     "id",
     "The JS completer completes keywords (or at least 'void').");


// The End.

t.tldr();
t.exit();
