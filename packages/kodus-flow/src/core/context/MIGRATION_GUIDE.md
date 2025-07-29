# 🚀 Context Architecture Migration Guide

This guide helps you migrate from the old context architecture to the new **ContextBuilder** approach.

## 🎯 What Changed?

### ✅ NEW ARCHITECTURE (Recommended)
- **Single Entry Point**: `ContextBuilder` 
- **Clean APIs**: No circular references
- **Clear Separation**: Memory, Session, State services
- **Type Safety**: Full TypeScript support

### ❌ OLD ARCHITECTURE (Legacy)
- **Multiple Factories**: Confusing entry points
- **Circular References**: Context → Runtime → Context
- **Mixed Responsibilities**: Overloaded ExecutionRuntime

---

## 📋 Migration Steps

### **STEP 1: Update Imports**

```typescript
// ❌ OLD WAY
import { 
    ExecutionRuntime, 
    RuntimeRegistry 
} from '@kodus/flow/context';

// ✅ NEW WAY  
import { 
    ContextBuilder,
    createAgentContext 
} from '@kodus/flow/context';
```

### **STEP 2: Update Context Creation**

```typescript
// ❌ OLD WAY
const runtime = RuntimeRegistry.getByThread(threadId);
const agentContext = await runtime.initializeAgentContext(
    agent, input, options
);

// ✅ NEW WAY
const agentContext = await createAgentContext({
    agentName: 'MyAgent',
    thread: { id: threadId },
    tenantId: 'tenant-1',
});
```

### **STEP 3: Use Clean APIs**

```typescript
// ✅ CLEAN APIS (No circular references)
await context.memory.store("knowledge");
await context.state.set("namespace", "key", "value");
await context.session.addEntry(input, output);
await context.track.toolUsage("tool", params, result, true);

// ❌ OLD WAY (Circular references)
const runtime = context.executionRuntime;
await runtime.getMemoryManager().store({...});
```

---

## 🔧 Component Migration

### **Planners (TODO - Next Phase)**
```typescript
// ❌ CURRENT (Legacy)
private getExecutionRuntime(thread: Thread): ExecutionRuntime | null {
    return RuntimeRegistry.getByThread(thread.id);
}

// ✅ TARGET (New)
private async getAgentContext(options: AgentExecutionOptions): Promise<AgentContext> {
    return createAgentContext(options);
}
```

### **Agent Core (TODO - Next Phase)**
```typescript
// ❌ CURRENT (Legacy)
const executionRuntime = new ExecutionRuntime(memoryManager);
const agentExecutionContext = await executionRuntime.initializeAgentContext(...)

// ✅ TARGET (New)
const agentContext = await createAgentContext(options);
const executionRuntime = new SimpleExecutionRuntime(identifiers);
const agentExecutionContext = executionRuntime.createAgentExecutionContext(
    agentContext, options
);
```

---

## 📦 Export Changes

### **Recommended Imports**
```typescript
// ✅ NEW ARCHITECTURE
import { 
    ContextBuilder,           // Main class
    contextBuilder,           // Singleton instance  
    createAgentContext,       // Main function
    SimpleExecutionRuntime,   // New pure runtime
} from '@kodus/flow/context';
```

### **Legacy Imports (Still Available)**
```typescript
// ⚠️ LEGACY (Will be deprecated)
import { 
    LegacyExecutionRuntime,   // Old ExecutionRuntime
    RuntimeRegistry,          // Registry pattern
    UnifiedContextFactory,    // Old factory
} from '@kodus/flow/context';
```

---

## 🎪 Architecture Comparison

### **NEW Flow**
```
User → ContextBuilder → Services → AgentContext
                     ↓
        MemoryManager + SessionService + StateService
```

### **OLD Flow (Legacy)**
```
User → RuntimeRegistry → ExecutionRuntime → AgentContext
                                         ↑
                        Circular Reference ←┘
```

---

## ⚡ Performance Benefits

| **Aspect** | **Old** | **New** |
|------------|---------|---------|
| **Memory Leaks** | Possible (circular refs) | Eliminated |
| **Startup Time** | Slower (complex init) | Faster (simple) |
| **Type Safety** | Mixed | Full TypeScript |
| **Code Clarity** | Confusing | Clean, obvious |
| **Testing** | Complex mocking | Easy to test |

---

## 🚨 Breaking Changes

### **Removed/Deprecated**
- `RuntimeRegistry.getByThread()` → Use `createAgentContext()`
- `ExecutionRuntime.initializeAgentContext()` → Use `ContextBuilder`
- Circular `context.executionRuntime` access → Use clean APIs

### **Still Works (Backward Compatibility)**
- `createAgentContext()` from context-factory ✅
- `UnifiedContextFactory` ✅  
- All existing service APIs ✅

---

## 🎯 Migration Checklist

- [ ] **Update imports** to use ContextBuilder
- [ ] **Replace RuntimeRegistry** usage with createAgentContext
- [ ] **Use clean APIs** instead of circular references
- [ ] **Update planners** (Phase 2 - TODO)
- [ ] **Update agent-core** (Phase 2 - TODO) 
- [ ] **Remove legacy code** (Phase 3 - TODO)

---

## 🆘 Need Help?

The new architecture is fully backward compatible. Existing code will continue to work while you migrate progressively.

**Questions? Check the implementation in:**
- `src/core/context/context-builder.ts` - Main implementation
- `src/core/context/index.ts` - Export structure
- `src/core/context/MIGRATION_GUIDE.md` - This guide