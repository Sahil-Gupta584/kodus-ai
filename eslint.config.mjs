import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import { fileURLToPath } from 'url';
import path from 'path';

// Obter o diretório atual para o tsconfigRootDir
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
    // Configurações básicas do ESLint
    eslint.configs.recommended,

    // Configurações recomendadas do TypeScript
    ...tseslint.configs.recommended,

    // Integração com o Prettier
    prettierRecommended,

    // Padrões globais para ignorar arquivos
    {
        ignores: [
            // Arquivos de build e dependências
            'dist/**',
            'node_modules/**',

            // Arquivos específicos do .eslintignore anterior
            '**/tsconfig-paths-bootstrap.js',
            'ee/configs/environment/environment.ts',
            'ee/configs/environment/environment.dev.ts',

            // Arquivos de configuração
            '.eslintrc.js',

            // Pasta de testes de performance
            'test/performance/**',
        ],
    },

    // Configurações específicas para arquivos TypeScript
    {
        files: ['**/*.ts'],

        // Configurações de linguagem
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: './tsconfig.eslint.json',
                tsconfigRootDir: __dirname,
                sourceType: 'module',
            },
            // Ambiente Node.js e Jest
            globals: {
                node: true,
                jest: true,
            },
        },

        // Configurações para resolução de importações
        settings: {
            'import/resolver': {
                typescript: {
                    directory: './',
                },
            },
        },

        // Regras específicas - exatamente as mesmas que você tinha antes
        rules: {
            '@typescript-eslint/interface-name-prefix': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            'prettier/prettier': [
                'error',
                {
                    singleQuote: true,
                    trailingComma: 'all',
                    tabWidth: 4,
                    semi: true,
                    bracketSpacing: true,
                    quoteProps: 'consistent',
                },
            ],
        },
    },
];
