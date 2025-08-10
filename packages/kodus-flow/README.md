## Observabilidade em Produção (OTLP)

Para captura 100% de spans em alta escala, use OpenTelemetry com o BatchSpanProcessor + OTLP exporter:

```ts
import { getObservability, setupOtelTracing } from './src/observability/index.js';

// 1) Setup do OTEL
const tracerAdapter = await setupOtelTracing({
  exporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  maxQueueSize: 20480,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 2000,
  exportTimeoutMillis: 10000,
});

// 2) Plug no ObservabilitySystem
const obs = getObservability({
  telemetry: {
    enabled: true,
    sampling: { rate: 1, strategy: 'probabilistic' }, // habilite 1.0 apenas quando necessário
    externalTracer: tracerAdapter,
    privacy: { includeSensitiveData: false },
  },
  logging: { enabled: true, level: 'warn' },
  monitoring: { enabled: true },
});

// Serverless: chame forceFlush no final
await obs.telemetry.forceFlush();
```

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

## 🕐 Timeline de Execução

O Kodus Flow oferece **visibilidade completa** do fluxo de execução dos agentes:

```typescript
// Executar agente
const result = await orchestration.callAgent('myAgent', 'Hello');

// Obter timeline completo
const correlationId = result.context.correlationId;
const timeline = orchestration.getExecutionTimeline(correlationId);

console.log(timeline);
// 🕐 EXECUTION TIMELINE
// ═══════════════════════════════════════════════════════
// 09:30:45.123 ⚡ INITIALIZED agent.started (0ms)
// 09:30:45.150 🤔 THINKING agent.thinking (27ms)
// 09:30:45.850 ⚡ ACTING tool.called (700ms)
// 09:30:46.100 👀 OBSERVING tool.result (250ms)
// 09:30:47.600 ✅ COMPLETED agent.completed (1.48s)
```

### **Funcionalidades do Timeline:**

- ✅ **Visualização ASCII** - Timeline visual no terminal
- ✅ **Relatórios detalhados** - Análise completa de performance
- ✅ **Export JSON/CSV** - Para análise externa
- ✅ **Monitoramento ativo** - Lista execuções em andamento
- ✅ **Cleanup automático** - Limpeza de timelines antigos

### **Métodos Disponíveis:**

```typescript
// Timeline formatado
orchestration.getExecutionTimeline(correlationId, 'ascii' | 'detailed' | 'compact')

// Relatório completo
orchestration.getExecutionReport(correlationId)

// Export para análise
orchestration.exportTimelineJSON(correlationId)
orchestration.exportTimelineCSV(correlationId)

// Análise programática
orchestration.getRawTimeline(correlationId)
orchestration.getActiveExecutions()
orchestration.hasTimeline(correlationId)
```

📖 **Guia completo**: [Timeline Integration](docs/TIMELINE_INTEGRATION.md)

## 📚 Documentação

- [Publicação Simples](PUBLISH_SIMPLE.md) - Como publicar no Google Artifact Registry
- [Uso Simples](USAGE_SIMPLE.md) - Como usar o pacote
- [Timeline Integration](docs/TIMELINE_INTEGRATION.md) - Guia completo do timeline

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
