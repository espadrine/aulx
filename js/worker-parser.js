onmessage = function(event) {
  try {
    postMessage(esprima.parse(event.data, {loc: true}));
  } catch (e) {}
};
