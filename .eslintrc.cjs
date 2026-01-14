module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2021,
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
  },
  plugins: ['vue', '@typescript-eslint'],
  extends: ['plugin:vue/essential'],
  rules: {
    indent: ['error', 2, { SwitchCase: 1 }],
    semi: ['error', 'always'],
    'linebreak-style': ['error', 'unix'],
    'eol-last': ['error', 'always'],
    'vue/html-indent': ['error', 2, { baseIndent: 1, alignAttributesVertically: true }],
    'vue/script-indent': ['error', 2, { baseIndent: 1, switchCase: 1 }],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
  overrides: [
    {
      files: ['*.ts', '*.vue'],
      rules: {
        'no-undef': 'off',
      },
    },
    {
      files: ['*.vue'],
      rules: {
        indent: 'off',
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules'],
};
