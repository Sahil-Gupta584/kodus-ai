# 💬 Exemplos de Agentes de Conversação

Este documento apresenta exemplos específicos de agentes de conversação de diferentes frameworks, focando em padrões de implementação e boas práticas.

## 🏗️ Google ADK - Agent de Conversação Multi-Especialista

### Exemplo: Sistema de Ensino com Múltiplos Agentes

O Google ADK demonstra um sistema conversacional sofisticado com múltiplos agentes especializados:

#### 1. Agent de Gramática (Grammar Agent)

```python
# agent_grammar/agent.py
from google.adk.agents import Agent
from google.genai import types

def check_grammar(text_input: str) -> dict:
    """Checks the grammar of input text and returns corrections and explanations.
    
    Args:
        text_input: The input text to be checked for grammar errors.
    
    Returns:
        A dictionary containing corrected text, explanations, and error descriptions.
    """
    prompt = f"""
    Analyze the following text for grammar errors, correct them, and provide 
    explanations for each correction:

    Text: {text_input}

    Return the response as a JSON object with the following structure:
    {{
      "corrected_text": "The corrected text.",
      "explanations": [
        "Explanation of the first error.",
        "Explanation of the second error."
      ],
      "errors": [
        "Description of the first error.",
        "Description of the second error."
      ]
    }}
    """
    
    # Implementação da análise gramatical
    return {
        "corrected_text": corrected_text,
        "explanations": explanations,
        "errors": errors
    }

# Criar agent de gramática
agent_grammar = Agent(
    model="gemini-2.0-flash-001",
    name="agent_grammar",
    description="Agent especializado em correção gramatical",
    instruction="Analise e corrija erros gramaticais no texto fornecido.",
    tools=[check_grammar]
)
```

#### 2. Agent de Matemática (Math Agent)

```python
# agent_maths/agent.py
from google.adk.agents import Agent

def add(numbers: list[int]) -> int:
    """Calculates the sum of a list of integers."""
    return sum(numbers)

def multiply(numbers: list[int]) -> int:
    """Calculates the product of a list of integers."""
    product = 1
    for num in numbers:
        product *= num
    return product

def subtract(numbers: list[int]) -> int:
    """Subtracts numbers in a list sequentially from left to right."""
    if not numbers:
        return 0
    result = numbers[0]
    for num in numbers[1:]:
        result -= num
    return result

def divide(numbers: list[int]) -> float:
    """Divides numbers in a list sequentially from left to right."""
    if not numbers:
        return 0.0
    result = numbers[0]
    for num in numbers[1:]:
        if num == 0:
            raise ZeroDivisionError("Division by zero")
        result /= num
    return result

# Criar agent de matemática
agent_math = Agent(
    model="gemini-2.0-flash-001",
    name="agent_math",
    description="Agent especializado em cálculos matemáticos",
    instruction="Use as funções disponíveis para resolver cálculos matemáticos.",
    tools=[add, multiply, subtract, divide]
)
```

#### 3. Agent de Síntese (Summary Agent)

```python
# agent_summary/agent.py
from google.adk.agents import Agent
from google.genai import types

summary_instruction_prompt = """
Prompt for agent_summary:

You are agent_summary, a friendly, patient, and encouraging teaching assistant simulator. 
Your primary role is to communicate feedback and results to a young student in a clear, 
positive, and easy-to-understand manner.

You will receive input from two other agents:

agent_grammar Output:
- corrected_query: The grammatically correct version of the student's original question.
- grammar_explanation: An explanation of the grammatical errors found.

agent_math Output:
- math_result: The numerical answer or result of the calculation requested.
- calculation_steps: If available, the steps taken to reach the result.

Your Task:
Combine the information from agent_grammar and agent_math into a single, coherent 
response addressed directly to the student. Your response should:

1. Adopt a Teacher-to-Child Tone: Be warm, friendly, positive, and encouraging.
2. Acknowledge the Question: Start with a friendly greeting.
3. Address the Grammar: Gently introduce grammar feedback as helpful advice.
4. Address the Math: Clearly present the math result.
5. Provide Encouragement: End with positive reinforcement.

Example Response Structure:
"Hi there! That's a great question you asked! 😊

First, let's look at how we asked it. Instead of [original], saying it like this: 
'[Corrected Query]' is perfect. The little change we made was [Simple Grammar Explanation].

Now, for the math part you asked about! The answer is: [Math Result].

Great job asking your question and doing the math thinking! Keep up the fantastic work! ✨"
"""

# Criar agent de síntese
agent_summary = Agent(
    model="gemini-2.0-flash-001",
    name="agent_summary",
    description="Synthesizes grammar corrections and math results into a friendly response",
    instruction=summary_instruction_prompt,
    generate_content_config=types.GenerateContentConfig(temperature=0.2),
)
```

#### 4. Orquestração Multi-Agent

```python
# chapter3_main_multi_agent.py
from google.adk.agents import SequentialAgent
from google.adk.tools.agent_tool import AgentTool

# Criar agent orquestrador
orchestrator_agent = SequentialAgent(
    model="gemini-2.0-flash-001",
    name="orchestrator",
    description="Orchestrates multiple specialized agents",
    instruction="Coordinate between grammar and math agents to provide comprehensive responses.",
    sub_agents=[
        AgentTool(agent=agent_grammar, name="grammar_agent"),
        AgentTool(agent=agent_math, name="math_agent"),
        AgentTool(agent=agent_summary, name="summary_agent")
    ]
)

# Executar conversação
async def run_conversation(query: str):
    session_service = InMemorySessionService()
    artifact_service = InMemoryArtifactService()
    
    session = await session_service.create_session(
        app_name='multi_agent',
        user_id="student",
        session_id="learning_session"
    )
    
    content = types.Content(role='user', parts=[types.Part(text=query)])
    
    runner = Runner(
        app_name='multi_agent',
        agent=orchestrator_agent,
        artifact_service=artifact_service,
        session_service=session_service
    )
    
    events = runner.run_async(
        user_id="student",
        session_id="learning_session",
        new_message=content
    )
    
    async for event in events:
        if event.is_final_response():
            return event.content.parts[0].text
```

### Padrões Observados no Google ADK

1. **Especialização por Domínio**: Cada agent tem responsabilidade específica
2. **Tools Bem Documentadas**: Docstrings detalhadas com exemplos
3. **Orquestração Inteligente**: SequentialAgent coordena múltiplos agents
4. **Tom Conversacional**: Respostas amigáveis e encorajadoras
5. **Sessões Persistentes**: Gerenciamento de estado da conversa

## 🧠 Agno Framework - Agent Conversacional Financeiro

### Exemplo: Agent de Análise Financeira

```python
# reasoning_finance_agent.py
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.reasoning import ReasoningTools
from agno.tools.yfinance import YFinanceTools

# Criar agent financeiro conversacional
finance_agent = Agent(
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
    instructions="""
    You are a friendly financial advisor. Help users understand:
    - Stock prices and trends
    - Company information and news
    - Analyst recommendations
    - Market insights
    
    Always explain financial concepts in simple terms and provide context.
    Use tables to display data clearly.
    Be encouraging and educational in your responses.
    """,
    markdown=True,
)

# Exemplo de conversação
async def chat_with_finance_agent():
    responses = await finance_agent.chat([
        "What's the current price of Apple stock?",
        "Can you explain what this means for investors?",
        "What do analysts think about Apple's future?"
    ])
    
    for response in responses:
        print(f"Agent: {response.content}")
```

### Padrões Observados no Agno

1. **Tools Especializadas**: YFinance, Reasoning integrados
2. **Multi-Modalidade**: Suporte para diferentes tipos de input
3. **Conversação Natural**: Interface de chat fluida
4. **Explicações Educativas**: Foco em educar o usuário
5. **Markdown Formatado**: Respostas bem estruturadas

## ⚡ Mastra Framework - Agent Conversacional TypeScript

### Exemplo: Agent de Suporte ao Cliente

```typescript
// customer-support-agent.ts
import { Agent } from '@mastra/core';
import { z } from 'zod';

// Tools para suporte ao cliente
const customerSupportTools = [
    {
        name: 'search_knowledge_base',
        description: 'Search the knowledge base for relevant articles',
        inputSchema: z.object({
            query: z.string().describe('Search query for knowledge base'),
            category: z.string().optional().describe('Category to search in')
        }),
        execute: async (input: { query: string; category?: string }) => {
            // Implementação da busca na base de conhecimento
            return {
                articles: [
                    { title: 'How to reset password', url: '/kb/reset-password' },
                    { title: 'Account settings guide', url: '/kb/account-settings' }
                ],
                relevance_score: 0.95
            };
        }
    },
    {
        name: 'create_support_ticket',
        description: 'Create a new support ticket for the customer',
        inputSchema: z.object({
            subject: z.string().describe('Ticket subject'),
            description: z.string().describe('Detailed description of the issue'),
            priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('Ticket priority'),
            category: z.string().describe('Issue category')
        }),
        execute: async (input: { subject: string; description: string; priority: string; category: string }) => {
            // Implementação da criação de ticket
            return {
                ticket_id: 'TKT-2024-001',
                status: 'open',
                estimated_response_time: '2-4 hours'
            };
        }
    },
    {
        name: 'get_account_info',
        description: 'Retrieve customer account information',
        inputSchema: z.object({
            customer_id: z.string().describe('Customer ID to look up')
        }),
        execute: async (input: { customer_id: string }) => {
            // Implementação da busca de informações da conta
            return {
                customer_name: 'John Doe',
                account_type: 'premium',
                subscription_status: 'active',
                last_login: '2024-01-15T10:30:00Z'
            };
        }
    }
];

// Criar agent de suporte ao cliente
const customerSupportAgent = new Agent({
    model: 'gpt-4',
    instructions: `
    You are a helpful customer support agent. Your role is to:
    
    1. Be friendly and professional
    2. Understand customer issues quickly
    3. Search knowledge base for relevant solutions
    4. Create support tickets when needed
    5. Provide clear, actionable guidance
    6. Escalate complex issues appropriately
    
    Always acknowledge the customer's concern and show empathy.
    Use the available tools to provide accurate information.
    If you can't solve an issue, create a support ticket.
    `,
    tools: customerSupportTools
});

// Exemplo de conversação
async function handleCustomerInquiry(message: string) {
    const response = await customerSupportAgent.run(message);
    
    console.log('Customer:', message);
    console.log('Agent:', response.content);
    
    // Verificar se tools foram executadas
    if (response.tool_calls) {
        console.log('Tools executed:', response.tool_calls);
    }
    
    return response;
}

// Exemplos de uso
const conversations = [
    "I can't log into my account",
    "How do I reset my password?",
    "I need help with billing",
    "My subscription was cancelled by mistake"
];

for (const message of conversations) {
    await handleCustomerInquiry(message);
}
```

### Padrões Observados no Mastra

1. **TypeScript Nativo**: Schemas tipados com Zod
2. **Tools Específicas**: Por domínio (suporte ao cliente)
3. **Conversação Estruturada**: Interface clara de input/output
4. **Tratamento de Erros**: Escalação automática de problemas
5. **Logging Detalhado**: Rastreamento de execução de tools

## 🔄 Comparação com Kodus Flow

### Similaridades nos Padrões

1. **Tools como Funções**: Todos usam funções como tools
2. **Conversação Natural**: Interface amigável para o usuário
3. **Especialização**: Agents focados em domínios específicos
4. **Orquestração**: Coordenação entre múltiplos agents

### Diferenças do Kodus Flow

1. **Simplicidade**: Usuário só implementa `think()`
2. **Execução Autônoma**: Framework gerencia tools automaticamente
3. **Enhanced Context**: Acesso rico a todas as funcionalidades
4. **Router Inteligente**: Seleção automática de tools

## 📋 Lições para Agentes de Conversação

### ✅ Padrões Recomendados

1. **Tom Conversacional**: Respostas amigáveis e naturais
2. **Especialização**: Agents focados em domínios específicos
3. **Tools Bem Documentadas**: Docstrings detalhadas
4. **Tratamento de Erros**: Escalação e fallbacks
5. **Contexto Persistente**: Manter histórico da conversa

### 🎯 Implementação no Kodus Flow

```typescript
// Exemplo de agent de conversação no Kodus Flow
orchestration.createAgent({
    name: 'conversational-agent',
    description: 'Agent de conversação amigável e útil',
    executionMode: 'simple',
    
    // ✅ HABILITAR: Execução autônoma de tools
    enableAutonomousToolExecution: true,
    toolExecutionStrategy: 'adaptive',
    
    // ✅ CONFIGURAR: Router para inteligência
    routerConfig: {
        name: 'conversation-router',
        enableAdaptiveStrategy: true,
        toolExecutionConstraints: {
            maxConcurrency: 3,
            defaultTimeout: 10000,
            qualityThreshold: 0.8,
            failFast: false,
        },
    },
    
    // ✅ FUNÇÃO THINK: Lógica conversacional
    think: async (input: string, context: Record<string, unknown>) => {
        // O framework já fornece:
        // - context.tools: Tools disponíveis
        // - context.memory: Histórico da conversa
        // - context.state: Estado atual
        // - context.observability: Logging e métricas
        
        return {
            reasoning: 'Analisando pergunta do usuário e selecionando tools apropriadas',
            action: {
                type: 'final_answer',
                content: 'Resposta amigável e contextualizada baseada nas tools executadas'
            }
        };
    }
});
```

## 🎯 Conclusão

Os exemplos mostram que agentes de conversação bem-sucedidos compartilham:

1. **Simplicidade para o usuário**: Interface natural
2. **Tools especializadas**: Por domínio específico
3. **Tom conversacional**: Respostas amigáveis
4. **Contexto persistente**: Manter histórico
5. **Tratamento de erros**: Fallbacks e escalação

O Kodus Flow está no caminho certo com sua abordagem de **simplicidade para o usuário** e **execução autônoma de tools**. 
