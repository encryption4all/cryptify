const path = require("path");

module.exports = function override(config, env) {
  config.resolve.fallback = {
    http: false,
    https: false,
    url: false,
    util: false,
  };

  config.experiments = {
    asyncWebAssembly: true,
    syncWebAssembly: true,
  };

  config.module.rules.push({
    test: /\.(wasm)$/,
    type: "webassembly/async",
  });

  return config;
};
