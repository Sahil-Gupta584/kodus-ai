# AgentExecutionOptions - Correct Usage

## ❌ Incorrect Usage (Missing BaseContext properties)

```typescript
// This will cause TypeScript error
const options = {
    thread: {
        id: 'thread-123',
        metadata: { title: 'My Thread', description: 'Thread description' }
    },
    userContext: {
        organizationAndTeamData: myData
    }
};
```

## ✅ Correct Usage (Complete AgentExecutionOptions)

```typescript
import { createAgentContext } from '@kodus/flow';

// Complete options with all required BaseContext properties
const options: AgentExecutionOptions = {
    // BaseContext properties (REQUIRED)
    tenantId: 'your-tenant-id',
    correlationId: 'correlation-123', // or use IdGenerator.correlationId()
    startTime: Date.now(),
    
    // AgentExecutionOptions properties (REQUIRED)
    agentName: 'conversationAgent',
    thread: {
        id: 'thread-123',
        metadata: { 
            title: 'My Thread', 
            description: 'Thread description' 
        }
    },
    
    // Optional properties
    sessionId: 'session-123',
    timeout: 30000,
    maxIterations: 10,
    userContext: {
        organizationAndTeamData: myData
    },
    enableSession: true,
    enableState: true,
    enableMemory: true
};

// Use with createAgentContext
const agentContext = await createAgentContext(options);
```

## 🛠️ Helper Function for Quick Creation

```typescript
import { IdGenerator } from '@kodus/flow';

function createAgentExecutionOptions(
    agentName: string,
    threadId: string,
    tenantId: string,
    additionalOptions: Partial<AgentExecutionOptions> = {}
): AgentExecutionOptions {
    return {
        // Required BaseContext properties
        tenantId,
        correlationId: IdGenerator.correlationId(),
        startTime: Date.now(),
        
        // Required AgentExecutionOptions properties
        agentName,
        thread: {
            id: threadId,
            metadata: { description: `Thread for ${agentName}` }
        },
        
        // Merge additional options
        ...additionalOptions
    };
}

// Usage
const options = createAgentExecutionOptions(
    'conversationAgent',
    'thread-123',
    'tenant-456',
    {
        userContext: {
            organizationAndTeamData: myData
        }
    }
);
```

## 🔧 Error Resolution

If you see the error:
```
Type '{ thread: ...; userContext: ...; }' is not assignable to parameter of type 'AgentExecutionOptions'.
Type '{ thread: ...; userContext: ...; }' is missing the following properties from type 'BaseContext': tenantId, correlationId, startTime
```

**Solution:** Add the missing `BaseContext` properties:
- `tenantId`: Your tenant identifier
- `correlationId`: Unique correlation ID for tracing
- `startTime`: Timestamp when execution started

## 📋 Required Properties Checklist

- [ ] `tenantId` - Multi-tenant identifier
- [ ] `correlationId` - Execution correlation ID
- [ ] `startTime` - Execution start timestamp
- [ ] `agentName` - Name of the agent to execute
- [ ] `thread` - Thread configuration with id and metadata