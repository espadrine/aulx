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

source = '<!-- --!>';
tokens = htmlTokenize(source);
t.eq(tokens[1].type, htmlToken.comment, "Comment with --!>");
t.eq(tokens[1].data, " ", "Comment data with --!>");
t.eq(tokens[2].type, htmlToken.commentClose, "Comment close with --!>");
t.eq(tokens[2].value, "--!>", "Comment close with --!>");
t.eq(tokens[2].start.column, 5, "Comment close start with --!>");
t.eq(tokens[2].end.column, 9, "Comment close end with --!>");

source = '<!-- --!-->';
tokens = htmlTokenize(source);
t.eq(tokens[1].type, htmlToken.comment, "Comment with --!-->");
t.eq(tokens[1].data, " --!", "Comment data with --!-->");
t.eq(tokens[1].start.column, 4, "Comment start with --!-->");
t.eq(tokens[1].end.column, 8, "Comment end with --!-->");
t.eq(tokens[2].type, htmlToken.commentClose, "Comment close with --!-->");
t.eq(tokens[2].value, "-->", "Comment close with --!-->");
t.eq(tokens[2].start.column, 8, "Comment close start with --!-->");
t.eq(tokens[2].end.column, 11, "Comment close end with --!-->");

source = '<!--->';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.commentOpen, "Comment <!--->");
t.eq(tokens[0].value, "<!--", "Comment open value <!--->");
t.eq(tokens[0].start.column, 0, "Comment open start <!--->");
t.eq(tokens[0].end.column, 4, "Comment open end <!--->");
t.eq(tokens[1].type, htmlToken.commentClose, "Comment close <!--->");
t.eq(tokens[1].value, "->", "Comment close value <!--->");
t.eq(tokens[1].start.column, 4, "Comment close start <!--->");
t.eq(tokens[1].end.column, 6, "Comment close end <!--->");


source = '<!DoctypE html><hi>';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Doctype open");
t.eq(tokens[0].value, "<!DoctypE", "Doctype open value");
t.eq(tokens[0].start.column, 0, "Doctype open start");
t.eq(tokens[0].end.column, 9, "Doctype open end");
t.eq(tokens[0].data.forceQuirksFlag, false, "Doctype forceQuirksFlag");
t.eq(tokens[1].type, htmlToken.doctype, "Doctype");
t.eq(tokens[1].value, "html", "Doctype value");
t.eq(tokens[1].start.column, 10, "Doctype start");
t.eq(tokens[1].end.column, 14, "Doctype end");
t.eq(tokens[2].type, htmlToken.doctypeClose, "Doctype close");
t.eq(tokens[2].value, ">", "Doctype close value");
t.eq(tokens[2].start.column, 14, "Doctype close start");
t.eq(tokens[2].end.column, 15, "Doctype close end");
t.eq(tokens[3].type, htmlToken.startTagOpen, "Tag after doctype");

source = '<!doctypehtml><hi>';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Doctype no space open");
t.eq(tokens[0].value, "<!doctype", "Doctype no space open value");
t.eq(tokens[0].start.column, 0, "Doctype no space open start");
t.eq(tokens[0].end.column, 9, "Doctype no space open end");
t.eq(tokens[1].type, htmlToken.doctype, "Doctype no space");
t.eq(tokens[1].value, "html", "Doctype no space value");
t.eq(tokens[1].start.column, 9, "Doctype no space start");
t.eq(tokens[1].end.column, 13, "Doctype no space end");
t.eq(tokens[2].type, htmlToken.doctypeClose, "Doctype no space close");
t.eq(tokens[2].value, ">", "Doctype no space close value");
t.eq(tokens[2].start.column, 13, "Doctype no space close start");
t.eq(tokens[2].end.column, 14, "Doctype no space close end");

source = '<!doctype>';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Void doctype open");
t.eq(tokens[0].value, "<!doctype", "Void doctype open value");
t.eq(tokens[0].start.column, 0, "Void doctype open start");
t.eq(tokens[0].end.column, 9, "Void doctype open end");
t.eq(tokens[1].type, htmlToken.doctypeClose, "Void doctype close");
t.eq(tokens[1].value, ">", "Void doctype close value");
t.eq(tokens[1].start.column, 9, "Void doctype close start");
t.eq(tokens[1].end.column, 10, "Void doctype close end");

source = '<!doctype >';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Empty doctype open");
t.eq(tokens[0].value, "<!doctype", "Empty doctype open value");
t.eq(tokens[0].start.column, 0, "Empty doctype open start");
t.eq(tokens[0].end.column, 9, "Empty doctype open end");
t.eq(tokens[1].type, htmlToken.doctype, "Empty doctype");
t.eq(tokens[1].value, " ", "Empty doctype value");
t.eq(tokens[1].start.column, 9, "Empty doctype start");
t.eq(tokens[1].end.column, 10, "Empty doctype end");
t.eq(tokens[2].type, htmlToken.doctypeClose, "Empty doctype close");
t.eq(tokens[2].value, ">", "Empty doctype close value");
t.eq(tokens[2].start.column, 10, "Empty doctype close start");
t.eq(tokens[2].end.column, 11, "Empty doctype close end");

source = '<!doctype html >';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Doctype html space open");
t.eq(tokens[0].value, "<!doctype", "Doctype html space open value");
t.eq(tokens[0].start.column, 0, "Doctype html space open start");
t.eq(tokens[0].end.column, 9, "Doctype html space open end");
t.eq(tokens[1].type, htmlToken.doctype, "Doctype html space");
t.eq(tokens[1].value, "html", "Doctype html space value");
t.eq(tokens[1].start.column, 10, "Doctype html space start");
t.eq(tokens[1].end.column, 14, "Doctype html space end");
t.eq(tokens[2].type, htmlToken.doctypeClose, "Doctype html space close");
t.eq(tokens[2].value, ">", "Doctype html space close value");
t.eq(tokens[2].start.column, 15, "Doctype html space close start");
t.eq(tokens[2].end.column, 16, "Doctype html space close end");

source = '<!doctype html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN\x00" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\x00" >';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Doctype public+system open");
t.eq(tokens[0].data.forceQuirksFlag, false, "Doctype public+system open quirks flag");
t.eq(tokens[0].data.publicIdentifier, "-//W3C//DTD XHTML 1.0 Transitional//EN\ufffd", "Doctype public+system open public identifier");
t.eq(tokens[0].data.systemIdentifier, "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\ufffd", "Doctype public+system open system identifier");
t.eq(tokens[1].type, htmlToken.doctype, "Doctype public+system name");
t.eq(tokens[2].type, htmlToken.doctypePublic, "Doctype public+system public");
t.eq(tokens[2].value, "PUBLIC", "Doctype public+system public value");
t.eq(tokens[2].start.column, 15, "Doctype public+system public start");
t.eq(tokens[2].end.column, 21, "Doctype public+system public end");
t.eq(tokens[3].type, htmlToken.doctypePublicIdentifier, "Doctype public+system public identifier");
t.eq(tokens[3].value, "\"-//W3C//DTD XHTML 1.0 Transitional//EN\x00\"", "Doctype public+system public identifier value");
t.eq(tokens[3].data, "-//W3C//DTD XHTML 1.0 Transitional//EN\ufffd", "Doctype public+system public identifier data");
t.eq(tokens[3].start.column, 22, "Doctype public+system public identifier start");
t.eq(tokens[3].end.column, 63, "Doctype public+system public identifier end");
t.eq(tokens[4].type, htmlToken.doctypeSystemIdentifier, "Doctype public+system system identifier");
t.eq(tokens[4].value, "\"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\x00\"", "Doctype public+system system identifier value");
t.eq(tokens[4].data, "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\ufffd", "Doctype public+system system identifier data");
t.eq(tokens[4].start.column, 64, "Doctype public+system system identifier start");
t.eq(tokens[4].end.column, 122, "Doctype public+system system identifier end");
t.eq(tokens[5].type, htmlToken.doctypeClose, "Doctype public+system close");
t.eq(tokens[5].value, ">", "Doctype public+system close value");
t.eq(tokens[5].start.column, 123, "Doctype public+system close start");
t.eq(tokens[5].end.column, 124, "Doctype public+system close end");

source = '<!doctype html PUBLIC \'URI\'>';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Doctype public '' open");
t.eq(tokens[1].type, htmlToken.doctype, "Doctype public '' name");
t.eq(tokens[2].type, htmlToken.doctypePublic, "Doctype public '' public");
t.eq(tokens[3].type, htmlToken.doctypePublicIdentifier, "Doctype public '' public identifier");
t.eq(tokens[3].value, "'URI'", "Doctype public '' public identifier value");
t.eq(tokens[3].data, "URI", "Doctype public '' public identifier data");
t.eq(tokens[3].start.column, 22, "Doctype public '' public identifier start");
t.eq(tokens[3].end.column, 27, "Doctype public '' public identifier end");
t.eq(tokens[4].type, htmlToken.doctypeClose, "Doctype public '' close");

source = '<!doctype html PUBLIC"URI">';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Doctype public\"\" open");
t.eq(tokens[1].type, htmlToken.doctype, "Doctype public\"\" name");
t.eq(tokens[2].type, htmlToken.doctypePublic, "Doctype public\"\" public");
t.eq(tokens[3].type, htmlToken.doctypePublicIdentifier, "Doctype public\"\" public identifier");
t.eq(tokens[3].value, '"URI"', "Doctype public\"\" public identifier value");
t.eq(tokens[3].data, "URI", "Doctype public\"\" public identifier data");
t.eq(tokens[3].start.column, 21, "Doctype public\"\" public identifier start");
t.eq(tokens[3].end.column, 26, "Doctype public\"\" public identifier end");
t.eq(tokens[4].type, htmlToken.doctypeClose, "Doctype public\"\" close");

source = '<!doctype html PUBLIC\'URI\'>';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Doctype public'' open");
t.eq(tokens[1].type, htmlToken.doctype, "Doctype public'' name");
t.eq(tokens[2].type, htmlToken.doctypePublic, "Doctype public'' public");
t.eq(tokens[3].type, htmlToken.doctypePublicIdentifier, "Doctype public'' public identifier");
t.eq(tokens[3].value, "'URI'", "Doctype public'' public identifier value");
t.eq(tokens[3].data, "URI", "Doctype public'' public identifier data");
t.eq(tokens[3].start.column, 21, "Doctype public'' public identifier start");
t.eq(tokens[3].end.column, 26, "Doctype public'' public identifier end");
t.eq(tokens[4].type, htmlToken.doctypeClose, "Doctype public'' close");

source = '<!doctype html SYSTEM "URI">';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Doctype system open");
t.eq(tokens[0].data.forceQuirksFlag, false, "Doctype system open quirks flag");
t.eq(tokens[0].data.publicIdentifier, undefined, "Doctype system open public identifier");
t.eq(tokens[0].data.systemIdentifier, "URI", "Doctype system open system identifier");
t.eq(tokens[1].type, htmlToken.doctype, "Doctype system name");
t.eq(tokens[2].type, htmlToken.doctypeSystem, "Doctype system");
t.eq(tokens[3].type, htmlToken.doctypeSystemIdentifier, "Doctype system identifier");
t.eq(tokens[3].value, "\"URI\"", "Doctype system identifier value");
t.eq(tokens[3].data, "URI", "Doctype system identifier data");
t.eq(tokens[3].start.column, 22, "Doctype system identifier start");
t.eq(tokens[3].end.column, 27, "Doctype system identifier end");
t.eq(tokens[4].type, htmlToken.doctypeClose, "Doctype system close");

source = '<!doctype html SYSTEM \'URI\'>';
tokens = htmlTokenize(source);
t.eq(tokens[0].type, htmlToken.doctypeOpen, "Doctype system '' open");
t.eq(tokens[0].data.forceQuirksFlag, false, "Doctype system open '' quirks flag");
t.eq(tokens[0].data.publicIdentifier, undefined, "Doctype system open '' public identifier");
t.eq(tokens[0].data.systemIdentifier, "URI", "Doctype system open '' system identifier");
t.eq(tokens[1].type, htmlToken.doctype, "Doctype system '' name");
t.eq(tokens[2].type, htmlToken.doctypeSystem, "Doctype system ''");
t.eq(tokens[3].type, htmlToken.doctypeSystemIdentifier,
    "Doctype system '' identifier");
t.eq(tokens[3].value, "'URI'", "Doctype system '' identifier value");
t.eq(tokens[3].data, "URI", "Doctype system '' identifier data");
t.eq(tokens[3].start.column, 22, "Doctype system '' identifier start");
t.eq(tokens[3].end.column, 27, "Doctype system '' identifier end");
t.eq(tokens[4].type, htmlToken.doctypeClose, "Doctype system '' close");

//source = '<!doctype html SYSTEM"URI">';
//console.log('---');
//tokens = htmlTokenize(source);
//tlog(tokens);

//source = '<!doctype html SYSTEM'URI'>';
//source = '<!doctype html PUBLIC "URI""System">';
//source = '<!doctype html PUBLIC "URI"'System'>';


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
