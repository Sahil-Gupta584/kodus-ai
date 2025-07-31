# 🏗️ Session/Memory Architecture Redesign

## 🚨 **PROBLEMA ATUAL:**

A session está sendo contaminada com dados técnicos que deveriam estar separados:

```json
// Session atual (RUIM):
[
  {
    "timestamp": 1753921648488,
    "input": {
      "type": "planner_step",
      "step": {
        "type": "execution_start",
        "executionId": "exec_mdqnnvql_xNYpd7_3",
        "startTime": 1753921646445,
        "status": "running",
        "agentName": "conversational-agent",
        "correlationId": "corr_mCyEkS2oY_mdqnnvqi"
      }
    },
    "output": null,
    "agentName": "system"
  }
]
```

**Problemas:**
- ❌ Dados técnicos misturados com conversa
- ❌ Session history ilegível para UI
- ❌ Memory com informações inúteis
- ❌ Impossível fazer analytics limpo

---

## 🎯 **ARQUITETURA IDEAL - SEPARATION OF CONCERNS:**

### **Princípios:**
1. **Session** = User conversation only (what user sees)
2. **Memory** = Learning & context (what agent remembers)  
3. **State** = Execution state (current processing state)
4. **Telemetry** = Technical debugging (observability)

---

## 📋 **IMPLEMENTAÇÃO DETALHADA:**

### **1. 💬 SESSION - User Conversation Layer**

#### **Novo Type:**
```typescript
// src/core/context/services/session-service.ts
export type UserConversationEntry = {
    timestamp: number;
    userInput: string;                    // What user said
    assistantOutput: string;              // What user saw  
    agentName: string;                    // Which agent responded
    conversationId: string;               // Thread continuity
    success: boolean;                     // Did it work for user?
    duration?: number;                    // Response time (user-visible)
};

export type ConversationHistory = Array<UserConversationEntry>;
```

#### **Exemplo Session Limpa:**
```json
{
  "conversationHistory": [
    {
      "timestamp": 1753921826865,
      "userInput": "@kody hello",
      "assistantOutput": "Hello! How can I assist you today?",
      "agentName": "conversational-agent", 
      "conversationId": "conv_123",
      "success": true,
      "duration": 1200
    },
    {
      "timestamp": 1753922000000,
      "userInput": "Create a report about tech trends",
      "assistantOutput": "I'll create a comprehensive tech trends report for you...",
      "agentName": "conversational-agent",
      "conversationId": "conv_123", 
      "success": true,
      "duration": 15000
    }
  ]
}
```

#### **Novos Métodos:**
```typescript
// SessionService - métodos limpos
async addCleanConversation(
    sessionId: string,
    userInput: string,
    assistantOutput: string,
    agentName: string,
    success: boolean = true,
    duration?: number
): Promise<boolean>

async getCleanHistory(
    sessionId: string, 
    limit: number = 10
): Promise<UserConversationEntry[]>

async getConversationContext(
    sessionId: string
): Promise<string> // Formatted context for agents
```

---

### **2. 🧠 MEMORY - Learning & Context Layer**

#### **Novos Types:**
```typescript
// src/core/memory/types.ts
export type MemoryInsightType = 
    | 'user_preference'     // "User prefers friendly greetings"
    | 'pattern'            // "Plan-execute works well for multi-step tasks"  
    | 'context'            // "User is working on agent architecture"
    | 'outcome'            // "This approach succeeded/failed"
    | 'feedback';          // "User was satisfied with response"

export interface MemoryInsight {
    id: string;
    type: MemoryInsightType;
    content: string;                      // Human-readable insight
    confidence: number;                   // 0-1 reliability score
    entityId?: string;                    // User/tenant
    sessionId?: string;                   // Link to conversation
    timestamp: number;
    source: 'conversation' | 'execution' | 'feedback' | 'analysis';
    tags: string[];
    expiresAt?: number;                   // Some insights expire
}
```

#### **Exemplo Memory Entries:**
```json
[
  {
    "id": "mem_001",
    "type": "user_preference",
    "content": "User prefers direct, concise responses over verbose explanations",
    "confidence": 0.8,
    "sessionId": "sess_123",
    "source": "conversation",
    "tags": ["communication_style", "response_format"],
    "timestamp": 1753921826865
  },
  {
    "id": "mem_002", 
    "type": "pattern",
    "content": "Plan-execute strategy effective for multi-tool workflows",
    "confidence": 0.9,
    "source": "execution",
    "tags": ["planning", "strategy", "multi_tool"],
    "timestamp": 1753921826865
  },
  {
    "id": "mem_003",
    "type": "context",
    "content": "User is working on improving agent architecture and session management",
    "confidence": 0.7,
    "sessionId": "sess_123", 
    "source": "conversation",
    "tags": ["project_context", "architecture"],
    "timestamp": 1753921826865
  }
]
```

#### **Novos Métodos:**
```typescript
// MemoryManager - métodos para insights
async storeInsight(insight: Omit<MemoryInsight, 'id' | 'timestamp'>): Promise<MemoryInsight>

async getRelevantInsights(
    query: string, 
    context: { sessionId?: string; entityId?: string },
    limit: number = 5
): Promise<MemoryInsight[]>

async extractInsightsFromConversation(
    conversation: UserConversationEntry[]
): Promise<MemoryInsight[]>

async updateInsightConfidence(
    insightId: string, 
    feedback: 'positive' | 'negative'
): Promise<void>
```

---

### **3. ⚡ STATE - Execution State Layer**

#### **Novos Types:**
```typescript
// src/core/context/services/execution-state.ts
export interface ExecutionState {
    sessionId: string;
    executionId: string;
    correlationId: string;
    status: 'planning' | 'executing' | 'completed' | 'failed' | 'replanning';
    startTime: number;
    endTime?: number;
    
    currentStep?: {
        stepId: string;
        description: string;
        status: 'pending' | 'executing' | 'completed' | 'failed';
        startTime: number;
        attempts: number;
        tool?: string;
    };
    
    plan?: {
        id: string;
        strategy: string;
        steps: Array<{
            id: string; 
            description: string;
            status: string;
            tool?: string;
        }>;
        currentStepIndex: number;
        totalSteps: number;
    };
    
    context: {
        iterations: number;
        lastThought?: string;
        availableTools: string[];
        agentName: string;
    };
    
    performance: {
        totalDuration?: number;
        planningTime?: number;
        executionTime?: number;
        toolCallCount: number;
        retryCount: number;
    };
}

export interface ExecutionStateService {
    createExecution(sessionId: string, agentName: string): Promise<ExecutionState>;
    updateExecution(executionId: string, updates: Partial<ExecutionState>): Promise<void>;
    getCurrentExecution(sessionId: string): Promise<ExecutionState | null>;
    getExecutionHistory(sessionId: string, limit?: number): Promise<ExecutionState[]>;
    completeExecution(executionId: string, success: boolean): Promise<void>;
    cleanupExpiredExecutions(): Promise<number>;
}
```

---

### **4. 📊 TELEMETRY - Technical Debugging Layer**

#### **Novos Types:**
```typescript
// src/core/observability/telemetry-service.ts
export interface TelemetryEvent {
    timestamp: number;
    level: 'debug' | 'info' | 'warn' | 'error';
    category: 'planner' | 'tool' | 'agent' | 'session' | 'memory' | 'system';
    event: string;
    message?: string;
    data: Record<string, unknown>;
    executionId?: string;
    sessionId?: string;
    correlationId?: string;
    duration?: number;
    tags: string[];
}

export interface TelemetryService {
    emit(event: Omit<TelemetryEvent, 'timestamp'>): void;
    query(filters: {
        category?: string;
        level?: string;
        sessionId?: string;
        executionId?: string;
        since?: number;
        limit?: number;
    }): Promise<TelemetryEvent[]>;
    getMetrics(timeRange: { start: number; end: number }): Promise<{
        executionCount: number;
        averageDuration: number;
        successRate: number;
        errorsByType: Record<string, number>;
    }>;
}
```

---

## 🔄 **FLUXO DE DADOS REDESENHADO:**

### **User Input Flow:**
```
User: "@kody hello"
    ↓
1. SESSION.addCleanConversation("@kody hello", "", agentName, false) // Placeholder
2. STATE.createExecution(sessionId, agentName)
3. TELEMETRY.emit("agent", "execution_started", {...})
4. AGENT.process(input) 
    ↓ Internal processing...
    4a. PLANNER.think() → TELEMETRY.emit("planner", "plan_created")
    4b. EXECUTOR.execute() → TELEMETRY.emit("tool", "step_executed") 
    4c. STATE.updateExecution(executionId, { currentStep: {...} })
5. Response: "Hello! How can I assist you today!"
6. SESSION.updateConversation(entry.id, response, success: true, duration)
7. MEMORY.extractInsightsFromConversation([conversation])
8. STATE.completeExecution(executionId, success: true)
9. TELEMETRY.emit("agent", "execution_completed", { duration, success })
```

---

## 🛠️ **REFATORAÇÃO NECESSÁRIA:**

### **1. Context Builder:**
```typescript
// src/core/context/context-builder.ts - REDESIGNED
const contextBuilder = {
    session: {
        // ✅ CLEAN: Only user conversation
        addConversation: async (userInput: string, assistantOutput: string) => {
            await sessionService.addCleanConversation(
                session.id,
                userInput,
                assistantOutput, 
                agentName,
                true
            );
        },
        
        getHistory: async (limit = 5) => {
            return sessionService.getCleanHistory(session.id, limit);
        },
        
        getContext: async () => {
            return sessionService.getConversationContext(session.id);
        }
    },

    memory: {
        // ✅ LEARNING: Store and retrieve insights
        learn: async (insight: string, type: MemoryInsightType) => {
            await memoryService.storeInsight({
                type,
                content: insight,
                confidence: 0.8,
                sessionId: session.id,
                source: 'conversation',
                tags: []
            });
        },
        
        recall: async (query: string) => {
            return memoryService.getRelevantInsights(query, { 
                sessionId: session.id 
            });
        }
    },

    state: {
        // ✅ EXECUTION: Current state tracking
        createExecution: async (agentName: string) => {
            return executionStateService.createExecution(session.id, agentName);
        },
        
        updateExecution: async (executionId: string, updates: Partial<ExecutionState>) => {
            await executionStateService.updateExecution(executionId, updates);
        },
        
        getCurrentExecution: async () => {
            return executionStateService.getCurrentExecution(session.id);
        }
    },

    telemetry: {
        // ✅ TECHNICAL: Debug and monitoring
        log: (category: string, event: string, data: unknown) => {
            telemetryService.emit({
                level: 'info',
                category,
                event,
                data,
                executionId: context.executionId,
                sessionId: session.id,
                tags: []
            });
        },
        
        error: (category: string, error: Error, context?: unknown) => {
            telemetryService.emit({
                level: 'error',
                category,
                event: 'error_occurred',
                message: error.message,
                data: { error: error.stack, context },
                executionId: context.executionId,
                sessionId: session.id,
                tags: ['error']
            });
        }
    }
};
```

### **2. Agent Core:**
```typescript
// src/engine/agents/agent-core.ts - CLEAN SEPARATION
export async function executeAgent<TInput, TOutput>(
    agent: Agent<TInput, TOutput>,
    input: TInput,
    context: AgentExecutionContext
): Promise<AgentExecutionResult<TOutput>> {
    
    const startTime = Date.now();
    
    // ✅ STATE: Create execution tracking
    const execution = await context.state.createExecution(agent.name);
    
    // ✅ TELEMETRY: Log start
    context.telemetry.log('agent', 'execution_started', {
        agent: agent.name,
        inputType: typeof input
    });

    try {
        // Execute agent
        const result = await agent.process(input, context.agentContext);
        const duration = Date.now() - startTime;
        
        // ✅ SESSION: Clean conversation only
        if (context.sessionId && typeof input === 'string' && typeof result.output === 'string') {
            await context.session.addConversation(
                input,              // Clean user input
                result.output       // Clean assistant response
            );
        }

        // ✅ MEMORY: Extract insights
        await context.memory.learn(
            `Successfully handled: ${extractIntent(input)}`,
            'outcome'
        );

        // ✅ STATE: Complete execution
        await context.state.updateExecution(execution.executionId, {
            status: 'completed',
            endTime: Date.now(),
            performance: {
                totalDuration: duration,
                toolCallCount: result.metadata?.toolCallCount || 0
            }
        });

        // ✅ TELEMETRY: Log completion
        context.telemetry.log('agent', 'execution_completed', {
            agent: agent.name,
            duration,
            success: true,
            iterations: result.metadata?.iterations || 1
        });

        return result;

    } catch (error) {
        // ✅ STATE: Mark as failed
        await context.state.updateExecution(execution.executionId, {
            status: 'failed',
            endTime: Date.now()
        });

        // ✅ TELEMETRY: Log error
        context.telemetry.error('agent', error as Error, {
            agent: agent.name,
            input: typeof input === 'string' ? input.substring(0, 100) : 'complex'
        });

        throw error;
    }
}
```

---

## 📈 **BENEFÍCIOS DA NOVA ARQUITETURA:**

### **🎯 Session Benefits:**
- ✅ Clean conversation history for UI
- ✅ Perfect for chat interfaces
- ✅ Easy conversation context for agents
- ✅ User-friendly analytics

### **🧠 Memory Benefits:**  
- ✅ Agent learns user preferences
- ✅ Contextual insights across sessions
- ✅ Improved response quality over time
- ✅ Pattern recognition for optimization

### **⚡ State Benefits:**
- ✅ Real-time execution tracking
- ✅ Better error handling and recovery
- ✅ Execution replay capabilities
- ✅ Performance optimization data

### **📊 Telemetry Benefits:**
- ✅ Rich debugging information
- ✅ Performance monitoring
- ✅ Error analysis and trends
- ✅ System health monitoring

---

## 🚀 **IMPLEMENTAÇÃO ROADMAP:**

### **Phase 1: Foundation**
1. ✅ Create new types and interfaces
2. ✅ Implement ExecutionStateService
3. ✅ Implement TelemetryService  
4. ✅ Update MemoryManager for insights

### **Phase 2: Core Refactor**
5. ✅ Refactor SessionService for clean conversations
6. ✅ Update ContextBuilder with new architecture
7. ✅ Refactor AgentCore for separation

### **Phase 3: Integration**
8. ✅ Update all planners to use new telemetry
9. ✅ Update tool engine for clean state tracking
10. ✅ Add insight extraction from conversations

### **Phase 4: Migration**
11. ✅ Create migration script for existing sessions
12. ✅ Add backward compatibility layer
13. ✅ Update tests and documentation

---

## 🔧 **FILES TO CREATE/MODIFY:**

### **New Files:**
- `src/core/context/services/execution-state-service.ts`
- `src/core/observability/telemetry-service.ts`
- `src/core/memory/insight-extractor.ts`
- `src/core/context/types/clean-types.ts`

### **Files to Modify:**
- `src/core/context/services/session-service.ts`
- `src/core/context/context-builder.ts`
- `src/engine/agents/agent-core.ts`
- `src/core/memory/memory-manager.ts`
- All planner files for telemetry
- Tool engine for state tracking

---

## 📝 **MIGRATION STRATEGY:**

### **Backward Compatibility:**
```typescript
// Support old session format during transition
export function migrateOldSession(oldSession: OldSession): Session {
    return {
        ...oldSession,
        conversationHistory: oldSession.conversationHistory
            .filter(entry => isUserConversation(entry))
            .map(entry => ({
                timestamp: entry.timestamp,
                userInput: extractUserInput(entry.input),
                assistantOutput: extractAssistantOutput(entry.output),
                agentName: entry.agentName || 'unknown',
                conversationId: oldSession.threadId,
                success: !entry.metadata?.error
            }))
    };
}
```

### **Gradual Rollout:**
1. Deploy new services alongside old ones
2. Route new sessions to new architecture  
3. Migrate existing sessions in background
4. Remove old code once migration complete

---

## ✅ **IMPLEMENTATION CHECKLIST:**

- [ ] Create ExecutionStateService
- [ ] Create TelemetryService
- [ ] Update MemoryManager for insights
- [ ] Refactor SessionService for clean conversations
- [ ] Update ContextBuilder architecture
- [ ] Refactor AgentCore separation
- [ ] Create insight extraction logic
- [ ] Add migration utilities
- [ ] Update all planners
- [ ] Update tool engine
- [ ] Add comprehensive tests
- [ ] Update documentation

**This architecture will give us clean, maintainable, and scalable session/memory management with proper separation of concerns.**