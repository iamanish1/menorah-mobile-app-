module.exports = {
  root: true,
  ignorePatterns: [
    'ios/',
    'android/',
    'node_modules/',
    'node_modules.root-owned-*/',
    'node_modules.root-owned-*/**',
    'dist/',
    'build/',
    '.expo/',
  ],
  extends: ['@react-native', 'eslint:recommended', 'plugin:react/recommended'],
  rules: { 'react/react-in-jsx-scope': 'off' },
};
