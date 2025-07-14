# 🚀 Kodus Flow Engine v2 - API Specification

## 📋 Visão Geral

A **v2 do Kodus Flow Engine** introduz APIs muito mais elegantes e poderosas, mantendo 100% compatibilidade com a v1. Esta especificação documenta todas as novas funcionalidades e melhorias.

### **🎯 Principais Melhorias da v2:**
- **Enhanced Context**: Acesso direto a tools, routers e planners
- **Lifecycle Hooks Específicos**: Reação granular a eventos
- **Router Avançado**: Object-based routes, custom logic, LLM decision
- **Planner Integrado**: Múltiplas estratégias, auto-seleção
- **Event-Driven Internamente**: Comunicação via eventos (transparente)
- **Multi-Agent Collaboration**: Coordenação inteligente entre agents

---

## 🤖 Enhanced Agent API

### **1. Enhanced Context Access**

```typescript
// ✅ V2: Acesso direto via enhanced context
const agent = orchestration.createAgent({
  name: "SecurityAgent",
  tools: [semgrepTool, trufflehogTool, triageRouter],
  planner: securityPlanner,
  
  async think(input, ctx) {
    // ✨ NOVO: Direct tool access (mais fácil que antes)
    const vulnerabilities = await ctx.tools.semgrep(input.code);
    const routing = await ctx.tools.triageRouter({ severity: vulnerabilities.maxSeverity });
    
    // ✨ NOVO: Direct planner access
    const plan = await ctx.plan('security-analysis', { 
      vulnerabilities, 
      complexity: this.assessComplexity(input) 
    });
    
    // ✨ NOVO: Agent delegation via action
    if (routing.selectedAgent === 'ExpertSecurityAgent') {
      return {
        reasoning: "Complex vulnerabilities found, delegating to expert",
        action: { type: 'delegate', targetAgent: 'ExpertSecurityAgent', input: vulnerabilities }
      };
    }
    
    return { action: { type: 'final_answer', content: vulnerabilities } };
  }
});
```

### **2. Lifecycle Hooks Específicos**

```typescript
const agent = orchestration.createAgent({
  name: "EnhancedAgent",
  tools: [semgrepTool, triageRouter],
  
  async think(input, ctx) {
    return {
      reasoning: "Initial analysis",
      action: { type: 'tool_call', toolName: 'semgrep', input: { code: input } }
    };
  },
  
  // ✨ NOVO: Enhanced lifecycle hooks (optional)
  async onToolResult(result, ctx) {
    ctx.logger.info('Tool completed', { tool: ctx.lastTool, result });
    
    if (ctx.lastTool === 'semgrep' && result.vulnerabilities.length > 0) {
      return {
        reasoning: "Vulnerabilities found, routing to specialist",
        action: { type: 'tool_call', toolName: 'triageRouter', input: { severity: result.maxSeverity } }
      };
    }
    
    return { action: { type: 'final_answer', content: result } };
  },
  
  async onRouterResult(routingResult, ctx) {
    if (routingResult.confidence < 0.8) {
      return { action: { type: 'escalate', escalateTo: 'human-reviewer' } };
    }
    return { action: { type: 'delegate', targetAgent: routingResult.selectedAgent } };
  },
  
  async onAgentDelegation(delegationResult, ctx) {
    if (delegationResult.success) {
      return {
        reasoning: "Delegation successful, consolidating results",
        action: { 
          type: 'final_answer', 
          content: {
            originalRequest: ctx.originalInput,
            delegatedTo: ctx.delegatedAgent,
            result: delegationResult.data
          }
        }
      };
    } else {
      return {
        reasoning: "Delegation failed, using fallback",
        action: { type: 'delegate', targetAgent: 'fallback-agent' }
      };
    }
  },
  
  async onError(error, ctx) {
    if (error.message.includes('timeout')) {
      return {
        reasoning: "Timeout detected, retrying with longer timeout",
        action: { 
          type: 'tool_call', 
          toolName: ctx.lastAction.toolName,
          input: ctx.lastAction.input,
          options: { timeout: 30000 }
        }
      };
    }
    
    return {
      reasoning: "Generic error, using fallback",
      action: { type: 'final_answer', content: "Error processed, using local data" }
    };
  },
  
  // ✨ NOVO: Reactive event handlers (optional)
  eventHandlers: {
    'system.security-alert': async (event, ctx) => {
      return { type: 'security.urgent-scan', data: event.data };
    },
    
    'user.priority-change': async (event, ctx) => {
      ctx.state.set('priority', event.data.newPriority);
      return { type: 'priority.update', data: event.data };
    },
    
    'config.update': async (event, ctx) => {
      ctx.state.set('config', event.data.newConfig);
      return { type: 'config.reload', data: event.data };
    }
  }
});
```

### **3. Enhanced Context Interface**

```typescript
interface EnhancedAgentContext extends AgentContext {
  // ✨ Direct tool access
  tools: {
    [toolName: string]: (input: unknown) => Promise<unknown>;
  };
  
  // ✨ Direct router access
  routers: {
    [routerName: string]: (input: unknown) => Promise<RoutingResult>;
  };
  
  // ✨ Direct planner access
  plan(plannerName: string, input: unknown): Promise<Plan>;
  replan(plan: Plan, failedStep: PlanStep, error: Error): Promise<Plan>;
  
  // ✨ State management
  state: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): boolean;
  };
  
  // ✨ Execution tracking
  lastTool?: string;
  lastAction?: AgentAction;
  delegatedAgent?: string;
  originalInput?: unknown;
  toolResults: Record<string, unknown>;
  
  // ✨ Logging
  logger: Logger;
  
  // ✨ Utility methods
  extractRoutingContext(): Record<string, unknown>;
  assessComplexity(input: unknown): number;
}
```

---

## 🧭 Advanced Router API

### **1. Object-based Routes**

```typescript
// ✅ V2: Router com object-based routes (muito mais limpo)
const ciRouter = orchestration.createRouter({
  name: 'CIRouter',
  description: 'Intelligent CI routing system',
  
  // ✨ NOVO: Intent schema validation
  intentSchema: z.object({
    prLabels: z.array(z.string()),
    diff: z.string(),
    author: z.string(),
    filesChanged: z.number()
  }),
  
  // ✨ NOVO: Object-based routes (cleaner)
  routes: {
    security: 'security-team',
    quality: 'quality-team', 
    performance: 'performance-team',
    default: 'review-team'
  },
  
  // ✨ NOVO: Custom routing logic
  ruleFn: ({ prLabels, diff, author, filesChanged }) => {
    // Security routing
    if (prLabels.includes('security') || 
        diff.match(/\.key|password|secret|token/)) {
      return 'security';
    }
    
    // Performance routing
    if (prLabels.includes('performance') || 
        diff.match(/optimization|cache|memory/)) {
      return 'performance';
    }
    
    // Quality routing
    if (prLabels.includes('fix') || 
        diff.match(/src\//) || 
        filesChanged > 10) {
      return 'quality';
    }
    
    return 'default';
  },
  
  // ✨ NOVO: Advanced strategies
  strategy: 'custom_rules', // custom_rules, llm_decision, semantic_similarity
  
  // ✨ NOVO: Confidence thresholds
  confidenceThreshold: 0.8,
  
  // ✨ NOVO: Fallback configuration
  fallback: 'review-team',
  
  // ✨ NOVO: Routing metadata
  metadata: {
    version: '2.0',
    lastUpdated: Date.now(),
    totalRoutes: 4
  }
});
```

### **2. LLM Decision Router**

```typescript
const smartRouter = orchestration.createRouter({
  name: 'IntelligentRouter',
  
  intentSchema: z.object({
    complexity: z.enum(['low', 'medium', 'high']),
    domain: z.enum(['security', 'performance', 'ui', 'backend', 'data']),
    target: z.string(),
    urgency: z.enum(['low', 'medium', 'high', 'critical'])
  }),
  
  routes: {
    junior: 'junior-reviewer',
    senior: 'senior-reviewer',
    specialist: 'domain-specialist',
    expert: 'expert-reviewer'
  },
  
  // ✨ NOVO: LLM-based decision making
  strategy: 'llm_decision',
  
  // ✨ NOVO: LLM configuration
  llmConfig: {
    model: 'gpt-4',
    temperature: 0.1,
    maxTokens: 500,
    systemPrompt: `You are an intelligent router that decides which agent should handle a request.
    
Available agents:
- junior: For simple changes, small fixes, documentation updates
- senior: For complex changes, refactoring, architectural decisions  
- specialist: For domain-specific changes (security, performance, etc.)
- expert: For critical changes, security vulnerabilities, production issues

Choose the most appropriate agent based on the request complexity, domain, and urgency.`
  },
  
  confidenceThreshold: 0.85,
  fallback: 'senior'
});
```

### **3. Semantic Similarity Router**

```typescript
const semanticRouter = orchestration.createRouter({
  name: 'SemanticRouter',
  
  routes: {
    security: 'security-agent',
    performance: 'performance-agent',
    quality: 'quality-agent'
  },
  
  // ✨ NOVO: Semantic similarity strategy
  strategy: 'semantic_similarity',
  
  // ✨ NOVO: Embedding configuration
  embeddingConfig: {
    model: 'text-embedding-ada-002',
    dimensions: 1536,
    similarityThreshold: 0.8
  },
  
  // ✨ NOVO: Training examples for each route
  trainingExamples: {
    security: [
      "Fix authentication vulnerability",
      "Update security headers", 
      "Remove hardcoded secrets",
      "Implement input validation"
    ],
    performance: [
      "Optimize database queries",
      "Add caching layer",
      "Reduce bundle size",
      "Improve loading time"
    ],
    quality: [
      "Fix linting errors",
      "Add unit tests",
      "Improve code coverage",
      "Refactor complex functions"
    ]
  },
  
  fallback: 'quality'
});
```

### **4. Router as Tool**

```typescript
// ✅ V2: Router funciona como tool dentro do agent
const managerAgent = orchestration.createAgent({
  name: 'CIManager',
  tools: [ciRouter], // Router como tool!
  
  async think(input, ctx) {
    // ✨ NOVO: Usar router diretamente
    const routing = await ctx.tools.ciRouter(input);
    
    return {
      reasoning: `Routed to ${routing.selectedAgent} with ${routing.confidence} confidence`,
      action: {
        type: 'delegate',
        targetAgent: routing.selectedAgent,
        input: routing.processedInput
      }
    };
  },
  
  // ✨ NOVO: Router result handler
  async onRouterResult(routingResult, ctx) {
    if (routingResult.confidence < 0.8) {
      return { 
        action: { 
          type: 'escalate', 
          escalateTo: 'human-reviewer',
          reason: 'Low routing confidence'
        } 
      };
    }
    
    return { 
      action: { 
        type: 'delegate', 
        targetAgent: routingResult.selectedAgent,
        input: routingResult.processedInput
      } 
    };
  }
});
```

### **5. Router Result Interface**

```typescript
interface RoutingResult<T = unknown> {
  selectedRoute: string;
  selectedAgent: string;
  confidence: number;
  reasoning: string;
  processedInput: T;
  metadata: {
    routerId: string;
    executionId: string;
    duration: number;
    strategy: string;
    availableRoutes: string[];
    excludedRoutes?: string[];
    confidenceBreakdown?: Record<string, number>;
  };
}
```

---

## 🧠 Integrated Planner API

### **1. Multi-Strategy Planner**

```typescript
// ✅ V2: Planner com múltiplas estratégias integrado
const bugFixPlanner = orchestration.createPlanner({
  name: 'BugFixPlanner',
  description: 'Intelligent bug fixing planner with multiple strategies',
  
  // ✨ NOVO: Multiple strategies with configs
  strategies: {
    cot: {
      name: 'Chain of Thought',
      prompt: "Think step by step to fix this bug. First, analyze the problem, then identify the root cause, then propose a solution, then implement it, finally verify the fix.",
      maxSteps: 5,
      temperature: 0.3,
      evaluationFn: (step) => step.confidence > 0.7
    },
    
    tot: {
      name: 'Tree of Thoughts',
      prompt: "Explore multiple approaches to fix this bug. Consider different strategies and evaluate each one.",
      maxBranches: 3,
      maxDepth: 4,
      evaluationFn: (branch) => branch.confidence,
      selectionStrategy: 'best_first'
    },
    
    dynamic: {
      name: 'Dynamic Strategy Selection',
      fallbackStrategy: 'cot',
      complexityThreshold: 0.7,
      decisionFn: (input) => {
        const complexity = input.diff.length > 2000 ? 'high' : 'low';
        return complexity === 'high' ? 'tot' : 'cot';
      }
    }
  },
  
  // ✨ NOVO: Auto strategy selection
  decideStrategy: (input) => {
    const complexity = input.diff.length > 2000 ? 'high' : 'low';
    const urgency = input.urgency === 'critical' ? 'high' : 'low';
    
    if (complexity === 'high' && urgency === 'high') return 'tot';
    if (complexity === 'high') return 'tot';
    return 'cot';
  },
  
  // ✨ NOVO: Plan structure definition
  planSchema: z.object({
    steps: z.array(z.object({
      id: z.string(),
      description: z.string(),
      tool: z.string().optional(),
      params: z.record(z.unknown()).optional(),
      dependencies: z.array(z.string()).optional(),
      critical: z.boolean().default(false),
      estimatedDuration: z.number().optional()
    })),
    metadata: z.object({
      strategy: z.string(),
      confidence: z.number(),
      estimatedDuration: z.number(),
      complexity: z.enum(['low', 'medium', 'high']),
      riskLevel: z.enum(['low', 'medium', 'high'])
    })
  }),
  
  // ✨ NOVO: Plan validation
  validatePlan: (plan) => {
    const hasCriticalSteps = plan.steps.some(step => step.critical);
    const hasDependencies = plan.steps.some(step => step.dependencies?.length > 0);
    
    return {
      valid: plan.steps.length > 0 && plan.metadata.confidence > 0.5,
      warnings: [
        !hasCriticalSteps && 'No critical steps identified',
        !hasDependencies && 'No step dependencies defined'
      ].filter(Boolean)
    };
  }
});
```

### **2. Agent with Integrated Planner**

```typescript
// ✅ V2: Agent com planner integrado
const securityAgent = orchestration.createAgent({
  name: 'security-team',
  tools: [semgrepTool, trufflehogTool, dependencyAnalyzer],
  planner: bugFixPlanner, // Integrated planner
  
  async think(input, ctx) {
    // ✨ NOVO: Context-aware planning
    const plan = await ctx.plan('BugFixPlanner', { 
      diff: input.diff,
      complexity: this.assessComplexity(input),
      urgency: input.urgency || 'medium'
    });
    
    // ✨ NOVO: Plan-driven execution
    const findings = [];
    for (const step of plan.steps) {
      try {
        // Execute step
        const result = await ctx.tools[step.tool](step.params);
        findings.push({ step: step.id, result, success: true });
        
        // ✨ NOVO: Dynamic replanning on failure
        if (result.error && step.critical) {
          const newPlan = await ctx.replan(plan, step, result.error);
          return this.executePlan(newPlan, ctx);
        }
        
      } catch (error) {
        findings.push({ step: step.id, error: error.message, success: false });
        
        if (step.critical) {
          // Critical step failed - replan
          const newPlan = await ctx.replan(plan, step, error);
          return this.executePlan(newPlan, ctx);
        }
      }
    }
    
    // ✨ NOVO: Result aggregation
    return ctx.reduce('security-reducer', { 
      findings, 
      threshold: plan.metadata.threshold 
    });
  },
  
  // ✨ NOVO: Plan execution helper
  async executePlan(plan, ctx) {
    ctx.logger.info('Executing plan', { 
      planId: plan.id, 
      strategy: plan.metadata.strategy,
      steps: plan.steps.length 
    });
    
    const results = [];
    for (const step of plan.steps) {
      const result = await ctx.tools[step.tool](step.params);
      results.push({ step: step.id, result });
    }
    
    return {
      reasoning: `Executed ${plan.metadata.strategy} plan with ${results.length} steps`,
      action: { type: 'final_answer', content: { plan, results } }
    };
  }
});
```

### **3. Planner Context Interface**

```typescript
interface PlannerContext extends AgentContext {
  // ✨ Plan management
  plan(plannerName: string, input: unknown): Promise<Plan>;
  replan(plan: Plan, failedStep: PlanStep, error: Error): Promise<Plan>;
  
  // ✨ Strategy management
  setStrategy(strategy: string): void;
  getStrategy(): string;
  
  // ✨ Plan execution
  executePlan(plan: Plan): Promise<PlanExecutionResult>;
  
  // ✨ Plan validation
  validatePlan(plan: Plan): PlanValidationResult;
}

interface Plan {
  id: string;
  goal: string;
  strategy: string;
  steps: PlanStep[];
  metadata: PlanMetadata;
  status: 'created' | 'executing' | 'completed' | 'failed';
}

interface PlanStep {
  id: string;
  description: string;
  tool?: string;
  params?: Record<string, unknown>;
  dependencies?: string[];
  critical: boolean;
  estimatedDuration?: number;
  completed?: boolean;
  result?: unknown;
}

interface PlanMetadata {
  strategy: string;
  confidence: number;
  estimatedDuration: number;
  complexity: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  threshold?: number;
}
```

---

## 🔄 Multi-Agent Collaboration

### **1. Agent Delegation**

```typescript
// ✅ V2: Delegação inteligente entre agents
const orchestratorAgent = orchestration.createAgent({
  name: "review-orchestrator",
  
  async think(input, ctx) {
    const { code, filePath, complexity } = input;
    
    // ✨ NOVO: Parallel agent execution
    const [codeAnalysis, securityAnalysis, perfAnalysis] = await Promise.all([
      ctx.delegate('code-review-agent', { filePath }),
      ctx.delegate('security-agent', code),
      ctx.delegate('performance-agent', code)
    ]);
    
    // ✨ NOVO: Result consolidation
    const overallScore = this.calculateOverallScore([
      codeAnalysis.data.score,
      securityAnalysis.data.securityScore,
      perfAnalysis.data.performanceScore
    ]);
    
    return {
      reasoning: `Consolidated analyses from ${3} specialized agents`,
      action: {
        type: 'final_answer',
        content: {
          overallScore,
          breakdown: {
            code: codeAnalysis.data.score,
            security: securityAnalysis.data.securityScore,
            performance: perfAnalysis.data.performanceScore
          },
          recommendations: this.generateRecommendations(overallScore)
        }
      }
    };
  },
  
  // ✨ NOVO: Delegation result handler
  async onAgentDelegation(delegationResult, ctx) {
    if (delegationResult.success) {
      ctx.logger.info('Delegation successful', {
        targetAgent: ctx.delegatedAgent,
        duration: delegationResult.duration
      });
    } else {
      ctx.logger.warn('Delegation failed', {
        targetAgent: ctx.delegatedAgent,
        error: delegationResult.error
      });
    }
  }
});
```

### **2. Agent Communication**

```typescript
// ✅ V2: Comunicação entre agents via eventos
const collaborativeAgent = orchestration.createAgent({
  name: "collaborative-agent",
  
  async think(input, ctx) {
    // ✨ NOVO: Send message to other agents
    await ctx.sendMessage('security-agent', {
      type: 'security-check-request',
      data: { code: input.code, priority: 'high' }
    });
    
    // ✨ NOVO: Wait for response
    const response = await ctx.waitForMessage('security-agent', {
      type: 'security-check-response',
      timeout: 30000
    });
    
    return {
      reasoning: "Collaborated with security agent",
      action: { type: 'final_answer', content: response.data }
    };
  },
  
  // ✨ NOVO: Message handlers
  messageHandlers: {
    'security-check-request': async (message, ctx) => {
      const result = await ctx.tools.securityScanner(message.data);
      await ctx.sendMessage(message.from, {
        type: 'security-check-response',
        data: result
      });
    }
  }
});
```

---

## 🔧 Enhanced Tool API

### **1. Tool with Enhanced Context**

```typescript
// ✅ V2: Tool com enhanced context
const enhancedTool = orchestration.createTool({
  name: "enhanced-analyzer",
  description: "Enhanced code analyzer with context awareness",
  
  // ✨ NOVO: Enhanced execution context
  execute: async (input, ctx) => {
    // ctx agora tem acesso ao contexto do agent
    const agentState = ctx.state.get('analysis-history') || [];
    const previousResults = agentState.filter(r => r.file === input.filePath);
    
    // Use previous results to improve analysis
    const analysis = await performAnalysis(input, previousResults);
    
    // Update agent state
    ctx.state.set('analysis-history', [...agentState, {
      file: input.filePath,
      result: analysis,
      timestamp: Date.now()
    }]);
    
    return analysis;
  },
  
  // ✨ NOVO: Tool lifecycle hooks
  onStart: async (input, ctx) => {
    ctx.logger.info('Tool started', { tool: 'enhanced-analyzer', input });
  },
  
  onFinish: async (result, ctx) => {
    ctx.logger.info('Tool finished', { tool: 'enhanced-analyzer', result });
  },
  
  onError: async (error, ctx) => {
    ctx.logger.error('Tool error', { tool: 'enhanced-analyzer', error });
  }
});
```

### **2. Tool with Circuit Breaker**

```typescript
// ✅ V2: Tool com circuit breaker integrado
const resilientTool = orchestration.createTool({
  name: "resilient-api",
  description: "API tool with circuit breaker and retry logic",
  
  execute: async (input, ctx) => {
    // Circuit breaker is automatically applied
    const result = await fetchAPI(input);
    return result;
  },
  
  // ✨ NOVO: Circuit breaker configuration
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 60000,
    expectedErrors: ['timeout', 'rate-limit']
  },
  
  // ✨ NOVO: Retry configuration
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    baseDelay: 1000,
    maxDelay: 10000
  },
  
  // ✨ NOVO: Timeout configuration
  timeout: 30000
});
```

---

## 📊 Enhanced Monitoring & Observability

### **1. Detailed Execution Tracking**

```typescript
// ✅ V2: Tracking detalhado de execução
const trackedAgent = orchestration.createAgent({
  name: "tracked-agent",
  
  async think(input, ctx) {
    // ✨ NOVO: Execution tracking
    ctx.track('input-received', { inputType: typeof input, size: JSON.stringify(input).length });
    
    const result = await ctx.tools.analyzer(input);
    
    ctx.track('tool-executed', { 
      tool: 'analyzer', 
      duration: ctx.lastToolDuration,
      success: true 
    });
    
    return { action: { type: 'final_answer', content: result } };
  }
});

// ✨ NOVO: Execution metrics
const metrics = await orchestration.getExecutionMetrics({
  agentName: 'tracked-agent',
  timeRange: 'last-24h',
  includeDetails: true
});

console.log('Metrics:', {
  totalExecutions: metrics.total,
  averageDuration: metrics.avgDuration,
  successRate: metrics.successRate,
  toolUsage: metrics.toolUsage,
  errorBreakdown: metrics.errorBreakdown
});
```

### **2. Performance Profiling**

```typescript
// ✅ V2: Performance profiling automático
const orchestration = createOrchestration({
  debug: true,
  profiling: {
    enabled: true,
    trackToolCalls: true,
    trackAgentCalls: true,
    trackRouterCalls: true,
    trackPlannerCalls: true,
    detailedTiming: true
  }
});

// Profiling data is automatically collected
const profile = await orchestration.getPerformanceProfile({
  agentName: 'security-agent',
  executionId: 'exec-123'
});

console.log('Performance Profile:', {
  totalDuration: profile.totalDuration,
  toolCalls: profile.toolCalls.map(t => ({
    tool: t.name,
    duration: t.duration,
    success: t.success
  })),
  bottlenecks: profile.bottlenecks,
  recommendations: profile.recommendations
});
```

---

## 🚀 Migration Guide

### **From v1 to v2**

```typescript
// v1 (still works)
const agent = orchestration.createAgent({
  name: "legacy-agent",
  think: async (input, ctx) => {
    return {
      reasoning: "Processing...",
      action: { type: 'final_answer', content: "Done" }
    };
  }
});

// v2 (enhanced, optional)
const agent = orchestration.createAgent({
  name: "enhanced-agent",
  tools: [analyzerTool],
  planner: smartPlanner,
  
  async think(input, ctx) {
    // Enhanced context access
    const result = await ctx.tools.analyzer(input);
    return { action: { type: 'final_answer', content: result } };
  },
  
  // Optional enhanced hooks
  async onToolResult(result, ctx) {
    ctx.logger.info('Tool completed', { result });
  }
});
```

### **Backward Compatibility**

- ✅ **100% backward compatible**: Todas as APIs v1 continuam funcionando
- ✅ **Zero breaking changes**: Migração transparente
- ✅ **Enhanced functionality**: Novas capacidades são opt-in
- ✅ **Gradual migration**: Pode migrar agent por agent

---

## 📋 API Reference Summary

### **Enhanced Agent**
```typescript
orchestration.createAgent({
  name: string,
  tools?: string[],
  planner?: Planner,
  
  // Core
  think: (input, ctx) => Promise<AgentThought>,
  
  // Enhanced hooks (optional)
  onToolResult?: (result, ctx) => Promise<AgentThought>,
  onRouterResult?: (result, ctx) => Promise<AgentThought>,
  onAgentDelegation?: (result, ctx) => Promise<AgentThought>,
  onError?: (error, ctx) => Promise<AgentThought>,
  
  // Event handlers (optional)
  eventHandlers?: Record<string, (event, ctx) => Promise<AgentThought>>
});
```

### **Advanced Router**
```typescript
orchestration.createRouter({
  name: string,
  intentSchema: z.ZodType,
  routes: Record<string, string>,
  ruleFn: (input) => string,
  strategy: 'custom_rules' | 'llm_decision' | 'semantic_similarity',
  confidenceThreshold: number,
  fallback: string
});
```

### **Integrated Planner**
```typescript
orchestration.createPlanner({
  name: string,
  strategies: Record<string, StrategyConfig>,
  decideStrategy: (input) => string,
  planSchema: z.ZodType,
  validatePlan: (plan) => ValidationResult
});
```

### **Enhanced Context**
```typescript
interface EnhancedContext {
  tools: Record<string, (input) => Promise<unknown>>;
  routers: Record<string, (input) => Promise<RoutingResult>>;
  plan: (plannerName, input) => Promise<Plan>;
  replan: (plan, step, error) => Promise<Plan>;
  state: StateManager;
  logger: Logger;
  track: (event, data) => void;
}
```

---

## 🎯 Next Steps

1. **Implement Enhanced Context**: Acesso direto a tools, routers, planners
2. **Implement Lifecycle Hooks**: Hooks específicos para diferentes eventos
3. **Implement Advanced Router**: Object-based routes, LLM decision, semantic similarity
4. **Implement Integrated Planner**: Múltiplas estratégias, auto-seleção
5. **Implement Multi-Agent Collaboration**: Delegação, comunicação via eventos
6. **Implement Enhanced Monitoring**: Performance profiling, detailed tracking

A **v2 do Kodus Flow Engine** representa uma evolução significativa, oferecendo APIs muito mais elegantes e poderosas, mantendo toda a robustez enterprise da v1! 🚀 