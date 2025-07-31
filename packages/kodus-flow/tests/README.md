# 🧪 Clean Architecture Tests

Este diretório contém testes abrangentes para validar a nova arquitetura limpa do Kodus Flow.

## 📋 Visão Geral

Os testes foram criados para validar que a refatoração foi bem-sucedida e que todos os componentes funcionam corretamente com a nova arquitetura limpa.

### 🎯 Objetivos dos Testes

1. **Validar LLM Obrigatório**: Garantir que LLM é obrigatório em todos os pontos
2. **Separação de Responsabilidades**: Confirmar que cada componente tem uma responsabilidade específica
3. **Think→Act→Observe**: Validar que o ciclo funciona corretamente
4. **Integração End-to-End**: Testar fluxos completos
5. **Performance**: Verificar que a arquitetura é eficiente

## 🏗️ Estrutura dos Testes

### 1. Testes de Orchestração
**Arquivo**: `tests/orchestration/clean-architecture.test.ts`

**Objetivo**: Validar que SDKOrchestrator apenas coordena, sem lógica de negócio.

**Testes Incluídos**:
- ✅ LLM obrigatório no constructor
- ✅ Separação clara de responsabilidades
- ✅ Tool management (create, execute, list)
- ✅ Agent management (create, execute, status)
- ✅ Statistics & monitoring
- ✅ Architecture validation

### 2. Testes de PlannerFactory
**Arquivo**: `tests/engine/planning/planner-factory.test.ts`

**Objetivo**: Validar que PlannerFactory exige LLM obrigatório e não tem fallbacks.

**Testes Incluídos**:
- ✅ LLM obrigatório para todos os planners
- ✅ Criação bem-sucedida com LLM válido
- ✅ Interface Planner implementada corretamente
- ✅ Error handling educativo
- ✅ Validação de LLM integration
- ✅ Factory pattern validation

### 3. Testes de ReActPlanner
**Arquivo**: `tests/engine/planning/strategies/react-planner.test.ts`

**Objetivo**: Validar que ReActPlanner funciona com LLM real.

**Testes Incluídos**:
- ✅ Think phase com LLM
- ✅ Action parsing (tool_call, final_answer)
- ✅ Result analysis com LLM
- ✅ Think→Act→Observe cycle completo
- ✅ Error handling gracioso
- ✅ ReAct format parsing

### 4. Testes de Think→Act→Observe
**Arquivo**: `tests/engine/agents/think-act-observe.test.ts`

**Objetivo**: Validar que AgentCore executa ciclo Think→Act→Observe corretamente.

**Testes Incluídos**:
- ✅ Think phase execution
- ✅ Act phase execution
- ✅ Observe phase execution
- ✅ Complete loop execution
- ✅ Context management
- ✅ Error handling
- ✅ Configuration & integration

### 5. Testes de Integração
**Arquivo**: `tests/integration/clean-architecture.integration.test.ts`

**Objetivo**: Validar que toda a arquitetura funciona integrada end-to-end.

**Cenários Testados**:
- 📊 Mathematical problem solving
- 🌍 Information gathering & processing
- 🔄 Multi-step workflows
- 🎯 Error recovery & resilience
- ⚡ Performance & efficiency
- 🏗️ Architecture validation

### 6. Testes de Validação LLM
**Arquivo**: `tests/validation/llm-mandatory.test.ts`

**Objetivo**: Garantir que LLM é obrigatório em toda a arquitetura.

**Validações Incluídas**:
- ✅ SDKOrchestrator LLM requirements
- ✅ PlannerFactory LLM requirements
- ✅ ReActPlanner LLM requirements
- ✅ AgentCore LLM requirements
- ✅ No fallback validation
- ✅ Error message quality
- ✅ Consistency validation

## 🚀 Como Executar os Testes

### Executar Todos os Testes

```bash
# Método 1: Script automatizado
./run-clean-architecture-tests.sh

# Método 2: Vitest diretamente
npx vitest run tests/
```

### Executar Testes Específicos

```bash
# Testes de arquitetura limpa
npx vitest run tests/orchestration/clean-architecture.test.ts

# Testes de PlannerFactory
npx vitest run tests/engine/planning/planner-factory.test.ts

# Testes de ReActPlanner
npx vitest run tests/engine/planning/react-planner.test.ts

# Testes de Think→Act→Observe
npx vitest run tests/engine/agents/think-act-observe.test.ts

# Testes de integração
npx vitest run tests/integration/clean-architecture.integration.test.ts

# Testes de LLM obrigatório
npx vitest run tests/validation/llm-mandatory.test.ts
```

### Executar com Watch Mode

```bash
npx vitest watch tests/
```

## 🔧 Configuração Necessária

### Variáveis de Ambiente

```bash
# Obrigatório: Chave API do Gemini
export GEMINI_API_KEY=your_gemini_api_key_here

# Opcional: Configurações adicionais
export NODE_ENV=test
export LOG_LEVEL=debug
```

### Dependências

Os testes usam:
- **Vitest**: Framework de testes
- **Zod**: Validação de schemas
- **Gemini LLM**: Provider de LLM real

## 📊 Cobertura dos Testes

### Componentes Testados

- ✅ **SDKOrchestrator**: Coordenação limpa
- ✅ **PlannerFactory**: Factory pattern com LLM
- ✅ **ReActPlanner**: Planning com LLM real
- ✅ **AgentCore**: Think→Act→Observe loop
- ✅ **ToolEngine**: Integração com tools
- ✅ **LLMAdapter**: Integração com LLM

### Cenários Cobertos

- ✅ **Happy Path**: Fluxos normais de execução
- ✅ **Error Handling**: Tratamento de erros
- ✅ **Edge Cases**: Casos extremos
- ✅ **Performance**: Eficiência da arquitetura
- ✅ **Integration**: Integração entre componentes
- ✅ **Validation**: Validação de contratos

## 🎯 Critérios de Sucesso

Para que os testes passem, a arquitetura deve:

1. **LLM Obrigatório**: Falhar sem LLM em qualquer ponto
2. **Separação Limpa**: Orchestrator apenas coordena
3. **Think→Act→Observe**: Ciclo funciona corretamente
4. **Error Handling**: Erros são tratados graciosamente
5. **Performance**: Execução eficiente
6. **Integration**: Componentes se integram corretamente

## 🔍 Debugging

### Logs Detalhados

```bash
# Executar com logs detalhados
DEBUG=* npx vitest run tests/

# Logs específicos do framework
DEBUG=kodus-flow:* npx vitest run tests/
```

### Teste Individual

```bash
# Executar teste específico com verbose
npx vitest run tests/orchestration/clean-architecture.test.ts --reporter=verbose
```

## 📈 Métricas de Qualidade

### Cobertura Esperada

- **Cobertura de Código**: > 85%
- **Cobertura de Branches**: > 80%
- **Cobertura de Funcionalidades**: 100%

### Performance Esperada

- **Testes Unitários**: < 5s cada
- **Testes de Integração**: < 30s cada
- **Suíte Completa**: < 2min

## 🚨 Troubleshooting

### Problemas Comuns

1. **GEMINI_API_KEY não configurada**
   ```bash
   export GEMINI_API_KEY=your_key_here
   ```

2. **Timeout nos testes**
   ```bash
   npx vitest run --timeout=60000
   ```

3. **Erros de compilação TypeScript**
   ```bash
   npm run build
   ```

### Suporte

Para problemas com os testes:
1. Verifique as variáveis de ambiente
2. Execute `npm run build` primeiro
3. Verifique os logs detalhados
4. Consulte a documentação do framework

---

## 🏆 Resumo

Estes testes validam que a refatoração da arquitetura foi bem-sucedida:

- ✅ **SDKOrchestrator**: Limpo, sem God Object
- ✅ **LLM Obrigatório**: Em todos os pontos
- ✅ **Separação**: Responsabilidades claras
- ✅ **Think→Act→Observe**: Funcionando perfeitamente
- ✅ **Integration**: End-to-end validado

A arquitetura está pronta para produção com confiança! 🚀