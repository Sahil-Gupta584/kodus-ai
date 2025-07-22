# 🔧 **GUIA COMPLETO: Debugging no VSCode - Kodus Flow**

## 🚨 **PROBLEMAS IDENTIFICADOS E SOLUÇÕES**

### **1. Source Maps Não Funcionam**

**Problema:** Breakpoints não caem nas linhas corretas do TypeScript

**Solução:**
```json
// .vscode/launch.json - Configuração Corrigida
{
    "name": "🔧 Debug TypeScript (Source Maps)",
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
        "!**/node_modules/**"
    ],
    "outFiles": ["${workspaceFolder}/dist/**/*.js"],
    "smartStep": true,
    "disableOptimisticBPs": true,
    "showAsyncStacks": true
}
```

### **2. Múltiplos Debuggers no Código**

**Problema:** Muitos `debugger;` statements causam confusão

**Solução:**
```typescript
// ✅ REMOVER todos os debugger statements do código
// ✅ USAR breakpoints do VSCode em vez de debugger statements

// ❌ EVITAR
debugger; // Remove todos estes

// ✅ PREFERIR
// Coloque breakpoints diretamente no VSCode
```

### **3. Configuração do tsconfig.json**

**Problema:** Source maps não são gerados corretamente

**Solução:**
```json
// tsconfig.json - Configuração para Debug
{
    "compilerOptions": {
        "sourceMap": true,
        "inlineSourceMap": false,
        "inlineSources": true,
        "outDir": "./dist",
        "declaration": false,
        "declarationMap": false
    }
}
```

## 🎯 **PASSOS PARA RESOLVER**

### **Passo 1: Limpar Debuggers**
```bash
# Remover todos os debugger statements
find src/ -name "*.ts" -exec sed -i '' 's/debugger;//g' {} \;
```

### **Passo 2: Configurar VSCode**
1. Abra `.vscode/launch.json`
2. Use a configuração "🔧 Debug TypeScript (Source Maps)"
3. Certifique-se que `TSX_SOURCEMAP=true` está definido

### **Passo 3: Testar Debugging**
1. Abra `src/engine/planning/strategies/react-planner.ts`
2. Coloque um breakpoint na linha 67 (método `think`)
3. Use F5 para iniciar debug
4. Verifique se o breakpoint é atingido

## 🔍 **VERIFICAÇÕES ESPECÍFICAS**

### **1. Verificar Source Maps**
```bash
# Verificar se source maps estão sendo gerados
ls -la dist/**/*.map

# Verificar se tsx está usando source maps
tsx --version
```

### **2. Verificar Configuração do Node**
```bash
# Verificar se Node.js suporta source maps
node --version
# Deve ser >= 16.0.0 para suporte completo
```

### **3. Verificar VSCode Extensions**
- TypeScript Extension deve estar ativo
- Node.js Extension deve estar ativo
- Debugger for Node.js deve estar ativo

## 🛠️ **CONFIGURAÇÕES ALTERNATIVAS**

### **Opção 1: Usar ts-node em vez de tsx**
```json
{
    "name": "Debug com ts-node",
    "type": "node",
    "request": "launch",
    "runtimeExecutable": "node",
    "runtimeArgs": ["-r", "ts-node/register"],
    "args": ["${file}"],
    "env": {
        "TS_NODE_PROJECT": "./tsconfig.json"
    },
    "sourceMaps": true
}
```

### **Opção 2: Usar tsx com configuração específica**
```json
{
    "name": "Debug com tsx otimizado",
    "type": "node",
    "request": "launch",
    "runtimeExecutable": "tsx",
    "args": ["--source-map", "${file}"],
    "env": {
        "NODE_ENV": "development"
    },
    "sourceMaps": true,
    "resolveSourceMapLocations": [
        "${workspaceFolder}/**",
        "!**/node_modules/**"
    ]
}
```

## 🎯 **TESTE PRÁTICO**

### **1. Criar Script de Teste**
```typescript
// debug-test.ts
console.log('🚀 Teste de debugging iniciado');

function testFunction() {
    const x = 10;
    const y = 20;
    const result = x + y;
    console.log('Resultado:', result);
    return result;
}

testFunction();
console.log('✅ Teste concluído');
```

### **2. Colocar Breakpoints**
1. Abra `debug-test.ts`
2. Coloque breakpoint na linha `const result = x + y;`
3. Use F5 para iniciar debug
4. Verifique se o breakpoint é atingido

### **3. Verificar Variáveis**
- Abra o painel "Variables" no VSCode
- Verifique se `x`, `y`, e `result` estão visíveis
- Use F10 para step over
- Use F11 para step into

## 🔧 **COMANDOS ÚTEIS**

### **Limpar Cache do VSCode**
```bash
# Limpar cache do VSCode
rm -rf ~/.vscode/extensions
rm -rf ~/.vscode/User/workspaceStorage

# Reiniciar VSCode
code --disable-extensions
```

### **Verificar TypeScript**
```bash
# Verificar se TypeScript está funcionando
npx tsc --noEmit

# Verificar source maps
npx tsc --sourceMap
```

### **Verificar tsx**
```bash
# Verificar versão do tsx
tsx --version

# Testar execução simples
tsx --help
```

## 🎯 **RESUMO DA SOLUÇÃO**

1. **Remover todos os `debugger;` statements**
2. **Usar configuração correta no launch.json**
3. **Verificar source maps estão habilitados**
4. **Usar breakpoints do VSCode em vez de debugger statements**
5. **Testar com script simples primeiro**

## 🚀 **PRÓXIMOS PASSOS**

1. Execute os comandos de limpeza
2. Configure o launch.json corretamente
3. Teste com o script de debug
4. Se funcionar, teste com o React Planner
5. Se ainda não funcionar, use ts-node como alternativa

---

**Nota:** O problema principal é que o `tsx` pode não estar gerando source maps corretamente. A solução é usar a configuração específica no launch.json e remover os debugger statements que podem estar interferindo. 
