# 🔍 Guia de Observabilidade Automática

## 🎯 **Visão Geral**

O framework agora oferece **métodos automáticos** para capturar contexto e simplificar o logging, ajudando o desenvolvedor a focar na lógica de negócio.

## 🚀 **Métodos Automáticos Disponíveis**

### **1. Logging Automático com Contexto**

```typescript
// ✅ ANTES: Dev precisava capturar tudo manualmente
catch (error) {
    this.logger.error('Failed', error as Error, {
        agentName: this.getDefinition()?.name,
        correlationId: context.correlationId,
        sessionId: context.sessionId,
        input: this.sanitizeInput(input),
        duration: Date.now() - startTime,
        attempt: attempt + 1,
        maxRetries
    });
    throw error;
}

// ✅ AGORA: Framework captura automaticamente
catch (error) {
    this.logError('Failed', error as Error, 'agent-execution', {
        input: input, // Será sanitizado automaticamente
        duration: Date.now() - startTime,
        attempt: attempt + 1,
        maxRetries
    });
    throw error;
}
```

### **2. Contexto Automático Capturado**

O framework captura automaticamente:

- ✅ **Identificação**: `agentName`, `tenantId`, `operation`
- ✅ **Execução**: `correlationId`, `sessionId`, `executionStatus`
- ✅ **Kernel**: `kernelEnabled`, `kernelContext` (se disponível)
- ✅ **Multi-Agent**: `agentCount`, `activeDelegations`, `pendingMessages`
- ✅ **Tempo**: `timestamp`

### **3. Sanitização Automática**

```typescript
// ✅ Input é sanitizado automaticamente
this.logError('Failed', error as Error, 'agent-execution', {
    input: input, // Será sanitizado automaticamente
    sensitiveData: { password: 'secret123' } // Será redatado
});
```

**Resultado:**
```json
{
  "input": { "expression": "2+2" },
  "sensitiveData": { "password": "[REDACTED]" }
}
```

## 📋 **Métodos Disponíveis**

### **`logError(message, error, operation, additionalContext?)`**
```typescript
// Log de erro com contexto automático
this.logError(
    'Agent execution failed',
    error as Error,
    'agent-execution',
    { input: input, duration: 1500 }
);
```

### **`logInfo(message, operation, additionalContext?)`**
```typescript
// Log de info com contexto automático
this.logInfo(
    'Agent execution started',
    'agent-execution',
    { input: input }
);
```

### **`logDebug(message, operation, additionalContext?)`**
```typescript
// Log de debug (só se debug=true)
this.logDebug(
    'Processing iteration 3',
    'agent-thinking',
    { iteration: 3, thought: thought }
);
```

### **`wrapErrorWithObservability(error, errorCode, message, context?)`**
```typescript
// Wrap error com observabilidade
const wrappedError = this.wrapErrorWithObservability(
    error,
    'ENGINE_AGENT_EXECUTION_FAILED',
    'Agent execution failed',
    { agentName: 'calculator' }
);
```

## 🎯 **Exemplos Práticos**

### **1. Execução de Agente**
```typescript
async executeAgent(input: unknown): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    
    try {
        this.logInfo('Agent execution started', 'agent-execution', { input });
        
        const result = await this.processAgent(input);
        
        this.logInfo('Agent execution completed', 'agent-execution', {
            duration: Date.now() - startTime,
            output: result
        });
        
        return result;
    } catch (error) {
        this.logError('Agent execution failed', error as Error, 'agent-execution', {
            input,
            duration: Date.now() - startTime
        });
        
        throw this.wrapErrorWithObservability(
            error,
            'ENGINE_AGENT_EXECUTION_FAILED',
            'Agent execution failed',
            { agentName: this.getDefinition()?.name }
        );
    }
}
```

### **2. Processamento de Tool**
```typescript
async executeTool(toolName: string, input: unknown): Promise<ToolResult> {
    try {
        this.logInfo('Tool execution started', 'tool-execution', {
            toolName,
            input
        });
        
        const result = await this.toolEngine.execute(toolName, input);
        
        this.logInfo('Tool execution completed', 'tool-execution', {
            toolName,
            result
        });
        
        return result;
    } catch (error) {
        this.logError('Tool execution failed', error as Error, 'tool-execution', {
            toolName,
            input
        });
        
        throw error;
    }
}
```

### **3. Multi-Agent Coordination**
```typescript
async coordinate(input: unknown): Promise<MultiAgentResult> {
    try {
        this.logInfo('Multi-agent coordination started', 'coordination', {
            input,
            agentCount: this.agents.size
        });
        
        const result = await this.executeSequential(input);
        
        this.logInfo('Multi-agent coordination completed', 'coordination', {
            result,
            activeDelegations: this.activeDelegations.size
        });
        
        return result;
    } catch (error) {
        this.logError('Multi-agent coordination failed', error as Error, 'coordination', {
            input,
            activeDelegations: this.activeDelegations.size
        });
        
        throw error;
    }
}
```

## 🔧 **Configuração**

### **Habilitar Debug Mode**
```typescript
const config: AgentCoreConfig = {
    tenantId: 'my-tenant',
    debug: true, // Habilita logDebug
    monitoring: true, // Habilita métricas
    enableKernelIntegration: true, // Captura contexto do kernel
    enableMultiAgent: true, // Captura contexto multi-agent
};
```

### **Contexto Capturado Automaticamente**
```json
{
  "operation": "agent-execution",
  "agentName": "calculator-agent",
  "tenantId": "my-tenant",
  "timestamp": 1703123456789,
  "correlationId": "corr-123",
  "sessionId": "session-456",
  "executionStatus": "running",
  "kernelEnabled": true,
  "kernelContext": "available",
  "agentCount": 5,
  "activeDelegations": 2,
  "pendingMessages": 3,
  "input": { "expression": "2+2" },
  "duration": 1500,
  "attempt": 1,
  "maxRetries": 3
}
```

## 🎯 **Benefícios**

### **1. Para o Desenvolvedor**
- ✅ **Menos código boilerplate**
- ✅ **Contexto rico automaticamente**
- ✅ **Sanitização automática**
- ✅ **Debug mais fácil**

### **2. Para o Sistema**
- ✅ **Logs consistentes**
- ✅ **Observabilidade rica**
- ✅ **Performance otimizada**
- ✅ **Segurança automática**

### **3. Para o DevOps**
- ✅ **Correlação automática**
- ✅ **Alertas inteligentes**
- ✅ **Troubleshooting rápido**
- ✅ **Métricas automáticas**

## 🚀 **Próximos Passos**

1. **Migrar código existente** para usar os novos métodos
2. **Implementar `getContextSummary`** no KernelHandler
3. **Integrar com observabilityErrorUtils** para wrap automático
4. **Adicionar métricas automáticas** baseadas no contexto
5. **Implementar alertas inteligentes** baseados nos logs

---

**Resultado:** Logging rico e consistente com **mínimo esforço** do desenvolvedor! 🎯 
