// Testing files in this directory.
//

var Test = require('../entrance/test');
var t = new Test();
var htmlTokenize = require('./tokenizer').htmlTokenize;
var aulx = require('../aulx');

var source;
var caret;
var tokens;

var jlog = function(data, intro) {
  var logged = '';
  if (intro) { logged += intro + ': '; }
  logged += JSON.stringify(data);
  console.log(logged);
}

// Testing the tokenizer.

source = 'foo &gt; bar';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, 1, "Textual token");
t.eq(tokens[0].value, "foo ", "A textual token should have the text's data");
t.eq(tokens[0].start.line, 0, "The first token should be at line 0");
t.eq(tokens[0].start.column, 0, "The first token should be at column 0");
t.eq(tokens[0].end.column, 4, "Token columns should increase");
t.eq(tokens[1].type, 2, "Attribute reference token");
t.eq(tokens[1].data, ">",
    "Attribute reference token contains characters");
t.eq(tokens[1].value, "&gt;",
    "Attribute reference token contains original text");
t.eq(tokens[2].type, 1, "Textual token after character reference");
t.eq(tokens[2].value, " bar",
    "The textual token after the character reference " +
    "should have the text's data");
t.eq(tokens[3].type, 0, "EOF token");
t.eq(tokens[3].start.column, 12, "EOF token starts at the end");
t.eq(tokens[3].end.column, 12, "EOF token ends at the end");

//source = '<foo> bar';
//tokens = htmlTokenize(source);

//source = '<foo bar="baz"></foo>';
//tokens = htmlTokenize(source);
jlog(tokens);


// Testing the autocompletion.

// Testing main.js

// Properties.
source = '<htm';
caret = {line:1, ch:4};
//t.eq(aulx.html(source, caret).candidates,
//     [{display:"html", prefix:"htm", score:0}],
//     "HTML tag autocompletion with one suggestion.");


// The End.

t.tldr();
t.exit();
