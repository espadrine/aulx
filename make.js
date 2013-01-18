// Contrary to popular belief, this file is meant to be a JS code concatenator.
// It *does not minimize* the code.
// It is meant to be used in a node environment, as in , `node build.js`.

var fs = require('fs');
var path = require('path');

function bundle(file, inputs) {
  var output = fs.createWriteStream(file);

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
}

// Target environment: AMD / Node.js / plain old browsers.
//
bundle('aulx.js', [
  'entrance/umd-begin.js',
  'js/static.js',
  'js/sandbox.js',
  'js/main.js',
  'entrance/completers.js',
  'entrance/umd-end.js',
]);
