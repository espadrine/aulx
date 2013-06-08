// Testing files in this directory.
//

var Test = require('../entrance/test');
var t = new Test();
var aulx = require('../aulx');
var aulxJS = new aulx.js({global:global});

var source;
var caret;

// Testing main.js

// getContext(source, caret)
source = 'var foo.bar;baz';
caret = {line:0, ch:15};
t.eq(aulxJS.getContext(source, caret),
     { completing: aulxJS.Completing.identifier,
       data: ['baz'] },
     'getContext cares for semi-colons.');
caret = {line:0, ch:11};
t.eq(aulxJS.getContext(source, caret),
     { completing: aulxJS.Completing.identifier,
       data: ['foo', 'bar'] },
     "getContext takes all identifiers (doesn't stop with a dot).");
caret = {line:0, ch:10};
t.eq(aulxJS.getContext(source, caret),
     { completing: aulxJS.Completing.identifier,
       data: ['foo', 'ba'] },
     "getContext cuts identifiers on the cursor.");

source = 'var foo.bar;\nbaz';
caret = {line:1, ch:3};
t.eq(aulxJS.getContext(source, caret),
     { completing: aulxJS.Completing.identifier,
       data: ['baz'] },
     "getContext deals with multiple lines.");

source = 'var foo/*.bar;\n bar*/ baz';
caret = {line:1, ch:10};
t.eq(aulxJS.getContext(source, caret),
     { completing: aulxJS.Completing.identifier,
       data: ['baz'] },
     "getContext deals with multiple line comments.");

source = 'var foo "bar\\\n bar" baz';
caret = {line:1, ch:9};
t.eq(aulxJS.getContext(source, caret),
     { completing: aulxJS.Completing.identifier,
       data: ['baz'] },
     "getContext deals with multiple line strings.");

source = 'var foo "bar\\\n bar';
caret = {line:1, ch:4};
t.eq(aulxJS.getContext(source, caret),
     undefined,
     "getContext deals with untokenizable contexts.");

source = 'this.foo';
caret = {line:0, ch:8};
t.eq(aulxJS.getContext(source, caret),
     { completing: aulxJS.Completing.identifier,
       data: ['this', 'foo'] },
     "getContext deals with `this`.");

// Testing sandbox.js

source = 'foo.ba';
caret = {line:0, ch:source.length};
// Create a global object with no inheritance.
var global = Object.create(null);
global.foo = Object.create(null);
global.foo.bar = 0;
aulxJS = new aulx.js({global:global});
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"r", score:-1}],
     "The JS completer works with dynamic analysis.");

source = '"foo".';
caret = {line:0, ch:source.length};
// Fake String.prototype.
global.String = Object.create(null);
global.String.prototype = Object.create(null);
global.String.prototype.big = 1;
aulxJS = new aulx.js({global:global});
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"big", postfix:"big", score:-1}],
     "The JS completer does string completion.");

source = '/foo/.';
caret = {line:0, ch:source.length};
// Fake String.prototype.
global.RegExp = Object.create(null);
global.RegExp.prototype = Object.create(null);
global.RegExp.prototype.test = 'something';
aulxJS = new aulx.js({global:global});
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"test", postfix:"test", score:-1}],
     "The JS completer does RegExp completion.");

// Testing static.js

source = 'var foobar; foo';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"foobar", postfix:"bar", score:0}],
     "The JS completer works with static analysis.");

source = 'foo.bar = 5; foo.b';
caret = {line:0, ch:source.length};
aulxJS.fireStaticAnalysis(source, caret);
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:0}],
     "The JS completer has static object analysis in property assignments.");

source = 'foo.bar(); foo.b';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:0}],
     "The JS completer has static object analysis in function calls.");

source = 'foo.bar = {baz:5}; foo.bar.b';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"baz", postfix:"az", score:0}],
     "The JS completer has static object literal analysis " +
     "in object assignments.");

source = 'var foo = {bar:5}; foo.b';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:0}],
     "The JS completer has static object analysis in definition.");

source = 'var foo = {"bar":5}; foo.b';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:0}],
     "The JS completer has static object analysis even with strings.");

source = 'this.bar = 5; this.b';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:0}],
     "The JS completer has static object analysis even with strings.");

source = 'F.prototype.bar = 0; var foo = new F(); foo.b';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:0}],
     "The static analysis goes through the prototype.");

source = 'var foo = {"b*": 0}; foo.b';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [],
     "The static analysis doesn't complete non-identifiers.");

source = 'var foo = {b: {bar: 0}}; foo.b.b';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:0}],
     "The static analysis sees types in objects.");

source = 'if (foo) {} else if (foo) {foo.bar = function () { foo.b }}';
caret = {line:0, ch:source.length - 3};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:0}],
     "The static analysis goes through else clauses.");

source = 'f.foo = {bar: 0}; f.foo.b';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js();
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:0}],
     "Static analysis with assignment to property.");

source = 'var foo = 0; foo.b';
global = Object.create(null);
global.Number = Object.create(null);
global.Number.prototype = Object.create(null);
global.Number.prototype.bar = 0;
caret = {line:0, ch:source.length};
aulxJS = new aulx.js({global:global});
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:-1}],
     "Static analysis maps literals to built-in types.");

source = 'var foo = []; foo.b';
global = Object.create(null);
global.Array = Object.create(null);
global.Array.prototype = Object.create(null);
global.Array.prototype.bar = 0;
caret = {line:0, ch:source.length};
aulxJS = new aulx.js({global:global});
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"bar", postfix:"ar", score:-1}],
     "Static analysis identifies array literals.");

source = 'window.quux = 0; qu';
caret = {line:0, ch:source.length};
aulxJS = new aulx.js({globalIdentifier:'window'});
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"quux", postfix:"ux", score:0}],
     "Static analysis uses the globalIdentifier option.");

source = 'init(); ini';
caret = {line:0, ch:source.length};
aulxJS.fireStaticAnalysis(source, caret);
t.eq(aulxJS.complete(source, caret).candidates,
     [{display:"init", postfix:"t", score:0}],
     "Static analysis reads undefined functions.");



// Testing keyword completion

source = 'vo';
caret = {line:0, ch:source.length};
aulxJS.fireStaticAnalysis(source, caret);
t.eq(aulxJS.complete(source, caret).candidates[0].display,
     "void",
     "The JS completer knows keywords (or at least 'void').");

source = 'vo';
caret = {line:0, ch:source.length};
aulxJS.fireStaticAnalysis(source, caret);
t.eq(aulxJS.complete(source, caret).candidates[0].postfix,
     "id",
     "The JS completer completes keywords (or at least 'void').");


// The End.

t.tldr();
t.exit();
