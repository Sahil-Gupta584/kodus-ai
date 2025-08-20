# 🎯 **MAPEAMENTO COMPLETO: STATUS, RESULT.TYPES E LÓGICAS**

## 📋 **VISÃO GERAL**

Mapeamento completo de todos os status, tipos de resultado e lógicas de decisão no sistema Kodus Flow.

## 🔄 **STATUS UNIFICADOS (UNIFIED_STATUS)**

### **1. STATUS BÁSICOS**
```typescript
PENDING: 'pending'           // Aguardando execução
EXECUTING: 'executing'       // Em execução
COMPLETED: 'completed'       // Concluído com sucesso
FAILED: 'failed'            // Falhou
```

### **2. STATUS DE CONTROLE**
```typescript
REPLANNING: 'replanning'     // Replanejando
WAITING_INPUT: 'waiting_input' // Aguardando input do usuário
PAUSED: 'paused'            // Pausado
CANCELLED: 'cancelled'       // Cancelado
SKIPPED: 'skipped'          // Pulado
```

### **3. STATUS ReWOO**
```typescript
REWRITING: 'rewriting'       // ReWOO: Reescrita do plano
OBSERVING: 'observing'       // ReWOO: Observação
PARALLEL: 'parallel'         // ReWOO: Execução paralela
```

### **4. STATUS DE PROBLEMA**
```typescript
STAGNATED: 'stagnated'       // Estagnado (sem progresso)
TIMEOUT: 'timeout'          // Timeout
DEADLOCK: 'deadlock'        // Deadlock
```

## 🎯 **TIPOS DE AÇÃO (AgentAction)**

### **1. AÇÕES CORE**
```typescript
// Resposta final para o usuário
{ type: 'final_answer'; content: string }

// Chamada de ferramenta
{ type: 'tool_call'; toolName: string; input: unknown }

// Solicita mais informações
{ type: 'need_more_info'; question: string }

// Executa plano
{ type: 'execute_plan'; planId: string }
```

### **2. AÇÕES MULTI-AGENTE**
```typescript
// Delega para outro agente
{ type: 'delegate'; targetAgent: string; input: unknown }

// Colaboração entre agentes
{ type: 'collaborate'; agents: string[]; strategy: 'parallel' | 'sequential' }

// Roteamento inteligente
{ type: 'route'; routerName: string; input: unknown }

// Planejamento
{ type: 'plan'; plannerName: string; goal: string }

// Pausa workflow
{ type: 'pause'; reason: string }

// Broadcast de eventos
{ type: 'broadcast'; event: string; data: unknown }

// Descoberta de agentes
{ type: 'discover'; criteria: object }

// Sincronização de estado
{ type: 'sync_state'; target: string; data: unknown }
```

### **3. AÇÕES DE FERRAMENTAS PARALELAS**
```typescript
// Execução paralela
{ type: 'parallel_tools'; tools: ToolCall[] }

// Execução sequencial
{ type: 'sequential_tools'; tools: ToolCall[] }

// Execução condicional
{ type: 'conditional_tools'; tools: ToolCall[] }

// Estratégia mista
{ type: 'mixed_tools'; strategy: 'parallel' | 'sequential' | 'conditional' }

// Baseado em dependências
{ type: 'dependency_tools'; tools: ToolCall[]; dependencies: object[] }
```

## 📊 **TIPOS DE RESULTADO (ActionResult)**

### **1. RESULTADOS BÁSICOS**
```typescript
// Resultado de ferramenta
{ type: 'tool_result'; content: unknown }

// Resposta final
{ type: 'final_answer'; content: string }

// Erro
{ type: 'error'; error: string }

// Array de resultados de ferramentas
{ type: 'tool_results'; content: Array<{toolName: string; result?: unknown; error?: string}> }

// Precisa replanejar
{ type: 'needs_replan'; feedback: string }
```

## 🔍 **LÓGICAS DE DECISÃO**

### **1. MÉTODO `analyzeResult` - CASOS DE USO**

#### **CASO 1: SEM PLANO ATIVO**
```typescript
if (!currentPlan) {
    return {
        isComplete: true,        // ✅ PARA EXECUÇÃO
        isSuccessful: true,
        feedback: 'No plan to analyze',
        shouldContinue: false,
    };
}
```
**TRIGGER**: Quando não há plano ativo no contexto
**RESULTADO**: Para execução e retorna resposta direta

#### **CASO 2: PLANO EM WAITING_INPUT**
```typescript
if (currentPlan.status === UNIFIED_STATUS.WAITING_INPUT) {
    return {
        isComplete: true,        // ✅ PARA EXECUÇÃO
        isSuccessful: true,
        feedback: 'Awaiting user input to proceed',
        shouldContinue: false,
    };
}
```
**TRIGGER**: Plano aguardando input do usuário
**RESULTADO**: Para execução e aguarda input

#### **CASO 3: RESULTADO FINAL (final_answer)**
```typescript
if (result.type === 'final_answer') {
    currentPlan.status = UNIFIED_STATUS.COMPLETED;
    return {
        isComplete: true,        // ✅ PARA EXECUÇÃO
        isSuccessful: true,
        feedback: synthesizedResponse,
        shouldContinue: false,
    };
}
```
**TRIGGER**: Resultado é `final_answer`
**RESULTADO**: Para execução e retorna resposta final

#### **CASO 4: SEM STEP ATUAL**
```typescript
if (!currentStep) {
    return {
        isComplete: true,        // ✅ PARA EXECUÇÃO
        isSuccessful: true,
        feedback: 'Plan execution completed',
        shouldContinue: false,
    };
}
```
**TRIGGER**: Não há step atual no plano
**RESULTADO**: Para execução - plano completado

#### **CASO 5: FALHA DEFINITIVA**
```typescript
if (isDefinitiveFailure) {
    return {
        isComplete: true,        // ✅ PARA EXECUÇÃO
        isSuccessful: false,
        feedback: synthesizedErrorResponse,
        shouldContinue: false,
    };
}
```
**TRIGGER**: Falha definitiva (max_replans_exceeded, permission_denied, etc.)
**RESULTADO**: Para execução com erro definitivo

#### **CASO 6: ÚLTIMO STEP COMPLETADO**
```typescript
if (isLastStep) {
    currentPlan.status = UNIFIED_STATUS.COMPLETED;
    return {
        isComplete: true,        // ✅ PARA EXECUÇÃO
        isSuccessful: true,
        feedback: synthesizedResponse,
        shouldContinue: false,
    };
}
```
**TRIGGER**: Último step do plano foi completado
**RESULTADO**: Para execução com sucesso

#### **CASO 7: ERRO NO PLANNING**
```typescript
return {
    isComplete: true,            // ✅ PARA EXECUÇÃO
    isSuccessful: false,
    feedback: 'Planning failed',
    shouldContinue: false,
};
```
**TRIGGER**: Erro durante o processo de planning
**RESULTADO**: Para execução com erro

#### **CASO 8: REPLANNING**
```typescript
if (shouldReplan) {
    currentPlan.status = UNIFIED_STATUS.REPLANNING;
    return {
        isComplete: false,       // ❌ CONTINUA EXECUÇÃO
        isSuccessful: false,
        feedback: 'Will replan from this point',
        shouldContinue: true,
    };
}
```
**TRIGGER**: Falha recuperável que precisa replanejar
**RESULTADO**: Continua execução com replanning

#### **CASO 9: STEP EM ANDAMENTO**
```typescript
return {
    isComplete: false,           // ❌ CONTINUA EXECUÇÃO
    isSuccessful: true,
    feedback: 'Step completed, moving to next',
    shouldContinue: true,
};
```
**TRIGGER**: Step completado, mas há mais steps
**RESULTADO**: Continua execução para próximo step

### **2. MÉTODO `think` - CASOS DE USO**

#### **CASO 1: ERRO DE PLANNING**
```typescript
return {
    reasoning: 'Error in planning',
    action: {
        type: 'final_answer',    // ✅ CRIA final_answer
        content: 'I encountered an error while planning...',
    },
};
```
**TRIGGER**: Erro durante criação do plano
**RESULTADO**: Cria `final_answer` com erro

#### **CASO 2: MAX REPLANS EXCEEDED**
```typescript
return {
    reasoning: 'Plan failed due to max replans exceeded',
    action: {
        type: 'final_answer',    // ✅ CRIA final_answer
        content: 'I cannot complete this task because I need additional information...',
    },
};
```
**TRIGGER**: Número máximo de replans atingido
**RESULTADO**: Cria `final_answer` com falha definitiva

#### **CASO 3: FALLBACK SEM PLANO**
```typescript
return {
    reasoning: 'No plan available; please replan',
    action: { 
        type: 'final_answer',    // ✅ CRIA final_answer
        content: 'Replanning…' 
    },
};
```
**TRIGGER**: Não há plano disponível
**RESULTADO**: Cria `final_answer` de fallback

#### **CASO 4: ERRO NO THINKING**
```typescript
return {
    reasoning: 'Plan-and-Execute thinking failed',
    action: {
        type: 'final_answer',    // ✅ CRIA final_answer
        content: 'I encountered an error while planning...',
    },
};
```
**TRIGGER**: Erro durante processo de thinking
**RESULTADO**: Cria `final_answer` com erro

#### **CASO 5: PLANO CRIADO COM SUCESSO**
```typescript
return {
    reasoning: 'Plan created. Executing…',
    action: {
        type: 'execute_plan',    // ✅ EXECUTA PLANO
        planId: current.id,
    },
};
```
**TRIGGER**: Plano criado com sucesso
**RESULTADO**: Executa o plano criado

### **3. MÉTODO `extractFinalResult` - CASOS DE USO**

#### **CASO 1: FINAL_ANSWER ENCONTRADA**
```typescript
if (result.type === 'final_answer') {
    return result.content;       // ✅ RETORNA CONTEÚDO
}
```
**TRIGGER**: Resultado é `final_answer`
**RESULTADO**: Retorna conteúdo para usuário

#### **CASO 2: SUCESSO SEM FINAL_ANSWER**
```typescript
if (finalResult && finalResult.success) {
    return finalResult.result;   // ✅ RETORNA RESULTADO
}
```
**TRIGGER**: Sucesso mas sem `final_answer`
**RESULTADO**: Retorna resultado direto

#### **CASO 3: FALHA**
```typescript
return 'Sorry, I had trouble processing your request. Please try again with more details.';
```
**TRIGGER**: Falha ou resultado inválido
**RESULTADO**: Retorna mensagem de erro padrão

## 🎯 **FLUXO COMPLETO DE DECISÃO**

### **1. FLUXO PRINCIPAL**
```
Usuário → AgentCore.execute() → Loop Think→Act→Observe → analyzeResult() → extractFinalResult() → Usuário
```

### **2. PONTOS DE DECISÃO**

#### **PONTO 1: `think()`**
- **Cria `final_answer`** se erro definitivo
- **Cria `execute_plan`** se plano criado
- **Cria `final_answer`** se fallback necessário

#### **PONTO 2: `analyzeResult()`**
- **`isComplete = true`** se deve parar
- **`isComplete = false`** se deve continuar
- **Define `synthesizedResponse`** para resposta final

#### **PONTO 3: `extractFinalResult()`**
- **Extrai conteúdo** de `final_answer`
- **Retorna resultado** direto se sucesso
- **Retorna erro padrão** se falha

### **3. CONDIÇÕES DE PARADA**

#### **PARA EXECUÇÃO (`isComplete = true`):**
1. ✅ Sem plano ativo
2. ✅ Plano em `WAITING_INPUT`
3. ✅ Resultado é `final_answer`
4. ✅ Sem step atual
5. ✅ Falha definitiva
6. ✅ Último step completado
7. ✅ Erro no planning

#### **CONTINUA EXECUÇÃO (`isComplete = false`):**
1. ❌ Replanning necessário
2. ❌ Step em andamento
3. ❌ Falha recuperável

## 📊 **RESUMO DOS CASOS DE USO**

### **CASOS QUE GERAM RESPOSTA FINAL:**
1. **Erro definitivo** → `final_answer` com erro
2. **Plano completado** → `final_answer` com sucesso
3. **Falha definitiva** → `final_answer` com falha
4. **Sem plano** → Resposta direta
5. **Aguardando input** → Resposta de aguardo

### **CASOS QUE CONTINUAM EXECUÇÃO:**
1. **Replanning** → Continua com novo plano
2. **Step em andamento** → Continua para próximo step
3. **Falha recuperável** → Continua com replanning

### **CASOS QUE CRIAM FINAL_ANSWER:**
1. **Erro de planning** → `final_answer` com erro
2. **Max replans exceeded** → `final_answer` com falha
3. **Fallback sem plano** → `final_answer` de fallback
4. **Erro no thinking** → `final_answer` com erro
5. **Plano completado** → `final_answer` com sucesso

---

**RESULTADO**: Sistema com **7 cenários de parada** e **3 cenários de continuação**, totalizando **10 casos de uso principais** para decisão de resposta final vs continuação da execução.
