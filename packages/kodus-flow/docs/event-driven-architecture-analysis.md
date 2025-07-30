# Event-Driven Runtime Architecture Analysis

## Current Problems

### 1. **Runtime Doing Too Much**
```typescript
// ❌ Runtime shouldn't do automatic retries
const ackCleanupInterval = setInterval(() => {
    // Auto-retry logic in runtime - BAD!
    eventQueue.enqueue(ackInfo.event, 1)  
}, 5000);
```

### 2. **Confused Responsibilities**
- Runtime: Should only dispatch events, manage queues
- Kernel: Should be process/context abstraction
- Application: Should handle business logic, retries, errors

### 3. **What Should Happen**

```typescript
// ✅ Proper Event-Driven Architecture

// Runtime: Pure event dispatcher
interface EventRuntime {
    emit(event: Event): void;
    on(eventType: string, handler: EventHandler): void;
    off(eventType: string, handler: EventHandler): void;
    // NO RETRY LOGIC HERE!
}

// Kernel: Process abstraction
interface ExecutionKernel {
    execute(task: Task): Promise<Result>;
    pause(): void;
    resume(): void;
    // Context management, NOT event handling
}

// Application Layer: Business logic
class ToolExecutionService {
    async executeWithRetry(toolName: string, input: unknown) {
        // RETRY LOGIC BELONGS HERE!
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.toolEngine.execute(toolName, input);
            } catch (error) {
                if (attempt === maxRetries - 1) throw error;
                await this.delay(backoffDelay);
            }
        }
    }
}
```

## Recommendations

### 1. **Remove Runtime Retry Logic**
- ACK/NACK should be simple delivery confirmation
- NO automatic re-enqueuing in runtime
- Application layer handles retries

### 2. **Simplify Event Flow**
```
Application → Runtime.emit(event) → Queue → Dispatch → Handler
                     ↑                                    ↓
                   Success                              ACK/NACK
```

### 3. **Clear Separation of Concerns**
- **Runtime**: Event loop, queue management, dispatch
- **Kernel**: Process isolation, context management
- **Application**: Business logic, error handling, retry policies

### 4. **Fix the Current Issues**

Instead of complex filtering in runtime, we should:
1. Remove auto-retry from runtime
2. Move retry logic to application layer (ToolEngine, AgentCore)
3. Use ACK/NACK only for delivery confirmation, not retry triggers

## Current Code Issues

The current implementation has:
- Runtime making business decisions (what to retry)
- Complex event filtering logic that's error-prone
- Mixed concerns between layers
- Potential for infinite loops and resource leaks

This explains why you're seeing the issues with events continuing to process after errors!