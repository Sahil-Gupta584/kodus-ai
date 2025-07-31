# Kodus Flow: Arquitetura de Planning e Routing

## 🎯 Nossa Proposta de Valor

O Kodus Flow se diferencia dos outros frameworks pela **arquitetura pluggável de Planning e Routing**, oferecendo controle granular sobre como agents pensam e executam actions.

### Comparação com a Indústria

| Framework | Planning | Routing | Flexibilidade |
|-----------|----------|---------|---------------|
| **LangChain** | LLM decide tudo (caixa preta) | Sequential básico | ❌ Baixa |
| **CrewAI** | Role-based simples | Agent-centric | ⚠️ Média |
| **AutoGen** | Conversational | Function calling | ⚠️ Média |
| **Mastra** | Instruction-based | LLM-driven | ⚠️ Média |
| **Kodus Flow** | **Múltiplas estratégias plugáveis** | **Otimização inteligente** | ✅ **Alta** |

---

## 🧠 Planning Layer - Camada de Inteligência

### Conceito
O **Planning Engine** define **COMO** o agent pensa e estrutura seu raciocínio, sem determinar se vai usar tools ou responder diretamente.

### Estratégias Disponíveis

> **Baseado em research de Foundation Agents**: https://github.com/FoundationAgents/awesome-foundation-agents

## **🔧 Máxima Customização - Interface Flexível**

```typescript
interface PlannerConfig {
    // Built-in planners
    type: 'simple' | 'llmReact' | 'llmOoda' | 'smart' | 'llmTot' | 'hybrid';
    
    // 🔥 CUSTOM PROMPTS - User override
    systemPrompt?: string;        // Override default system prompt
    planningPrompt?: string;      // Override planning template
    reflectionPrompt?: string;    // Override refinement prompt
    
    // Advanced customization
    examples?: FewShotExample[];  // Few-shot examples
    temperature?: number;         // LLM temperature
    maxTokens?: number;          // Response length
    
    // Complete customization
    customPlanner?: CustomPlannerFunction;
}
```

### **Usage Examples:**

#### **Built-in Default (Zero Config)**
```typescript
createAgent({
    planner: 'simple'  // Uses research-backed CoT prompt
})
```

#### **Custom Prompts Override**
```typescript
createAgent({
    planner: {
        type: 'simple',
        systemPrompt: `Você é um especialista em medicina.
        Analise step-by-step e SEMPRE mencione que não substitui consulta médica.`,
        
        planningPrompt: `Paciente relata: {input}
        Análise:
        1. Sintomas principais
        2. Possíveis causas  
        3. Recomendações gerais`,
        
        temperature: 0.2
    }
})
```

#### **Few-Shot Examples**
```typescript
createAgent({
    planner: {
        type: 'llmReact',
        examples: [
            {
                input: "Qual o clima hoje?",
                output: "Thought: Preciso verificar o clima\nAction: weather_tool\nAction Input: {}"
            }
        ]
    }
})
```

#### **Completely Custom Planner**
```typescript
createAgent({
    planner: {
        type: 'custom',
        customPlanner: async (input, context, llm) => {
            const prompt = `Meu algoritmo customizado: ${input}`;
            const response = await llm.call(prompt);
            return {
                strategy: 'custom',
                reasoning: response.reasoning,
                suggestedAction: response.action
            };
        }
    }
})
```

---

## **🧠 Built-in Planners (Research-Based Defaults)**

#### 1. **Simple Planner** - Chain of Thought
```typescript
planner: 'simple' | { type: 'simple', systemPrompt?: string }
```
- **Default Prompt**: Step-by-step CoT reasoning
- **Comportamento**: Linear thinking (A→B→C)
- **Customizable**: ✅ Full prompt override support
- **Uso**: Chat agents, MVPs, protótipos
- **Research Base**: Chain-of-Thought prompting

#### 2. **ReAct Planner** - Reasoning + Acting
```typescript
planner: 'llmReact' | { type: 'llmReact', systemPrompt?: string }
```
- **Default Prompt**: `Thought→Action→Observation` loop
- **Comportamento**: Iterative problem-solving
- **Customizable**: ✅ Override prompts + few-shot examples  
- **Uso**: Tool-heavy problem solving
- **Research Base**: ReAct: Synergizing Reasoning and Acting

#### 3. **OODA Planner** - Military Decision Cycles
```typescript
planner: 'llmOoda' | { type: 'llmOoda', systemPrompt?: string }
```
- **Default Prompt**: `OBSERVE→ORIENT→DECIDE→ACT` cycles
- **Comportamento**: Structured decision-making
- **Customizable**: ✅ Domain-specific OODA adaptations
- **Uso**: Strategic decisions, dynamic environments
- **Research Base**: Military tactical planning

#### 4. **Smart Planner** - Auto-adaptive  
```typescript
planner: 'smart' | { type: 'smart', systemPrompt?: string }
```
- **Default Prompt**: Context-aware strategy selection
- **Comportamento**: Auto-selects best approach
- **Customizable**: ✅ Custom complexity analysis
- **Uso**: Production general-purpose agents
- **Research Base**: Multi-strategy planning

#### 5. **Tree of Thoughts** - Multi-path Reasoning
```typescript
planner: 'llmTot' | { type: 'llmTot', systemPrompt?: string }
```
- **Default Prompt**: Generate and evaluate multiple approaches
- **Comportamento**: Explores reasoning paths
- **Customizable**: ✅ Custom evaluation criteria
- **Uso**: Creative tasks, research, exploration
- **Research Base**: Tree of Thoughts deliberate problem solving

#### 6. **Hybrid Planner** - LATS Integration
```typescript
planner: 'hybrid' | { type: 'hybrid', systemPrompt?: string }
```
- **Default Prompt**: Language Agent Tree Search
- **Comportamento**: Unifies reasoning + acting + planning
- **Customizable**: ✅ Strategy combination rules
- **Uso**: Mission-critical complex tasks
- **Research Base**: LATS - Unifying Reasoning, Acting, Planning

---

## 🔀 Routing Layer - Camada de Otimização

### Conceito
O **Routing Engine** define **COMO** executar tools quando o agent decide usar `tool_call`, otimizando performance automaticamente.

### Estratégias Disponíveis

#### 1. **Sequential Router** - Máxima Confiabilidade
```typescript
router: 'sequential'
```
- **Execução**: Uma tool por vez, em ordem
- **Uso**: Casos críticos, debugging
- **Vantagem**: Máxima confiabilidade
- **Desvantagem**: Menor performance

#### 2. **Parallel Router** - Máxima Velocidade
```typescript
router: 'parallel'
```
- **Execução**: Todas as tools simultaneamente
- **Uso**: Tools independentes, alta performance
- **Vantagem**: Máxima velocidade
- **Desvantagem**: Maior consumo de recursos

#### 3. **Adaptive Router** - Otimização Inteligente
```typescript
router: 'adaptive'
```
- **Execução**: Analisa dependências e otimiza automaticamente
- **Uso**: Produção, casos gerais
- **Vantagem**: Balance automático performance/confiabilidade
- **Desvantagem**: Overhead de análise

#### 4. **Smart Router** - Context-Aware
```typescript
router: 'smart'
```
- **Execução**: Considera contexto e recursos disponíveis
- **Uso**: Ambientes com recursos limitados
- **Vantagem**: Otimização baseada em contexto
- **Desvantagem**: Complexidade de configuração

---

## 🔄 Fluxograma de Execução

```
📥 INPUT (User Request)
    ↓
🎯 ORCHESTRATOR
    │ ├─ Resolve planner config
    │ ├─ Resolve router config  
    │ └─ Injeta LLM adapter
    ↓
🤖 AGENT CORE
    │ ├─ Cria AgentContext
    │ └─ Inicia thinking loop
    ↓
🧠 PLANNING ENGINE
    │ ├─ Analisa input complexity
    │ ├─ Aplica estratégia escolhida
    │ ├─ Gera Plan estruturado
    │ └─ Determina requiresTools
    ↓
🤖 AGENT CORE (Decision)
    │ 
    ├─ requiresTools = false ──→ Action: final_answer ──→ 📤 OUTPUT
    │
    ├─ requiresTools = true ──→ Action: tool_call ──→ 🔀 ROUTING ENGINE
    │                                                    │
    │                                                    ├─ Analisa dependencies
    │                                                    ├─ Aplica estratégia
    │                                                    ├─ Executa tools
    │                                                    └─ Retorna results
    │                                                    ↓
    │                                              🤖 AGENT CORE (Observe)
    │                                                    │
    │                                                    ├─ Processa resultados
    │                                                    ├─ Atualiza contexto
    │                                                    └─ Decide: continuar ou finalizar
    │                                                    ↓
    └─ multi-agent ──→ Action: delegate_to_agent        📤 OUTPUT ou volta para Planning
```

---

## 💡 Exemplos Práticos

### 1. Chat Agent Simples
```typescript
const chatAgent = await flow.createAgent({
    name: "chat_assistant",
    description: "Assistente de chat amigável",
    planner: 'simple',    // ← Raciocínio linear básico
    // router não é usado (sem tools)
});

// Input: "Olá!"
// Planning: Simple → determina requiresTools = false
// Output: Action: final_answer → "Olá! Como posso ajudar?"
```

### 2. Weather Agent com Tools
```typescript
const weatherAgent = await flow.createAgent({
    name: "weather_bot",
    description: "Bot de informações climáticas",
    planner: 'smart',      // ← Auto-adapta complexidade
    router: 'adaptive',    // ← Otimiza execução automaticamente
});

// Input: "Qual o clima em SP e RJ?"
// Planning: Smart → detecta múltiplas cidades → requiresTools = true
// Routing: Adaptive → detecta independência → executa em paralelo
// Output: Informações de ambas as cidades
```

### 3. Data Analysis Agent
```typescript
const analysisAgent = await flow.createAgent({
    name: "data_analyst",
    description: "Analista de dados avançado",
    planner: 'llmOoda',    // ← Processo militar de análise
    router: 'smart',       // ← Context-aware execution
});

// Input: "Analise vendas Q4 e compare com Q3"
// Planning: OODA → Observe (dados) → Orient (contexto) → Decide (estratégia) → Act
// Routing: Smart → executa getData sequencialmente, depois analysis em paralelo
// Output: Relatório estruturado com insights
```

### 4. Strategic Decision Agent
```typescript
const strategicAgent = await flow.createAgent({
    name: "strategic_advisor",
    description: "Consultor estratégico",
    planner: 'hybrid',     // ← Combina múltiplas estratégias
    router: 'adaptive',    // ← Otimização máxima
});

// Input: "Devemos expandir para mercado X considerando cenário Y?"
// Planning: Hybrid → usa OODA para análise + ReAct para simulações
// Routing: Adaptive → coordena multiple data sources e analysis tools
// Output: Recomendação estratégica fundamentada
```

---

## 🚀 Vantagens Competitivas

### 1. **Pluggable Intelligence**
- Troca estratégias de thinking sem reescrever código
- Adapta comportamento ao contexto de uso
- Facilita experimentação e otimização

### 2. **Performance Optimization**
- Routing inteligente automático
- Execução paralela quando possível
- Otimização baseada em recursos disponíveis

### 3. **Production Ready**
- Configurações específicas para cada ambiente
- Observabilidade integrada
- Fallbacks robustos

### 4. **Developer Experience**
- API consistente independente da complexidade
- **Máxima customização**: Override prompts sem limits
- **Zero config**: Built-ins work out-of-the-box
- **Progressive complexity**: Start simple, customize as needed

---

## 📈 Roadmap

### Próximas Funcionalidades
- **Custom Planners**: API para criar planners personalizados
- **Router Analytics**: Métricas de performance de routing
- **Auto-tuning**: Otimização automática baseada em histórico
- **Multi-modal Planning**: Support para diferentes tipos de input

### Integrações Planejadas
- **LangGraph**: Compatibilidade com grafos de LangChain
- **OpenTelemetry**: Observabilidade avançada
- **Kubernetes**: Deployment em clusters
- **Edge Computing**: Execução em edge devices

---

## 🔧 Como Implementar

### **Zero Config (Começar Rápido)**
```typescript
import { createOrchestration } from '@kodus/flow';

const flow = createOrchestration({
    llmAdapter: yourLLMAdapter,
    tenantId: 'your-app'
});

// Built-in planner - zero config
await flow.createAgent({
    name: "chat_agent",
    description: "Assistente de chat",
    planner: 'simple'     // ← Research-backed CoT prompt
});

const result = await flow.callAgent('chat_agent', 'Olá!');
```

### **Custom Prompts (Domain-Specific)**
```typescript
// Medical domain agent
await flow.createAgent({
    name: "medical_assistant",
    description: "Assistente médico",
    planner: {
        type: 'simple',
        systemPrompt: `Você é um assistente médico especializado.
        SEMPRE mencione que não substitui consulta médica.
        Seja preciso, cauteloso e empático.`,
        
        planningPrompt: `Paciente relata: {input}
        
        Análise step-by-step:
        1. Sintomas e contexto
        2. Possíveis causas (listagem cautelosa)
        3. Recomendações gerais
        4. Quando procurar ajuda médica
        
        IMPORTANTE: Sempre termine com aviso sobre consulta médica.`,
        
        temperature: 0.2  // Lower temperature for medical accuracy
    },
    router: 'sequential'  // Reliable execution for medical tools
});
```

### **Advanced Tool Integration (ReAct)**
```typescript
// Data analysis agent with tools
await flow.createAgent({
    name: "data_analyst",
    description: "Analista de dados avançado", 
    planner: {
        type: 'llmReact',
        systemPrompt: `Você é um analista de dados expert.
        Use the ReAct format for systematic analysis:
        
        Thought: [your reasoning]
        Action: [tool to use or final_answer]
        Action Input: [parameters]
        Observation: [tool results]
        
        Continue until you have complete analysis.`,
        
        examples: [
            {
                input: "Análise vendas Q4",
                output: `Thought: Preciso primeiro obter os dados de vendas Q4
                Action: get_sales_data
                Action Input: {"period": "Q4", "year": 2024}`
            }
        ]
    },
    router: 'adaptive'  // Smart tool execution
});
```

### **Strategic Decision Agent (OODA)**
```typescript
// Strategic planning agent
await flow.createAgent({
    name: "strategic_advisor",
    description: "Consultor estratégico",
    planner: {
        type: 'llmOoda',
        systemPrompt: `Você é um consultor estratégico sênior.
        Use the OODA Loop for systematic decision-making:
        
        OBSERVE: Gather and analyze current situation
        ORIENT: Contextualize within market/business environment  
        DECIDE: Evaluate options and select best strategy
        ACT: Provide actionable recommendations
        
        Cycle through OODA until strategy is complete.`,
        
        planningPrompt: `Strategic Challenge: {input}
        
        Apply OODA methodology systematically.`,
        
        temperature: 0.4  // Balanced creativity + accuracy
    },
    router: 'smart'  // Context-aware execution
});
```

**Resultado:** 
- ✅ **Zero Config**: Built-ins work immediately
- ✅ **Custom Prompts**: Domain expertise built-in  
- ✅ **Progressive Complexity**: Start simple, evolve as needed
- ✅ **Production Ready**: Research-backed + battle-tested