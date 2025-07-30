# Kodus Flow - Casos Avançados

> ⚠️ **ATENÇÃO**: Estes são casos muito específicos. Para 99% dos usos, prefira a [API Principal](./GUIA_OFICIAL_SIMPLIFICADO.md).

## 🔧 **Quando Usar APIs Avançadas**

### **1. Tool Isolada (sem agente)**

```typescript
import { ToolEngine, defineTool } from '@kodus/flow';

// Use quando precisar executar UMA tool específica sem lógica de agente
const toolEngine = new ToolEngine();
toolEngine.registerTool(myTool);

const result = await toolEngine.executeCall('tool-name', params);
```

**Caso de uso**: Scripts de automação, testes unitários de tools, integrações simples.

### **2. Workflow Muito Customizado**

```typescript
import { defineWorkflow, WorkflowEngine } from '@kodus/flow';

// Use para workflows com lógica de steps muito específica
const complexWorkflow = defineWorkflow('data-processing')
  .step('validate', async (input) => {
    // Validação customizada
    return validatedData;
  })
  .step('transform', async (data) => {
    // Transformação específica
    return transformedData;
  })
  .step('notify', async (data) => {
    // Notificação específica
    return notification;
  })
  .build();

const result = await complexWorkflow.execute(input);
```

**Caso de uso**: Pipelines de dados, processamento ETL, workflows de CI/CD.

### **3. Debugging/Testing Individual**

```typescript
import { AgentEngine, ToolEngine } from '@kodus/flow';

// Use para testar agentes isoladamente durante desenvolvimento
const toolEngine = new ToolEngine();
const agentEngine = new AgentEngine(agentDefinition, toolEngine);

// Testar comportamento específico
const thought = await agentEngine.think(testInput);
console.log('Agent thought:', thought);
```

**Caso de uso**: Testes unitários, debugging de lógica de agentes, prototipagem.

### **4. Runtime de Baixo Nível**

```typescript
import { createWorkflow, workflowEvent, withRetry } from '@kodus/flow';

// Use para controle muito específico de eventos
const startEvent = workflowEvent<string>('start');
const processEvent = workflowEvent<any>('process');

const workflow = createWorkflow({ name: 'low-level', debug: true });

workflow.handle([startEvent], withRetry(async (event) => {
  // Lógica de baixo nível com retry customizado
}, { maxRetries: 5 }));
```

**Caso de uso**: Sistemas de eventos complexos, integrações com message queues.

## 🎯 **Migração de API Avançada para Principal**

Se você está usando APIs avançadas e quer migrar para a principal:

### **De Tool Engine para Orchestration**

```typescript
// ❌ API Avançada
const toolEngine = new ToolEngine();
toolEngine.registerTool(myTool);
const result = await toolEngine.executeCall('tool-name', params);

// ✅ API Principal 
const orchestration = createOrchestration({
  debug: true
});

orchestration.createTool(myTool);
const result = await orchestration.run(input);
```

### **De Agent Engine para Orchestration**

```typescript
// ❌ API Avançada
const toolEngine = new ToolEngine();
const agentEngine = new AgentEngine(myAgent, toolEngine);
const result = await agentEngine.process(input);

// ✅ API Principal
const orchestration = createOrchestration({
  debug: true
});

orchestration.createAgent(myAgent);
orchestration.createTool(myTool);
const result = await orchestration.callAgent('MyAgent', input);
```

### **De Workflow para Orchestration**

```typescript
// ❌ API Avançada - workflow muito simples
const workflow = defineWorkflow('simple')
  .step('process', async (input) => processData(input))
  .build();

// ✅ API Principal - usar agente
const agent = defineAgent({
  name: 'DataProcessor',
  think: async (input) => ({
    reasoning: 'Processing data',
    action: { type: 'final_answer', content: processData(input) }
  })
});
```

## 🚫 **Não Use APIs Avançadas Para:**

- ❌ Aplicações normais multi-usuário
- ❌ Sistemas de produção padrão  
- ❌ Quando Orchestration API resolve
- ❌ Para "ter mais controle" sem motivo específico
- ❌ Porque "parece mais simples" (não é a longo prazo)

## ✅ **Use APIs Avançadas Apenas Para:**

- ✅ Testes unitários específicos
- ✅ Scripts de automação simples
- ✅ Integrações muito específicas
- ✅ Debugging durante desenvolvimento
- ✅ Casos onde Orchestration não atende

---

## 📚 **Documentação das APIs Avançadas**

### **ToolEngine**

```typescript
class ToolEngine {
  registerTool(tool: ToolDefinition): void
  executeCall(toolName: string, input: unknown): Promise<unknown>
  getStats(): EngineStats
}
```

### **AgentEngine** 

```typescript
class AgentEngine {
  constructor(agent: AgentDefinition, toolEngine: ToolEngine)
  process(input: unknown): Promise<{ output: unknown, reasoning: string }>
  think(input: unknown): Promise<AgentThought>
}
```

### **WorkflowEngine**

```typescript
const workflow = defineWorkflow(name)
  .step(name, handler)
  .build();

workflow.execute(input): Promise<unknown>
```

---

> 💡 **Lembre-se**: Se você não tem certeza se precisa de APIs avançadas, provavelmente não precisa. Use a [API Principal](./GUIA_OFICIAL_SIMPLIFICADO.md)!