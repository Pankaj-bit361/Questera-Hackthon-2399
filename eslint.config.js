import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist','.motion-data/**','.motion-proof/**','.studio-data/**'] },
  js.configs.recommended,
  {files:['motion/**/*.mjs','Questera-Backend/motion/**/*.cjs','Questera-Backend/studio/**/*.cjs','studio/**/*.cjs','tests/**/*.mjs'],languageOptions:{ecmaVersion:2022,globals:{...globals.node,...globals.browser}},rules:{'no-unused-vars':'off'}},
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
        React: true,
        JSX: true
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        sourceType: 'module'
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'no-undef': 'error', 
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
      'no-unused-vars': 'off',
      'no-case-declarations': 'off',
      'no-useless-catch': 'off'
    },
  }
];