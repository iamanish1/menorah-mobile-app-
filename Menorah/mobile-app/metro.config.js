const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add path mapping for TypeScript paths
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

// Configure Metro to handle socket.io-client and other Node.js modules
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'cjs', 'mjs'];

// Add node modules that need to be polyfilled
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Add extra node modules to be resolved
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  'events': require.resolve('events'),
  'buffer': require.resolve('buffer'),
  'util': require.resolve('util'),
  'stream': require.resolve('stream-browserify'),
  'process': require.resolve('process/browser'),
};

// Configure transformer
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

module.exports = config;
