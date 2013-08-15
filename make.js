// Contrary to popular belief, this file is meant to be a JS code concatenator.
// It *does not minimize* the code.
// It is meant to be used in a node environment, as in , `node make.js`.

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

// Union of lists (in the correct order).
function union(lists) {
  var ulist = [];
  for (var i = 0; i < lists.length; i++) {
    ulist = ulist.concat(lists[i]);
  }
  return ulist;
}

// Web workers for static analysis.
bundle('demo/parser-worker.js', [
  'node_modules/esprima/esprima.js',
  'js/worker-parser.js',
]);

// Target environment: AMD / Node.js / plain old browsers.
//
var aulxBundle = [
  'entrance/umd-begin.js',
  'entrance/completers.js',

  // JS completion files.
  'entrance/compl-begin.js',
  'js/main.js',
  'js/static.js',
  'js/sandbox.js',
  'js/keyword.js',
  'entrance/compl-end.js',

  // CSS completion files.
  'entrance/compl-begin.js',
  'css/main.js',
  'css/state-machine.js',
  'css/selectors.js',
  'css/css-token-begin.js',
  'css/tokenizer.js',
  'css/css-token-end.js',
  'css/properties.js',
  'entrance/compl-end.js',

  'entrance/umd-end.js',
];
bundle('aulx.js', aulxBundle);

// Target environment: AMD / plain old browsers.
// Contains UI code for text editors.
//
bundle('aulx-ui.js', union([aulxBundle, [
  'entrance/umd-begin-ui.js',

  'ui/main.js',
  'ui/popup.js',
  'ui/cm.js',

  'entrance/umd-end.js',
]]));
