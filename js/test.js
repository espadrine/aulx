// Testing files in this directory.
//

var Test = require('../test');
var t = new Test();
var aulx = require('../aulx');

// Testing main.js

// getContext(source, caret)
var source = 'var foo.bar;baz';
var caret = {line:0, ch:15};
t.eq(aulx.getContext(source, caret),
     { completion: aulx.Completion.identifier,
       data: ['baz'] },
     'getContext cares for semi-colons.');
caret = {line:0, ch:11};
t.eq(aulx.getContext(source, caret),
     { completion: aulx.Completion.identifier,
       data: ['foo', 'bar'] },
     "getContext takes all identifiers (doesn't stop with a dot).");
caret = {line:0, ch:10};
t.eq(aulx.getContext(source, caret),
     { completion: aulx.Completion.identifier,
       data: ['foo', 'ba'] },
     "getContext cuts identifiers on the cursor.");

// Testing sandbox.js

var jsCompleter = aulx.completer.js;
var source = 'foo.ba';
var caret = {line:0, ch:source.length};
// Create a global object with no inheritance.
var global = Object.create(null);
global.foo = Object.create(null);
global.foo.bar = 0;
t.eq(jsCompleter(source, caret, {global:global}),
     {candidates:['bar'], completions:['r']},
     "The JS completer works with dynamic analysis.");

// Testing static.js

var source = 'var foobar; foo';
var caret = {line:0, ch:source.length};
t.eq(jsCompleter(source, caret, {fireStaticAnalysis:true}),
     {candidates:['foobar'], completions:['bar']},
     "The JS completer works with static analysis.");


// The End.

t.tldr();
t.exit();
