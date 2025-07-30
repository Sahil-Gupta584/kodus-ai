/**
 * Registro de paths para resolução de aliases em runtime
 * Este arquivo deve ser importado no início da aplicação
 */
import { register } from 'tsconfig-paths';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Compatibilidade ESM/CJS
const currentDir = import.meta.url
    ? dirname(fileURLToPath(import.meta.url))
    : process.cwd();

// Registra os aliases de path definidos no tsconfig.json
register({
    baseUrl: resolve(currentDir, '..'),
    paths: {
        '@/*': ['./src/*'],
        '@kodus/flow/*': ['./src/*'],
        '@agents/*': ['./src/agent/*'],
        '@core/*': ['./src/core/*'],
        '@tools/*': ['./src/tools/*'],
        '@workflows/*': ['./src/workflow/*'],
        '@human/*': ['./src/human/*'],
        '@telemetry/*': ['./src/telemetry/*'],
        '@types/*': ['./src/types/*'],
    },
    // Adiciona extensão .js para arquivos compilados
    addMatchAll: true,
});
