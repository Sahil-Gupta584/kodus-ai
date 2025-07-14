# 📚 Exemplos de Agents em Outros Frameworks

Este documento apresenta exemplos de como outros frameworks implementam agents, para comparação e inspiração no desenvolvimento do Kodus Flow.

## 🏗️ Google ADK (Agent Development Kit)

### Características Principais
- **Modelo**: Baseado em eventos e streams
- **Tools**: Funções Python com docstrings detalhadas
- **Sessões**: Gerenciamento de estado com InMemorySessionService
- **Execução**: Runner assíncrono com eventos

### Exemplo Básico - Agent Simples

```python
# chapter1_main_basic.py
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# Criar agent básico
basic_agent = Agent(
    model="gemini-2.0-flash",
    name="agent_basic",
    description="Agent básico criado com Google ADK",
    instruction="Se perguntarem como você foi criado, diga que foi com Google ADK.",
    generate_content_config=types.GenerateContentConfig(temperature=0.2),
)

# Executar agent
async def send_query_to_agent(agent, query):
    session_service = InMemorySessionService()
    artifact_service = InMemoryArtifactService()
    
    session = await session_service.create_session(
        app_name='agent_basic',
        user_id="user",
        session_id="user_session"
    )
    
    content = types.Content(role='user', parts=[types.Part(text=query)])
    
    runner = Runner(
        app_name='agent_basic', 
        agent=agent, 
        artifact_service=artifact_service, 
        session_service=session_service
    )
    
    events = runner.run_async(
        user_id="user", 
        session_id="user_session", 
        new_message=content
    )
    
    async for event in events:
        if event.is_final_response():
            return event.content.parts[0].text
```

### Exemplo com Tools

```python
# agent_maths/agent.py
from google.adk.agents import Agent

def add(numbers: list[int]) -> int:
    """Calculates the sum of a list of integers.
    
    Args:
        numbers: A list of integers to be added.
    
    Returns:
        The sum of the integers in the input list.
    
    Examples:
        add([1, 2, 3]) == 6
    """
    return sum(numbers)

def multiply(numbers: list[int]) -> int:
    """Calculates the product of a list of integers.
    
    Args:
        numbers: A list of integers to be multiplied.
    
    Returns:
        The product of the integers in the input list.
    
    Examples:
        multiply([2, 3, 4]) == 24
    """
    product = 1
    for num in numbers:
        product *= num
    return product

# Criar agent com tools
agent_math = Agent(
    model="gemini-2.0-flash-001",
    name="math_agent",
    description="Agent especializado em cálculos matemáticos",
    instruction="Use as funções disponíveis para resolver cálculos matemáticos.",
    tools=[add, multiply, subtract, divide]
)
```

### Padrões Observados
1. **Tools como Funções Python**: Tools são funções Python com docstrings detalhadas
2. **Eventos Assíncronos**: Execução baseada em streams de eventos
3. **Sessões Explícitas**: Gerenciamento manual de sessões
4. **Runner Centralizado**: Runner gerencia toda a execução
5. **Configuração Simples**: Agent criado com parâmetros diretos

## 🧠 Agno Framework

### Características Principais
- **Modelo**: Multi-modal nativo (texto, imagem, áudio, vídeo)
- **Tools**: Integração com 20+ bancos de dados vetoriais
- **Reasoning**: 3 abordagens para raciocínio
- **Performance**: Instanciação em ~3μs, ~6.5Kib memória

### Exemplo - Agent Financeiro com Reasoning

```python
# reasoning_finance_agent.py
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.reasoning import ReasoningTools
from agno.tools.yfinance import YFinanceTools

# Criar agent com reasoning e tools financeiras
reasoning_agent = Agent(
    model=Claude(id="claude-sonnet-4-20250514"),
    tools=[
        ReasoningTools(add_instructions=True),
        YFinanceTools(
            stock_price=True, 
            analyst_recommendations=True, 
            company_info=True, 
            company_news=True
        ),
    ],
    instructions="Use tables to display data.",
    markdown=True,
)
```

### Padrões Observados
1. **Tools Especializadas**: Tools específicas para domínios (YFinance, Reasoning)
2. **Multi-Modalidade**: Suporte nativo para diferentes tipos de input
3. **Reasoning Integrado**: Tools de raciocínio como cidadão de primeira classe
4. **Configuração Declarativa**: Agent configurado com parâmetros específicos
5. **Performance Otimizada**: Foco em performance e eficiência

## ⚡ Mastra Framework

### Características Principais
- **Modelo**: TypeScript com Vercel AI SDK
- **Tools**: Funções tipadas com validação de parâmetros
- **Workflows**: Máquinas de estado duráveis baseadas em grafos
- **Integrações**: Auto-geradas e type-safe

### Exemplo - Agent Básico

```typescript
// basic-agent.ts
import { Agent } from '@mastra/core';

// Criar agent básico
const agent = new Agent({
    model: 'gpt-4',
    instructions: 'You are a helpful assistant.',
    tools: [
        {
            name: 'calculator',
            description: 'Perform mathematical calculations',
            inputSchema: {
                type: 'object',
                properties: {
                    expression: { type: 'string' }
                },
                required: ['expression']
            },
            execute: async (input: { expression: string }) => {
                return { result: eval(input.expression) };
            }
        }
    ]
});

// Executar agent
const response = await agent.run('Calculate 2 + 2');
```

### Padrões Observados
1. **TypeScript Nativo**: Framework construído em TypeScript
2. **Schemas Tipados**: Tools com schemas de validação
3. **Workflows Duráveis**: Máquinas de estado para workflows complexos
4. **Integrações Auto-Geradas**: APIs type-safe para serviços externos
5. **Observabilidade**: Tracing OpenTelemetry integrado

## 🔄 Comparação com Kodus Flow

### Similaridades
1. **Tools como Funções**: Todos usam funções como tools
2. **Configuração Declarativa**: Agents configurados com parâmetros
3. **Execução Assíncrona**: Suporte a execução não-bloqueante
4. **Sessões/Contexto**: Gerenciamento de estado da conversa

### Diferenças
1. **Arquitetura em Camadas**: Kodus Flow tem 5 camadas bem definidas
2. **Orchestration Layer**: API simples para usuário final
3. **Enhanced Context**: Contexto rico com acesso a todas as camadas
4. **Router Inteligente**: Seleção automática de tools
5. **Planner Dinâmico**: Decomposição automática de tarefas

### Lições Aprendidas

#### ✅ O que Kodus Flow faz bem:
- **Simplicidade para o usuário**: Apenas implementar `think()`
- **Execução autônoma**: Framework gerencia tools automaticamente
- **Contexto rico**: Acesso a todas as funcionalidades
- **Arquitetura enterprise**: Separação clara de responsabilidades

#### 🔄 O que podemos melhorar:
- **Documentação de Tools**: Docstrings mais detalhadas como Google ADK
- **Exemplos Práticos**: Mais exemplos específicos por domínio
- **Performance**: Otimizações como Agno
- **Type Safety**: Schemas mais robustos como Mastra

## 📋 Recomendações

### 1. Melhorar Documentação de Tools
```typescript
// Exemplo melhorado
orchestration.createTool({
    name: 'calculate_math',
    description: 'Perform mathematical calculations with detailed error handling',
    inputSchema: z.object({
        expression: z.string().describe('Mathematical expression to evaluate'),
        precision: z.number().optional().describe('Decimal precision for result')
    }),
    execute: async (input: { expression: string; precision?: number }) => {
        // Implementação com validação e tratamento de erros
    }
});
```

### 2. Exemplos por Domínio
- **Financeiro**: Tools para análise de dados financeiros
- **Desenvolvimento**: Tools para análise de código
- **Pesquisa**: Tools para busca e síntese de informações
- **Criativo**: Tools para geração de conteúdo

### 3. Performance e Observabilidade
- Métricas de performance como Agno
- Tracing detalhado como Mastra
- Logging estruturado como Google ADK

### 4. Simplicidade Mantida
- **NÃO** complicar a API do usuário
- **SIM** manter apenas `think()` como interface
- **SIM** execução automática de tools
- **SIM** contexto rico disponível

## 🎯 Conclusão

O Kodus Flow está no caminho certo com sua arquitetura em camadas e simplicidade para o usuário. Os exemplos dos outros frameworks mostram que:

1. **Simplicidade é fundamental**: Usuário só implementa `think()`
2. **Tools bem documentadas**: Docstrings detalhadas são essenciais
3. **Performance importa**: Otimizações fazem diferença
4. **Type safety é valor**: Schemas robustos previnem erros
5. **Exemplos práticos**: Casos de uso reais são fundamentais

O framework deve continuar focado na **simplicidade para o usuário** enquanto oferece **poder enterprise** sob o capô. 
