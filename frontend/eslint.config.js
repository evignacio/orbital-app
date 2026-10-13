import js from '@eslint/js';
import globals from 'globals';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Dependências entre camadas (plano §3.1): cada regra diz o que `target` NÃO pode importar.
const camadas = {
  features: ['components', 'hooks', 'store', 'viz', 'api', 'domain', 'storage'],
  hooks: ['store', 'api', 'domain', 'storage'],
  store: ['api', 'domain', 'storage'],
  viz: ['domain'],
  api: ['domain'],
  components: ['components', 'domain'],
};
const todas = [
  'app',
  'features',
  'components',
  'hooks',
  'store',
  'viz',
  'api',
  'domain',
  'storage',
];

// "target" só pode importar de si mesma e das camadas permitidas; o resto é proibido.
const zones = Object.entries({
  ...camadas,
  domain: [],
}).flatMap(([target, permitidas]) => {
  const proprias = target === 'components' ? ['components'] : [target];
  const liberadas = new Set([...permitidas, ...proprias]);
  return todas
    .filter((from) => !liberadas.has(from))
    .map((from) => ({
      target: `./src/${target}`,
      from: `./src/${from}`,
      message: `A camada "${target}" não pode importar de "${from}" (plano §3.1).`,
    }));
});

export default tseslint.config(
  { ignores: ['dist', 'prototipos', 'public', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  jsxA11y.flatConfigs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones }],
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
