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
     { completion: jsCompleter.Completion.identifier,
       data: ['baz'] },
     'getContext cares for semi-colons.');
caret = {line:0, ch:11};
t.eq(jsCompleter.getContext(source, caret),
     { completion: jsCompleter.Completion.identifier,
       data: ['foo', 'bar'] },
     "getContext takes all identifiers (doesn't stop with a dot).");
caret = {line:0, ch:10};
t.eq(jsCompleter.getContext(source, caret),
     { completion: jsCompleter.Completion.identifier,
       data: ['foo', 'ba'] },
     "getContext cuts identifiers on the cursor.");

// Testing sandbox.js

source = 'foo.ba';
caret = {line:0, ch:source.length};
// Create a global object with no inheritance.
var global = Object.create(null);
global.foo = Object.create(null);
global.foo.bar = 0;
t.eq(jsCompleter(source, caret, {global:global}),
     {candidates:['bar'], completions:['r']},
     "The JS completer works with dynamic analysis.");

source = '"foo".';
caret = {line:0, ch:source.length};
// Fake String.prototype.
global.String = Object.create(null);
global.String.prototype = Object.create(null);
global.String.prototype.big = 1;
t.eq(jsCompleter(source, caret, {global:global}),
     {candidates:['big'], completions:['big']},
     "The JS completer does string completion.");

// Testing static.js

source = 'var foobar; foo';
caret = {line:0, ch:source.length};
t.eq(jsCompleter(source, caret, {fireStaticAnalysis:true}),
     {candidates:['foobar'], completions:['bar']},
     "The JS completer works with static analysis.");


// The End.

t.tldr();
t.exit();
