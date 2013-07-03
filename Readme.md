# Aulx [![Build Status](https://travis-ci.org/espadrine/aulx.png)](https://travis-ci.org/espadrine/aulx)


*Autocompletion for the Web*

Let's have the best JS, CSS, HTML autocompletion ever!

## Try it

### Completion in Node or Browser
The `aulx.js` file contains the backend of whole project. It is a concatenation
of many other JS files, although it isn't minified.

You can try to require it in node.

```javascript
var aulx = require('aulx');
var source = 'var foo; fo';
aulx.js(source, {line:0, ch:11});
```

### User interface in Browser
The `aulx-ui.js` file contains the user interface part of project. It only
supports CodeMirror right now, but more is soon to follow :).

Here is a snippet to add autocompelte support to any CodeMirror editor.

You can try to require it in node.

```javascript
var editor = CodeMirror.fromTextArea(idOfTextbox);
var aulxui = new AulxUI.CM(editor);
// or simply ...
new AulxUI.CM(idOfTextbox);
// And that's it. Your editor will automagically get JS autocompletion.
```

## Interface

To autocomplete JS code, you will probably want to instantiate an Aulx object.
The constructor has the following options.

```javascript
var aulx = Aulx.JS({
    // A JS parser compatible with SpiderMonkey.
  parse: esprima.parse,
    // If true, the parser above is actually a function that returns the
    // parser function. Primarily in use to put the parser in
    // a worker thread.
  parserContinuation: false,
    // An object to inspect in order to benefit from dynamic introspection.
  global: window,
    // The name of the global object, used in the static analysis.
  globalIdentifier: "window"
});

aulx.complete(
  source,           // A string containing JS source code.
  { line: 0,        // The line where the caret is.
    ch: 11 }        // The column where the caret is.
);

// Returns a sorted Completion object, like the following:
{ candidates:
   [ { display: 'foo',      // Symbol to complete (show that).
       prefix: 'fo',        // What that completion is based on.
       score: 0 },          // Don't use the score.
     { display: 'for',
       prefix: 'fo',
       score: -9 } ],
  candidateFromDisplay:
   { foo:
      { display: 'foo',
        prefix: 'fo',
        score: 0 },
     for:
      { display: 'for',
        prefix: 'fo',
        score: -9 } } }
```

You can however boycott the creation of an Aulx instance, generating a new
instance every time:

```javascript
aulx.js(source, {line:0, ch:11}, optionsJustLikeAbove);
```

Similarly, CSS autocompletion has the following interface.

```javascript
aulx.css(cssSource, {line:0, ch:11});
```

## State of the project

Done:

- JS keyword autocompletion,
- JS static analysis: a simple algorithm for autocompletion,
- JS Static type inference,
- JS dynamic analysis,
- Structured and scalable way to create the frontend userinterface,
- CSS property autocompletion.

To do:

- HTML (including inlined CSS and JS autocompletion),
- CoffeeScript, SASS, … We can go crazy with this!


![Aulx (French for Garlic)](http://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Allium_sativum._Restra_de_allos_de_Oroso-_Galiza.jpg/640px-Allium_sativum._Restra_de_allos_de_Oroso-_Galiza.jpg "Photographer: Luis Miguel Bugallo Sánchez")


## To the delicate attention of fellow developers

Project entry point: `entrance/completers.js`.
It uses all completers, each of which has its own directory.

Completer entry point: `<completer>/main.js` (no surprise there!)

Building the bundle `aulx.js` is done with this swift command:

    make

or, if your computer lacks `make`:

    node make

Finally, testing completers is either done in batch mode with yet another
swift command:

    make test

or, for each completer:

    node <completer>/test
    # For example:
    node js/test

----

*Baked by Thaddée Tyl
<br>Grilled by Girish Sharma*

This work is licensed under the Creative Commons Attribution 3.0 Unported
License. To view a copy of this license, visit
http://creativecommons.org/licenses/by/3.0/.
