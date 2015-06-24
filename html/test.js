// Testing files in this directory.
//

var Test = require('../entrance/test');
var t = new Test();
var htmlTokenize = require('./tokenizer').htmlTokenize;
var htmlToken = require('./tokenizer').htmlToken;
var aulx = require('../aulx');

var source;
var caret;
var tokens;

var nameFromToken = [];
for (var tokenName in htmlToken) {
  nameFromToken[htmlToken[tokenName]] = tokenName;
}
var tlog = function(tokens, intro) {
  var logged = '';
  if (intro) { logged += intro + ':\n'; }
  for (var i = 0; i < tokens.length; i++) {
    logged += nameFromToken[tokens[i].type] + ': ' + JSON.stringify(tokens[i]) + '\n';
  }
  console.log(logged);
}

// Testing the tokenizer.

source = 'foo &gt; bar';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.char, "Textual token");
t.eq(tokens[0].value, "foo ", "A textual token should have the text's data");
t.eq(tokens[0].start.line, 0, "The first token should be at line 0");
t.eq(tokens[0].start.column, 0, "The first token should be at column 0");
t.eq(tokens[0].end.column, 4, "Token columns should increase");
t.eq(tokens[1].type, htmlToken.charRef, "Attribute reference token");
t.eq(tokens[1].data, ">",
    "Attribute reference token contains characters");
t.eq(tokens[1].value, "&gt;",
    "Attribute reference token contains original text");
t.eq(tokens[2].type, htmlToken.char, "Textual token after character reference");
t.eq(tokens[2].value, " bar",
    "The textual token after the character reference " +
    "should have the text's data");
t.eq(tokens[3].type, htmlToken.eof, "EOF token");
t.eq(tokens[3].start.column, 12, "EOF token starts at the end");
t.eq(tokens[3].end.column, 12, "EOF token ends at the end");

source = '<foo> bar </foo>';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.startTagOpen, "Start tag open");
t.eq(tokens[0].value, "<", "Start tag open should be <");
t.eq(tokens[1].type, htmlToken.startTag, "Start tag");
t.eq(tokens[1].value, "foo", "Start tag should be foo");
t.eq(tokens[1].start.column, 1, "Start tag should start at the beginning of foo");
t.eq(tokens[1].end.column, 4, "Start tag should end at the end of foo");
t.eq(tokens[2].type, htmlToken.startTagClose, "Start tag close");
t.eq(tokens[3].type, htmlToken.char, "Inside tag content is a char");
t.eq(tokens[3].value, " bar ", "Inside tag content is ' bar '");
t.eq(tokens[3].start.column, 5, "Inside tag content start");
t.eq(tokens[3].end.column, 10, "Inside tag content end");
t.eq(tokens[4].type, htmlToken.endTagOpen, "End tag open");
t.eq(tokens[5].type, htmlToken.endTag, "End tag");
t.eq(tokens[5].value, "foo", "End tag content");
t.eq(tokens[6].type, htmlToken.endTagClose, "End tag close");
t.eq(tokens[7].type, htmlToken.eof, "EOF");

source = '<foo bar >';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.startTagOpen, "Start tag open");
t.eq(tokens[1].type, htmlToken.startTag, "Start tag");
t.eq(tokens[2].type, htmlToken.attr, "Attribute");
t.eq(tokens[2].value, "bar", "Attribute value");
t.eq(tokens[2].start.column, 5, "Attribute start location");
t.eq(tokens[2].end.column, 8, "Attribute end location");
t.eq(tokens[3].type, htmlToken.startTagClose, "Start tag close");
t.eq(tokens[4].type, htmlToken.eof, "EOF");



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
