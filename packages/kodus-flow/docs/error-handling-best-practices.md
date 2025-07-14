# 🎯 **Guia de Boas Práticas - Tratamento de Erros**

## 📋 **Visão Geral**

Este guia define as melhores práticas para uso do módulo de erros do Kodus Flow, garantindo **consistência**, **performance** e **observabilidade** em todo o framework.

## 🚫 **O QUE NÃO FAZER**

### ❌ **Erros Genéricos**
```typescript
// ❌ ERRADO: Erro genérico sem contexto
throw new Error('Operation failed');

// ❌ ERRADO: Sem integração com observabilidade
catch (error) {
    console.log('Error:', error);
    throw error;
}
```

### ❌ **Falta de Contexto**
```typescript
// ❌ ERRADO: Sem informações de debug
throw new Error('Agent not found');

// ❌ ERRADO: Sem correlação
catch (error) {
    this.logger.error('Failed', error);
    throw error;
}
```

## ✅ **O QUE FAZER**

### 🎯 **1. Use Erros Específicos por Camada**

```typescript
// ✅ CORRETO: Kernel
throw new KernelError('KERNEL_INITIALIZATION_FAILED', 'Kernel not initialized');

// ✅ CORRETO: Runtime
throw new RuntimeError('RUNTIME_EVENT_PROCESSING_TIMEOUT', 'Event processing timeout');

// ✅ CORRETO: Engine
throw new EngineError('ENGINE_AGENT_NOT_FOUND', `Agent ${agentName} not found`);

// ✅ CORRETO: Orchestration
throw new OrchestrationError('ORCHESTRATION_PERMISSION_DENIED', 'Access denied');
```

### 🎯 **2. Integre com Observabilidade**

```typescript
// ✅ CORRETO: Logging estruturado
catch (error) {
    const wrappedError = observabilityErrorUtils.wrapAndObserveError(
        error,
        'ENGINE_OPERATION_FAILED',
        'Agent execution failed',
        { 
            agentName: 'my-agent',
            correlationId: context.correlationId 
        }
    );
    throw wrappedError;
}
```

### 🎯 **3. Implemente Retry Logic**

```typescript
// ✅ CORRETO: Verificação de retry
catch (error) {
    if (ErrorUtils.isRetryable(error)) {
        this.logger.warn('Retryable error, attempting retry', {
            error: error.message,
            attempt: attempt + 1,
            maxRetries
        });
        return await this.retryOperation(operation, attempt + 1);
    }
    
    // Erro não retryable, propagar
    throw error;
}
```

### 🎯 **4. Use Contexto Rico**

```typescript
// ✅ CORRETO: Contexto detalhado
throw new EngineError('ENGINE_TOOL_EXECUTION_FAILED', 'Tool execution failed', {
    context: {
        toolName: 'calculator',
        input: { expression: '2+2' },
        correlationId: 'corr-123',
        tenantId: 'tenant-456'
    },
    recoverable: true,
    retryable: true
});
```

## 🔧 **Padrões por Camada**

### **Kernel Layer**
```typescript
// Estados inválidos
throw new KernelError('KERNEL_INITIALIZATION_FAILED', 'Kernel not initialized');
throw new KernelError('KERNEL_OPERATION_TIMEOUT', 'Operation timeout');
throw new KernelError('KERNEL_CONTEXT_CORRUPTION', 'Context corruption detected');

// Quotas e limites
throw new KernelError('KERNEL_QUOTA_EXCEEDED', 'Memory quota exceeded');
```

### **Runtime Layer**
```typescript
// Processamento de eventos
throw new RuntimeError('RUNTIME_EVENT_PROCESSING_TIMEOUT', 'Event processing timeout');
throw new RuntimeError('RUNTIME_MEMORY_EXCEEDED', 'Memory limit exceeded');
throw new RuntimeError('RUNTIME_EVENT_QUEUE_FULL', 'Event queue full');

// Middleware
throw new RuntimeError('RUNTIME_MIDDLEWARE_CHAIN_BROKEN', 'Middleware chain broken');
```

### **Engine Layer**
```typescript
// Agentes
throw new EngineError('ENGINE_AGENT_INITIALIZATION_FAILED', 'Agent initialization failed');
throw new EngineError('AGENT_TIMEOUT', 'Agent execution timeout');
throw new EngineError('AGENT_LOOP_DETECTED', 'Infinite loop detected');

// Tools
throw new EngineError('ENGINE_TOOL_NOT_FOUND', `Tool ${toolName} not found`);
throw new EngineError('ENGINE_TOOL_EXECUTION_TIMEOUT', 'Tool execution timeout');

// Workflows
throw new EngineError('ENGINE_WORKFLOW_VALIDATION_FAILED', 'Workflow validation failed');
throw new EngineError('WORKFLOW_CYCLE_DETECTED', 'Workflow cycle detected');
```

### **Orchestration Layer**
```typescript
// Recursos não encontrados
throw new OrchestrationError('ORCHESTRATION_AGENT_NOT_FOUND', `Agent ${agentName} not found`);
throw new OrchestrationError('ORCHESTRATION_TOOL_NOT_FOUND', `Tool ${toolName} not found`);
throw new OrchestrationError('ORCHESTRATION_WORKFLOW_NOT_FOUND', `Workflow ${workflowName} not found`);

// Permissões e limites
throw new OrchestrationError('ORCHESTRATION_PERMISSION_DENIED', 'Access denied');
throw new OrchestrationError('ORCHESTRATION_RESOURCE_LIMIT_EXCEEDED', 'Resource limit exceeded');
```

## 🎯 **Padrões de Tratamento**

### **1. Try-Catch com Observabilidade**

```typescript
async executeOperation(input: unknown): Promise<unknown> {
    const startTime = Date.now();
    const correlationId = IdGenerator.correlationId();
    
    try {
        // Preparar contexto
        const context = {
            correlationId,
            operation: 'executeOperation',
            input: this.sanitizeInput(input)
        };
        
        // Executar operação
        const result = await this.performOperation(input);
        
        // Log sucesso
        this.logger.info('Operation completed', {
            correlationId,
            duration: Date.now() - startTime,
            success: true
        });
        
        return result;
    } catch (error) {
        // Log erro com contexto
        this.logger.error('Operation failed', error as Error, {
            correlationId,
            duration: Date.now() - startTime,
            input: this.sanitizeInput(input)
        });
        
        // Verificar se é retryable
        if (ErrorUtils.isRetryable(error)) {
            return await this.retryOperation(input, correlationId);
        }
        
        // Wrap e propagar
        throw observabilityErrorUtils.wrapAndObserveError(
            error,
            'ENGINE_OPERATION_FAILED',
            'Operation failed',
            { correlationId }
        );
    }
}
```

### **2. Retry Pattern**

```typescript
async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            
            if (!ErrorUtils.isRetryable(error) || attempt === maxRetries) {
                throw error;
            }
            
            // Exponential backoff
            const delay = baseDelay * Math.pow(2, attempt - 1);
            this.logger.warn('Retryable error, retrying', {
                attempt,
                maxRetries,
                delay,
                error: lastError.message
            });
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError!;
}
```

### **3. Circuit Breaker Pattern**

```typescript
class CircuitBreaker {
    private failures = 0;
    private lastFailureTime = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';
    
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === 'open') {
            if (Date.now() - this.lastFailureTime > 60000) {
                this.state = 'half-open';
            } else {
                throw new RuntimeError('RUNTIME_CIRCUIT_BREAKER_OPEN', 'Circuit breaker is open');
            }
        }
        
        try {
            const result = await operation();
            
            if (this.state === 'half-open') {
                this.state = 'closed';
                this.failures = 0;
            }
            
            return result;
        } catch (error) {
            this.failures++;
            this.lastFailureTime = Date.now();
            
            if (this.failures >= 5) {
                this.state = 'open';
            }
            
            throw error;
        }
    }
}
```

## 📊 **Métricas e Monitoramento**

### **1. Contadores de Erro**

```typescript
// Incrementar métricas de erro
this.monitor?.incrementRuntimeMetric('eventProcessing', 'failedEvents');

// Registrar erro específico
this.telemetry.recordMetric('counter', 'errors.engine.agent_not_found', 1, {
    agentName: 'my-agent',
    tenantId: 'tenant-123'
});
```

### **2. Health Checks**

```typescript
getHealthStatus(): HealthStatus {
    const errorRate = this.getErrorRate();
    const memoryUsage = this.getMemoryUsage();
    
    return {
        overall: errorRate > 0.1 ? 'unhealthy' : memoryUsage > 0.8 ? 'degraded' : 'healthy',
        components: {
            errorRate: { status: errorRate > 0.1 ? 'error' : 'ok', value: errorRate },
            memory: { status: memoryUsage > 0.8 ? 'warning' : 'ok', value: memoryUsage }
        }
    };
}
```

## 🔍 **Debugging e Troubleshooting**

### **1. Logs Estruturados**

```typescript
// ✅ CORRETO: Log estruturado
this.logger.error('Agent execution failed', error as Error, {
    agentName: 'my-agent',
    correlationId: 'corr-123',
    tenantId: 'tenant-456',
    input: this.sanitizeInput(input),
    duration: Date.now() - startTime,
    attempt: attempt + 1,
    maxRetries
});

// ❌ ERRADO: Log simples
console.error('Error:', error);
```

### **2. Contexto de Debug**

```typescript
// Adicionar contexto de debug
const debugContext = {
    stack: error instanceof Error ? error.stack : undefined,
    cause: error instanceof Error ? error.cause : undefined,
    timestamp: Date.now(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version
};

this.logger.debug('Debug context', debugContext);
```

## 🚀 **Performance e Otimização**

### **1. Error Sampling**

```typescript
// Sample errors in production to reduce noise
if (process.env.NODE_ENV === 'production' && Math.random() > 0.1) {
    // Only log 10% of errors in production
    return;
}
```

### **2. Async Error Handling**

```typescript
// Handle errors asynchronously to avoid blocking
process.nextTick(() => {
    this.logger.error('Async error handling', error as Error);
    this.monitor?.incrementRuntimeMetric('eventProcessing', 'failedEvents');
});
```

## 📋 **Checklist de Implementação**

- [ ] **Use erros específicos por camada**
- [ ] **Integre com observabilidade**
- [ ] **Implemente retry logic**
- [ ] **Adicione contexto rico**
- [ ] **Configure métricas de erro**
- [ ] **Implemente circuit breaker**
- [ ] **Use logs estruturados**
- [ ] **Configure health checks**
- [ ] **Teste cenários de erro**
- [ ] **Documente padrões de erro**

## 🎯 **Exemplos Práticos**

### **Agent Execution**

```typescript
async executeAgent(agentName: string, input: unknown): Promise<unknown> {
    const correlationId = IdGenerator.correlationId();
    const startTime = Date.now();
    
    try {
        // Validar agente
        const agent = this.getAgent(agentName);
        if (!agent) {
            throw new OrchestrationError(
                'ORCHESTRATION_AGENT_NOT_FOUND',
                `Agent ${agentName} not found`,
                { context: { agentName, correlationId } }
            );
        }
        
        // Executar com retry
        return await this.retryOperation(
            () => agent.execute(input),
            3,
            1000
        );
    } catch (error) {
        // Log com contexto
        this.logger.error('Agent execution failed', error as Error, {
            agentName,
            correlationId,
            duration: Date.now() - startTime,
            input: this.sanitizeInput(input)
        });
        
        // Verificar se é retryable
        if (ErrorUtils.isRetryable(error)) {
            return await this.retryOperation(
                () => this.executeAgent(agentName, input),
                2,
                2000
            );
        }
        
        // Wrap e propagar
        throw observabilityErrorUtils.wrapAndObserveError(
            error,
            'ENGINE_AGENT_EXECUTION_FAILED',
            'Agent execution failed',
            { agentName, correlationId }
        );
    }
}
```

### **Tool Execution**

```typescript
async executeTool(toolName: string, input: unknown): Promise<unknown> {
    const correlationId = IdGenerator.correlationId();
    
    try {
        const tool = this.getTool(toolName);
        if (!tool) {
            throw new EngineError(
                'ENGINE_TOOL_NOT_FOUND',
                `Tool ${toolName} not found`,
                { context: { toolName, correlationId } }
            );
        }
        
        return await tool.execute(input);
    } catch (error) {
        this.logger.error('Tool execution failed', error as Error, {
            toolName,
            correlationId,
            input: this.sanitizeInput(input)
        });
        
        throw observabilityErrorUtils.wrapAndObserveError(
            error,
            'ENGINE_TOOL_EXECUTION_FAILED',
            'Tool execution failed',
            { toolName, correlationId }
        );
    }
}
```

Este guia garante que todos os erros sejam **tratados consistentemente**, **observáveis** e **recuperáveis** em todo o framework Kodus Flow. 
