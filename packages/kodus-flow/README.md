# 🚀 Kodus Flow

Framework enterprise para orquestração de agentes de IA com arquitetura em 5 camadas bem definidas.

## 📦 Instalação

```bash
npm install @kodus/flow
```

## 🚀 Uso Rápido

```typescript
import { createOrchestration } from '@kodus/flow';

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

## 📚 Documentação

- [Publicação Simples](PUBLISH_SIMPLE.md) - Como publicar no Google Artifact Registry
- [Uso Simples](USAGE_SIMPLE.md) - Como usar o pacote

## 🔧 Desenvolvimento

```bash
# Instalar dependências
yarn install

# Build
yarn build

# Testes
yarn test:run

# Lint
yarn lint
```

## 📦 Publicação

```bash
# Ver guia simples
cat PUBLISH_SIMPLE.md

# Publicação rápida
yarn publish:quick
```

## 🏗️ Arquitetura

- **Orchestration Layer**: API simples para usuário
- **Engine Layer**: Executar agentes, tools, workflows
- **Kernel Layer**: Gerenciar contexto, estado, isolamento
- **Runtime Layer**: Processar eventos e streams
- **Observability Layer**: Logging, telemetry, monitoring

## 📄 Licença

MIT
