onmessage = function(event) {
  postMessage(esprima.parse(event.data, {loc: true}));
};
