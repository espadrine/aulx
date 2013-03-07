# Aulx [![Build Status](https://travis-ci.org/espadrine/aulx.png)](https://travis-ci.org/espadrine/aulx)


*Autocompletion for the Web*

Let's have the best JS, CSS, HTML autocompletion ever!

## Try it

The `aulx.js` file contains the whole project. It is a concatenation of many
other JS files, although it isn't minified.

You can try to require it in node.

    var aulx = require('aulx');
    var source = 'var foo; fo';
    aulx.js(source, {line:0, ch:11});

## State of the project

Done:

- JS keyword autocompletion,
- JS static analysis: a simple algorithm for autocompletion,
- JS Static type inference,
- JS dynamic analysis,
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

*Baked by Thaddée Tyl*.

This work is licensed under the Creative Commons Attribution 3.0 Unported
License. To view a copy of this license, visit
http://creativecommons.org/licenses/by/3.0/.
