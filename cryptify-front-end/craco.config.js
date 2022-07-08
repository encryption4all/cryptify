module.exports = {
  webpack: {
    configure: (config) => {
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
