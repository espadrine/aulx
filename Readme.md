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


