(function (global, factory) {
  // Universal Module Definition (UMD) to support AMD, Node.js,
  // and plain browser loading.
  if (typeof exports === 'object') {
    module.exports = factory(require('esprima'));
  } else if (typeof define === 'function' && define.amd) {
    define(['esprima'], factory);
  } else {
    global.Aulx = factory(global.esprima);
  }
}(this, function (esprima) {
var exports = {};


