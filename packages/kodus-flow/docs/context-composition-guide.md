# Guia de Composição de Contextos

## 📋 Visão Geral

Este guia estabelece as **boas práticas** para criação e composição de contextos no Kodus Flow, garantindo consistência, performance e facilidade de manutenção.

## ✅ REGRAS FUNDAMENTAIS

### 1. **SEMPRE use factories para criar contextos**
```typescript
// ✅ CORRETO: Usar factories
import { createAgentBaseContext, createAgentTestContext } from '../src/core/context/context-factory.js';

const context = createAgentBaseContext('my-agent', 'tenant-1');
const testContext = createAgentTestContext('test-agent', 'test-tenant');

// ❌ INCORRETO: Criar manualmente
const context: AgentContext = {
    agentName: 'my-agent',
    tenantId: 'tenant-1',
    // ... muitas linhas de código manual
};
```

### 2. **Padrão de composição: Base → Enhanced**
```typescript
// 1. Criar contexto base usando factory
const baseContext = createAgentBaseContext('agent-1', 'tenant-1');

// 2. Criar enhanced context usando factory
const enhancedContextFactory = createEngineContextFactory(kernelHandler, toolEngine);
const enhancedContext = enhancedContextFactory.createContext(baseContext, {
    usesTools: true,
    usesPlanner: false,
    usesRouter: false,
    usesMultiAgent: false,
    usesState: false,
    usesStateSync: false,
    usesCircuitBreaker: false,
    usesObservability: false,
});
```

### 3. **Prefira ContextStateManager sobre GlobalStateManager**
```typescript
// ✅ CORRETO: ContextStateManager (isolado por execução)
const context = createAgentBaseContext('agent-1', 'tenant-1');
// ContextStateManager é injetado automaticamente

// ⚠️ APENAS quando necessário: GlobalStateManager
// Use apenas para:
// - Cache compartilhado entre execuções
// - Coordenação multi-agent
// - Estado global da aplicação
```

## 🏗️ HIERARQUIA DE CONTEXTOS

```
BaseContext (core/context/context-factory.ts)
├── WorkflowContext (workflows)
├── AgentContext (agents)
└── ToolContext (tools)

EnhancedAgentContext (core/context/enhanced-context.ts)
├── Tools Proxy
├── Routers Proxy
├── Agents Proxy
├── Ecosystem Proxy
├── Planner Proxy
├── State Proxy
├── StateSync Proxy
├── CircuitBreaker Proxy
└── Observability Proxy
```

## 📦 FACTORIES DISPONÍVEIS

### Context Factory (core/context/context-factory.ts)
```typescript
// Para contextos base
createAgentBaseContext(agentName: string, tenantId: string): AgentContext
createAgentTestContext(agentName: string, tenantId: string): AgentContext
createAgentIntegrationContext(agentName: string, tenantId: string): AgentContext

// Para workflows
createBaseContext(options: CreateBaseContextOptions): BaseContext
createWorkflowContext(baseContext: BaseContext, options): WorkflowContext
```

### Enhanced Context Factory (core/context/enhanced-context.ts)
```typescript
// Para enhanced contexts
createEngineContextFactory(kernelHandler, toolEngine): EnhancedContextFactory
createOrchestratorContextFactory(orchestration): EnhancedContextFactory
```

## 🎯 EXEMPLOS PRÁTICOS

### Exemplo 1: Contexto Simples
```typescript
import { createAgentBaseContext } from '../src/core/context/context-factory.js';

// Contexto básico para agent
const context = createAgentBaseContext('calculator-agent', 'math-tenant');
```

### Exemplo 2: Contexto com Enhanced Features
```typescript
import { createAgentBaseContext } from '../src/core/context/context-factory.js';
import { createEngineContextFactory } from '../src/core/context/enhanced-context.js';

// 1. Contexto base
const baseContext = createAgentBaseContext('advanced-agent', 'tenant-1');

// 2. Enhanced context com tools e state
const enhancedFactory = createEngineContextFactory(kernelHandler, toolEngine);
const enhancedContext = enhancedFactory.createContext(baseContext, {
    usesTools: true,
    usesState: true,
    usesObservability: true,
    // ... outras features conforme necessário
});
```

### Exemplo 3: Contexto para Testes
```typescript
import { createAgentTestContext } from '../src/core/context/context-factory.js';

// Contexto específico para testes
const testContext = createAgentTestContext('test-agent', 'test-tenant');
```

### Exemplo 4: Contexto para Integração
```typescript
import { createAgentIntegrationContext } from '../src/core/context/context-factory.js';

// Contexto específico para integração
const integrationContext = createAgentIntegrationContext('integration-agent', 'integration-tenant');
```

## ⚠️ ANTI-PATTERNS

### ❌ Anti-pattern 1: Criação Manual de Contextos
```typescript
// ❌ NUNCA faça isso
const context: AgentContext = {
    agentName: 'agent-1',
    tenantId: 'tenant-1',
    // ... muitas linhas de código manual
    // Fácil de esquecer propriedades obrigatórias
    // Difícil de manter
    // Inconsistente entre diferentes partes do código
};
```

### ❌ Anti-pattern 2: Usar GlobalStateManager Desnecessariamente
```typescript
// ❌ Evite usar GlobalStateManager para estado local
const globalState = new GlobalStateManager();
globalState.set('agent-data', data); // Estado global desnecessário

// ✅ Use ContextStateManager para estado local
const context = createAgentBaseContext('agent-1', 'tenant-1');
// ContextStateManager é injetado automaticamente
```

### ❌ Anti-pattern 3: Duplicar Lógica de Contexto
```typescript
// ❌ Não duplique lógica de criação de contexto
function createMyContext() {
    return {
        agentName: 'agent-1',
        tenantId: 'tenant-1',
        // ... lógica duplicada
    };
}

// ✅ Use as factories existentes
const context = createAgentBaseContext('agent-1', 'tenant-1');
```

## 🔧 CONFIGURAÇÃO AVANÇADA

### Customizando ContextStateManager
```typescript
import { ContextStateManager } from '../src/core/context/state-manager.js';

// Criar state manager customizado se necessário
const customStateManager = new ContextStateManager({
    namespace: 'custom-namespace',
    persistence: 'memory', // ou 'redis', 'custom'
});
```

### Integrando com Enhanced Context
```typescript
// O enhanced context detecta automaticamente o uso de features
const enhancedContext = enhancedFactory.createContext(baseContext, {
    usesTools: true, // Injeta tools proxy
    usesState: true, // Injeta state proxy
    usesObservability: true, // Injeta observability proxy
});
```

## 📊 BENEFÍCIOS

### ✅ Consistência
- Todos os contextos seguem o mesmo padrão
- Propriedades obrigatórias sempre presentes
- Comportamento previsível

### ✅ Manutenibilidade
- Mudanças centralizadas nas factories
- Fácil de testar e debugar
- Código mais limpo

### ✅ Performance
- ContextStateManager otimizado
- Lazy loading de features
- Memory management adequado

### ✅ Segurança
- Validação automática de tenantId
- Isolamento de estado por execução
- Sanitização de inputs

## 🚀 PRÓXIMOS PASSOS

1. **Refatorar exemplos existentes** para usar factories
2. **Atualizar documentação** com este padrão
3. **Criar testes** para validar composição de contextos
4. **Implementar linting rules** para prevenir criação manual

## 📚 REFERÊNCIAS

- [Context Factory](../src/core/context/context-factory.ts)
- [Enhanced Context](../src/core/context/enhanced-context.ts)
- [State Manager](../src/core/context/state-manager.ts)
- [Types](../src/core/types/index.ts) 