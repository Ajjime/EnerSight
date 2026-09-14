import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    // eslint-plugin-react exists here for two specific rules that core ESLint
    // cannot provide, both of which this project needed:
    //
    //   react/jsx-no-undef   Core `no-undef` does not inspect JSX identifiers, so
    //                        `<HeaderActionButton>` used without an import went
    //                        unnoticed and white-screened the Reports page on a
    //                        filtered empty search.
    //   react/jsx-uses-vars  Core `no-unused-vars` does not count a JSX element
    //                        reference as usage, so components used only in markup
    //                        (`<Icon size={23} />`) were reported as unused.
    plugins: { react },
    settings: { react: { version: 'detect' } },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',

      // lucide-react ships icons whose names collide with JavaScript globals.
      // Importing `Map` for the GIS icon shadowed the Map constructor in the same
      // module, so `new Map()` threw "Map is not a constructor" and blanked the
      // page at runtime. Nothing else catches that, and it stays invisible until
      // someone uses the shadowed global.
      //
      // This fires only when the local binding takes the global's name, so an
      // alias is fine:  import { Map as MapIcon } from "lucide-react";
      //
      // `no-shadow` with builtinGlobals would also catch it, but it floods the
      // codebase with ~100 reports for the ordinary `(event) => ...` handler
      // parameter, so it is not worth turning on.
      'no-restricted-syntax': [
        'error',
        ...['Map', 'Set', 'Image', 'Text', 'Range', 'Option'].map(
          (name) => ({
            selector: `ImportSpecifier[imported.name='${name}'][local.name='${name}']`,
            message: `"${name}" shadows a JavaScript global. Import it with an alias, e.g. { ${name} as ${name}Icon }.`,
          })
        ),
      ],
    },
  },
])
