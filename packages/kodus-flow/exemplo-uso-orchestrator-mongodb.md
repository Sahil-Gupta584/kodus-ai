# 🎯 **Como Habilitar MongoDB no Orchestrator**

## 📋 **Visão Geral**

O usuário **SEMPRE** acessa através do **Orchestrator**. Para habilitar MongoDB, você precisa configurar o persistor no nível do kernel que o Orchestrator usa internamente.

## 🚀 **Configuração do Orchestrator com MongoDB**

### **1. Configuração Básica**

```typescript
import { createOrchestration } from './src/orchestration/index.js';
import { createLLMAdapter } from './src/adapters/llm/index.js';
import { geminiProvider } from './src/adapters/llm/providers/gemini-provider.js';

// Criar LLM adapter (OBRIGATÓRIO)
const llmAdapter = createLLMAdapter(geminiProvider);

// Criar Orchestrator com configuração de persistor
const orchestrator = createOrchestration({
    llmAdapter,
    tenantId: 'meu-tenant',
    
    // Configuração do persistor (opcional)
    persistorConfig: {
        type: 'mongodb',
        connectionString: 'mongodb://localhost:27017/kodus',
        database: 'kodus',
        collection: 'snapshots',
        maxPoolSize: 10,
        ttl: 86400, // 1 dia
    },
});
```

### **2. Usando Variáveis de Ambiente**

```typescript
import { createOrchestration } from './src/orchestration/index.js';
import { createLLMAdapter } from './src/adapters/llm/index.js';
import { geminiProvider } from './src/adapters/llm/providers/gemini-provider.js';

const orchestrator = createOrchestration({
    llmAdapter: createLLMAdapter(geminiProvider),
    tenantId: process.env.TENANT_ID || 'default-tenant',
    
    // MongoDB via variáveis de ambiente
    persistorConfig: {
        type: 'mongodb',
        connectionString: process.env.MONGODB_URI || 'mongodb://localhost:27017/kodus',
        database: process.env.MONGODB_DATABASE || 'kodus',
        collection: process.env.MONGODB_COLLECTION || 'snapshots',
        maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE || '10'),
        ttl: parseInt(process.env.MONGODB_TTL || '86400'),
    },
});
```

### **3. Configuração Dinâmica por Ambiente**

```typescript
const getPersistorConfig = () => {
    const env = process.env.NODE_ENV || 'development';
    
    if (env === 'production') {
        return {
            type: 'mongodb' as const,
            connectionString: process.env.MONGODB_URI!,
            database: process.env.MONGODB_DATABASE || 'kodus',
            collection: process.env.MONGODB_COLLECTION || 'snapshots',
            maxPoolSize: 20,
            ttl: 604800, // 7 dias
        };
    }
    
    return {
        type: 'memory' as const,
        maxSnapshots: 100,
    };
};

const orchestrator = createOrchestration({
    llmAdapter: createLLMAdapter(geminiProvider),
    tenantId: 'meu-tenant',
    persistorConfig: getPersistorConfig(),
});
```

## 🔧 **Uso do Orchestrator com MongoDB**

### **Criar Agente com Persistência**

```typescript
// Criar agente (automaticamente usa MongoDB se configurado)
const agent = await orchestrator.createAgent({
    name: 'meu-agente',
    identity: {
        role: 'Assistant',
        goal: 'Help users with tasks',
        description: 'A helpful AI assistant',
    },
    executionMode: 'workflow', // Habilita persistência automática
});

// Chamar agente (snapshots são salvos automaticamente)
const result = await orchestrator.callAgent('meu-agente', {
    message: 'Hello, how can you help me?',
});
```

### **Verificar Status**

```typescript
// Verificar se MongoDB está funcionando
const stats = orchestrator.getStats();
console.log('Orchestrator stats:', stats);

// Listar agentes
const agents = orchestrator.listAgents();
console.log('Agentes registrados:', agents);

// Verificar status de um agente
const agentStatus = orchestrator.getAgentStatus('meu-agente');
console.log('Status do agente:', agentStatus);
```

## 🛠️ **Configuração de Ambiente**

### **Variáveis de Ambiente**

```bash
# .env
NODE_ENV=production
TENANT_ID=meu-tenant

# MongoDB
MONGODB_URI=mongodb://localhost:27017/kodus
MONGODB_DATABASE=kodus
MONGODB_COLLECTION=snapshots
MONGODB_POOL_SIZE=10
MONGODB_TTL=86400

# LLM
GEMINI_API_KEY=sua-chave-aqui
```

### **Docker Compose**

```yaml
# docker-compose.yml
version: '3.8'
services:
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_DATABASE: kodus
    volumes:
      - mongodb_data:/data/db

  app:
    build: .
    environment:
      MONGODB_URI: mongodb://mongodb:27017/kodus
      NODE_ENV: production
    depends_on:
      - mongodb

volumes:
  mongodb_data:
```

## 🔍 **Monitoramento**

### **Logs Automáticos**

```typescript
// Os logs são automáticos
// 2024-01-15 10:30:00 [info] MongoDBStorageAdapter initialized
// 2024-01-15 10:30:05 [debug] Item stored in MongoDB
// 2024-01-15 10:30:10 [debug] Item retrieved from MongoDB
```

### **Health Check**

```typescript
// Verificar se MongoDB está saudável
const isHealthy = await orchestrator.isHealthy?.();
console.log('MongoDB saudável:', isHealthy);
```

## 🎯 **Resumo**

1. **Configurar** persistor no Orchestrator
2. **Usar** variáveis de ambiente para configuração
3. **Criar** agentes normalmente (persistência automática)
4. **Monitorar** logs e health checks

O MongoDB é habilitado **transparentemente** através do Orchestrator - o usuário não precisa se preocupar com detalhes de implementação! 🚀 
