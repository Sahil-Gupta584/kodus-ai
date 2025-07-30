# 🤖 Kodus Flow - Agent & Tool Examples

Este documento mostra todas as variações e possibilidades de uso de Agents e Tools no Kodus Flow.

## 📋 Índice

- [1. Agents Básicos](#1-agents-básicos)
- [2. Tools](#2-tools)
- [3. Agents com Tools](#3-agents-com-tools)
- [4. Multi-Agent Systems](#4-multi-agent-systems)
- [5. Planners (CoT/ToT)](#5-planners-cottot)
- [6. Pipelines](#6-pipelines)
- [7. Routers Inteligentes](#7-routers-inteligentes)
- [8. Estado Persistente](#8-estado-persistente)
- [9. Review Quality Agent (Caso Real)](#9-review-quality-agent-caso-real)

---

## 1. Agents Básicos

### 1.1 Agent Simples
```typescript
import { createOrchestration } from '@kodus/flow';

const orchestration = createOrchestration();

const simpleAgent = orchestration.createAgent({
  name: "hello-agent",
  description: "Agent que cumprimenta",
  
  think: async (input: string, context) => {
    return {
      reasoning: `Recebi o input: "${input}" e vou cumprimentar`,
      action: {
        type: 'final_answer',
        content: `Olá! Você disse: ${input}`
      }
    };
  }
});

// Uso
const result = await orchestration.callAgent("hello-agent", "Oi!");
console.log(result.data); // "Olá! Você disse: Oi!"
```

### 1.2 Agent com Lógica Complexa
```typescript
const analysisAgent = orchestration.createAgent({
  name: "code-analyzer",
  description: "Analisa qualidade de código",
  
  think: async (code: string, context) => {
    // Análise de complexidade
    const lines = code.split('\n').length;
    const functions = (code.match(/function|=>/g) || []).length;
    const complexity = functions > 10 ? 'high' : lines > 100 ? 'medium' : 'low';
    
    // Score baseado em métricas
    let score = 100;
    if (complexity === 'high') score -= 30;
    if (lines > 200) score -= 20;
    if (!code.includes('test')) score -= 15;
    
    return {
      reasoning: `Analisei ${lines} linhas, ${functions} funções. Complexidade: ${complexity}`,
      action: {
        type: 'final_answer',
        content: {
          score,
          complexity,
          metrics: { lines, functions },
          suggestions: score < 70 ? ['Adicionar testes', 'Refatorar funções'] : []
        }
      }
    };
  }
});
```

### 1.3 Agent com Lifecycle Hooks
```typescript
const lifecycleAgent = orchestration.createAgent({
  name: "lifecycle-agent",
  
  onStart: async (input, context) => {
    console.log(`🚀 Agent iniciado para: ${input}`);
    context.state.set('startTime', Date.now());
  },
  
  think: async (input, context) => {
    const startTime = context.state.get('startTime');
    
    return {
      reasoning: "Processando com lifecycle completo",
      action: { type: 'final_answer', content: `Processado em ${Date.now() - startTime}ms` }
    };
  },
  
  onFinish: async (result, context) => {
    console.log(`✅ Agent finalizado: ${result}`);
  },
  
  onError: async (error, context) => {
    console.error(`❌ Erro no agent: ${error.message}`);
  }
});
```

---

## 2. Tools

### 2.1 Tool Básico
```typescript
const gitTool = orchestration.createTool({
  name: "git-status",
  description: "Verifica status do git",
  
  execute: async ({ path = '.' }) => {
    const { execSync } = require('child_process');
    const status = execSync('git status --porcelain', { cwd: path }).toString();
    
    return {
      hasChanges: status.length > 0,
      files: status.split('\n').filter(line => line.trim()),
      clean: status.length === 0
    };
  }
});
```

### 2.2 Tool com Validação
```typescript
const fileAnalyzerTool = orchestration.createTool({
  name: "file-analyzer",
  description: "Analisa arquivos do projeto",
  
  execute: async ({ filePath, analysisType = 'basic' }) => {
    if (!filePath) {
      throw new Error('filePath é obrigatório');
    }
    
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(filePath)) {
      return { error: 'Arquivo não encontrado', exists: false };
    }
    
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const analysis = {
      basic: {
        size: stats.size,
        lines: content.split('\n').length,
        extension: path.extname(filePath)
      },
      detailed: {
        size: stats.size,
        lines: content.split('\n').length,
        words: content.split(/\s+/).length,
        chars: content.length,
        functions: (content.match(/function|=>/g) || []).length,
        imports: (content.match(/import|require/g) || []).length,
        extension: path.extname(filePath),
        lastModified: stats.mtime
      }
    };
    
    return analysis[analysisType] || analysis.basic;
  }
});
```

### 2.3 Tool Assíncrono com API
```typescript
const apiTool = orchestration.createTool({
  name: "github-pr-info",
  description: "Busca informações de PR do GitHub",
  
  execute: async ({ owner, repo, prNumber, token }) => {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const pr = await response.json();
    
    return {
      title: pr.title,
      description: pr.body,
      author: pr.user.login,
      status: pr.state,
      filesChanged: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      reviewers: pr.requested_reviewers.map(r => r.login),
      labels: pr.labels.map(l => l.name)
    };
  }
});
```

---

## 3. Agents com Tools

### 3.1 Agent que usa Tools
```typescript
const codeReviewAgent = orchestration.createAgent({
  name: "code-review-agent",
  description: "Agent que faz review de código usando tools",
  tools: [fileAnalyzerTool, gitTool],
  
  think: async (input, context) => {
    const { filePath } = input;
    
    // Usar tool para analisar arquivo
    const fileAnalysis = await context.availableTools
      .find(t => t.name === 'file-analyzer')
      ?.execute({ filePath, analysisType: 'detailed' });
    
    // Usar tool para verificar git status
    const gitStatus = await context.availableTools
      .find(t => t.name === 'git-status')
      ?.execute({ path: '.' });
    
    // Análise baseada nos resultados das tools
    let score = 100;
    let issues = [];
    
    if (fileAnalysis.lines > 300) {
      score -= 20;
      issues.push('Arquivo muito grande (>300 linhas)');
    }
    
    if (fileAnalysis.functions > 15) {
      score -= 15;
      issues.push('Muitas funções no arquivo');
    }
    
    if (!gitStatus.clean) {
      issues.push('Existem mudanças não commitadas');
    }
    
    return {
      reasoning: `Analisei ${fileAnalysis.lines} linhas, ${fileAnalysis.functions} funções. Git status: ${gitStatus.clean ? 'limpo' : 'com mudanças'}`,
      action: {
        type: 'final_answer',
        content: {
          score,
          issues,
          fileAnalysis,
          gitStatus
        }
      }
    };
  }
});
```

### 3.2 Agent com Multiple Tools
```typescript
const prReviewAgent = orchestration.createAgent({
  name: "pr-review-agent",
  tools: [gitTool, fileAnalyzerTool, apiTool],
  
  think: async (input, context) => {
    const { owner, repo, prNumber, token } = input;
    
    // 1. Buscar info do PR
    const prInfo = await context.availableTools
      .find(t => t.name === 'github-pr-info')
      ?.execute({ owner, repo, prNumber, token });
    
    // 2. Verificar status local
    const gitStatus = await context.availableTools
      .find(t => t.name === 'git-status')
      ?.execute({});
    
    // 3. Analisar arquivos principais (simulado)
    const fileAnalyses = [];
    
    // Análise completa
    const reviewScore = this.calculateReviewScore(prInfo, gitStatus, fileAnalyses);
    
    return {
      reasoning: `Revisei PR #${prNumber}: ${prInfo.filesChanged} arquivos, ${prInfo.additions}+ ${prInfo.deletions}-`,
      action: {
        type: 'final_answer',
        content: {
          prInfo,
          reviewScore,
          recommendations: this.generateRecommendations(reviewScore, prInfo)
        }
      }
    };
  },
  
  calculateReviewScore(prInfo, gitStatus, fileAnalyses) {
    let score = 100;
    
    // Penalizar PRs muito grandes
    if (prInfo.filesChanged > 20) score -= 30;
    if (prInfo.additions > 500) score -= 20;
    
    // Bonus para PRs com descrição
    if (prInfo.description && prInfo.description.length > 50) score += 10;
    
    return Math.max(0, Math.min(100, score));
  },
  
  generateRecommendations(score, prInfo) {
    const recommendations = [];
    
    if (score < 70) {
      recommendations.push('Considere dividir este PR em partes menores');
    }
    
    if (!prInfo.description) {
      recommendations.push('Adicione uma descrição detalhada ao PR');
    }
    
    if (prInfo.reviewers.length === 0) {
      recommendations.push('Adicione reviewers ao PR');
    }
    
    return recommendations;
  }
});
```

---

## 4. Multi-Agent Systems

### 4.1 Multi-Agent Simples
```typescript
// Criando agents especializados
const securityAgent = orchestration.createAgent({
  name: "security-agent",
  think: async (code, context) => {
    const securityIssues = [];
    
    if (code.includes('eval(')) securityIssues.push('Uso perigoso de eval()');
    if (code.includes('innerHTML')) securityIssues.push('Possível XSS via innerHTML');
    if (code.includes('document.write')) securityIssues.push('Uso de document.write');
    
    return {
      reasoning: `Análise de segurança encontrou ${securityIssues.length} issues`,
      action: {
        type: 'final_answer',
        content: { securityScore: securityIssues.length === 0 ? 100 : 70, issues: securityIssues }
      }
    };
  }
});

const performanceAgent = orchestration.createAgent({
  name: "performance-agent",
  think: async (code, context) => {
    const perfIssues = [];
    
    if (code.includes('for') && code.includes('for')) perfIssues.push('Possível loop aninhado');
    if (code.includes('setTimeout') && code.includes('setInterval')) perfIssues.push('Múltiplos timers');
    
    return {
      reasoning: `Análise de performance encontrou ${perfIssues.length} issues`,
      action: {
        type: 'final_answer',
        content: { performanceScore: perfIssues.length === 0 ? 100 : 80, issues: perfIssues }
      }
    };
  }
});

// Multi-agent coordination
const reviewTeam = orchestration.createMultiAgent(
  "code-review-team",
  "Time especializado de review",
  {
    agents: [codeReviewAgent, securityAgent, performanceAgent]
  }
);
```

### 4.2 Multi-Agent com Orquestração
```typescript
const orchestratorAgent = orchestration.createAgent({
  name: "review-orchestrator",
  
  think: async (input, context) => {
    const { code, filePath } = input;
    
    // 1. Executar análises em paralelo
    const [codeAnalysis, securityAnalysis, perfAnalysis] = await Promise.all([
      orchestration.callAgent("code-review-agent", { filePath }),
      orchestration.callAgent("security-agent", code),
      orchestration.callAgent("performance-agent", code)
    ]);
    
    // 2. Consolidar resultados
    const overallScore = (
      codeAnalysis.data.score + 
      securityAnalysis.data.securityScore + 
      perfAnalysis.data.performanceScore
    ) / 3;
    
    // 3. Gerar relatório consolidado
    const allIssues = [
      ...(codeAnalysis.data.issues || []),
      ...(securityAnalysis.data.issues || []),
      ...(perfAnalysis.data.issues || [])
    ];
    
    return {
      reasoning: `Consolidei análises de ${3} agents especializados`,
      action: {
        type: 'final_answer',
        content: {
          overallScore,
          breakdown: {
            code: codeAnalysis.data.score,
            security: securityAnalysis.data.securityScore,
            performance: perfAnalysis.data.performanceScore
          },
          allIssues,
          recommendation: overallScore >= 80 ? 'APPROVE' : overallScore >= 60 ? 'REQUEST_CHANGES' : 'REJECT'
        }
      }
    };
  }
});
```

---

## 5. Planners (CoT/ToT)

### 5.1 Chain-of-Thought (CoT) Planner
```typescript
const cotAnalysisAgent = orchestration.createAgent({
  name: "cot-analysis-agent",
  
  think: async (input, context) => {
    // O planner vai executar isso em múltiplos passos iterativos
    const complexity = input.complexity || 'medium';
    
    return {
      reasoning: "Vou analisar este problema passo a passo...",
      action: {
        type: 'final_answer',
        content: `Análise CoT para complexidade ${complexity}`
      }
    };
  }
});

// Criar planner CoT
const cotPlanner = orchestration.createPlanner({
  strategy: 'cot',
  complexity: 'medium',
  maxSteps: 5
});

// Usar o planner (ele vai fazer loop iterativo automaticamente)
const result = await cotPlanner.plan(
  { code: "function test() {}", complexity: "high" },
  context,
  cotAnalysisAgent.think
);

console.log(result.planningSteps); // ["Initial problem analysis", "Reasoning refinement", ...]
console.log(result.confidence); // 0.85
```

### 5.2 Tree-of-Thoughts (ToT) Planner
```typescript
const totAgent = orchestration.createAgent({
  name: "tot-exploration-agent",
  
  think: async (input, context) => {
    // Cada chamada vai gerar uma "branch" diferente no tree
    const explorationIndex = context.explorationIndex || 0;
    const depth = context.currentDepth || 0;
    
    return {
      reasoning: `Explorando branch ${explorationIndex} na depth ${depth}`,
      action: {
        type: 'final_answer',
        content: `Solução ${explorationIndex} (depth ${depth})`
      }
    };
  }
});

const totPlanner = orchestration.createPlanner({
  strategy: 'tot',
  maxDepth: 3,
  branchingFactor: 2
});

const totResult = await totPlanner.plan(
  { problem: "Complex architectural decision" },
  context,
  totAgent.think
);

console.log(totResult.metadata.exploredNodes); // 7 (1 root + 2*3 levels)
console.log(totResult.metadata.selectedPath); // ["node1", "node3", "node6"]
```

### 5.3 Dynamic Planner (Auto-select)
```typescript
const smartAgent = orchestration.createAgent({
  name: "smart-adaptive-agent",
  
  think: async (input, context) => {
    // O planner dinâmico vai escolher CoT ou ToT baseado na complexidade
    return {
      reasoning: "Adaptando estratégia baseada no contexto...",
      action: { type: 'final_answer', content: input }
    };
  }
});

const dynamicPlanner = orchestration.createPlanner({
  strategy: 'dynamic', // Auto-seleciona CoT ou ToT
  complexity: 'high'   // Alta complexidade = ToT, baixa = CoT
});

// Para problema simples, usará CoT
const simpleResult = await dynamicPlanner.plan(
  { taskComplexity: 'low', problem: "Simple validation" },
  context,
  smartAgent.think
);

// Para problema complexo, usará ToT
const complexResult = await dynamicPlanner.plan(
  { taskComplexity: 'high', problem: "Architecture design" },
  context,
  smartAgent.think
);
```

---

## 6. Pipelines

### 6.1 Pipeline Sequencial
```typescript
// Agents que serão usados no pipeline
const lintAgent = orchestration.createAgent({
  name: "lint-agent",
  think: async (code, context) => ({
    reasoning: "Executando lint...",
    action: { type: 'final_answer', content: { lintPassed: true, code } }
  })
});

const testAgent = orchestration.createAgent({
  name: "test-agent", 
  think: async (input, context) => ({
    reasoning: "Executando testes...",
    action: { type: 'final_answer', content: { testsPassed: true, ...input } }
  })
});

const buildAgent = orchestration.createAgent({
  name: "build-agent",
  think: async (input, context) => ({
    reasoning: "Fazendo build...",
    action: { type: 'final_answer', content: { buildPassed: true, ...input } }
  })
});

// Pipeline sequencial (cada step usa resultado do anterior)
const ciPipeline = orchestration.createSequence(
  "ci-pipeline",
  lintAgent,
  testAgent, 
  buildAgent
);

// Executar pipeline
const pipelineResult = await ciPipeline.execute("const x = 1;");
console.log(pipelineResult.success); // true
console.log(pipelineResult.results); // [lintResult, testResult, buildResult]
```

### 6.2 Pipeline Paralelo
```typescript
const securityScanAgent = orchestration.createAgent({
  name: "security-scan",
  think: async (code, context) => ({
    reasoning: "Escaneando vulnerabilidades...",
    action: { type: 'final_answer', content: { vulnerabilities: [] } }
  })
});

const performanceScanAgent = orchestration.createAgent({
  name: "performance-scan",
  think: async (code, context) => ({
    reasoning: "Analisando performance...",
    action: { type: 'final_answer', content: { performanceScore: 95 } }
  })
});

const qualityScanAgent = orchestration.createAgent({
  name: "quality-scan",
  think: async (code, context) => ({
    reasoning: "Verificando qualidade...",
    action: { type: 'final_answer', content: { qualityScore: 88 } }
  })
});

// Pipeline paralelo (todos executam simultaneamente)
const analysisParallel = orchestration.createParallel(
  "security-analysis",
  securityScanAgent,
  performanceScanAgent,
  qualityScanAgent
);

const parallelResult = await analysisParallel.execute("const code = 'test';");
// Todos os 3 agents executam ao mesmo tempo
```

### 6.3 Pipeline Complexo (Híbrido)
```typescript
// Pipeline que combina sequencial e paralelo
const complexPipeline = orchestration.createSequence(
  "complex-ci-pipeline",
  
  // 1. Primeiro: lint (sequencial)
  lintAgent,
  
  // 2. Depois: análises em paralelo
  analysisParallel,
  
  // 3. Finalmente: build (sequencial)
  buildAgent
);

const result = await complexPipeline.execute(sourceCode);
```

---

## 7. Routers Inteligentes

### 7.1 Router Básico
```typescript
const basicRouter = orchestration.createRouter({
  name: "task-router",
  description: "Roteia tarefas para agents especializados",
  
  routes: [
    {
      name: "code-review",
      description: "Para review de código",
      agent: "code-review-agent"
    },
    {
      name: "security-check", 
      description: "Para verificações de segurança",
      agent: "security-agent"
    },
    {
      name: "performance-analysis",
      description: "Para análise de performance", 
      agent: "performance-agent"
    }
  ],
  
  strategy: 'best_match' // ou 'first_match', 'llm_decision'
});

// O router escolhe automaticamente o agent certo
const routedResult = await basicRouter.route({
  task: "Verificar se este código tem vulnerabilidades",
  code: "eval(userInput)"
});

console.log(routedResult.selectedRoute); // "security-check"
```

### 7.2 Router com LLM Decision
```typescript
const smartRouter = orchestration.createRouter({
  name: "intelligent-router",
  
  routes: [
    {
      name: "junior-reviewer",
      description: "Para PRs simples, mudanças pequenas",
      agent: juniorReviewAgent
    },
    {
      name: "senior-reviewer", 
      description: "Para PRs complexos, mudanças críticas",
      agent: seniorReviewAgent
    },
    {
      name: "security-specialist",
      description: "Para mudanças relacionadas à segurança",
      agent: securitySpecialistAgent
    }
  ],
  
  strategy: 'llm_decision', // Usa LLM para decidir
  
  intentSchema: z.object({
    complexity: z.enum(['low', 'medium', 'high']),
    domain: z.enum(['security', 'performance', 'ui', 'backend']),
    target: z.string()
  })
});

const smartResult = await smartRouter.route({
  prTitle: "Fix critical security vulnerability in auth system",
  filesChanged: ["auth.ts", "security-utils.ts"],
  additions: 15,
  deletions: 3
});

console.log(smartResult.selectedRoute); // "security-specialist"
console.log(smartResult.reasoning); // "Detected security-related changes..."
```

### 7.3 Router com Fallback
```typescript
const robustRouter = orchestration.createRouter({
  name: "robust-router",
  
  routes: [
    { name: "specialist-a", agent: specialistA },
    { name: "specialist-b", agent: specialistB }
  ],
  
  fallback: "general-agent", // Se nenhum specialist for adequado
  
  strategy: 'best_match'
});
```

---

## 8. Estado Persistente

### 8.1 Configuração de Persistência
```typescript
// Memory persistor (desenvolvimento)
const orchestration = createOrchestration({
  persistorType: 'memory',
  persistorOptions: {}
});

// SQLite persistor (produção local)
const orchestration = createOrchestration({
  persistorType: 'sqlite',
  persistorOptions: {
    database: './agent-state.db'
  }
});

// Redis persistor (produção distribuída)
const orchestration = createOrchestration({
  persistorType: 'redis',
  persistorOptions: {
    host: 'localhost',
    port: 6379,
    password: 'secret'
  }
});
```

### 8.2 Agent com Estado Persistente
```typescript
const statefulAgent = orchestration.createAgent({
  name: "learning-agent",
  
  think: async (input, context) => {
    // Recuperar estado anterior
    const previousAnalyses = context.state.get('analyses') || [];
    const learningData = context.state.get('learningData') || { patterns: [] };
    
    // Processar novo input
    const currentAnalysis = {
      timestamp: Date.now(),
      input: input,
      result: "Analysis result..."
    };
    
    // Aprender com padrões anteriores
    const patterns = learningData.patterns;
    const similarInputs = patterns.filter(p => 
      p.input.toLowerCase().includes(input.toLowerCase())
    );
    
    // Atualizar estado
    context.state.set('analyses', [...previousAnalyses, currentAnalysis]);
    context.state.set('learningData', {
      ...learningData,
      patterns: [...patterns, { input, timestamp: Date.now() }]
    });
    
    return {
      reasoning: `Processei com base em ${previousAnalyses.length} análises anteriores e ${similarInputs.length} padrões similares`,
      action: {
        type: 'final_answer',
        content: {
          result: currentAnalysis.result,
          learnedFrom: similarInputs.length,
          totalHistory: previousAnalyses.length + 1
        }
      }
    };
  }
});
```

### 8.3 Workflow com Checkpoint/Resume
```typescript
const checkpointWorkflow = orchestration.createAgent({
  name: "checkpoint-workflow",
  
  think: async (input, context) => {
    const checkpoints = context.state.get('checkpoints') || [];
    const currentStep = context.state.get('currentStep') || 0;
    
    const steps = [
      'validate-input',
      'fetch-data', 
      'process-data',
      'generate-report'
    ];
    
    // Continuar de onde parou
    for (let i = currentStep; i < steps.length; i++) {
      const stepName = steps[i];
      
      try {
        // Simular processamento do step
        const stepResult = await this.executeStep(stepName, input);
        
        // Salvar checkpoint
        checkpoints.push({
          step: stepName,
          index: i,
          result: stepResult,
          timestamp: Date.now()
        });
        
        context.state.set('checkpoints', checkpoints);
        context.state.set('currentStep', i + 1);
        
        console.log(`✅ Checkpoint salvo: ${stepName}`);
        
      } catch (error) {
        console.log(`❌ Erro no step ${stepName}, checkpoint salvo`);
        throw error; // Pode ser resumido depois
      }
    }
    
    return {
      reasoning: `Workflow completado com ${checkpoints.length} checkpoints`,
      action: {
        type: 'final_answer',
        content: {
          completed: true,
          checkpoints: checkpoints.map(c => c.step)
        }
      }
    };
  },
  
  async executeStep(stepName, input) {
    // Simular diferentes tipos de processamento
    await new Promise(resolve => setTimeout(resolve, 1000));
    return `Result from ${stepName}`;
  }
});
```

---

## 9. Review Quality Agent (Caso Real)

### 9.1 Review Agent Completo
```typescript
// Tools especializadas
const astAnalyzerTool = orchestration.createTool({
  name: "ast-analyzer",
  execute: async ({ code, language = 'typescript' }) => {
    // Simular análise AST
    const ast = parseCode(code, language);
    return {
      complexity: calculateComplexity(ast),
      patterns: extractPatterns(ast),
      issues: findIssues(ast)
    };
  }
});

const dependencyGraphTool = orchestration.createTool({
  name: "dependency-graph",
  execute: async ({ filePath, projectRoot }) => {
    // Análise de dependências
    return {
      dependencies: findDependencies(filePath),
      dependents: findDependents(filePath, projectRoot),
      circularDeps: detectCircularDependencies(filePath)
    };
  }
});

const testGeneratorTool = orchestration.createTool({
  name: "test-generator",
  execute: async ({ code, testFramework = 'jest' }) => {
    // Gerar testes automaticamente
    return {
      tests: generateTests(code, testFramework),
      coverage: estimateCoverage(code),
      suggestions: suggestAdditionalTests(code)
    };
  }
});

// Agent principal de review
const reviewQualityAgent = orchestration.createAgent({
  name: "review-quality-agent",
  description: "Agent autônomo de review de código com contexto externo",
  tools: [astAnalyzerTool, dependencyGraphTool, testGeneratorTool],
  
  think: async (prData, context) => {
    const { files, prInfo } = prData;
    
    // Phase 1: Análise estrutural
    const structuralAnalysis = await this.analyzeStructure(files, context);
    
    // Phase 2: Análise de dependências
    const dependencyAnalysis = await this.analyzeDependencies(files, context);
    
    // Phase 3: Geração de testes
    const testAnalysis = await this.analyzeTests(files, context);
    
    // Phase 4: Contexto externo (simulado - seria MCP)
    const externalContext = await this.gatherExternalContext(prInfo, context);
    
    // Phase 5: Scoring e recomendações
    const reviewScore = this.calculateReviewScore({
      structural: structuralAnalysis,
      dependencies: dependencyAnalysis,
      tests: testAnalysis,
      external: externalContext
    });
    
    const recommendations = this.generateRecommendations(reviewScore, {
      structural: structuralAnalysis,
      dependencies: dependencyAnalysis,
      tests: testAnalysis
    });
    
    return {
      reasoning: `Analisei ${files.length} arquivos com análise estrutural, dependências, testes e contexto externo. Score: ${reviewScore.overall}/100`,
      action: {
        type: 'final_answer',
        content: {
          reviewScore,
          recommendations,
          analyses: {
            structural: structuralAnalysis,
            dependencies: dependencyAnalysis,
            tests: testAnalysis,
            external: externalContext
          },
          decision: reviewScore.overall >= 80 ? 'APPROVE' : 
                   reviewScore.overall >= 60 ? 'REQUEST_CHANGES' : 'REJECT'
        }
      }
    };
  },
  
  async analyzeStructure(files, context) {
    const analyses = [];
    
    for (const file of files) {
      const astResult = await context.availableTools
        .find(t => t.name === 'ast-analyzer')
        ?.execute({ code: file.content, language: file.language });
      
      analyses.push({
        file: file.path,
        ...astResult
      });
    }
    
    return {
      files: analyses,
      overallComplexity: analyses.reduce((sum, a) => sum + a.complexity, 0) / analyses.length,
      totalIssues: analyses.reduce((sum, a) => sum + a.issues.length, 0)
    };
  },
  
  async analyzeDependencies(files, context) {
    const dependencyMaps = [];
    
    for (const file of files) {
      const depResult = await context.availableTools
        .find(t => t.name === 'dependency-graph')
        ?.execute({ filePath: file.path, projectRoot: '.' });
      
      dependencyMaps.push({
        file: file.path,
        ...depResult
      });
    }
    
    return {
      files: dependencyMaps,
      circularDependencies: dependencyMaps.filter(d => d.circularDeps.length > 0),
      highCouplingFiles: dependencyMaps.filter(d => d.dependencies.length > 10)
    };
  },
  
  async analyzeTests(files, context) {
    const testAnalyses = [];
    
    for (const file of files.filter(f => !f.path.includes('.test.'))) {
      const testResult = await context.availableTools
        .find(t => t.name === 'test-generator')
        ?.execute({ code: file.content });
      
      testAnalyses.push({
        file: file.path,
        ...testResult
      });
    }
    
    return {
      files: testAnalyses,
      avgCoverage: testAnalyses.reduce((sum, t) => sum + t.coverage, 0) / testAnalyses.length,
      totalTestsGenerated: testAnalyses.reduce((sum, t) => sum + t.tests.length, 0)
    };
  },
  
  async gatherExternalContext(prInfo, context) {
    // Simular chamadas MCP (seria real em produção)
    return {
      notionRequirements: {
        found: true,
        requirements: ["REQ-001: User authentication", "REQ-002: Data validation"],
        compliance: 85
      },
      figmaDesigns: {
        found: true,
        designsAffected: ["Component-Button", "Layout-Header"],
        compliance: 92
      },
      sentryImpact: {
        potentialErrors: ["TypeError in UserService", "Validation error in Form"],
        riskLevel: 'medium'
      }
    };
  },
  
  calculateReviewScore(analyses) {
    let score = 100;
    
    // Structural scoring
    if (analyses.structural.overallComplexity > 10) score -= 20;
    if (analyses.structural.totalIssues > 5) score -= 15;
    
    // Dependency scoring
    if (analyses.dependencies.circularDependencies.length > 0) score -= 25;
    if (analyses.dependencies.highCouplingFiles.length > 2) score -= 10;
    
    // Test scoring
    if (analyses.tests.avgCoverage < 70) score -= 20;
    
    // External context scoring
    if (analyses.external.notionRequirements.compliance < 80) score -= 10;
    if (analyses.external.figmaDesigns.compliance < 85) score -= 5;
    if (analyses.external.sentryImpact.riskLevel === 'high') score -= 15;
    
    return {
      overall: Math.max(0, score),
      breakdown: {
        structural: Math.max(0, 100 - (analyses.structural.totalIssues * 3)),
        dependencies: analyses.dependencies.circularDependencies.length === 0 ? 100 : 50,
        tests: analyses.tests.avgCoverage,
        external: analyses.external.notionRequirements.compliance
      }
    };
  },
  
  generateRecommendations(reviewScore, analyses) {
    const recommendations = [];
    
    if (analyses.structural.overallComplexity > 10) {
      recommendations.push({
        type: 'complexity',
        severity: 'high',
        message: 'Considere refatorar métodos complexos',
        files: analyses.structural.files.filter(f => f.complexity > 15).map(f => f.file)
      });
    }
    
    if (analyses.dependencies.circularDependencies.length > 0) {
      recommendations.push({
        type: 'architecture',
        severity: 'critical',
        message: 'Dependências circulares detectadas - corrigir antes do merge',
        files: analyses.dependencies.circularDependencies.map(d => d.file)
      });
    }
    
    if (analyses.tests.avgCoverage < 70) {
      recommendations.push({
        type: 'testing',
        severity: 'medium',
        message: `Cobertura de testes baixa (${analyses.tests.avgCoverage}%). Adicionar testes`,
        suggestion: 'Testes sugeridos foram gerados automaticamente'
      });
    }
    
    return recommendations;
  }
});
```

### 9.2 Review Pipeline com Planner
```typescript
// Pipeline de review com planner CoT
const reviewPipeline = orchestration.createSequence(
  "comprehensive-review-pipeline",
  
  // Pre-processing
  "git-diff-analyzer",
  "file-classifier", 
  
  // Main review com planner
  reviewQualityAgent,
  
  // Post-processing
  "report-generator",
  "notification-sender"
);

// Usar com planner para raciocínio complexo
const cotPlanner = orchestration.createPlanner({
  strategy: 'cot',
  complexity: 'high',
  maxSteps: 7
});

// Execução completa
async function runReviewPipeline(prData) {
  // 1. Pipeline básico
  const pipelineResult = await reviewPipeline.execute(prData);
  
  // 2. Se score baixo, usar planner para análise profunda
  if (pipelineResult.results[2].reviewScore.overall < 70) {
    console.log("🧠 Score baixo detectado, ativando planner CoT para análise profunda...");
    
    const deepAnalysis = await cotPlanner.plan(
      prData,
      { availableTools: [astAnalyzerTool, dependencyGraphTool, testGeneratorTool] },
      reviewQualityAgent.think
    );
    
    return {
      ...pipelineResult,
      deepAnalysis: deepAnalysis,
      finalRecommendation: deepAnalysis.thought.action.content.decision
    };
  }
  
  return pipelineResult;
}
```

---

## 🚀 Uso Completo

```typescript
// Inicializar orchestration
const orchestration = createOrchestration({
  persistorType: 'memory',
  debug: true
});

// Registrar todos os agents e tools
// ... (código dos exemplos acima)

// Usar o sistema completo
async function main() {
  // Dados de exemplo de um PR
  const prData = {
    files: [
      { path: 'src/auth.ts', content: 'export function authenticate() { ... }', language: 'typescript' },
      { path: 'src/utils.ts', content: 'export const helpers = { ... }', language: 'typescript' }
    ],
    prInfo: {
      title: "Add user authentication system",
      author: "developer",
      filesChanged: 2
    }
  };
  
  // Executar review completo
  const reviewResult = await runReviewPipeline(prData);
  
  console.log('📊 Review Score:', reviewResult.results[2].reviewScore.overall);
  console.log('✅ Decision:', reviewResult.results[2].decision);
  console.log('📝 Recommendations:', reviewResult.results[2].recommendations);
  
  // Se necessário, usar outros agents
  if (reviewResult.results[2].decision === 'REQUEST_CHANGES') {
    // Gerar sugestões de correção
    const suggestions = await orchestration.callAgent(
      "suggestion-generator", 
      reviewResult.results[2].analyses
    );
    
    console.log('💡 Suggestions:', suggestions.data);
  }
}

main().catch(console.error);
```

---

Este documento mostra todas as possibilidades disponíveis hoje no Kodus Flow. O sistema é robusto e permite desde agents simples até arquiteturas complexas com planners, pipelines e estado persistente.