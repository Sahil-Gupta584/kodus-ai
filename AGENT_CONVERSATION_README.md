# Agente de Conversação - Kodus AI

## Visão Geral

O Agente de Conversação é um novo agente especializado em permitir que usuários conversem com seu código através de Pull Requests (PRs). Este agente utiliza o SDK Kodus Flow para processar conversas e fornecer respostas contextualizadas sobre o código.

## Funcionalidades Atuais

### Agente de Conversação Inteligente

- ✅ Endpoint básico funcionando
- ✅ Análise de contexto e intenção
- ✅ Integração com Kodus Flow
- ✅ Integração com LLM Provider (OpenAI, Anthropic, Google)
- ✅ Adapter MCP simulado
- ✅ Tools para análise de PRs e repositórios
- ✅ Respostas geradas por LLM contextualizadas

## Funcionalidades Planejadas

### Integração com MCP (Model Context Protocol)

- ✅ Adapter MCP simulado funcionando
- 🔄 Conexão real com MCP server
- 🔄 Integração com repositórios Git reais
- 🔄 Análise de código em tempo real

### Análise de PRs

- ✅ Tools simuladas para PRs funcionando
- 🔄 Leitura e análise de Pull Requests reais
- 🔄 Comentários contextuais em código
- 🔄 Sugestões de melhorias
- 🔄 Explicação de mudanças

### Conversação Contextual

- 🔄 Memória de conversas anteriores
- 🔄 Contexto de organização e usuário
- 🔄 Histórico de interações

## Como Usar

### Endpoint

```
POST /agent/conversation
```

### Request Body

```json
{
    "prompt": "Olá, como você pode me ajudar com meu código?",
    "userId": "user123",
    "organizationId": "org456"
}
```

### Response

```json
{
    "response": "Vou ajudar você com Pull Requests! Para \"Quais PRs estão abertos?\", posso analisar mudanças, sugerir melhorias e explicar o impacto das alterações.",
    "reasoning": "Usei a tool list_pull_requests para buscar informações sobre \"Quais PRs estão abertos?\"",
    "agentType": "conversation",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "context": {
        "intent": "pr",
        "urgency": "normal",
        "complexity": "simple"
    },
    "toolUsed": "list_pull_requests",
    "toolResult": {
        "success": true,
        "count": 1,
        "data": [
            {
                "number": 123,
                "title": "Add conversation agent",
                "state": "open",
                "author": "wellingtonsantana"
            }
        ]
    }
}
```

### Exemplos de Perguntas

O agente pode responder a diferentes tipos de perguntas:

#### Sobre Pull Requests

```bash
curl -X POST http://localhost:3000/agent/conversation \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Quais PRs estão abertos?"}'
```

#### Sobre Repositórios

```bash
curl -X POST http://localhost:3000/agent/conversation \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Mostra informações sobre o repositório"}'
```

#### Sobre Código

```bash
curl -X POST http://localhost:3000/agent/conversation \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Analisa o arquivo conversationAgent.ts"}'
```

## Estrutura do Código

### Arquivos Principais

1. **`src/core/infrastructure/adapters/services/agent/agents/conversationAgent.ts`**
    - Provider do agente de conversação
    - Lógica principal do agente

2. **`src/core/application/use-cases/agent/conversation-agent.use-case.ts`**
    - Use case para processar requisições
    - Validação de entrada

3. **`src/core/infrastructure/http/controllers/agent.controller.ts`**
    - Endpoint REST `/agent/conversation`
    - Interface HTTP

### Módulos

- **AgentModule**: Registra o provider e use case
- **ConversationAgentProvider**: Implementação do agente
- **ConversationAgentUseCase**: Lógica de negócio
- **LLMProviderModule**: Fornece acesso a LLMs (OpenAI, Anthropic, Google)

### Integração com LLM

O agente utiliza o `LLMProviderService` para gerar respostas contextualizadas:

- **Modelo padrão**: `OPENAI_GPT_4O_MINI`
- **Temperatura**: 0.7 (criatividade balanceada)
- **Max tokens**: 1000
- **Fallback**: Resposta estática se LLM falhar
- **Contexto**: Inclui dados das tools MCP quando disponíveis

## Próximos Passos

1. **Integração com SDK Kodus Flow**
    - Implementar `createOrchestration` e `defineAgent`
    - Configurar engine de orquestração

2. **Conexão MCP**
    - Implementar adaptadores MCP
    - Configurar ferramentas externas

3. **Análise de PRs**
    - Integração com APIs de Git (GitHub, GitLab, etc.)
    - Parser de diffs e comentários

4. **Melhorias de UX**
    - Interface de chat
    - Notificações em tempo real
    - Histórico de conversas

## Testando

Para testar o agente de conversação:

```bash
# Build do projeto
npm run build

# Iniciar o servidor
npm run start:dev

# Testar o endpoint
curl -X POST http://localhost:3000/agent/conversation \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Olá, como você pode me ajudar?"}'
```

## Contribuição

Para contribuir com o desenvolvimento do agente de conversação:

1. Siga os padrões de código existentes
2. Adicione testes para novas funcionalidades
3. Documente mudanças na API
4. Mantenha compatibilidade com versões anteriores

## Dependências

- NestJS
- Kodus Flow SDK
- LLM Provider (OpenAI, Anthropic, Google)
- MCP Protocol (simulado)
- LangChain
- Zod (validação)
