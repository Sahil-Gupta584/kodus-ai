# 🔍 EVENT TRACING GUIDE

## 🎯 **OBJETIVO**

Monitorar a **trajetória completa** dos eventos para identificar:
- ✅ Se há eventos duplicados
- ✅ Onde estão os timeouts
- ✅ Qual é o fluxo real dos eventos
- ✅ Se as correções estão funcionando

## 📊 **LOGS IMPLEMENTADOS**

### **1. EventQueue - Deduplication Tracking**
```bash
# ✅ Evento duplicado detectado
🚨 EVENT DUPLICATE DETECTED {
  eventId: 'call_abc123',
  eventType: 'tool.execute.request',
  correlationId: 'corr_xyz789',
  timestamp: 1753125480000,
  queueSize: 15,
  processedEventsCount: 1250
}

# ✅ Evento enfileirado com trace completo
📥 EVENT ENQUEUED - FULL TRACE {
  eventId: 'call_abc123',
  eventType: 'tool.execute.request',
  correlationId: 'corr_xyz789',
  priority: 1,
  queueSize: 16,
  eventSize: 473,
  trace: {
    source: 'event-queue-enqueue',
    step: 'event-added-to-queue',
    processedEventsCount: 1250,
    queueDepth: 16
  }
}

# ✅ Evento processado com sucesso
✅ EVENT PROCESSED SUCCESSFULLY {
  eventId: 'call_abc123',
  eventType: 'tool.execute.request',
  correlationId: 'corr_xyz789',
  successCount: 1,
  errorCount: 0,
  queueSize: 15,
  processedEventsCount: 1251,
  trace: {
    source: 'event-queue-processor',
    step: 'event-processed-success',
    batchSize: 10,
    chunkIndex: 0
  }
}
```

### **2. MultiKernelHandler - Request/Response Tracking**
```bash
# ✅ Request iniciado
🚀 MULTI-KERNEL REQUEST STARTED {
  requestEventType: 'tool.execute.request',
  responseEventType: 'tool.execute.response',
  correlationId: 'corr_xyz789',
  timeout: 15000,
  dataKeys: ['toolName', 'input'],
  trace: {
    source: 'multi-kernel-handler',
    step: 'request-initiated',
    timestamp: 1753125480000
  }
}

# ✅ Kernel target identificado
🎯 KERNEL TARGET IDENTIFIED {
  targetKernel: 'agent',
  kernelId: 'agent-execution',
  correlationId: 'corr_xyz789',
  trace: {
    source: 'multi-kernel-handler',
    step: 'kernel-target-identified',
    timestamp: 1753125480000
  }
}

# ✅ Handler registrado
📝 RESPONSE HANDLER REGISTERED {
  responseKernel: 'agent',
  responseKernelId: 'agent-execution',
  responseEventType: 'tool.execute.response',
  correlationId: 'corr_xyz789',
  trace: {
    source: 'multi-kernel-handler',
    step: 'handler-registered',
    timestamp: 1753125480000
  }
}

# ✅ Request emitido
📤 MULTI-KERNEL REQUEST EMITTED {
  requestEventType: 'tool.execute.request',
  correlationId: 'corr_xyz789',
  emitResult: { success: true, eventId: 'call_abc123' },
  trace: {
    source: 'multi-kernel-handler',
    step: 'request-emitted',
    timestamp: 1753125480000
  }
}

# ✅ Events processados após emit
🔄 EVENTS PROCESSED AFTER EMIT {
  correlationId: 'corr_xyz789',
  trace: {
    source: 'multi-kernel-handler',
    step: 'events-processed',
    timestamp: 1753125480000
  }
}

# ✅ Response recebido
📨 MULTI-KERNEL RESPONSE RECEIVED {
  eventId: 'call_def456',
  eventType: 'tool.execute.response',
  correlationId: 'corr_xyz789',
  hasError: false,
  trace: {
    source: 'multi-kernel-handler',
    step: 'response-received',
    timestamp: 1753125480000
  }
}

# ✅ Request sucesso
✅ MULTI-KERNEL REQUEST SUCCESS {
  correlationId: 'corr_xyz789',
  responseDataKeys: ['data', 'metadata'],
  trace: {
    source: 'multi-kernel-handler',
    step: 'request-success',
    timestamp: 1753125480000
  }
}
```

### **3. ToolEngine - Tool Execution Tracking**
```bash
# ✅ Tool execution iniciado
🔧 TOOL EXECUTION STARTED {
  toolName: 'github-mcp.list_repositories',
  callId: 'call_abc123',
  inputKeys: ['owner', 'repo'],
  timeout: 45000,
  maxRetries: 3,
  trace: {
    source: 'tool-engine',
    step: 'tool-execution-started',
    timestamp: 1753125480000
  }
}

# ✅ Tool execution sucesso
✅ TOOL EXECUTION SUCCESS {
  toolName: 'github-mcp.list_repositories',
  callId: 'call_abc123',
  attempt: 1,
  executionTime: 12500,
  hasResult: true,
  resultKeys: ['repositories', 'count'],
  trace: {
    source: 'tool-engine',
    step: 'tool-execution-success',
    timestamp: 1753125480000
  }
}

# ❌ Tool execution falhou
❌ TOOL EXECUTION FAILED {
  toolName: 'github-mcp.list_repositories',
  callId: 'call_abc123',
  attempt: 1,
  maxRetries: 3,
  error: 'Timeout waiting for tool.execute.response (15000ms)',
  errorStack: 'Error: Timeout...',
  executionTime: 15000,
  trace: {
    source: 'tool-engine',
    step: 'tool-execution-failed',
    timestamp: 1753125480000
  }
}
```

## 🔍 **COMO MONITORAR**

### **1. Filtrar por CorrelationId**
```bash
# Buscar todos os logs de uma execução específica
grep "corr_xyz789" logs.txt

# Verificar se há duplicação
grep "🚨 EVENT DUPLICATE DETECTED" logs.txt
```

### **2. Filtrar por EventId**
```bash
# Rastrear um evento específico
grep "call_abc123" logs.txt

# Verificar se o mesmo evento aparece múltiplas vezes
grep "call_abc123" logs.txt | wc -l
```

### **3. Filtrar por Step**
```bash
# Verificar se há timeouts
grep "⏰ MULTI-KERNEL REQUEST TIMEOUT" logs.txt

# Verificar sucessos
grep "✅ MULTI-KERNEL REQUEST SUCCESS" logs.txt

# Verificar falhas
grep "❌ TOOL EXECUTION FAILED" logs.txt
```

### **4. Monitorar Queue Size**
```bash
# Verificar se queue size está controlado
grep "queueSize" logs.txt | tail -20

# Verificar se há backpressure
grep "backpressureActive" logs.txt
```

## 📈 **MÉTRICAS PARA COLETAR**

### **1. Duplicação de Eventos**
```bash
# Contar eventos duplicados
grep "🚨 EVENT DUPLICATE DETECTED" logs.txt | wc -l

# Contar eventos processados
grep "✅ EVENT PROCESSED SUCCESSFULLY" logs.txt | wc -l
```

### **2. Timeouts**
```bash
# Contar timeouts por tool
grep "⏰ MULTI-KERNEL REQUEST TIMEOUT" logs.txt | grep "github-mcp" | wc -l

# Contar timeouts por correlationId
grep "⏰ MULTI-KERNEL REQUEST TIMEOUT" logs.txt | jq '.correlationId' | sort | uniq -c
```

### **3. Performance**
```bash
# Tempo médio de execução
grep "executionTime" logs.txt | jq '.executionTime' | awk '{sum+=$1} END {print sum/NR}'

# Queue size médio
grep "queueSize" logs.txt | jq '.queueSize' | awk '{sum+=$1} END {print sum/NR}'
```

## 🎯 **PADRÕES PARA IDENTIFICAR PROBLEMAS**

### **1. Eventos Duplicados**
```bash
# Se aparecer este log, há duplicação
🚨 EVENT DUPLICATE DETECTED

# Verificar se o mesmo eventId aparece múltiplas vezes
grep "eventId.*call_abc123" logs.txt
```

### **2. Timeouts Frequentes**
```bash
# Se aparecer este log frequentemente, há problema de timeout
⏰ MULTI-KERNEL REQUEST TIMEOUT

# Verificar se é sempre o mesmo tool
grep "⏰ MULTI-KERNEL REQUEST TIMEOUT" logs.txt | grep "github-mcp"
```

### **3. Queue Crescente**
```bash
# Se queueSize sempre crescer, há problema
grep "queueSize" logs.txt | tail -10

# Se backpressure sempre ativo, há problema
grep "backpressureActive.*true" logs.txt
```

## 🚀 **PRÓXIMOS PASSOS**

1. **Deploy das correções** com logs detalhados
2. **Monitorar por 1h** para coletar dados
3. **Analisar padrões** nos logs
4. **Ajustar timeouts** se necessário
5. **Implementar alertas** para problemas recorrentes

---

**Status**: ✅ **LOGS IMPLEMENTADOS**
**Próximo Teste**: Deploy e monitoramento
**Responsável**: Equipe de Runtime & Kernel 
