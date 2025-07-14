# 🎯 Observabilidade Funcional - Kodus Flow

## 📋 **Visão Geral**

O módulo `@/observability` é o **sistema funcional de observabilidade** para todo o framework Kodus Flow. Fornece uma API simples e eficiente baseada em funções puras, **focada no essencial** para agentes e workflows.

## 🚀 **API Principal**

### **1. Logger Simples**
```typescript
import { createLogger } from '@/observability';

const logger = createLogger('my-component', 'info');

logger.info('Operation completed', {
    userId: 'user-123',
    operation: 'create-user'
});
```

### **2. Abordagem Funcional**
```typescript
import { createObservableOperation } from '@/observability';

// Criar operação observável
const observableOperation = createObservableOperation(
    async (input) => { /* sua operação */ },
    'my-operation',
    (input) => ({ userId: input.userId }), // extrair contexto
    { retries: 3, timeout: 5000 } // opções
);

// Usar a operação
const result = await observableOperation(input);
```

### **3. Observabilidade Completa**
```typescript
import { getObservability } from '@/observability';

const obs = getObservability();

// Trace com contexto
await obs.trace('user.creation', async () => {
    // Operação aqui
}, { correlationId: 'corr-123' });

// Medir performance
const { result, duration } = await obs.measure('database.query', async () => {
    return await db.query('SELECT * FROM users');
});
```

## 🎯 **Características**

### ✅ **Funcional**
- **Funções puras** sem side effects
- **Composição de funções** para flexibilidade
- **Currying** para configuração

### ✅ **Simples**
- **API minimalista** e direta
- **Configuração automática** baseada no ambiente
- **Performance otimizada** para produção

### ✅ **Eficiente**
- **Logging estruturado** com contexto
- **Métricas automáticas** sem overhead
- **Telemetry OpenTelemetry-compatible**

### ✅ **Focado no Essencial**
- **Métricas específicas** para agentes e workflows
- **Debugging simplificado** para troubleshooting
- **Sem over-engineering** desnecessário

## 🔧 **Configuração**

### **Automática (Recomendado)**
```typescript
// Detecta ambiente automaticamente
const obs = getObservability();
```

### **Customizada**
```typescript
const obs = getObservability({
    environment: 'production',
    logging: {
        level: 'warn',
        outputs: ['console', 'file']
    },
    telemetry: {
        enabled: true,
        sampling: { rate: 0.1 }
    }
});
```

## 📊 **Ambientes**

### **Development**
- ✅ Logging detalhado
- ✅ Debugging habilitado
- ✅ Telemetry 100% sampling
- ✅ Monitoring básico

### **Production**
- ✅ Logging otimizado
- ✅ Debugging desabilitado
- ✅ Telemetry 10% sampling
- ✅ Monitoring completo

### **Test**
- ✅ Logging mínimo
- ✅ Telemetry desabilitado
- ✅ Monitoring desabilitado

## 🎯 **Uso no Framework**

### **Engine Layer**
```typescript
import { createObservableOperation } from '@/observability';

export class AgentEngine {
    private observeExecution = createObservableOperation(
        async (input) => { /* execução do agente */ },
        'agent.execution',
        (input) => ({ agentName: input.name, inputSize: JSON.stringify(input).length })
    );
    
    async execute(input: AgentInput) {
        return await this.observeExecution(input);
    }
}
```

### **Runtime Layer**
```typescript
import { createObservableOperation } from '@/observability';

export class EventProcessor {
    private observeEventProcessing = createObservableOperation(
        async (event) => { /* processamento do evento */ },
        'event.process',
        (event) => ({ eventType: event.type, eventId: event.id })
    );
    
    async process(event: Event) {
        return await this.observeEventProcessing(event);
    }
}
```

### **Orchestration Layer**
```typescript
import { createObservableOperation } from '@/observability';

export class Orchestrator {
    private observeAgentCreation = createObservableOperation(
        async (config) => { /* criação do agente */ },
        'agent.creation',
        (config) => ({ agentName: config.name, configKeys: Object.keys(config) })
    );
    
    async createAgent(config: AgentConfig) {
        return await this.observeAgentCreation(config);
    }
}
```

## 🔍 **Componentes**

### **Functional**
- **Funções puras** para observabilidade
- **Composição** de operações observáveis
- **Currying** para configuração flexível
- **Validação** e transformação funcional

### **Logger**
- **Logging estruturado** com contexto
- **Performance tracking** automático
- **Métricas** de tamanho e performance

### **Telemetry**
- **OpenTelemetry-compatible**
- **Distributed tracing**
- **Metrics collection**
- **External APM integration**

### **Monitoring**
- **Métricas essenciais** para agentes e workflows
- **Health checks** básicos
- **Performance metrics** simplificados
- **Sem over-engineering**

### **Debugging**
- **Event tracing** para workflows
- **Performance profiling** para agentes
- **State inspection** para troubleshooting
- **Error analysis** simplificada

## 🚫 **Não Use**

- ❌ Não acesse componentes internos diretamente
- ❌ Não crie múltiplas instâncias desnecessárias
- ❌ Não ignore configuração de ambiente
- ❌ Não use console.log em produção

## ✅ **Melhores Práticas**

- ✅ Use `createObservableOperation` para operações observáveis
- ✅ Use `createLogger` para logging simples
- ✅ Use `getObservability` para observabilidade completa
- ✅ Configure ambiente adequadamente
- ✅ Monitore performance em produção
- ✅ Mantenha foco no essencial

## 🎯 **Resumo**

O módulo `@/observability` é o **sistema funcional** que fornece:

1. **Abordagem funcional** com funções puras
2. **API simples** e direta
3. **Performance otimizada** para produção
4. **Configuração automática** baseada no ambiente
5. **Composição flexível** de operações
6. **Foco no essencial** para agentes e workflows

**Use sempre este módulo** para observabilidade no Kodus Flow. A abordagem funcional garante simplicidade e eficiência, **sem over-engineering**.

## 📈 **Métricas Essenciais**

### **Agentes**
- Total de agentes
- Agentes ativos
- Execuções por agente
- Taxa de sucesso/falha
- Tempo médio de execução

### **Workflows**
- Total de workflows
- Workflows ativos
- Execuções por workflow
- Taxa de sucesso/falha
- Tempo médio de execução

### **Sistema**
- Uso de memória
- Uso de CPU
- Throughput geral
- Health status

**Simples, eficiente e focado no que realmente importa!** 🎯 
