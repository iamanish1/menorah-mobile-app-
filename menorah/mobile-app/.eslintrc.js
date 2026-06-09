module.exports = {
  root: true,
  ignorePatterns: [
    'ios/',
    'android/',
    'node_modules/',
    'dist/',
    'build/',
    '.expo/',
  ],
  extends: ['@react-native', 'eslint:recommended', 'plugin:react/recommended'],
  rules: { 'react/react-in-jsx-scope': 'off' },
};
