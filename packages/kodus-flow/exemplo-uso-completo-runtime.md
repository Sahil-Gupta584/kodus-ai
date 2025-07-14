# 🚀 Uso COMPLETO dos métodos Runtime

## ❌ Problema Atual:
O sistema usa apenas KernelHandler.emit() e runtime.process(), mas NÃO usa:
- emitAsync()
- ack()/nack() 
- processWithAcks()

## ✅ Solução: Implementar uso completo

### 1. No AgentCore - Usar emitAsync() com garantias

```typescript
// Atual (parcial):
if (this.kernelHandler) {
    this.kernelHandler.emit('agent.action.start', { ... });
}

// DEVERIA SER (completo):
if (this.kernelHandler) {
    const kernel = this.kernelHandler.getKernel();
    const runtime = kernel?.getRuntime();
    if (runtime) {
        // Usar emitAsync com delivery guarantee
        const emitResult = await runtime.emitAsync('agent.action.start', {
            agentName: context.agentName,
            actionType,
            correlationId,
            sessionId: context.sessionId,
        }, {
            deliveryGuarantee: 'at-least-once',
            correlationId,
        });

        // ACK se processamento foi bem-sucedido
        if (emitResult.success) {
            await runtime.ack(emitResult.eventId);
        } else {
            await runtime.nack(emitResult.eventId, new Error('Failed to emit'));
        }
    }
}
```

### 2. No Orchestrator - Usar processWithAcks()

```typescript
// Atual (parcial):
await runtime.process?.();

// DEVERIA SER (completo):
if (runtime.processWithAcks) {
    const result = await runtime.processWithAcks();
    this.logger.debug('Events processed with ACK/NACK', {
        processed: result.processed,
        acked: result.acked,
        failed: result.failed,
        agentName,
        correlationId: finalCorrelationId,
    });
}
```

### 3. Em Tool Execution - Usar ack/nack

```typescript
// Tool execution com garantias:
try {
    const toolResult = await this.toolEngine.executeTool(
        toolAction.toolName,
        toolAction.input,
    );

    // Emitir evento com garantia
    const emitResult = await runtime.emitAsync('agent.tool.completed', {
        agentName: context.agentName,
        toolName: toolAction.toolName,
        result: toolResult,
    }, { deliveryGuarantee: 'at-least-once' });

    // ACK do sucesso
    await runtime.ack(emitResult.eventId);

} catch (error) {
    // Emitir erro e NACK
    const errorResult = await runtime.emitAsync('agent.tool.error', {
        agentName: context.agentName,
        toolName: toolAction.toolName,
        error: error.message,
    }, { deliveryGuarantee: 'at-least-once' });

    await runtime.nack(errorResult.eventId, error);
    throw error;
}
```

### 4. Enhanced Queue Integration

```typescript
// Usar métodos enhanced do kernel:
const enhancedStats = kernel.getEnhancedRuntimeStats();
const dlqOps = kernel.getDLQOperations();
const recoveryOps = kernel.getRecoveryOperations();

// Reprocessar DLQ se necessário
if (dlqOps && enhancedStats?.enhancedQueue.dlq.size > 0) {
    await dlqOps.reprocessItems({ maxAge: 60000, limit: 10 });
}
```

## 🎯 Resultado Final:

Com essas mudanças, o sistema usaria TODOS os métodos do runtime:
- ✅ emit() (já usado)
- ✅ emitAsync() (novo)
- ✅ process() (já usado)  
- ✅ processWithAcks() (novo)
- ✅ ack() (novo)
- ✅ nack() (novo)
- ✅ DLQ operations (novo)
- ✅ Recovery operations (novo)

O sistema ficaria 100% completo e com garantias de delivery!