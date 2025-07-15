# 🎯 **Como Usar o Persistor com MongoDB**

## 📋 **Visão Geral**

O **Persistor** é responsável por persistir **snapshots** de execução do kernel. Ele salva o estado dos agentes para permitir recuperação e continuidade de execução.

## 🚀 **Uso Básico**

### **1. Instalar Dependências**

```bash
npm install mongodb
# ou
yarn add mongodb
```

### **2. Configurar MongoDB**

```typescript
import { createPersistor } from './src/persistor/factory.js';

// Criar persistor com MongoDB
const persistor = createPersistor('mongodb', {
    connectionString: 'mongodb://localhost:27017/kodus',
    database: 'kodus',
    collection: 'snapshots',
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    ttl: 86400, // 1 dia
});
```

### **3. Usar no Kernel**

```typescript
import { ExecutionKernel } from './src/kernel/kernel.js';
import { createPersistor } from './src/persistor/factory.js';

const kernel = new ExecutionKernel({
    tenantId: 'meu-tenant',
    workflow: meuWorkflow,
    persistor: createPersistor('mongodb', {
        connectionString: process.env.MONGODB_URI || 'mongodb://localhost:27017/kodus',
        database: 'kodus',
        collection: 'snapshots',
    }),
});
```

## 🔧 **Configurações Disponíveis**

### **MongoDB Configuration**

```typescript
interface MongoDBConfig {
    connectionString: string;        // URI do MongoDB
    database: string;               // Nome do banco
    collection: string;             // Nome da collection
    maxPoolSize: number;            // Tamanho do pool de conexões
    serverSelectionTimeoutMS: number; // Timeout de seleção do servidor
    connectTimeoutMS: number;       // Timeout de conexão
    socketTimeoutMS: number;        // Timeout de socket
    ttl: number;                   // TTL em segundos
}
```

### **Exemplo Completo**

```typescript
import { createPersistor } from './src/persistor/factory.js';
import { ExecutionKernel } from './src/kernel/kernel.js';

// Configuração do MongoDB
const mongodbConfig = {
    connectionString: process.env.MONGODB_URI || 'mongodb://localhost:27017/kodus',
    database: 'kodus',
    collection: 'snapshots',
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    ttl: 86400, // 1 dia
};

// Criar persistor
const persistor = createPersistor('mongodb', mongodbConfig);

// Usar no kernel
const kernel = new ExecutionKernel({
    tenantId: 'meu-tenant',
    workflow: meuWorkflow,
    persistor,
});

// Inicializar kernel
await kernel.initialize();
```

## 📊 **Operações do Persistor**

### **Salvar Snapshot**

```typescript
// O kernel salva automaticamente snapshots
await kernel.checkpoint(); // Salva snapshot atual

// Ou manualmente
const snapshot = await kernel.createSnapshot();
await persistor.append(snapshot);
```

### **Verificar Existência**

```typescript
const exists = await persistor.has(snapshot.hash);
console.log('Snapshot existe:', exists);
```

### **Carregar Snapshots**

```typescript
// Carregar todos os snapshots de um contexto
for await (const snap of persistor.load('execution-context-id')) {
    console.log('Snapshot:', snap);
}

// Carregar snapshot específico
const snap = await persistor.getByHash?.(hash);
if (snap) {
    console.log('Snapshot encontrado:', snap);
}
```

### **Listar Snapshots**

```typescript
// Listar hashes de snapshots
const hashes = await persistor.listHashes?.('execution-context-id');
console.log('Hashes:', hashes);
```

### **Estatísticas**

```typescript
const stats = await persistor.getStats?.();
console.log('Estatísticas:', stats);
// {
//   itemCount: 150,
//   totalSize: 1024000,
//   averageItemSize: 6826,
//   adapterType: 'mongodb'
// }
```

## 🔄 **Recuperação de Estado**

### **Restaurar de Snapshot**

```typescript
// Carregar último snapshot
const snapshots = [];
for await (const snap of persistor.load('execution-context-id')) {
    snapshots.push(snap);
}

if (snapshots.length > 0) {
    const lastSnapshot = snapshots[snapshots.length - 1];
    await kernel.restoreFromSnapshot(lastSnapshot);
}
```

### **Checkpoint Automático**

```typescript
// O kernel faz checkpoint automático
kernel.on('checkpoint', (snapshot) => {
    console.log('Checkpoint criado:', snapshot.hash);
});

kernel.on('restore', (snapshot) => {
    console.log('Estado restaurado de:', snapshot.hash);
});
```

## 🛠️ **Configuração de Ambiente**

### **Variáveis de Ambiente**

```bash
# .env
MONGODB_URI=mongodb://localhost:27017/kodus
MONGODB_DATABASE=kodus
MONGODB_COLLECTION=snapshots
```

### **Configuração Dinâmica**

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

const persistor = createPersistor(
    getPersistorConfig().type,
    getPersistorConfig()
);
```

## 🔍 **Monitoramento**

### **Health Check**

```typescript
const isHealthy = await persistor.isHealthy?.();
console.log('Persistor saudável:', isHealthy);
```

### **Logs**

```typescript
// Os logs são automáticos
// 2024-01-15 10:30:00 [info] MongoDBStorageAdapter initialized
// 2024-01-15 10:30:05 [debug] Item stored in MongoDB
// 2024-01-15 10:30:10 [debug] Item retrieved from MongoDB
```

## 🚨 **Tratamento de Erros**

### **Conexão**

```typescript
try {
    const persistor = createPersistor('mongodb', config);
    await persistor.initialize();
} catch (error) {
    console.error('Erro ao conectar MongoDB:', error);
    // Fallback para memory
    const fallbackPersistor = createPersistor('memory');
}
```

### **Operações**

```typescript
try {
    await persistor.append(snapshot);
} catch (error) {
    console.error('Erro ao salvar snapshot:', error);
    // Implementar retry logic
}
```

## 📈 **Performance**

### **Índices Otimizados**

O MongoDB adapter cria automaticamente:

- `{ id: 1 }` - Índice único para busca por ID
- `{ timestamp: 1 }` - Índice para ordenação por tempo
- `{ 'metadata.xcId': 1 }` - Índice para busca por contexto
- `{ createdAt: 1 }` - Índice TTL para expiração

### **Configurações de Performance**

```typescript
const highPerformanceConfig = {
    type: 'mongodb' as const,
    connectionString: 'mongodb://localhost:27017/kodus',
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 1000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 30000,
    enableCompression: true,
};
```

## 🎯 **Resumo**

1. **Instalar**: `npm install mongodb`
2. **Configurar**: Connection string e opções
3. **Criar**: `createPersistor('mongodb', config)`
4. **Usar**: No kernel ou diretamente
5. **Monitorar**: Health checks e logs
6. **Recuperar**: Snapshots automáticos

O persistor com MongoDB oferece **persistência robusta** para snapshots de execução, permitindo **recuperação de estado** e **continuidade de execução** em ambientes de produção. 
