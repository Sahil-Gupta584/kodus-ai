# 📦 Como Usar @kodus/flow

## 🚀 Instalação

```bash
# Instalar
npm install @kodus/flow

# Ou com yarn
yarn add @kodus/flow
```

## 🎯 Uso Básico

```typescript
import { createOrchestration } from '@kodus/flow';

// Criar orquestração
const orchestration = createOrchestration({
    enableKernelIntegration: true,
    enableObservability: true
});

// Criar agente
await orchestration.createAgent({
    name: 'echo-agent',
    think: async (input) => ({
        reasoning: 'Echo simples',
        action: { type: 'final_answer', content: `Echo: ${input}` }
    })
});

// Executar
const result = await orchestration.callAgent('echo-agent', 'Teste');
console.log(result); // Echo: Teste
```

## 🔧 Exemplo Completo

```typescript
// package.json
{
  "dependencies": {
    "@kodus/flow": "^0.1.0"
  }
}

// index.ts
import { createOrchestration } from '@kodus/flow';

async function main() {
    const orchestration = createOrchestration({
        enableKernelIntegration: true,
        enableObservability: true
    });

    // Criar agente
    await orchestration.createAgent({
        name: 'hello-agent',
        think: async (input) => ({
            reasoning: 'Responder com saudação',
            action: { type: 'final_answer', content: `Olá! Você disse: ${input}` }
        })
    });

    // Executar
    const result = await orchestration.callAgent('hello-agent', 'Oi!');
    console.log(result); // Olá! Você disse: Oi!
}

main().catch(console.error);
```

## 🎯 Comandos Rápidos

```bash
# Instalar
npm install @kodus/flow

# Ver versão
npm view @kodus/flow version

# Listar versões
npm view @kodus/flow versions
```

## 📝 Notas

- ✅ **Público**: Não precisa de autenticação
- ✅ **Simples**: Instala como qualquer npm
- ✅ **TypeScript**: Suporte completo
- ✅ **ESM/CJS**: Ambos suportados

**É só isso! Funciona como qualquer pacote npm.** 🚀 