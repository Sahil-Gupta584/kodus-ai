# 🕐 Timeline Integration - Guia de Uso

## 📋 Visão Geral

O sistema de timeline agora está **totalmente integrado** no Orchestration Layer. Você pode acessar o timeline completo de qualquer execução de agente através do `SDKOrchestrator`.

## 🚀 Como Usar

### 1. **Execução Normal com Timeline**

```typescript
import { createOrchestration } from '@/orchestration/sdk-orchestrator';

// ✅ Criar orchestrator
const orchestration = createOrchestration({
    llmAdapter: yourLLMAdapter,
    enableObservability: true, // ✅ Importante!
});

// ✅ Criar agente
await orchestration.createAgent({
    name: 'myAgent',
    identity: { name: 'Assistant', role: 'helper' },
});

// ✅ Executar agente
const result = await orchestration.callAgent('myAgent', 'Hello, how are you?');

// ✅ Obter correlationId do resultado
const correlationId = result.context.correlationId;

// ✅ Ver timeline completo!
const timeline = orchestration.getExecutionTimeline(correlationId);
console.log(timeline);
```

### 2. **Visualização do Timeline**

```typescript
// ✅ Timeline ASCII (padrão)
const asciiTimeline = orchestration.getExecutionTimeline(correlationId, 'ascii');
console.log(asciiTimeline);

// ✅ Timeline detalhado
const detailedTimeline = orchestration.getExecutionTimeline(correlationId, 'detailed');
console.log(detailedTimeline);

// ✅ Timeline compacto
const compactTimeline = orchestration.getExecutionTimeline(correlationId, 'compact');
console.log(compactTimeline);
```

### 3. **Relatórios e Export**

```typescript
// ✅ Relatório completo
const report = orchestration.getExecutionReport(correlationId);
console.log(report);

// ✅ Export JSON
const jsonData = orchestration.exportTimelineJSON(correlationId);
console.log(jsonData);

// ✅ Export CSV
const csvData = orchestration.exportTimelineCSV(correlationId);
console.log(csvData);
```

### 4. **Análise Programática**

```typescript
// ✅ Timeline raw para análise
const rawTimeline = orchestration.getRawTimeline(correlationId);
if (rawTimeline) {
    console.log('Total entries:', rawTimeline.entries.length);
    console.log('Current state:', rawTimeline.currentState);
    console.log('Duration:', rawTimeline.totalDuration);
    console.log('Transitions:', rawTimeline.transitions.length);
}

// ✅ Verificar se timeline existe
const hasTimeline = orchestration.hasTimeline(correlationId);
console.log('Timeline exists:', hasTimeline);
```

### 5. **Monitoramento de Execuções Ativas**

```typescript
// ✅ Listar todas as execuções ativas
const activeExecutions = orchestration.getActiveExecutions();
console.log('Active executions:', activeExecutions);

// Exemplo de saída:
// [
//   {
//     correlationId: 'corr-123',
//     agentName: 'myAgent',
//     status: 'completed',
//     startTime: 1703123456789,
//     duration: 2500,
//     entryCount: 8
//   }
// ]
```

### 6. **Cleanup de Timelines**

```typescript
// ✅ Limpar timelines antigos (24h por padrão)
const cleanedCount = orchestration.cleanupOldTimelines();
console.log('Cleaned timelines:', cleanedCount);

// ✅ Limpar com tempo customizado (1 hora)
const cleanedCount = orchestration.cleanupOldTimelines(60 * 60 * 1000);
```

## 🎯 Exemplo Completo

```typescript
import { createOrchestration } from '@/orchestration/sdk-orchestrator';

async function exemploCompleto() {
    // 1. Setup
    const orchestration = createOrchestration({
        llmAdapter: yourLLMAdapter,
        enableObservability: true,
    });

    // 2. Criar agente
    await orchestration.createAgent({
        name: 'assistant',
        identity: { name: 'Assistant', role: 'helper' },
    });

    // 3. Executar
    const result = await orchestration.callAgent(
        'assistant',
        'Calcule 2 + 2 e explique o processo'
    );

    // 4. Verificar sucesso
    if (result.success) {
        console.log('✅ Resultado:', result.result);
        
        // 5. Timeline completo
        const correlationId = result.context.correlationId;
        const timeline = orchestration.getExecutionTimeline(correlationId);
        
        console.log('🕐 TIMELINE DE EXECUÇÃO:');
        console.log(timeline);
        
        // 6. Relatório detalhado
        const report = orchestration.getExecutionReport(correlationId);
        console.log('📊 RELATÓRIO:');
        console.log(report);
        
        // 7. Análise programática
        const rawTimeline = orchestration.getRawTimeline(correlationId);
        if (rawTimeline) {
            console.log('📈 ESTATÍSTICAS:');
            console.log('- Total de eventos:', rawTimeline.entries.length);
            console.log('- Estado final:', rawTimeline.currentState);
            console.log('- Duração total:', rawTimeline.totalDuration, 'ms');
            console.log('- Transições:', rawTimeline.transitions.length);
        }
    } else {
        console.error('❌ Erro:', result.error);
    }
}
```

## 🎨 Exemplo de Saída

```
🕐 TIMELINE DE EXECUÇÃO:
🕐 EXECUTION TIMELINE
═══════════════════════════════════════════════════════
Execution: corr-123
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

## 🔧 Configuração

### **Observabilidade Habilitada**

```typescript
const orchestration = createOrchestration({
    llmAdapter: yourLLMAdapter,
    enableObservability: true, // ✅ OBRIGATÓRIO para timeline
});
```

### **Performance**

- **Timeline tracking**: Overhead mínimo (~1-2ms por evento)
- **Memory usage**: ~1KB por execução
- **Cleanup automático**: 24h por padrão
- **Global singleton**: Não duplica recursos

## 🎯 Benefícios

1. **Visibilidade completa**: Vê todo o fluxo de execução
2. **Debugging fácil**: Timeline visual para troubleshooting
3. **Performance insights**: Análise de bottlenecks
4. **Export flexível**: JSON, CSV, relatórios
5. **Integração simples**: Apenas um `correlationId`
6. **Zero configuração**: Funciona automaticamente

## 🚨 Limitações

1. **Timeline só existe se `enableObservability: true`**
2. **Timeline é limpo automaticamente após 24h**
3. **Timeline só existe para execuções via `callAgent()`**
4. **Timeline é global (não isolado por tenant)**

## 🎉 Resultado

Agora você tem **visibilidade completa** de todo o fluxo de execução dos agentes! 🚀 
