const path = require("path");

module.exports = function override(config, env) {
  config.experiments = {
    asyncWebAssembly: true,
    syncWebAssembly: true,
  };

  config.resolve.fallback = {
    http: false,
    https: false,
    url: false,
    util: false,
  };

  console.log(config);

  return config;
};
