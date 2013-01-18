# Aulx

*Autocompletion for the Web*

Let's have the best JS, CSS, HTML autocompletion ever!

## Try it

The `aulx.js` file contains the whole project. It is a concatenation of many
other JS files, although it isn't minified.

You can try to require it in node.

    var aulx = require('aulx');
    var source = 'var foo; fo';
    aulx.completer.js(source, {line:0, ch:11});

## State of the project

Done:

- JS keyword autocompletion,
- JS static analysis: a simple algorithm for autocompletion,
- JS dynamic analysis.

To do:

- A better module system,
- Better static analysis for JS,
- CSS,
- HTML,
- CoffeeScript, SASS, … We can go crazy with this!


![Aulx (French for Garlic)](http://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Allium_sativum._Restra_de_allos_de_Oroso-_Galiza.jpg/640px-Allium_sativum._Restra_de_allos_de_Oroso-_Galiza.jpg "Photographer: Luis Miguel Bugallo Sánchez")


## To the delicate attention of fellow developers

The main dev entry point is at `entrance/completers.js`.
It uses all completers, each of which has its own directory.

The main entry point for each of those folder is, quite unexpectedly, `main.js`.
They also all have a `test.js` file, which is used for testing.

Building the bundle `aulx.js` is done with this swift command:

    make

or, if your computer lacks `make`:

    node make

Finally, testing completers is either done in batch mode with this other swift
command:

    make test

or, for each completer:

    node <completer>/test
    # For example:
    node js/test

