# 🔧 **CONFIGURAÇÃO DE DEBUG PARA SDK KODUS FLOW**

## 📋 **CONFIGURAÇÃO OTIMIZADA**

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Docker: Attach to Node",
            "type": "node",
            "request": "attach",
            "port": 9229,
            "address": "localhost",
            "localRoot": "${workspaceFolder}",
            "remoteRoot": "/usr/src/app",
            "skipFiles": ["<node_internals>/**"],
            "sourceMaps": true,
            "outFiles": [
                "${workspaceFolder}/dist/**/*.js",
                "${workspaceFolder}/packages/kodus-flow/dist/**/*.js"
            ],
            "resolveSourceMapLocations": [
                "${workspaceFolder}/**/*.js",
                "${workspaceFolder}/packages/kodus-flow/**/*.js",
                "/usr/src/app/node_modules/@kodus/flow/dist/**/*.js"
            ],
            "smartStep": true,
            "showAsyncStacks": true
        },
        {
            "name": "Launch & Debug (pwa-node)",
            "type": "pwa-node",
            "request": "launch",
            "program": "${workspaceFolder}/dist/index.js",
            "cwd": "${workspaceFolder}",
            "runtimeArgs": ["--preserve-symlinks", "--inspect-brk=9229"],
            "skipFiles": ["<node_internals>/**"],
            "sourceMaps": true,
            "outFiles": [
                "${workspaceFolder}/dist/**/*.js",
                "${workspaceFolder}/packages/kodus-flow/dist/**/*.js"
            ],
            "resolveSourceMapLocations": [
                "${workspaceFolder}/**/*.js",
                "${workspaceFolder}/packages/kodus-flow/**/*.js"
            ],
            "smartStep": true,
            "showAsyncStacks": true
        },
        {
            "name": "Debug TypeScript Direto",
            "type": "node",
            "request": "launch",
            "runtimeExecutable": "tsx",
            "args": ["${file}"],
            "cwd": "${workspaceFolder}",
            "console": "integratedTerminal",
            "skipFiles": ["<node_internals>/**"],
            "env": {
                "NODE_ENV": "development",
                "TSX_SOURCEMAP": "true"
            },
            "sourceMaps": true,
            "resolveSourceMapLocations": [
                "${workspaceFolder}/**",
                "${workspaceFolder}/packages/kodus-flow/**",
                "!**/node_modules/**"
            ],
            "outFiles": [
                "${workspaceFolder}/dist/**/*.js",
                "${workspaceFolder}/packages/kodus-flow/dist/**/*.js"
            ],
            "smartStep": true,
            "showAsyncStacks": true
        }
    ],
    "compounds": [
        {
            "name": "Docker + Local SDK Debug",
            "configurations": [
                "Docker: Attach to Node",
                "Launch & Debug (pwa-node)"
            ]
        }
    ]
}
```

## 🔍 **PRINCIPAIS MELHORIAS:**

### **1. Adicionado `smartStep` e `showAsyncStacks`**
```json
"smartStep": true,
"showAsyncStacks": true
```

### **2. Configuração para TypeScript Direto**
```json
{
    "name": "Debug TypeScript Direto",
    "type": "node",
    "request": "launch",
    "runtimeExecutable": "tsx",
    "args": ["${file}"],
    "env": {
        "NODE_ENV": "development",
        "TSX_SOURCEMAP": "true"
    }
}
```

### **3. Paths Corretos para SDK**
```json
"resolveSourceMapLocations": [
    "${workspaceFolder}/**/*.js",
    "${workspaceFolder}/packages/kodus-flow/**/*.js",
    "/usr/src/app/node_modules/@kodus/flow/dist/**/*.js"
]
```

## 🎯 **COMO USAR:**

### **Para Debugging Docker:**
1. Use "Docker: Attach to Node"
2. Certifique-se que o container está rodando com `--inspect-brk=9229`

### **Para Debugging Local:**
1. Use "Debug TypeScript Direto" para arquivos .ts
2. Use "Launch & Debug (pwa-node)" para arquivos compilados

### **Para Debugging Composto:**
1. Use "Docker + Local SDK Debug" para ambos

## 🚀 **TESTE RÁPIDO:**

1. **Crie um arquivo de teste:**
```typescript
// test-debug.ts
import { createOrchestration } from '@kodus/flow';

async function testDebug() {
    console.log('🚀 Testando debug...');
    
    const orchestration = createOrchestration({
        debug: true
    });
    
    console.log('✅ Orchestration criada');
    
    // Coloque breakpoint aqui
    const result = await orchestration.callAgent('test-agent', 'Hello');
    
    console.log('Resultado:', result);
}

testDebug().catch(console.error);
```

2. **Coloque breakpoints no código do SDK:**
   - Abra `packages/kodus-flow/src/engine/planning/strategies/react-planner.ts`
   - Coloque breakpoint na linha 67 (método `think`)

3. **Execute o debug:**
   - Use "Debug TypeScript Direto"
   - Pressione F5

## ✅ **RESULTADO ESPERADO:**
- Breakpoints no SDK devem ser atingidos
- Source maps devem funcionar corretamente
- Variáveis do SDK devem estar visíveis no debugger 
