const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

module.exports = {
  webpack: {
    configure: (config) => {
      config.plugins = [...config.plugins, new NodePolyfillPlugin()];
      const scopePluginIndex = config.resolve.plugins.findIndex(
        ({ constructor }) =>
          constructor && constructor.name === "ModuleScopePlugin"
      );

      config.resolve.plugins.splice(scopePluginIndex, 1);
      config.resolve.fallback = {
        http: false,
        https: false,
        url: false,
        util: false,
      };

      config.experiments = {
        asyncWebAssembly: true,
      };

      config.module.rules.push({
        test: /\.(wasm)$/,
        type: "webassembly/async",
      });

      return config;
    },
  },
};
