// noop-loader: returns empty module for .node native binary files
// These are resolved at runtime by node-gyp-build, not by webpack
module.exports = function() { return 'module.exports = {};'; };
