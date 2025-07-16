# Migration Guide: Clean Architecture

## Overview

Esta migração introduz uma arquitetura limpa que separa claramente as responsabilidades:

- **AgentDefinition**: O que o agent É (stateless)
- **ServiceRegistry**: Injeção de dependências
- **ExecutionContext**: Contexto de execução
- **ServiceAccess**: Facade para agents usarem services

## Before vs After

### BEFORE (Coupled)
```typescript
// Agent tinha save/load direto
const agent: AgentDefinition = {
    async think(input, context) {
        // Context tinha save/load methods
        await context.save('key', 'value');
        const data = await context.load('key');
    }
};

// Context misturava runtime com definition
interface AgentContext {
    stateManager: StateService;
    memoryManager: MemoryService;
    save(key, value): Promise<void>;  // ❌ Mixed concerns
    load(key): Promise<unknown>;      // ❌ Mixed concerns
}
```

### AFTER (Clean)
```typescript
// Agent usa services através de facade
const agent: AgentDefinition = {
    async think(input, context, services) {
        // Services são injetados e opcionais
        if (services.hasMemory()) {
            await services.save('key', 'value');
            const data = await services.load('key');
        }
    }
};

// Context separado de services
interface AgentExecutionContext {
    request: RequestInfo;      // WHO, WHERE, WHEN
    runtime: AgentRuntime;     // Services available
    state: ExecutionState;     // Current state
}
```

## Migration Steps

### 1. Update Agent Definitions

**Before:**
```typescript
const myAgent: AgentDefinition = {
    name: 'my-agent',
    description: 'My agent',
    async think(input, context) {
        // Old way - direct context access
        await context.save('data', input);
        return { reasoning: 'Done', action: { type: 'final_answer', content: 'result' }};
    }
};
```

**After:**
```typescript
import type { AgentDefinition } from '../core/types/agent-definition.js';

const myAgent: AgentDefinition = {
    name: 'my-agent',
    identity: {
        role: 'Assistant',
        goal: 'Help users with tasks',
    },
    async think(input, context, services) {
        // New way - service facade
        if (services.hasMemory()) {
            await services.save('data', input, {
                tenantId: context.request.tenantId,
                sessionId: context.request.sessionId,
            });
        }
        
        services.log('info', 'Processing input', { input });
        
        return { 
            reasoning: 'Processed input successfully', 
            action: { type: 'final_answer', content: 'result' }
        };
    },
    config: {
        maxIterations: 5,
        capabilities: {
            enableMemory: true,
            enableState: true,
        },
    },
};
```

### 2. Update Execution Code

**Before:**
```typescript
import { AgentCore } from '../engine/agents/agent-core.js';

const core = new AgentCore(config);
const result = await core.execute(agent, input, options);
```

**After:**
```typescript
import { CleanAgentExecutor } from '../engine/agents/clean-agent-executor.js';
import { createDefaultRuntime } from '../core/context/context-factory.js';
import { IdGenerator } from '../utils/id-generator.js';

const executor = new CleanAgentExecutor({
    timeout: 30000,
    maxIterations: 10,
});

const request = {
    tenantId: 'my-tenant',
    threadId: 'thread-123',
    executionId: IdGenerator.executionId(),
    correlationId: IdGenerator.correlationId(),
};

const runtime = await createDefaultRuntime();

const result = await executor.execute(agent, input, request, runtime);
```

### 3. Update Service Usage

**Before:**
```typescript
// Services were tightly coupled to context
context.stateManager.set('namespace', 'key', 'value');
context.memoryManager.store({ key: 'key', content: 'value' });
```

**After:**
```typescript
// Services used through facade with graceful degradation
await services.save('key', 'value', {
    namespace: 'my-namespace',
    tenantId: context.request.tenantId,
});

const data = await services.load('key', {
    namespace: 'my-namespace',
    tenantId: context.request.tenantId,
});

// Check availability
if (services.hasMemory()) {
    // Use persistent storage
}

if (services.hasState()) {
    // Use temporary storage
}
```

### 4. Update Service Configuration

**Before:**
```typescript
// Services configured globally or in factory
const memoryManager = getGlobalMemoryManager();
```

**After:**
```typescript
import { ServiceRegistry } from '../core/services/service-registry.js';

// Create registry
const registry = new ServiceRegistry();

// Register services
registry
    .registerStateService(stateService)
    .registerMemoryService(memoryService)
    .registerSessionService(sessionService)
    .registerLogger(logger);

// Get runtime
const runtime = registry.getRuntime();
```

## Breaking Changes

### Removed from AgentContext
- `save(key, value): Promise<void>`
- `load(key): Promise<unknown>`

### Changed Function Signatures

**Agent.think() function:**
```typescript
// Before
think(input: TInput, context: AgentContext): Promise<AgentThought>

// After  
think(input: TInput, context: AgentExecutionContext, services: ServiceAccess): Promise<AgentThought>
```

**Context creation:**
```typescript
// Before
createAgentContext(config: AgentContextConfig): AgentContext

// After
createAgentExecutionContext(agentName: string, request: RequestInfo, runtime: AgentRuntime): AgentExecutionContext
```

## Benefits

### 1. **Testability**
```typescript
// Easy to mock services
const mockServices = {
    hasMemory: () => false,
    hasState: () => true,
    save: jest.fn(),
    load: jest.fn(),
    log: jest.fn(),
};

await agent.think(input, context, mockServices);
```

### 2. **Flexibility**
```typescript
// Agents work with or without services
const minimalRuntime = { services: {}, resources: {} };
await executor.execute(agent, input, request, minimalRuntime);
```

### 3. **Performance**
```typescript
// Services lazy-loaded and optional
if (services.hasMemory()) {
    // Only use memory when available
}
```

### 4. **Maintainability**
- Clear separation of concerns
- Easy to add new services
- No tight coupling between layers

## Migration Checklist

- [ ] Update agent definitions to use new signature
- [ ] Replace AgentContext with AgentExecutionContext  
- [ ] Remove direct context.save/load calls
- [ ] Use ServiceAccess facade instead
- [ ] Update execution code to use CleanAgentExecutor
- [ ] Configure services via ServiceRegistry
- [ ] Update tests to use new interfaces
- [ ] Update documentation

## Example Files

See these files for complete examples:
- `src/examples/clean-architecture-example.ts`
- `src/engine/agents/clean-agent-executor.ts`
- `src/core/services/service-registry.ts`
- `src/core/services/service-access.ts`