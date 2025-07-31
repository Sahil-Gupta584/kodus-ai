# ID Generation Best Practices - Kodus Flow SDK

## Overview

Este documento define as melhores práticas para geração de IDs únicos no Kodus Flow SDK, garantindo segurança, performance e consistência em ambientes multi-tenant.

## Princípios Fundamentais

### 1. **Unicidade Global**
- Todos os IDs devem ser globalmente únicos
- Usar entropia criptográfica adequada (>= 128 bits)
- Incluir timestamp para ordenação temporal

### 2. **Segurança**
- Usar `crypto.randomBytes()` no Node.js
- Usar `crypto.getRandomValues()` no browser
- **NUNCA** usar `Math.random()` para IDs de produção

### 3. **Performance**
- IDs devem ser URL-safe (base62)
- Comprimento otimizado para casos de uso
- Suporte a geração em lote para alta performance

### 4. **Rastreabilidade**
- IDs incluem prefixos semânticos
- Timestamp extraível para debugging
- Formato consistente em todo o sistema

## Uso do IdGenerator

### Centralizado em `/src/utils/id-generator.ts`

```typescript
import { IdGenerator } from '../utils/id-generator.js';

// ✅ CORRETO - Para execuções de workflow
const executionId = IdGenerator.executionId();
// Formato: exec_[timestamp]_[random]_[counter]

// ✅ CORRETO - Para correlação distribuída  
const correlationId = IdGenerator.correlationId();
// Formato: corr_[random]_[timestamp]

// ✅ CORRETO - Para chamadas de tools/funções
const callId = IdGenerator.callId();
// Formato: call_[random]_[perfnow]

// ✅ CORRETO - Para sessões de usuário
const sessionId = IdGenerator.sessionId();
// Formato: sess_[random]_[timestamp]

// ✅ CORRETO - Para tenants
const tenantId = IdGenerator.tenantId();
// Formato: tenant_[random]
```

## Tipos de ID por Contexto

### 1. **Execution Context**
```typescript
// Identificação de execução de workflow
executionId: string; // formato: tenant:execution_id
tenantId: string;    // formato: tenant_[random] ou customizado
```

### 2. **Observability Context**
```typescript
// Telemetria e debugging
correlationId: string; // IdGenerator.correlationId()
traceId: string;       // correlationId.replace('corr_', 'trace_')
spanId: string;        // callId.replace('call_', 'span_')
```

### 3. **Function Call Context**
```typescript
// Chamadas de agentes, tools, LLM
invocationId: string;  // IdGenerator.callId()
functionCallId: string; // IdGenerator.callId()
requestId: string;     // IdGenerator.callId()
```

### 4. **Session Context**
```typescript
// Sessões de usuário
sessionId: string;     // IdGenerator.sessionId()
```

## Validação de IDs

```typescript
// Validar formato de ID
const isValid = IdGenerator.validateId(id, 'execution');

// Extrair timestamp para debugging
const timestamp = IdGenerator.extractTimestamp(id);
```

## ❌ Anti-Patterns

```typescript
// ❌ NUNCA FAZER - Math.random() não é seguro
const badId = Math.random().toString(36);

// ❌ NUNCA FAZER - Date.now() sozinho não é único
const badId = Date.now().toString();

// ❌ NUNCA FAZER - IDs sem prefixo são confusos
const badId = generateRandomString();

// ❌ NUNCA FAZER - UUIDs v4 são desnecessariamente longos
const badId = crypto.randomUUID();
```

## ✅ Melhores Práticas

```typescript
// ✅ Sempre usar IdGenerator centralizado
import { IdGenerator } from '../utils/id-generator.js';

// ✅ Prefixos semânticos claros
const traceId = IdGenerator.correlationId().replace('corr_', 'trace_');

// ✅ Validação quando necessário
if (!IdGenerator.validateId(tenantId, 'tenant')) {
    throw new Error('Invalid tenant ID format');
}

// ✅ Geração em lote para performance
const batchIds = HighThroughputIdGenerator.generateBatch(1000);

// ✅ IDs sequenciais quando ordem importa
const sequentialId = await SequentialIdGenerator.generateSequential('workflow');
```

## Cenários Específicos

### Multi-Tenant Isolation
```typescript
// Sempre incluir tenantId no executionId
const executionId = `${tenantId}:${IdGenerator.executionId()}`;
```

### Distributed Tracing
```typescript
// Hierarquia de correlação
const parentCorrelationId = IdGenerator.correlationId();
const childCorrelationId = `${parentCorrelationId}.${IdGenerator.callId().split('_')[1]}`;
```

### High-Throughput Scenarios
```typescript
// Para milhões de IDs por segundo
const fastId = HighThroughputIdGenerator.generateFast();
```

## Performance Considerations

### 1. **Entropy Pool Management**
- IdGenerator usa buffer pool interno
- Refresh automático quando necessário
- Thread-safe para concorrência

### 2. **Memory Efficiency**
- IDs otimizados para comprimento
- Base62 encoding para eficiência
- Reuso de buffers internos

### 3. **Network Efficiency**
- IDs URL-safe por padrão
- Compressão amigável
- Ordenação lexicográfica

## Security Considerations

### 1. **Cryptographic Strength**
- Minimum 128 bits de entropia
- CSPRNG (crypto.randomBytes)
- Resistente a ataques de timing

### 2. **Information Leakage**
- Timestamps não revelam dados sensíveis
- IDs não são sequenciais previsíveis
- Prefixos não expõem arquitetura interna

## Monitoring & Debugging

### 1. **ID Validation**
```typescript
// Validação em runtime
const metrics = {
    validIds: 0,
    invalidIds: 0,
    formatErrors: []
};
```

### 2. **Performance Metrics**
```typescript
// Monitorar geração de IDs
telemetry.recordMetric('histogram', 'id.generation.duration', duration);
```

### 3. **Debugging Tools**
```typescript
// Extrair informações de debugging
const debugInfo = {
    timestamp: IdGenerator.extractTimestamp(id),
    type: detectIdType(id),
    isValid: IdGenerator.validateId(id, type)
};
```

## Migration Guide

### Existing Code Using Math.random()

```typescript
// ❌ ANTES
const id = Math.random().toString(36).slice(2);

// ✅ DEPOIS  
const id = IdGenerator.callId();
```

### Existing Code Using Date.now()

```typescript
// ❌ ANTES
const id = `trace_${Date.now()}_${Math.random().toString(36)}`;

// ✅ DEPOIS
const id = IdGenerator.correlationId().replace('corr_', 'trace_');
```

## Testing

### Unit Tests
```typescript
describe('ID Generation', () => {
    it('should generate unique execution IDs', () => {
        const ids = Array.from({ length: 10000 }, () => IdGenerator.executionId());
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
    });
    
    it('should validate ID formats', () => {
        const id = IdGenerator.executionId();
        expect(IdGenerator.validateId(id, 'execution')).toBe(true);
    });
});
```

### Performance Tests
```typescript
describe('ID Performance', () => {
    it('should generate 100k IDs under 100ms', async () => {
        const start = performance.now();
        for (let i = 0; i < 100000; i++) {
            IdGenerator.callId();
        }
        const duration = performance.now() - start;
        expect(duration).toBeLessThan(100);
    });
});
```

---

**Última atualização:** 2025-01-20  
**Responsável:** Sistema de Arquitetura Kodus Flow  
**Versão:** 1.0
