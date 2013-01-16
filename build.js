// Contrary to popular belief, this file is meant to be a JS code concatenator.
// It is meant to be used in a node environment, as in , `node build.js`.

var fs = require('fs');
var path = require('path');

// Creating the output, 'aulx.js'.
var output = fs.createWriteStream('aulx.js');

// Feeding it all inputs.
var inputs = [
  'js/esprima.js',
  'js/static.js',
  'js/main.js',
  'completers.js',
];

(function cat(i) {
  var input = fs.createReadStream(path.join(__dirname, inputs[i]));
  input.pipe(output, {end: false});
  input.on('end', function() {
    var next = i + 1;
    if (next < inputs.length) {
      cat(next);
    } else {
      output.end();
    }
  });
}(0));

