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

source = 'foo &smth; bar';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.char, "Non-character reference token");
t.eq(tokens[0].value, "foo &smth; bar",
    "Non-character reference value contains characters");
t.eq(tokens[0].data, null, "Non-character reference data contains null");

source = 'foo &ampbar>';
tokens = htmlTokenize(source);
t.eq(tokens[1].type, htmlToken.charRef,
    "Character reference token without ; followed by letters");

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

source = '<foo bar />';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.startTagOpen, "Start tag open");
t.eq(tokens[1].type, htmlToken.startTag, "Start tag");
t.eq(tokens[2].type, htmlToken.attr, "Attribute");
t.eq(tokens[2].value, "bar", "Attribute value");
t.eq(tokens[2].start.column, 5, "Attribute start location");
t.eq(tokens[2].end.column, 8, "Attribute end location");
t.eq(tokens[3].type, htmlToken.selfClosing, "Self-closing tag");
t.eq(tokens[3].value, "/", "self-closing tag is a /");
t.eq(tokens[3].start.column, 9, "Attribute start location");
t.eq(tokens[3].end.column, 10, "Attribute end location");
t.eq(tokens[4].type, htmlToken.startTagClose, "Start tag close");
t.eq(tokens[5].type, htmlToken.eof, "EOF");

source = '<foo bar="baz">';
tokens = htmlTokenize(source);
t.eq(tokens[2].type, htmlToken.attr, "Attribute token before =");
t.eq(tokens[3].type, htmlToken.attrEq, "= before attribute value");
t.eq(tokens[3].start.column, 8, "= start column");
t.eq(tokens[3].end.column, 9, "= end column");
t.eq(tokens[4].type, htmlToken.attrDoubleQuotOpen,
  "Opening \" before attribute value");
t.eq(tokens[4].start.column, 9, "\" start column");
t.eq(tokens[4].end.column, 10, "\" end column");
t.eq(tokens[5].type, htmlToken.attrValue, "Attribute value");
t.eq(tokens[5].data, "baz", "Attribute value data");
t.eq(tokens[5].start.column, 10, "\" start column");
t.eq(tokens[5].end.column, 13, "\" end column");
t.eq(tokens[6].type, htmlToken.attrDoubleQuotClose,
  "Closing \" after attribute value");
t.eq(tokens[6].start.column, 13, "Closing \" start column");
t.eq(tokens[6].end.column, 14, "Closing \" end column");
t.eq(tokens[7].type, htmlToken.startTagClose,
  "Closing tag after attribute value");
t.eq(tokens[8].type, htmlToken.eof, "EOF");

source = "<foo bar='baz'>";
tokens = htmlTokenize(source);
t.eq(tokens[4].type, htmlToken.attrSingleQuotOpen,
  "Opening \" before attribute value");
t.eq(tokens[4].start.column, 9, "\" start column");
t.eq(tokens[4].end.column, 10, "\" end column");
t.eq(tokens[5].type, htmlToken.attrValue, "Attribute value");
t.eq(tokens[5].data, "baz", "Attribute value data");
t.eq(tokens[5].start.column, 10, "\" start column");
t.eq(tokens[5].end.column, 13, "\" end column");
t.eq(tokens[6].type, htmlToken.attrSingleQuotClose,
  "Closing \" after attribute value");
t.eq(tokens[6].start.column, 13, "Closing \" start column");
t.eq(tokens[6].end.column, 14, "Closing \" end column");
t.eq(tokens[8].type, htmlToken.eof, "EOF");

source = '<foo bar=baz>';
tokens = htmlTokenize(source);
t.eq(tokens[4].type, htmlToken.attrValue, "Unquoted attribute value");
t.eq(tokens[4].data, "baz", "Unquoted attribute value data");
t.eq(tokens[4].start.column, 9, "Start of unquoted attribute value");
t.eq(tokens[4].end.column, 12, "End of unquoted attribute value");
t.eq(tokens[5].type, htmlToken.startTagClose,
    "Closing tag after unquoted attribute value");
t.eq(tokens[5].start.column, 12,
    "Start of closing tag after unquoted attribute value");

source = '<foo bar=a&amp;b>';
tokens = htmlTokenize(source);
t.eq(tokens[4].type, htmlToken.attrValue,
    "Attribute value before character reference");
t.eq(tokens[4].data, "a", "Attribute value data before character reference");
t.eq(tokens[4].end.column, 10,
    "Attribute value before character reference ends before it");
t.eq(tokens[5].type, htmlToken.charRef, "Character reference in attribute");
t.eq(tokens[5].value, "&amp;", "Character reference value in attribute");
t.eq(tokens[5].data, "&", "Character reference data in attribute");
t.eq(tokens[5].start.column, 10, "Character reference start in attribute");
t.eq(tokens[5].end.column, 15, "Character reference end in attribute");
t.eq(tokens[6].type, htmlToken.attrValue,
    "Attribute value after character reference");
t.eq(tokens[6].data, "b", "Attribute value data after character reference");
t.eq(tokens[6].start.column, 15,
    "Attribute value after character reference starts after it");

source = '<foo bar=a&ampb>';
tokens = htmlTokenize(source);
t.eq(tokens[4].type, htmlToken.attrValue,
    "Attribute value with character reference without ; " +
    "followed by letter");
t.eq(tokens[4].value, "a&ampb",
    "Attribute value with character reference without ; " +
    "followed by letter has the correct value");
t.eq(tokens[4].data, "a&ampb",
    "Attribute value with character reference without ; " +
    "followed by letter has the correct data");
t.eq(tokens[4].start.column, 9,
    "Attribute value with character reference without ; " +
    "followed by letter starts correctly");
t.eq(tokens[4].end.column, 15,
    "Attribute value with character reference without ; " +
    "followed by letter ends correctly");

source = '<foo bar=a&amp=>';
tokens = htmlTokenize(source);
t.eq(tokens[4].type, htmlToken.attrValue,
    "Attribute value with character reference without ; " +
    "followed by =");
t.eq(tokens[4].value, "a&amp=",
    "Attribute value with character reference without ; " +
    "followed by = has the correct value");
t.eq(tokens[4].data, "a&amp=",
    "Attribute value with character reference without ; " +
    "followed by = has the correct data");
t.eq(tokens[4].start.column, 9,
    "Attribute value with character reference without ; " +
    "followed by = starts correctly");
t.eq(tokens[4].end.column, 15,
    "Attribute value with character reference without ; " +
    "followed by = ends correctly");

source = '<!---->';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.commentOpen, "Empty comment open");
t.eq(tokens[0].start.column, 0, "Empty comment open start");
t.eq(tokens[0].end.column, 4, "Empty comment open end");
t.eq(tokens[1].type, htmlToken.commentClose, "Empty comment close");
t.eq(tokens[1].start.column, 4, "Empty comment close start");
t.eq(tokens[1].end.column, 7, "Empty comment close end");

source = 'before <!-- hi - -- --- there --> after';
tokens = htmlTokenize(source);
t.eq(tokens[1].type, htmlToken.commentOpen, "Comment open");
t.eq(tokens[1].start.column, 7, "Comment open start");
t.eq(tokens[1].end.column, 11, "Comment open end");
t.eq(tokens[2].type, htmlToken.comment, "Comment");
t.eq(tokens[2].start.column, 11, "Comment start");
t.eq(tokens[2].end.column, 30, "Comment end");
t.eq(tokens[2].data, ' hi - -- --- there ', "Comment data");
t.eq(tokens[3].type, htmlToken.commentClose, "Comment close");
t.eq(tokens[3].start.column, 30, "Comment close start");
t.eq(tokens[3].end.column, 33, "Comment close end");
t.eq(tokens[4].type, htmlToken.char, "Text after comment");

source = '<!-- --->';
tokens = htmlTokenize(source);
t.eq(tokens[1].type, htmlToken.comment,
    "Comment with extra - when closing");
t.eq(tokens[1].data, " -",
    "Comment data includes the extra - when closing");
t.eq(tokens[1].start.column, 4,
    "Comment start with extra - when closing");
t.eq(tokens[1].end.column, 6,
    "Comment end with extra - when closing");
t.eq(tokens[2].type, htmlToken.commentClose,
    "Comment close with extra - when closing");
t.eq(tokens[2].value, "-->",
    "Comment close with extra - when closing does not include it");
t.eq(tokens[2].start.column, 6,
    "Comment close start with extra - when closing");
t.eq(tokens[2].end.column, 9,
    "Comment close end with extra - when closing");

//source = '<!-- --!>';
//source = '<!--->';

//source = '<!-- comment --> <foo/>';
//console.log('---');
//tokens = htmlTokenize(source);
//tlog(tokens);


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
