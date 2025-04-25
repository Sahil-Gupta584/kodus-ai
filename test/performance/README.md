# Testes de Performance para Kodus AI

Este diretório contém scripts para realizar testes de performance na aplicação Kodus AI, com foco especial em identificar problemas relacionados ao event loop e ao processamento de webhooks.

## Estrutura

```
/test/performance/
  ├── README.md               # Este arquivo
  ├── load-test.yml           # Configuração para testes com Artillery
  ├── monitor-event-loop.js   # Script para monitorar o event loop
  ├── simulate-webhooks.js    # Script para simular webhooks simples
  ├── simulate-full-flow.js   # Script para simular o fluxo completo
  ├── mock-llm-service.js     # Serviço de mock para LLMs
  ├── analyze-results.js      # Script para analisar resultados
  └── data/
      ├── webhooks.json       # Dados básicos de webhooks
      └── webhooks-expanded.json # Dados completos de webhooks
```

## Pré-requisitos

Instale as dependências necessárias:

```bash
npm install -g artillery
npm install axios express body-parser cors mongodb fs path
```

## Como Executar os Testes

### Opção 1: Teste Básico

1. **Monitorar o Event Loop**

   Primeiro, inicie o monitoramento do event loop em um terminal separado:

   ```bash
   node test/performance/monitor-event-loop.js
   ```

2. **Iniciar a Aplicação**

   Em outro terminal, inicie a aplicação Kodus AI normalmente:

   ```bash
   npm run start:dev
   ```

3. **Simular Webhooks Simples**

   Em um terceiro terminal, execute o script para simular webhooks básicos:

   ```bash
   node test/performance/simulate-webhooks.js
   ```

4. **Analisar os Resultados**

   ```bash
   node test/performance/analyze-results.js
   ```

### Opção 2: Simulação de Fluxo Completo

Esta opção simula o fluxo completo, incluindo processamento, banco de dados e chamadas LLM:

1. **Iniciar o Serviço de Mock LLM**

   Primeiro, inicie o serviço de mock para LLMs:

   ```bash
   node test/performance/mock-llm-service.js
   ```

2. **Monitorar o Event Loop**

   Em outro terminal, inicie o monitoramento do event loop:

   ```bash
   node test/performance/monitor-event-loop.js
   ```

3. **Iniciar a Aplicação**

   Em um terceiro terminal, inicie a aplicação Kodus AI:

   ```bash
   npm run start:dev
   ```

4. **Simular o Fluxo Completo**

   Em um quarto terminal, execute o script de simulação de fluxo completo:

   ```bash
   node test/performance/simulate-full-flow.js
   ```

   Este script irá:
   - Enviar webhooks de diferentes plataformas (GitHub, GitLab, Bitbucket)
   - Verificar o processamento no MongoDB (opcional)
   - Simular chamadas LLM sem gerar custos
   - Analisar o desempenho do sistema

5. **Analisar os Resultados Detalhados**

   Os resultados serão salvos em `full-flow-results.json` para análise posterior.

### Opção 3: Teste de Carga com Artillery (opcional)

Para um teste de carga mais completo, você pode usar o Artillery:

```bash
artillery run test/performance/load-test.yml
```

## Configuração

### Ajustando os Parâmetros de Teste

Você pode modificar os parâmetros de teste editando os arquivos de configuração:

- **simulate-webhooks.js**: Ajuste `CONFIG` para alterar o número de webhooks, intervalo, etc.
- **simulate-full-flow.js**: Configure o fluxo completo, incluindo verificação MongoDB e simulação LLM.
- **mock-llm-service.js**: Ajuste tempos de resposta e comportamento do serviço de mock LLM.
- **monitor-event-loop.js**: Ajuste o intervalo de verificação, limiar de bloqueio, etc.
- **load-test.yml**: Ajuste as fases de carga, taxas de chegada, etc.

### Personalizando os Webhooks

Edite os arquivos em `data/` para adicionar seus próprios exemplos de webhooks baseados em dados reais:

- **webhooks.json**: Webhooks básicos
- **webhooks-expanded.json**: Webhooks completos de diferentes plataformas

## Simulando Chamadas LLM

O script `mock-llm-service.js` fornece um serviço de mock para simular chamadas a APIs de LLM sem gerar custos. Ele simula:

1. Tempos de resposta realistas (configuráveis)
2. Respostas pré-definidas para diferentes tipos de análise
3. Erros ocasionais (com probabilidade configurável)

Para usar o serviço de mock LLM, você precisa:

1. Iniciar o serviço: `node test/performance/mock-llm-service.js`
2. Configurar sua aplicação para usar o endpoint de mock (temporariamente)

## Interpretando os Resultados

O script `analyze-results.js` e o relatório gerado pelo `simulate-full-flow.js` fornecem:

- Estatísticas do event loop (lag médio, máximo, períodos de bloqueio)
- Estatísticas dos webhooks (taxa de sucesso, tempo de resposta, throughput)
- Análise de processamento no MongoDB (se habilitado)
- Estatísticas de chamadas LLM simuladas
- Capacidade estimada do sistema (webhooks/segundo, webhooks/minuto)
- Análise e recomendações baseadas nos resultados

## Dicas para Diagnóstico

- **Bloqueios frequentes do event loop**: Indica operações síncronas pesadas que precisam ser movidas para workers ou processadas de forma assíncrona.
- **Picos ocasionais de lag**: Podem indicar operações em lote ou GC (Garbage Collection).
- **Tempos de resposta altos**: Considere responder aos webhooks imediatamente e processar em background.
- **Falhas em alta carga**: Podem indicar limites de recursos ou problemas de concorrência.

## Próximos Passos

Com base nos resultados, considere implementar:

1. Sistema de filas (Bull/BullMQ) para processamento assíncrono de webhooks
2. Workers para operações intensivas
3. Otimizações nas consultas ao MongoDB
4. Ajustes na concorrência e paralelismo
