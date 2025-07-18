# 🎯 ContextManager - Simple Usage Guide

## 📋 **Overview**

O ContextManager agora tem uma **API simples e intuitiva** para gerenciar contexto de forma fácil, mantendo a compatibilidade com a API complexa original.

## 🚀 **Simple API - Recommended**

### **Basic Operations**

```typescript
// Set context value
await contextManager.setValue('user.theme', 'dark-mode');
await contextManager.setValue('tool.github.status', 'connected');
await contextManager.setValue('agent.currentStep', 'analyzing');

// Get context value
const theme = contextManager.getValue<string>('user.theme');
const status = contextManager.getValue('tool.github.status');
const step = contextManager.getValue('agent.currentStep');

// Check if exists
if (contextManager.hasValue('user.theme')) {
    console.log('Theme is set!');
}

// Delete context value
contextManager.deleteValue('user.theme');
```

### **Bulk Operations**

```typescript
// Get all values for a type
const userContext = contextManager.getAll<string>('user');
// Result: { theme: 'dark-mode', language: 'en' }

// Set multiple values at once
await contextManager.setBulk('user', {
    theme: 'dark-mode',
    language: 'en',
    timezone: 'UTC'
});

// Clear all values for a type
contextManager.clearValues('user');

// Clear all context
contextManager.clearValues();
```

## 🎯 **Convenience Helpers**

### **User Preferences**

```typescript
// Set user preference
await contextManager.setUserPreference('theme', 'dark');
await contextManager.setUserPreference('language', 'en');

// Get user preference
const theme = contextManager.getUserPreference<string>('theme');
const language = contextManager.getUserPreference<string>('language');
```

### **Tool Results**

```typescript
// Set tool result
await contextManager.setToolResult('github', {
    status: 'success',
    data: { repos: 10, stars: 100 }
});

// Get tool result
const githubResult = contextManager.getToolResult('github');
```

### **Agent State**

```typescript
// Set agent state
await contextManager.setAgentState('currentStep', 'analyzing');
await contextManager.setAgentState('progress', 0.75);

// Get agent state
const step = contextManager.getAgentState<string>('currentStep');
const progress = contextManager.getAgentState<number>('progress');
```

### **Execution Context**

```typescript
// Set execution context
await contextManager.setExecutionContext('iteration', 3);
await contextManager.setExecutionContext('maxIterations', 10);

// Get execution context
const iteration = contextManager.getExecutionContext<number>('iteration');
const maxIterations = contextManager.getExecutionContext<number>('maxIterations');
```

## 🐛 **Debug Helpers**

```typescript
// Get context summary for debugging
const summary = contextManager.getDebugSummary();
console.log(summary);
// Output: { user: 3, tool: 2, agent: 1, execution: 2 }
```

## 📊 **Usage Examples in Agent Code**

### **In Agent Core**

```typescript
// During agent execution
await agentContext.contextManager?.setAgentState('currentPhase', 'thinking');
await agentContext.contextManager?.setExecutionContext('iteration', iterationCount);

// Store tool results
await agentContext.contextManager?.setToolResult('github', toolResult);

// Get user preferences
const userTheme = agentContext.contextManager?.getUserPreference<string>('theme');
```

### **In Tool Execution**

```typescript
// Before tool execution
await contextManager.setToolResult(toolName, {
    status: 'running',
    startTime: Date.now()
});

// After tool execution
await contextManager.setToolResult(toolName, {
    status: 'success',
    result: toolResult,
    duration: Date.now() - startTime
});
```

### **In Planner**

```typescript
// Get agent state for planning
const currentStep = contextManager.getAgentState<string>('currentStep');
const userPreferences = contextManager.getAll('user');

// Set planning state
await contextManager.setAgentState('planningStrategy', 'react');
await contextManager.setExecutionContext('plannerType', 'react');
```

## 🔄 **Migration from Complex API**

### **Before (Complex)**

```typescript
await contextManager.addContextValue({
    type: 'user',
    key: 'theme',
    value: 'dark-mode',
    metadata: { source: 'user-input' }
});
```

### **After (Simple)**

```typescript
await contextManager.set('user.theme', 'dark-mode', { source: 'user-input' });
// or even simpler:
await contextManager.setUserPreference('theme', 'dark-mode');
```

## 🎯 **Best Practices**

1. **Use Simple API** - Prefer `set/get/has/delete` over `addContextValue`
2. **Use Helpers** - Use `setUserPreference`, `setToolResult`, etc. for common cases
3. **Type Safety** - Use generics: `get<string>('user.theme')`
4. **Consistent Naming** - Use dot notation: `user.theme`, `tool.github.status`
5. **Bulk Operations** - Use `setBulk` for multiple values at once

## 📋 **API Reference**

### **Core Methods**
- `set(key, value, metadata?)` - Set context value
- `get<T>(key)` - Get context value
- `has(key)` - Check if exists
- `delete(key)` - Delete context value
- `getAll<T>(type)` - Get all values for type
- `clear(type?)` - Clear values
- `setBulk(type, values)` - Set multiple values

### **Helpers**
- `setUserPreference(key, value)` / `getUserPreference<T>(key)`
- `setToolResult(tool, result)` / `getToolResult<T>(tool)`
- `setAgentState(key, value)` / `getAgentState<T>(key)`
- `setExecutionContext(key, value)` / `getExecutionContext<T>(key)`

### **Debug**
- `getDebugSummary()` - Get context summary

---

**Result**: ContextManager agora tem uma API **simples, intuitiva e poderosa** que mantém toda a funcionalidade original mas com usabilidade muito melhor! 🎉