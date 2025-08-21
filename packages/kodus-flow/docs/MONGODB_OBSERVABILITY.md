# 🗄️ MongoDB Observabilidade - Kodus Flow

## 📋 **Visão Geral**

O **MongoDB Exporter** permite salvar toda a observabilidade do Kodus Flow (logs, telemetry, métricas e erros) no MongoDB para análise posterior, debugging e monitoramento.

## 🚀 **Configuração Rápida**

### **1. Configuração Simplificada (Recomendado)**

```typescript
import { createOrchestration } from '@kodus/flow';

const orchestration = createOrchestration({
    tenantId: 'kodus-agent-conversation',
    enableKernelIntegration: true,
    enableObservability: true,
    observability: {
        logging: { enabled: true, level: 'info' },
        telemetry: {
            enabled: true,
            serviceName: 'kodus-flow',
            sampling: { rate: 1, strategy: 'probabilistic' },
            privacy: { includeSensitiveData: false },
            spanTimeouts: {
                enabled: true,
                maxDurationMs: 5 * 60 * 1000,
            },
        },
        correlation: {
            enabled: true,
            generateIds: true,
            propagateContext: true,
        },
        // MongoDB Export Configuration
        mongodb: {
            type: 'mongodb',
            connectionString: 'mongodb://localhost:27017/kodus',
            database: 'kodus',
            collections: {
                logs: 'observability_logs',
                telemetry: 'observability_telemetry',
                metrics: 'observability_metrics',
                errors: 'observability_errors',
            },
            batchSize: 100,
            flushIntervalMs: 5000,
            ttlDays: 30,
            enableObservability: true,
        },
    },
    storage: {
        memory: {
            type: 'mongodb',
            connectionString: 'mongodb://localhost:27017/kodus',
            database: 'kodus',
            collection: 'memories',
        },
        session: {
            type: 'mongodb',
            connectionString: 'mongodb://localhost:27017/kodus',
            database: 'kodus',
            collection: 'sessions',
        },
        snapshot: {
            type: 'mongodb',
            connectionString: 'mongodb://localhost:27017/kodus',
            database: 'kodus',
            collection: 'snapshots',
        },
    },
});
```

## ⚠️ **Configuração CORRETA vs ERRADA**

### ✅ **CORRETO: MongoDB no observability**
```typescript
observability: {
    mongodb: {
        type: 'mongodb',
        connectionString: 'mongodb://localhost:27017/kodus',
        database: 'kodus',
        // ... outras configs
    },
}
```

### ❌ **ERRADO: MongoDB no storage**
```typescript
storage: {
    observability: {  // ❌ Isso vai dar erro de TypeScript
        type: 'mongodb',
        connectionString: 'mongodb://localhost:27017/kodus',
        // ...
    },
}
```

### 📋 **Estrutura Correta**
```typescript
const orchestration = createOrchestration({
    observability: {
        // ✅ MongoDB aqui
        mongodb: { /* ... */ },
    },
    storage: {
        // ✅ Outros storages aqui
        memory: { /* ... */ },
        session: { /* ... */ },
        snapshot: { /* ... */ },
        // ❌ NÃO observability aqui
    },
});
```
```

### **2. Configuração Avançada**

```typescript
import { getObservability } from '@kodus/flow/observability';

const obs = getObservability({
    environment: 'production',
    logging: { level: 'info' },
    telemetry: { enabled: true },
    monitoring: { enabled: true },
    
    // MongoDB Export Configuration
    mongodb: {
        connectionString: 'mongodb://user:pass@cluster.mongodb.net/kodus',
        database: 'kodus_production',
        collections: {
            logs: 'prod_logs',
            telemetry: 'prod_telemetry',
            metrics: 'prod_metrics',
            errors: 'prod_errors',
        },
        batchSize: 200,
        flushIntervalMs: 2000, // 2 segundos
        ttlDays: 90, // 90 dias de retenção
        enableObservability: true,
    },
});
```

## 📊 **Collections do MongoDB**

### **1. observability_logs**
```javascript
{
    _id: ObjectId,
    timestamp: Date,
    level: "debug" | "info" | "warn" | "error",
    message: String,
    component: String,
    correlationId: String,
    tenantId: String,
    executionId: String,
    metadata: Object,
    error: {
        name: String,
        message: String,
        stack: String
    },
    createdAt: Date
}
```

### **2. observability_telemetry**
```javascript
{
    _id: ObjectId,
    timestamp: Date,
    name: String,
    duration: Number,
    correlationId: String,
    tenantId: String,
    executionId: String,
    agentName: String,
    toolName: String,
    phase: "think" | "act" | "observe",
    attributes: Object,
    status: "ok" | "error",
    error: {
        name: String,
        message: String,
        stack: String
    },
    createdAt: Date
}
```

### **3. observability_metrics**
```javascript
{
    _id: ObjectId,
    timestamp: Date,
    correlationId: String,
    tenantId: String,
    executionId: String,
    metrics: {
        kernel: Object,
        runtime: Object,
        engine: Object,
        health: Object
    },
    createdAt: Date
}
```

### **4. observability_errors**
```javascript
{
    _id: ObjectId,
    timestamp: Date,
    correlationId: String,
    tenantId: String,
    executionId: String,
    errorName: String,
    errorMessage: String,
    errorStack: String,
    context: Object,
    createdAt: Date
}
```

## 🔍 **Queries Úteis**

### **1. Logs por Correlation ID**
```javascript
db.observability_logs.find({
    correlationId: "corr_123"
}).sort({timestamp: -1})
```

### **2. Telemetry de um Agente**
```javascript
db.observability_telemetry.find({
    agentName: "my-agent"
}).sort({timestamp: -1})
```

### **3. Erros por Período**
```javascript
db.observability_errors.find({
    timestamp: {
        $gte: new Date("2024-01-01"),
        $lte: new Date("2024-01-31")
    }
}).sort({timestamp: -1})
```

### **4. Performance de Tools**
```javascript
db.observability_telemetry.aggregate([
    { $match: { toolName: { $exists: true } } },
    { $group: {
        _id: "$toolName",
        avgDuration: { $avg: "$duration" },
        maxDuration: { $max: "$duration" },
        minDuration: { $min: "$duration" },
        count: { $sum: 1 }
    }},
    { $sort: { avgDuration: -1 } }
])
```

### **5. Fluxo Completo de Execução**
```javascript
db.observability_telemetry.find({
    correlationId: "corr_123"
}).sort({timestamp: 1})
```

## ⚙️ **Configurações**

### **MongoDBExporterConfig**

```typescript
interface MongoDBExporterConfig {
    // MongoDB connection
    connectionString: string;
    database: string;
    
    // Collections
    collections: {
        logs: string;
        telemetry: string;
        metrics: string;
        errors: string;
    };
    
    // Performance
    batchSize: number;        // Default: 100
    flushIntervalMs: number;  // Default: 5000
    maxRetries: number;       // Default: 3
    
    // Data retention
    ttlDays: number;          // Default: 30
    
    // Observability
    enableObservability: boolean; // Default: true
}
```

## 🚀 **Exemplo Completo**

```typescript
import { createOrchestration } from '@kodus/flow';

async function exampleWithMongoDB() {
    // 1. Criar orchestration com MongoDB
    const orchestration = createOrchestration({
        enableKernelIntegration: true,
        enableObservability: true,
        observability: {
            mongodb: {
                connectionString: 'mongodb://localhost:27017/kodus',
                database: 'kodus',
                collections: {
                    logs: 'observability_logs',
                    telemetry: 'observability_telemetry',
                    metrics: 'observability_metrics',
                    errors: 'observability_errors',
                },
                batchSize: 50,
                flushIntervalMs: 3000,
                ttlDays: 30,
                enableObservability: true,
            },
        },
    });

    // 2. Criar agente
    await orchestration.createAgent({
        name: 'mongodb-test-agent',
        think: async (input) => ({
            reasoning: 'Processando input',
            action: { 
                type: 'final_answer', 
                content: `Processado: ${input}` 
            }
        })
    });

    // 3. Executar agente
    const result = await orchestration.callAgent('mongodb-test-agent', 'Hello MongoDB!');
    
    // 4. Aguardar flush
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Dados salvos no MongoDB!');
    console.log('Result:', result);
}
```

## 🔧 **Índices Automáticos**

O MongoDB Exporter cria automaticamente os seguintes índices:

### **Logs**
- `timestamp: 1`
- `correlationId: 1`
- `tenantId: 1`
- `level: 1`
- `component: 1`
- `createdAt: 1` (TTL)

### **Telemetry**
- `timestamp: 1`
- `correlationId: 1`
- `tenantId: 1`
- `name: 1`
- `agentName: 1`
- `toolName: 1`
- `phase: 1`
- `createdAt: 1` (TTL)

### **Metrics**
- `timestamp: 1`
- `correlationId: 1`
- `tenantId: 1`
- `createdAt: 1` (TTL)

### **Errors**
- `timestamp: 1`
- `correlationId: 1`
- `tenantId: 1`
- `errorName: 1`
- `createdAt: 1` (TTL)

## 📈 **Performance**

### **Batch Processing**
- **Batch Size**: Configurável (default: 100)
- **Flush Interval**: Configurável (default: 5s)
- **Retry Logic**: Automático em caso de falha

### **TTL (Time To Live)**
- **Default**: 30 dias
- **Configurável**: Via `ttlDays`
- **Automático**: Limpeza automática de dados antigos

### **Connection Pool**
- **Max Pool Size**: 10 conexões
- **Timeout**: 10s para conexão
- **Socket Timeout**: 45s

## 🛠️ **Troubleshooting**

### **1. Conexão Falhou**
```typescript
// Verificar se MongoDB está rodando
// Verificar connection string
mongodb: {
    connectionString: 'mongodb://localhost:27017/kodus',
    // ...
}
```

### **2. Dados Não Aparecem**
```typescript
// Aguardar flush automático ou forçar
await obs.flush();

// Verificar se collections existem
db.getCollectionNames()
```

### **3. Performance Lenta**
```typescript
// Aumentar batch size
mongodb: {
    batchSize: 200,
    flushIntervalMs: 1000,
    // ...
}
```

## 🎯 **Casos de Uso**

### **1. Debugging de Produção**
```javascript
// Encontrar logs de uma execução específica
db.observability_logs.find({
    correlationId: "corr_123"
}).sort({timestamp: 1})
```

### **2. Análise de Performance**
```javascript
// Métricas de performance por agente
db.observability_telemetry.aggregate([
    { $match: { agentName: "my-agent" } },
    { $group: {
        _id: "$phase",
        avgDuration: { $avg: "$duration" },
        count: { $sum: 1 }
    }}
])
```

### **3. Monitoramento de Erros**
```javascript
// Erros por período
db.observability_errors.find({
    timestamp: {
        $gte: new Date(Date.now() - 24*60*60*1000) // Últimas 24h
    }
}).sort({timestamp: -1})
```

### **4. Análise de Fluxo**
```javascript
// Fluxo completo de uma execução
db.observability_telemetry.find({
    correlationId: "corr_123"
}).sort({timestamp: 1})
```

## 🎉 **Conclusão**

O MongoDB Exporter oferece:

- ✅ **Persistência completa** de observabilidade
- ✅ **Performance otimizada** com batch processing
- ✅ **Índices automáticos** para queries rápidas
- ✅ **TTL automático** para limpeza de dados
- ✅ **Retry logic** para resiliência
- ✅ **Configuração flexível** para diferentes ambientes

**Agora toda a execução do fluxo de agente está sendo salva no MongoDB para análise posterior!** 🚀

## 🎯 **Vantagens da Configuração Simplificada**

### **1. Configuração Limpa**
- **Estrutura simples** e intuitiva
- **Configuração direta** no observability
- **Fácil de entender** e manter

### **2. Compatibilidade**
- **Backward compatibility** mantida
- **Padrão consistente** com o resto do framework
- **Fácil migração** de projetos existentes

### **3. Manutenibilidade**
- **Configuração centralizada** no observability
- **Menos complexidade** desnecessária
- **Mais fácil** de gerenciar em ambientes de produção

### **4. Performance**
- **Configuração otimizada** para observabilidade
- **Menos overhead** de configuração
- **Melhor utilização** de recursos
