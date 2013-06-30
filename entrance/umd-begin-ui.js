(function (global, factory) {
  // Universal Module Definition (UMD) to support AMD, Node.js,
  // and plain browser loading.
  if (typeof exports === 'object') {
    module.exports = factory(global);
  } else if (typeof define === 'function' && define.amd) {
    define(['global'], factory);
  } else {
    global.AulxUI = factory(global);
  }
}(this, function (global) {
var exports = {};
