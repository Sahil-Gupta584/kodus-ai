# 🕐 Timeline System - Guia de Uso

## 📋 Visão Geral

O sistema de timeline de execução foi implementado seguindo a abordagem funcional do sistema de observabilidade existente. Ele fornece tracking completo de execução com state machine pattern e timeline visual para o usuário.

## 🚀 Funcionalidades Implementadas

### ✅ **Timeline de Execução**
- State machine pattern para tracking de estados
- Correlação de eventos usando tipos existentes
- Performance tracking detalhado
- Integração com sistema funcional

### ✅ **Visualização**
- ASCII timeline visual
- Relatórios detalhados
- Formato compacto para logs
- Export para JSON/CSV/Markdown

### ✅ **Integração**
- Middleware para tracking automático
- Composição com observabilidade existente
- Funções puras para análise

## 🔧 Como Usar

### 1. **Tracking Básico**

```typescript
import { 
    getTimelineManager, 
    withTimelineTracking 
} from '@/observability/execution-timeline';

// Criar timeline
const manager = getTimelineManager();
const timeline = manager.createTimeline({
    executionId: 'exec-123',
    correlationId: 'corr-456',
    agentName: 'myAgent',
});

// Track evento
manager.trackEvent(
    'exec-123',
    EVENT_TYPES.AGENT_THINKING,
    { input: 'user query' },
    { duration: 500 }
);
```

### 2. **Wrapper Funcional**

```typescript
import { withTimelineTracking } from '@/observability/execution-timeline';

// Wrapper para operações com tracking
const trackedOperation = withTimelineTracking(
    'myOperation',
    {
        executionId: 'exec-123',
        correlationId: 'corr-456',
        agentName: 'myAgent',
    },
    {
        trackInput: true,
        trackOutput: true,
        trackDuration: true,
    }
)(async (input: string) => {
    // Sua operação aqui
    return `Result: ${input}`;
});

const result = await trackedOperation('test input');
```

### 3. **Composição com Observabilidade**

```typescript
import { 
    createObservableTimelineOperation 
} from '@/observability/execution-timeline';

// Combina observabilidade + timeline
const observableOperation = createObservableTimelineOperation(
    async (input: string) => {
        // Sua operação
        return `Result: ${input}`;
    },
    'myOperation',
    {
        executionId: 'exec-123',
        correlationId: 'corr-456',
    },
    {
        retries: 3,
        timeout: 5000,
    },
    {
        trackInput: true,
        trackOutput: true,
        trackDuration: true,
    }
);
```

### 4. **Middleware para Eventos**

```typescript
import { 
    createTimelineTrackingMiddleware 
} from '@/observability/execution-timeline';

// Middleware para tracking automático
const timelineMiddleware = createTimelineTrackingMiddleware({
    agentName: 'myAgent',
});

// Usar no handler
const trackedHandler = timelineMiddleware(
    async (event: AnyEvent) => {
        // Processar evento
        return 'result';
    },
    'eventHandler'
);
```

## 👀 Visualização

### 1. **Timeline ASCII**

```typescript
import { getTimelineViewer } from '@/observability/timeline-viewer';

const viewer = getTimelineViewer();

// Visualizar timeline
const timeline = viewer.viewTimeline('exec-123', {
    format: 'ascii',
    maxEntries: 20,
    showDurations: true,
});

console.log(timeline);
```

### 2. **Relatório Detalhado**

```typescript
// Relatório completo
const report = viewer.viewTimeline('exec-123', {
    format: 'detailed',
    includeMetadata: true,
    showDurations: true,
});

console.log(report);
```

### 3. **Listar Timelines**

```typescript
// Ver todos os timelines ativos
const list = viewer.listTimelines({
    format: 'compact',
});

console.log(list);
```

### 4. **Export**

```typescript
// Export para JSON
const jsonData = viewer.exportTimeline('exec-123', 'json');

// Export para CSV
const csvData = viewer.exportTimeline('exec-123', 'csv');

// Export para Markdown
const mdData = viewer.exportTimeline('exec-123', 'markdown');
```

## 🔍 Análise de Performance

### 1. **Análise Automática**

```typescript
import { analyzeTimeline } from '@/observability/execution-timeline';

const timeline = manager.getTimeline('exec-123');
const analysis = analyzeTimeline(timeline);

console.log({
    totalEntries: analysis.totalEntries,
    avgDuration: analysis.avgDuration,
    isCompleted: analysis.isCompleted,
    stateDistribution: analysis.stateDistribution,
});
```

### 2. **Filtragem**

```typescript
import { 
    filterTimelineByState, 
    filterTimelineByEventType 
} from '@/observability/execution-timeline';

// Filtrar por estado
const thinkingEntries = filterTimelineByState(timeline, ['thinking']);

// Filtrar por tipo de evento
const agentEvents = filterTimelineByEventType(timeline, [
    EVENT_TYPES.AGENT_STARTED,
    EVENT_TYPES.AGENT_COMPLETED,
]);
```

## 🎯 Estados da Máquina de Estado

O sistema implementa os seguintes estados:

- **initialized**: Execução iniciada
- **thinking**: Agent está pensando
- **acting**: Agent está executando ação
- **observing**: Agent está observando resultado
- **completed**: Execução concluída com sucesso
- **failed**: Execução falhou
- **paused**: Execução pausada

## 📊 Exemplo de Saída

```
📊 EXECUTION TIMELINE
═══════════════════════════════════════════════════════
Execution: exec-123
Status: COMPLETED
Duration: 2.5s
Events: 8
──────────────────────────────────────────────────────

09:30:45.123 ⚡ INITIALIZED agent.started (0ms)
09:30:45.150 🤔 THINKING agent.thinking (27ms)
09:30:45.850 ⚡ ACTING tool.called (700ms)
09:30:46.100 👀 OBSERVING tool.result (250ms)
09:30:46.120 🤔 THINKING agent.thought (20ms)
09:30:47.600 ✅ COMPLETED agent.completed (1.48s)

📈 SUMMARY
────────────────────
Success: ✅
Avg Duration: 412ms
Transitions: 5
```

## 🔧 Integração com Sistema Existente

O sistema foi implementado para integrar perfeitamente com o sistema funcional existente:

- **Mantém abordagem funcional**: Funções puras para análise e formatação
- **Integra com observabilidade**: Usa `getObservability()` e `createObservableOperation`
- **Usa tipos existentes**: Integra com `EVENT_TYPES` e `AnyEvent`
- **Composição funcional**: Permite combinar com outras funcionalidades

## 📚 Arquivos Implementados

- `execution-timeline.ts`: Core do sistema com state machine
- `timeline-viewer.ts`: Visualização e relatórios
- Integração em `index.ts`: Exports principais

## 🎉 Benefícios

1. **Visibilidade completa**: Vê tudo que acontece na execução
2. **State machine**: Transições válidas e tracking de estados
3. **Performance insights**: Análise detalhada de performance
4. **Debugging**: Timeline visual para troubleshooting
5. **Funcional**: Mantém consistência com sistema existente
6. **Flexível**: Múltiplos formatos de visualização

O sistema está pronto para uso e fornece o "timeline de tudo que aconteceu na execução" que você solicitou! 🎯