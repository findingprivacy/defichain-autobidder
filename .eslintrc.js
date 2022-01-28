module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-await-in-loop': 0,
    'max-len': ['error', { code: 125 }],
    'object-curly-newline': [
      'error',
      { ObjectPattern: { multiline: true, minProperties: 10 } },
    ],
    'arrow-parens': [1, 'as-needed', { requireForBlockBody: true }],
  },
};
