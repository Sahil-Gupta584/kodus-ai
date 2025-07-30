# Gateway - Roteador Inteligente do Kodus Flow

## Visão Geral

O Gateway é um **roteador inteligente** que direciona requisições para diferentes targets (agentes, workflows, engines, funções) usando várias estratégias de roteamento. Ele atua como um orquestrador que analisa cada input e decide qual sistema é mais adequado para processá-lo.

## Conceitos Fundamentais

### Gateway Target

Um target é um destino de execução que pode processar uma determinada entrada:

```typescript
interface GatewayTarget {
    name: string;
    type: 'agent' | 'workflow' | 'engine' | 'multi_agent' | 'function';
    description?: string;
    capabilities?: string[];
    currentLoad?: number;
    costPerExecution?: number;
    executor?: Function;
}
```

**Tipos de Targets:**
- **`agent`**: Agentes individuais para tarefas específicas
- **`workflow`**: Workflows completos para processos complexos  
- **`engine`**: Engines de processamento especializados
- **`multi_agent`**: Sistemas com múltiplos agentes coordenados
- **`function`**: Funções simples para tarefas específicas

### Gateway Config

```typescript
interface GatewayConfig {
    name: string;
    strategy: 'rule_based' | 'llm_based' | 'hybrid' | 'round_robin' | 'random';
    targets?: GatewayTarget[];
    rules?: RoutingRule[];
    llmRouting?: LLMRoutingConfig;
    fallback?: FallbackConfig;
    defaultTimeout?: number;
    enableFallback?: boolean;
    // Callbacks
    onRoute?: (input: unknown, context: GatewayRoutingContext) => Promise<void>;
    onRouteComplete?: (result: unknown, target: GatewayTarget, context: GatewayRoutingContext) => Promise<void>;
    onRouteFailed?: (error: Error, context: GatewayRoutingContext) => Promise<void>;
}
```

## Estratégias de Roteamento

### 1. LLM-Based (Recomendado)
Usa IA para analisar o input e escolher o melhor target baseado nas capacidades.

```typescript
const gateway = createGateway({
    name: 'intelligent-gateway',
    strategy: 'llm_based',
    targets: [
        {
            name: 'bug-fixer',
            type: 'agent',
            description: 'Especialista em correção de bugs',
            capabilities: ['bug-fixing', 'code-analysis', 'debugging']
        },
        {
            name: 'researcher', 
            type: 'agent',
            description: 'Especialista em pesquisa e análise',
            capabilities: ['research', 'data-analysis', 'information-gathering']
        }
    ]
});

// O LLM analisa e roteia automaticamente
await gateway.route("Tem um bug no sistema de autenticação");
// → Provavelmente roteará para 'bug-fixer'

await gateway.route("Preciso pesquisar sobre tendências de mercado");
// → Provavelmente roteará para 'researcher'
```

### 2. Rule-Based
Usa regras predefinidas para decidir o roteamento.

```typescript
const gateway = createGateway({
    name: 'rule-based-gateway',
    strategy: 'rule_based',
    rules: [
        {
            condition: (input) => input.includes('bug') || input.includes('erro'),
            targetName: 'bug-fixer'
        },
        {
            condition: (input) => input.includes('pesquis') || input.includes('analise'),
            targetName: 'researcher'
        }
    ],
    targets: [/* targets */]
});
```

### 3. Hybrid
Combina regras com LLM como fallback.

```typescript
const gateway = createGateway({
    name: 'hybrid-gateway',
    strategy: 'hybrid',
    rules: [/* regras específicas */],
    llmRouting: {
        provider: 'openai',
        model: 'gpt-4',
        fallback: true
    }
});
```

### 4. Round Robin
Distribui requisições em ordem circular entre targets.

```typescript
const gateway = createGateway({
    name: 'load-balanced-gateway',
    strategy: 'round_robin',
    targets: [
        { name: 'worker-1', type: 'agent' },
        { name: 'worker-2', type: 'agent' },
        { name: 'worker-3', type: 'agent' }
    ]
});
```

## Exemplos Práticos

### 1. Gateway para Desenvolvimento de Software

```typescript
import { createGateway } from '@kodus/flow';

const devGateway = createGateway({
    name: 'software-development-gateway',
    strategy: 'llm_based',
    targets: [
        {
            name: 'code-reviewer',
            type: 'agent',
            description: 'Analisa código e identifica problemas',
            capabilities: ['code-review', 'quality-analysis', 'best-practices'],
            costPerExecution: 0.05
        },
        {
            name: 'bug-hunter',
            type: 'agent', 
            description: 'Especialista em encontrar e corrigir bugs',
            capabilities: ['bug-detection', 'debugging', 'error-analysis'],
            costPerExecution: 0.03
        },
        {
            name: 'security-scanner',
            type: 'workflow',
            description: 'Workflow completo de análise de segurança',
            capabilities: ['security-analysis', 'vulnerability-scan', 'penetration-testing'],
            costPerExecution: 0.10
        },
        {
            name: 'documentation-generator',
            type: 'function',
            description: 'Gera documentação automaticamente',
            capabilities: ['documentation', 'api-docs', 'code-comments'],
            costPerExecution: 0.02
        }
    ],
    fallback: {
        targetName: 'code-reviewer',
        strategy: 'default'
    },
    defaultTimeout: 30000
});

// Exemplos de uso
console.log('🚀 Demonstração do Gateway de Desenvolvimento');

// 1. Análise de código
const codeReview = await devGateway.route(`
    Analise este código JavaScript:
    
    function login(user, pass) {
        if (user == 'admin' && pass == '123') {
            return true;
        }
        return false;
    }
`);

// 2. Detecção de bug
const bugAnalysis = await devGateway.route(`
    Minha aplicação está crashando com erro "Cannot read property 'length' of undefined"
    quando tento acessar array.length após um fetch da API
`);

// 3. Análise de segurança
const securityScan = await devGateway.route(`
    Faça uma análise de segurança completa desta API:
    - Endpoint de login sem rate limiting
    - Senhas armazenadas em texto plano
    - Tokens JWT sem expiração
`);

// 4. Geração de documentação
const docGeneration = await devGateway.route(`
    Gere documentação para esta função:
    
    function calculateDiscount(price, userType, coupon) {
        // Lógica de desconto complexa
    }
`);
```

### 2. Gateway para Atendimento ao Cliente

```typescript
const customerServiceGateway = createGateway({
    name: 'customer-service-gateway',
    strategy: 'hybrid',
    rules: [
        {
            condition: (input) => input.toLowerCase().includes('urgente') || input.includes('!!!'),
            targetName: 'priority-agent'
        },
        {
            condition: (input) => input.toLowerCase().includes('técnico') || input.includes('bug'),
            targetName: 'technical-support'
        }
    ],
    targets: [
        {
            name: 'general-support',
            type: 'agent',
            description: 'Atendimento geral ao cliente',
            capabilities: ['customer-service', 'general-inquiries', 'basic-support'],
            currentLoad: 0.3
        },
        {
            name: 'technical-support',
            type: 'multi_agent',
            description: 'Suporte técnico especializado',
            capabilities: ['technical-support', 'troubleshooting', 'advanced-diagnostics'],
            currentLoad: 0.7
        },
        {
            name: 'priority-agent',
            type: 'agent',
            description: 'Agente para casos prioritários',
            capabilities: ['priority-support', 'escalation', 'crisis-management'],
            currentLoad: 0.1
        },
        {
            name: 'billing-specialist',
            type: 'workflow',
            description: 'Workflow para questões de faturamento',
            capabilities: ['billing', 'payments', 'refunds', 'invoicing'],
            currentLoad: 0.4
        }
    ],
    llmRouting: {
        provider: 'openai',
        model: 'gpt-4',
        systemPrompt: `
            Você é um roteador de atendimento ao cliente. Analise a mensagem e escolha o melhor agente:
            - general-support: dúvidas gerais, informações básicas
            - technical-support: problemas técnicos, bugs, troubleshooting
            - priority-agent: casos urgentes, reclamações graves
            - billing-specialist: questões de pagamento, faturamento, reembolsos
        `
    }
});

// Exemplos
await customerServiceGateway.route("URGENTE: Meu sistema está fora do ar há 2 horas!!!");
// → Roteado para 'priority-agent' (regra)

await customerServiceGateway.route("Como faço para alterar meu plano?");
// → Roteado para 'general-support' (LLM)

await customerServiceGateway.route("Erro 500 na API de pagamentos");
// → Roteado para 'technical-support' (regra)

await customerServiceGateway.route("Preciso de reembolso da cobrança duplicada");
// → Roteado para 'billing-specialist' (LLM)
```

### 3. Gateway para Análise de Dados

```typescript
const dataAnalysisGateway = createGateway({
    name: 'data-analysis-gateway',
    strategy: 'llm_based',
    targets: [
        {
            name: 'sql-analyst',
            type: 'agent',
            description: 'Especialista em consultas SQL e análise de banco de dados',
            capabilities: ['sql-queries', 'database-analysis', 'data-extraction']
        },
        {
            name: 'ml-engineer',
            type: 'workflow',
            description: 'Pipeline completo de machine learning',
            capabilities: ['machine-learning', 'predictive-analysis', 'model-training']
        },
        {
            name: 'report-generator',
            type: 'function',
            description: 'Gera relatórios e visualizações',
            capabilities: ['reporting', 'data-visualization', 'charts']
        },
        {
            name: 'data-cleaner',
            type: 'agent',
            description: 'Limpa e normaliza dados',
            capabilities: ['data-cleaning', 'normalization', 'validation']
        }
    ]
});

// Casos de uso
await dataAnalysisGateway.route("Quero uma consulta SQL para encontrar os top 10 clientes por faturamento");
// → 'sql-analyst'

await dataAnalysisGateway.route("Preciso treinar um modelo para prever churn de clientes");
// → 'ml-engineer'

await dataAnalysisGateway.route("Gere um dashboard com métricas de vendas do último trimestre");
// → 'report-generator'

await dataAnalysisGateway.route("Tenho dados duplicados e inconsistentes no dataset");
// → 'data-cleaner'
```

## Características Avançadas

### 1. Callbacks e Monitoring

```typescript
const gateway = createGateway({
    name: 'monitored-gateway',
    strategy: 'llm_based',
    targets: [/* targets */],
    
    // Callback antes do roteamento
    onRoute: async (input, context) => {
        console.log(`🔀 Roteando: ${input}`);
        console.log(`📊 Context: ${JSON.stringify(context)}`);
    },
    
    // Callback após sucesso
    onRouteComplete: async (result, target, context) => {
        console.log(`✅ Roteado para ${target.name}`);
        console.log(`⏱️ Tempo: ${Date.now() - context.startTime}ms`);
    },
    
    // Callback em caso de erro
    onRouteFailed: async (error, context) => {
        console.error(`❌ Falha no roteamento: ${error.message}`);
        // Enviar para sistema de monitoramento
    }
});
```

### 2. Métricas e Estatísticas

```typescript
// Obter estatísticas do gateway
const stats = gateway.getStats();
console.log(`
📊 Gateway Stats:
- Total de rotas: ${stats.totalRoutes}
- Taxa de sucesso: ${(stats.successfulRoutes / stats.totalRoutes * 100).toFixed(1)}%
- Latência média: ${stats.averageLatency}ms

🎯 Stats por Target:
${Object.entries(stats.targetStats).map(([name, stat]) => 
    `- ${name}: ${stat.routeCount} rotas, ${stat.successRate}% sucesso`
).join('\n')}
`);
```

### 3. Integração com Workflows

```typescript
// Gateway pode ser usado como step em workflows
const workflow = createWorkflow({
    name: 'intelligent-processing',
    steps: [
        // Input validation
        validateInput.toStep('validate'),
        
        // Intelligent routing
        gateway.toStep('route'),
        
        // Result processing
        processResult.toStep('process')
    ]
});
```

## Comparação: Gateway vs Router

| Aspecto | Gateway | Router |
|---------|---------|---------|
| **Propósito** | Roteador inteligente alto nível | Roteador simples baseado em schemas |
| **Estratégias** | LLM, regras, híbrido, round-robin | Schema matching com Zod |
| **Targets** | Agents, workflows, engines, functions | Apenas agents |
| **Inteligência** | IA analisa input e capacidades | Matching baseado em schema |
| **Métricas** | Performance, latência, custo | Básicas |
| **Fallback** | Sistema robusto de fallback | Fallback simples |
| **Uso** | Orquestração de sistemas complexos | Roteamento direto baseado em tipo |

## Casos de Uso Ideais

### Use Gateway quando:
- ✅ Precisar de roteamento inteligente baseado em contexto
- ✅ Tiver múltiplos tipos de targets (agents, workflows, engines)
- ✅ Quiser balanceamento de carga automático
- ✅ Precisar de métricas detalhadas e monitoring
- ✅ Tiver requisitos de fallback complexos

### Use Router quando:
- ✅ Precisar de roteamento simples baseado em schemas
- ✅ Tiver apenas agents como targets
- ✅ Quiser performance máxima com overhead mínimo
- ✅ Precisar de roteamento determinístico

## Conclusão

O Gateway é uma peça fundamental para criar sistemas inteligentes e adaptativos. Ele permite que você:

1. **Distribua inteligentemente** o trabalho entre diferentes sistemas
2. **Otimize performance** através de balanceamento de carga
3. **Monitore e analise** o comportamento do sistema
4. **Implemente fallbacks robustos** para garantir disponibilidade
5. **Escale facilmente** adicionando novos targets

Use o Gateway quando precisar de um orquestrador inteligente que toma decisões baseadas no contexto e nas capacidades dos sistemas disponíveis.