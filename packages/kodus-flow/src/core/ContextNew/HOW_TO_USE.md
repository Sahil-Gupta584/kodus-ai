# 🚀 Como usar o EnhancedContextBuilder

## ✅ CONFIGURAÇÃO CORRETA (Uma vez apenas!)

### 1️⃣ **No Orchestrator/Kernel (início da aplicação):**

```typescript
// sdk-orchestrator.ts ou kernel.ts
import { EnhancedContextBuilder } from '@/core/ContextNew';

class SDKOrchestrator {
    async initialize(config: OrchestratorConfig) {
        // ... outras configs ...

        // 🎯 CONFIGURE UMA VEZ APENAS!
        EnhancedContextBuilder.configure({
            connectionString: config.database?.connectionString,
            dbName: config.database?.name || 'kodus-flow',
            
            // Collections customizáveis
            sessionsCollection: 'agent-sessions',
            snapshotsCollection: 'execution-snapshots',
            
            // TTLs configuráveis
            sessionTTL: config.session?.ttl || 24 * 60 * 60 * 1000,
            snapshotTTL: config.snapshot?.ttl || 7 * 24 * 60 * 60 * 1000,
            
            // Memory config (opcional)
            memory: config.memory
        });

        this.logger.info('EnhancedContextBuilder configured');
    }
}
```

### 2️⃣ **No AgentCore (usa getInstance, não precisa connection string!):**

```typescript
// agent-core.ts
import { EnhancedContextBuilder } from '@/core/ContextNew';

class AgentCore {
    async executeAgent(options: AgentExecutionOptions) {
        // 🎯 SÓ USA getInstance() - JÁ ESTÁ CONFIGURADO!
        const contextBuilder = EnhancedContextBuilder.getInstance();
        
        // Inicializa sessão
        await contextBuilder.initializeAgentSession(
            options.sessionId,
            options.userId,
            options.tenantId
        );
        
        // Continue com execução...
    }
}
```

### 3️⃣ **No Planner (resolve createFinalResponse):**

```typescript
// plan-execute-planner.ts
import { EnhancedContextBuilder } from '@/core/ContextNew';

class PlanExecutePlanner {
    async createFinalResponse(plannerContext: PlannerExecutionContext) {
        // 🎯 SÓ USA getInstance() - SEM CONNECTION STRING!
        const contextBuilder = EnhancedContextBuilder.getInstance();
        
        // 🔥 Agora tem contexto completo!
        const finalContext = await contextBuilder.buildFinalResponseContext(plannerContext);
        
        // finalContext tem tudo que precisa:
        // - runtime.messages (conversa completa)
        // - runtime.entities (referências resolvidas)
        // - executionSummary (métricas de execução)
        // - recovery (info de recuperação)
        // - inferences (mapeamento de referências)
        
        return this.buildRichResponse(finalContext);
    }
}
```

### 4️⃣ **Em qualquer outro lugar:**

```typescript
// Em QUALQUER arquivo do projeto
import { EnhancedContextBuilder } from '@/core/ContextNew';

// NÃO PRECISA PASSAR CONNECTION STRING!
const builder = EnhancedContextBuilder.getInstance();

// Acesso a services específicos se necessário
const sessionManager = builder.getSessionManager();
const contextBridge = builder.getContextBridge();
const memoryManager = builder.getMemoryManager();
```

## ❌ **O QUE NÃO FAZER:**

```typescript
// ❌ ERRADO - Não passe connection string em todo lugar!
const runtime = createContextRuntime('mongodb://localhost:27017');

// ❌ ERRADO - Não configure múltiplas vezes!
EnhancedContextBuilder.configure({...}); // no arquivo A
EnhancedContextBuilder.configure({...}); // no arquivo B

// ❌ ERRADO - Não crie instâncias locais!
const myBuilder = new EnhancedContextBuilder(); // Privado!
```

## ✅ **RESUMO:**

1. **Configure UMA VEZ** no início (orchestrator/kernel)
2. **Use getInstance()** em todos os outros lugares
3. **Nunca passe connection string** depois da configuração inicial
4. **É um Singleton** - mesma instância em toda aplicação

## 🎯 **Benefícios:**

- ✅ Segue exatamente o padrão do `ContextBuilder` atual
- ✅ Configuração centralizada
- ✅ Sem duplicação de configs
- ✅ Acesso global em toda cadeia de execução
- ✅ Resolve o problema do `createFinalResponse`
- ✅ Collections MongoDB customizáveis
- ✅ Suporte InMemory + MongoDB via adapters