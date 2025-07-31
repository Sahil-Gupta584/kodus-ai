# Kodus Flow SDK - Core Types

Este diretório contém os tipos fundamentais que formam a base da arquitetura funcional do Kodus Flow SDK. Estes tipos são projetados para serem compostos e reutilizados em todo o SDK, fornecendo validação e segurança de tipos.

## Estrutura de Tipos

Os tipos são organizados em arquivos temáticos:

- **common-types.ts**: Tipos comuns usados em todo o SDK (IDs, metadados, filtros, etc.)
- **context-types.ts**: Tipos para contexto de execução
- **state-types.ts**: Tipos para gerenciamento de estado
- **event-types.ts**: Tipos para sistema de eventos
- **agent-types.ts**: Tipos para agentes e interações com IA
- **tool-types.ts**: Tipos para ferramentas e integrações externas
- **workflow-types.ts**: Tipos para definição e execução de workflows
- **memory-types.ts**: Tipos para armazenamento e recuperação de memória
- **telemetry-types.ts**: Tipos para telemetria e observabilidade

## Características Principais

### Validação com Zod

Todos os tipos são definidos usando [Zod](https://github.com/colinhacks/zod), o que permite:

- Validação em tempo de execução
- Inferência de tipos TypeScript
- Documentação integrada
- Composição de esquemas

Exemplo de uso:

```typescript
import { entityIdSchema } from '../core/types';

// Validação em tempo de execução
const result = entityIdSchema.safeParse('user-123');
if (result.success) {
  const validEntityId = result.data;
  // Use o ID validado...
} else {
  console.error('ID inválido:', result.error);
}
```

### Tipos Branded

IDs e outros valores críticos são implementados como "branded types" para evitar confusão entre diferentes tipos de strings:

```typescript
// Não permite atribuição acidental entre diferentes tipos de ID
const entityId: EntityId = 'user-123' as EntityId;
const sessionId: SessionId = 'session-456' as SessionId;

// Isso causaria um erro de tipo:
// const wrongAssignment: EntityId = sessionId;
```

### Composição de Tipos

Os tipos são projetados para serem compostos, permitindo a criação de tipos complexos a partir de blocos mais simples:

```typescript
import { 
  contextIdSchema, 
  entityIdSchema, 
  metadataSchema 
} from '../core/types';
import { z } from 'zod';

// Criar um novo tipo composto
const customContextSchema = z.object({
  contextId: contextIdSchema,
  entityId: entityIdSchema,
  customData: z.record(z.unknown()),
  metadata: metadataSchema.optional(),
});

type CustomContext = z.infer<typeof customContextSchema>;
```

## Uso dos Tipos Principais

### Context Types

O contexto de execução é central para o SDK, fornecendo acesso a estado, ferramentas e outros recursos:

```typescript
import { ExecutionContext, ContextOptions } from '../core/types';

// Criar um contexto
const options: ContextOptions = {
  entityId: 'user-123' as EntityId,
  metadata: { source: 'api' }
};

// Usar o contexto em uma função
function executeWithContext(context: ExecutionContext) {
  // Lógica que usa o contexto...
}
```

### State Types

O sistema de estado permite armazenar e recuperar dados durante a execução:

```typescript
import { StateUpdate, StateReference } from '../core/types';

// Atualizar estado
const update: StateUpdate = {
  key: 'user.preferences',
  value: { theme: 'dark' },
  scope: 'entity',
  entityId: 'user-123' as EntityId
};

// Referenciar estado
const reference: StateReference = {
  scope: 'entity',
  key: 'user.preferences',
  entityId: 'user-123' as EntityId
};
```

### Event Types

O sistema de eventos permite comunicação entre componentes:

```typescript
import { Event, SystemEventType } from '../core/types';

// Criar um evento
const event: Event = {
  id: 'evt-123' as EventId,
  type: SystemEventType.WORKFLOW_STARTED,
  payload: { workflowId: 'wf-123' },
  timestamp: Date.now(),
  entityId: 'user-123' as EntityId
};

// Filtrar eventos
const filter = {
  type: SystemEventType.WORKFLOW_STARTED,
  entityId: 'user-123' as EntityId
};
```

### Agent Types

Os tipos de agente definem como interagir com modelos de IA:

```typescript
import { AgentOptions, AgentMessage } from '../core/types';

// Configurar um agente
const options: AgentOptions = {
  name: 'CustomerSupportAgent',
  description: 'Ajuda clientes com problemas comuns',
  type: 'assistant',
  provider: 'openai'
};

// Criar uma mensagem
const message: AgentMessage = {
  role: 'user',
  content: 'Como posso resetar minha senha?'
};
```

### Tool Types

As ferramentas permitem que agentes interajam com sistemas externos:

```typescript
import { ToolOptions } from '../core/types';

// Definir uma ferramenta
const emailTool: ToolOptions = {
  name: 'sendEmail',
  description: 'Envia um email para o usuário',
  schema: {
    name: 'sendEmail',
    description: 'Envia um email',
    parameters: {
      to: {
        name: 'to',
        description: 'Endereço de email do destinatário',
        type: 'string',
        required: true
      },
      subject: {
        name: 'subject',
        description: 'Assunto do email',
        type: 'string',
        required: true
      },
      body: {
        name: 'body',
        description: 'Corpo do email',
        type: 'string',
        required: true
      }
    }
  },
  handler: async (args) => {
    // Implementação para enviar email
    return { success: true };
  }
};
```

### Workflow Types

Os workflows orquestram a execução de passos:

```typescript
import { WorkflowDefinition, StepDefinition } from '../core/types';

// Definir um workflow
const workflow: WorkflowDefinition = {
  name: 'ProcessarPedido',
  steps: {
    verificarEstoque: {
      name: 'Verificar Estoque',
      type: 'tool',
      config: { toolName: 'checkInventory' }
    },
    processarPagamento: {
      name: 'Processar Pagamento',
      type: 'tool',
      config: { toolName: 'processPayment' },
      next: 'enviarEmail'
    },
    enviarEmail: {
      name: 'Enviar Confirmação',
      type: 'tool',
      config: { toolName: 'sendEmail' }
    }
  },
  entryPoints: ['verificarEstoque']
};
```

### Memory Types

O sistema de memória permite armazenar e recuperar informações:

```typescript
import { MemoryItem, MemoryQuery } from '../core/types';

// Armazenar um item na memória
const item: MemoryItem = {
  id: 'mem-123' as MemoryId,
  key: 'conversation.history',
  value: [{ role: 'user', content: 'Olá' }],
  timestamp: Date.now(),
  entityId: 'user-123' as EntityId
};

// Consultar memória
const query: MemoryQuery = {
  keyPattern: 'conversation.*',
  entityId: 'user-123' as EntityId,
  limit: 10
};
```

### Telemetry Types

A telemetria fornece observabilidade para o SDK:

```typescript
import { SpanOptions, LogSchema } from '../core/types';

// Criar um span para rastreamento
const spanOptions: SpanOptions = {
  name: 'ProcessarPedido',
  kind: 'internal',
  attributes: {
    'order.id': 'order-123',
    'customer.id': 'user-456'
  }
};

// Registrar um log
const log = {
  level: 'info',
  message: 'Pedido processado com sucesso',
  timestamp: Date.now(),
  attributes: {
    orderId: 'order-123'
  }
};
```

## Melhores Práticas

1. **Use os esquemas Zod para validação**: Valide dados de entrada o mais cedo possível no fluxo de execução.
2. **Aproveite a inferência de tipos**: Use `z.infer<typeof meuSchema>` para obter tipos TypeScript a partir dos esquemas Zod.
3. **Componha tipos existentes**: Evite criar novos tipos do zero quando puder compor tipos existentes.
4. **Mantenha a imutabilidade**: Trate os objetos como imutáveis e use funções puras para transformações.
5. **Use branded types para IDs**: Evite confusão entre diferentes tipos de strings usando branded types.
