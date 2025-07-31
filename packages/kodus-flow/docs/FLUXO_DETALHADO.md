# 🔍 FLUXO DETALHADO - ONDE CADA AÇÃO É REGISTRADA

## 🎯 **FLUXO COMPLETO DE EXECUÇÃO**

### **1. 🚀 INÍCIO DA EXECUÇÃO**

```typescript
// ✅ Usuário chama:
const result = await agent.callAgent('user-input');

// ✅ AgentCore.processAction() é chamado
// ✅ AgentCore.emitEvent() é chamado
```

### **2. 📝 REGISTRO DE EVENTOS**

#### **✅ AÇÃO 1: Agent Action Start**
```typescript
// ✅ src/engine/agents/agent-core.ts - Linha 817
this.kernelHandler.emit('agent.action.start', {
    agentName: context.agentName,
    actionType,
    correlationId,
    sessionId: context.system.sessionId,
});

// ✅ ONDE É REGISTRADO:
// 1. KernelHandler.emit() → Kernel.emitEventAsync()
// 2. Kernel.run() → Runtime.processEvent()
// 3. Runtime → EventStore.appendEvents()
// 4. EventStore → Persistor.append() → MONGODB
```

#### **✅ AÇÃO 2: Tool Execution**
```typescript
// ✅ src/engine/agents/agent-core.ts - Linha 873
const toolResult = await this.kernelHandler.requestToolExecution(
    toolName,
    toolInput,
    { correlationId },
);

// ✅ ONDE É REGISTRADO:
// 1. ToolEngine.executeTool()
// 2. ToolEngine.emit('tool.execute.start')
// 3. ToolEngine.emit('tool.execute.response')
// 4. Runtime → EventStore → MONGODB
```

#### **✅ AÇÃO 3: Tool Completion**
```typescript
// ✅ src/engine/agents/agent-core.ts - Linha 948
this.kernelHandler.emit('agent.tool.completed', {
    agentName: context.agentName,
    toolName,
    result: toolResult,
    correlationId,
});

// ✅ ONDE É REGISTRADO:
// 1. KernelHandler.emit() → Kernel.emitEventAsync()
// 2. Kernel → Runtime → EventStore → MONGODB
```

### **3. 🗄️ PERSISTÊNCIA REAL**

#### **✅ EVENTOS VÃO PARA MONGODB:**
```typescript
// ✅ src/runtime/core/event-store.ts - Linha 115
async appendEvents(events: AnyEvent[]): Promise<void> {
    const snapshot = {
        xcId: `events_${this.config.executionId}`,
        ts: Date.now(),
        events: events, // ✅ EVENTOS AQUI
        state: {
            eventMetadata,
            sequenceNumber: this.sequenceNumber + events.length,
        },
        hash: this.generateBatchHash(events),
    };

    // ✅ SALVA NO MONGODB
    await this.persistor.append(snapshot);
}
```

#### **✅ SNAPSHOTS VÃO PARA MONGODB:**
```typescript
// ✅ src/kernel/kernel.ts - Linha 574
async pause(reason: string = 'manual'): Promise<string> {
    const snapshot = await this.createSnapshot();
    await this.persistor.append(snapshot); // ✅ SNAPSHOT NO MONGODB
    return snapshot.hash;
}
```

### **4. 📊 O QUE É REGISTRADO ONDE**

| Ação | Onde é Registrada | Persistência |
|------|-------------------|--------------|
| **Agent Action Start** | `agent.action.start` | ✅ MongoDB |
| **Tool Execution Start** | `tool.execute.start` | ✅ MongoDB |
| **Tool Execution Response** | `tool.execute.response` | ✅ MongoDB |
| **Agent Tool Completed** | `agent.tool.completed` | ✅ MongoDB |
| **Agent Action Error** | `agent.action.error` | ✅ MongoDB |
| **Context Updates** | `context.update` | ❌ Memória |
| **Session Data** | `session.update` | ❌ Memória |
| **State Changes** | `state.update` | ❌ Memória |

### **5. 🔍 FLUXO DETALHADO POR AÇÃO**

#### **✅ AÇÃO: Agent Executa Tool**

```typescript
// 1. ✅ AGENT EMITE EVENTO
this.kernelHandler.emit('agent.action.start', {
    agentName: 'my-agent',
    actionType: 'tool_call',
    correlationId: 'corr-123',
});

// 2. ✅ KERNEL PROCESSA
kernel.emitEventAsync('agent.action.start', data);

// 3. ✅ RUNTIME RECEBE
runtime.processEvent(event);

// 4. ✅ EVENT STORE SALVA
eventStore.appendEvents([event]);

// 5. ✅ PERSISTOR SALVA NO MONGODB
persistor.append({
    xcId: 'events_exec-123',
    ts: Date.now(),
    events: [event],
    state: { eventMetadata },
    hash: 'abc123',
});
```

#### **✅ AÇÃO: Tool Executa**

```typescript
// 1. ✅ TOOL ENGINE EMITE
toolEngine.emit('tool.execute.start', {
    toolName: 'calculator',
    input: { expression: '2+2' },
});

// 2. ✅ RUNTIME PROCESSA
runtime.processEvent(toolEvent);

// 3. ✅ EVENT STORE SALVA
eventStore.appendEvents([toolEvent]);

// 4. ✅ MONGODB RECEBE
// Collection: snapshots
// Document: { xcId: 'events_exec-123', events: [toolEvent] }
```

#### **✅ AÇÃO: Tool Completa**

```typescript
// 1. ✅ TOOL ENGINE EMITE RESULTADO
toolEngine.emit('tool.execute.response', {
    toolName: 'calculator',
    result: { value: 4 },
    duration: 150,
});

// 2. ✅ AGENT EMITE COMPLETION
agent.emit('agent.tool.completed', {
    agentName: 'my-agent',
    toolName: 'calculator',
    result: { value: 4 },
});

// 3. ✅ MONGODB RECEBE AMBOS
// Collection: snapshots
// Document: { events: [toolStart, toolResponse, agentCompletion] }
```

### **6. 🗄️ ESTRUTURA NO MONGODB**

#### **✅ COLLECTION: `snapshots`**

```javascript
// ✅ DOCUMENTO 1: Event Batch
{
  "_id": "snapshot_abc123",
  "xcId": "events_exec-123",
  "ts": 1703123456789,
  "events": [
    {
      "id": "event-1",
      "type": "agent.action.start",
      "data": {
        "agentName": "my-agent",
        "actionType": "tool_call",
        "correlationId": "corr-123"
      },
      "ts": 1703123456789
    },
    {
      "id": "event-2", 
      "type": "tool.execute.start",
      "data": {
        "toolName": "calculator",
        "input": { "expression": "2+2" }
      },
      "ts": 1703123456790
    },
    {
      "id": "event-3",
      "type": "tool.execute.response", 
      "data": {
        "toolName": "calculator",
        "result": { "value": 4 },
        "duration": 150
      },
      "ts": 1703123456940
    },
    {
      "id": "event-4",
      "type": "agent.tool.completed",
      "data": {
        "agentName": "my-agent",
        "toolName": "calculator", 
        "result": { "value": 4 }
      },
      "ts": 1703123456941
    }
  ],
  "state": {
    "eventMetadata": [
      { "eventId": "event-1", "processed": true },
      { "eventId": "event-2", "processed": true },
      { "eventId": "event-3", "processed": true },
      { "eventId": "event-4", "processed": true }
    ],
    "sequenceNumber": 4
  },
  "hash": "batch_hash_abc123"
}

// ✅ DOCUMENTO 2: Kernel Snapshot
{
  "_id": "snapshot_def456", 
  "xcId": "kernel_exec-123",
  "ts": 1703123456942,
  "events": [],
  "state": {
    "contextData": {
      "agent": { "state": { "status": "running" } },
      "user": { "preferences": { "language": "typescript" } }
    },
    "stateData": {
      "currentStep": "thinking",
      "variables": { "lastResult": 4 }
    }
  },
  "hash": "kernel_hash_def456"
}
```

### **7. 🎯 RESUMO DO FLUXO**

#### **✅ O QUE VAI PARA MONGODB:**
1. **Todos os eventos** (agent.action.start, tool.execute.start, etc.)
2. **Snapshots do kernel** (quando pausa/resume)
3. **Event metadata** (para replay)

#### **❌ O QUE FICA EM MEMÓRIA:**
1. **Context updates** (setContext/getContext)
2. **Session data** (session management)
3. **State changes** (state updates)
4. **Agent state** (agent internal state)

### **8. 🔍 VERIFICAÇÃO PRÁTICA**

#### **✅ COMO VERIFICAR NO MONGODB:**

```javascript
// ✅ Ver todos os eventos de uma execução
db.snapshots.find({ "xcId": "events_exec-123" })

// ✅ Ver snapshots do kernel
db.snapshots.find({ "xcId": "kernel_exec-123" })

// ✅ Ver eventos por tipo
db.snapshots.find({ 
  "events.type": "agent.action.start" 
})

// ✅ Ver eventos não processados
db.snapshots.find({ 
  "state.eventMetadata.processed": false 
})
```

## 🎯 **CONCLUSÃO**

### **✅ O QUE ESTÁ FUNCIONANDO:**
- **Eventos**: ✅ Vão para MongoDB
- **Snapshots**: ✅ Vão para MongoDB  
- **Replay**: ✅ Funciona com MongoDB
- **Pause/Resume**: ✅ Funciona com MongoDB

### **❌ O QUE NÃO ESTÁ FUNCIONANDO:**
- **Context**: ❌ Fica em memória
- **Session**: ❌ Fica em memória
- **State**: ❌ Fica em memória
- **Agent State**: ❌ Fica em memória

**Os eventos são persistidos corretamente no MongoDB, mas o context/state/session ficam em memória!** 🚨 
