# 🤖 Kodus Flow - Agent Architecture PRD

## Product Requirements Document
**Version:** 2.0  
**Date:** 2024-06-27  
**Team:** Kodus AI Platform  
**Focus:** Developer-Friendly Agent Creation for Daily Use

---

## 📋 Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Developer Experience Principles](#2-developer-experience-principles)
3. [Agent Creation Patterns](#3-agent-creation-patterns)
4. [Component Architecture](#4-component-architecture)
5. [Integration Patterns](#5-integration-patterns)
6. [API Design & Ergonomics](#6-api-design--ergonomics)
7. [Real-World Usage Examples](#7-real-world-usage-examples)
8. [Developer Journey](#8-developer-journey)
9. [Implementation Requirements](#9-implementation-requirements)
10. [Testing & Validation](#10-testing--validation)

---

## 1. Vision & Goals

### 1.1 Product Vision
Create an intuitive, flexible Agent framework that makes it **easy** for developers to build various types of agents for daily automation tasks, from simple responders to complex multi-step workflows.

### 1.2 Primary Goals
- **Simplicity:** 10 lines of code for basic agent, clear patterns for complex ones
- **Flexibility:** Same API works for simple chat bots and complex review systems
- **Clarity:** Obvious how to create different types of agents
- **Composability:** Agents, tools, routers, pipelines compose naturally
- **Developer Joy:** Intuitive APIs, good TypeScript support, clear error messages

### 1.3 Success Metrics
- Developer can create first agent in < 5 minutes
- Clear path from simple to complex agents
- 90% of use cases covered by established patterns
- Developers rarely need to read implementation code

---

## 2. Developer Experience Principles

### 2.1 Progressive Complexity
```typescript
// Level 1: Simple Response Agent (5 lines)
const chatBot = createAgent({
  async think(message: string) {
    return { action: { type: 'final_answer', content: `Echo: ${message}` } };
  }
});

// Level 2: Agent with Tools (10 lines)
const actionAgent = createAgent({
  tools: ["fileReader"],
  async think(task, ctx) {
    return { action: { type: 'tool_call', toolName: 'fileReader', input: task } };
  }
});

// Level 3: Complex Multi-Agent System (composition)
const reviewSystem = createSequence(
  triageRouter,     // Decides which specialist
  ReviewManager,    // Coordinates review process
  "QualityGate"     // Final approval step
);
```

### 2.2 Clear Mental Models
- **Agent** = Thing that thinks and acts
- **Tool** = Action an agent can perform  
- **Router** = Decision maker that picks the right agent
- **Pipeline** = Sequence of steps (agents, tools, routers)
- **Context** = Shared memory and environment

### 2.3 Consistent Patterns
```typescript
// All creation follows same pattern:
createAgent({ ... })
createTool({ ... })
createRouter({ ... })
createSequence(...)
createParallel(...)

// All execution follows same pattern:
await thing.execute(input, context)
await orchestration.run(input, options)
```

---

## 3. Agent Creation Patterns

### 3.1 Pattern Recognition

| Use Case | Complexity | Example Pattern |
|----------|------------|-----------------|
| **Direct Q&A** | Simple | Chat bot, FAQ responder |
| **Action Executor** | Medium | File processor, API caller |
| **Decision Router** | Medium | Triage system, specialist selector |
| **Workflow Manager** | High | Code review coordinator |
| **Domain Expert** | Medium | Security analyzer, doc writer |

### 3.2 Simple Response Pattern
```typescript
const customerSupportBot = createAgent({
  name: "CustomerSupportBot",
  system: "You are a helpful customer support assistant",
  model: openai("gpt-4o-mini"),
  
  async think(customerMessage: string, ctx) {
    return {
      reasoning: "Customer needs help, I'll respond directly",
      action: {
        type: 'final_answer',
        content: await this.generateResponse(customerMessage)
      }
    };
  }
});
```

### 3.3 Tool-Using Pattern
```typescript
const fileProcessorAgent = createAgent({
  name: "FileProcessor", 
  tools: ["readFile", "writeFile", "validateJSON"],
  
  async think(filePath: string, ctx) {
    return {
      reasoning: "Need to read and validate this file",
      action: {
        type: 'tool_call',
        toolName: 'readFile',
        input: { path: filePath }
      }
    };
  },
  
  async onToolResult(result, ctx) {
    if (ctx.lastTool === 'readFile') {
      return {
        reasoning: "File read, now validating JSON",
        action: {
          type: 'tool_call', 
          toolName: 'validateJSON',
          input: { content: result.content }
        }
      };
    }
    
    return {
      reasoning: "File processed successfully",
      action: { type: 'final_answer', content: result }
    };
  }
});
```

### 3.4 Router-Using Pattern
```typescript
const triageAgent = createAgent({
  name: "TriageAgent",
  tools: [triageRouter], // Router as tool
  
  async think(request: any, ctx) {
    return {
      reasoning: "Need to route this to the right specialist",
      action: {
        type: 'tool_call',
        toolName: 'triageRouter',
        input: { request, context: ctx.extractRoutingContext() }
      }
    };
  },
  
  async onRouterResult(routingResult, ctx) {
    return {
      reasoning: `Routed to ${routingResult.selectedAgent}`,
      action: {
        type: 'delegate',
        targetAgent: routingResult.selectedAgent,
        input: routingResult.processedInput
      }
    };
  }
});
```

### 3.5 Multi-Phase Workflow Pattern
```typescript
const reviewCoordinator = createAgent({
  name: "ReviewCoordinator",
  tools: [triageRouter, mcpFanOut],
  planner: dynamicPlanner,
  
  async think(prData: RepoCtx, ctx) {
    const phase = ctx.state.get('phase') || 'start';
    
    switch (phase) {
      case 'start':
        return this.startExternalGathering(prData, ctx);
      case 'triage':
        return this.triageFiles(prData, ctx);  
      case 'coordinate':
        return this.coordinateReviews(prData, ctx);
      case 'finalize':
        return this.finalizeResults(prData, ctx);
    }
  },
  
  async startExternalGathering(prData, ctx) {
    ctx.state.set('phase', 'triage');
    return {
      reasoning: "Getting external context first",
      action: {
        type: 'tool_call',
        toolName: 'mcpFanOut',
        input: { pr: prData.pr }
      }
    };
  }
});
```

### 3.6 Domain-Specific Pattern  
```typescript
const securityAnalyzer = createAgent({
  name: "SecurityAnalyzer",
  system: "Expert security code reviewer focused on vulnerabilities",
  model: openai("gpt-4o"),
  tools: ["astAnalyzer", "dependencyChecker", "secretScanner"],
  
  async think(codeChange: CodeChange, ctx) {
    const securityChecks = [
      'secret-detection',
      'dependency-vulnerabilities', 
      'injection-patterns',
      'authentication-bypass'
    ];
    
    return {
      reasoning: `Running ${securityChecks.length} security checks`,
      action: {
        type: 'tool_call',
        toolName: 'secretScanner',
        input: { code: codeChange.content }
      }
    };
  }
});
```

---

## 4. Component Architecture

### 4.1 Core Components Relationships

```
Agent ←→ Tool        (agents use tools)
Agent ←→ Router      (agents use routers as tools)  
Agent ←→ Planner     (agents use planners for strategy)

Router → Agent       (routers route to agents)
Pipeline → Agent     (pipelines orchestrate agents)
Pipeline → Router    (pipelines can include routing steps)

Multi-Agent → Agent  (coordinates multiple agents)
Multi-Agent → Router (can use router for coordination)
```

### 4.2 Enhanced Agent Interface
```typescript
interface AgentConfig<TInput = unknown, TOutput = unknown> {
  name: string;
  description?: string;
  system?: string;
  model?: LLMProvider;
  
  // Core thinking function
  think(input: TInput, context: AgentContext): Promise<AgentThought<TOutput>>;
  
  // Available tools and capabilities
  tools?: Array<Tool | Router | Pipeline>;
  planner?: Planner | PlannerStrategy;
  
  // Basic lifecycle hooks
  onStart?(input: TInput, context: AgentContext): Promise<void>;
  onFinish?(result: TOutput, context: AgentContext): Promise<void>;
  onError?(error: Error, context: AgentContext): Promise<void>;
  
  // NEW: Enhanced result handlers
  onToolResult?(result: unknown, context: AgentContext): Promise<AgentThought>;
  onRouterResult?(result: RoutingResult, context: AgentContext): Promise<AgentThought>;
  onModelResponse?(response: string, context: AgentContext): Promise<AgentThought>;
}
```

### 4.3 Enhanced Context System
```typescript
interface AgentContext {
  // Execution tracking
  executionId: string;
  correlationId: string;
  
  // State management
  state: StateManager;
  
  // Enhanced tool access
  availableTools: Tool[];
  tools: ToolProxy; // NEW: Direct access ctx.tools.fileReader({ ... })
  runTool(name: string, input: unknown): Promise<unknown>;
  
  // Router access
  route(routerName: string, input: unknown): Promise<RoutingResult>;
  
  // Logging and monitoring
  logger: Logger;
  
  // Runtime context
  lastTool?: string;
  lastRouterResult?: RoutingResult;
  stepIndex?: number;
  
  // Helper methods
  extractRoutingContext(): RoutingContext;
  collectFindings(): ReviewFindings;
}

// Tool Proxy for direct access
interface ToolProxy {
  [toolName: string]: (input: unknown) => Promise<unknown>;
}
```

### 4.4 Extended Action Types
```typescript
type AgentAction<T = unknown> =
  | { type: 'final_answer'; content: T }
  | { type: 'tool_call'; toolName: string; input: unknown }
  | { type: 'need_more_info'; question: string }
  | { type: 'delegate'; targetAgent: string; input: unknown }      // NEW
  | { type: 'route'; routerName: string; input: unknown }         // NEW  
  | { type: 'pause'; checkpointData: unknown }                    // NEW
  | { type: 'escalate'; reason: string; escalateTo: string };     // NEW
```

---

## 5. Integration Patterns

### 5.1 Current Integration Matrix

| From ↓ / To → | Agent | Tool | Router | Pipeline | Multi-Agent |
|---------------|-------|------|--------|----------|-------------|
| **Agent** | ❌ | ✅ | 🟡 | ❌ | ❌ |
| **Tool** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Router** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Pipeline** | ✅ | 🟡 | 🟡 | ✅ | ❌ |
| **Multi-Agent** | ✅ | ❌ | 🟡 | ❌ | ❌ |

**Legend:** ✅ Fully Supported | 🟡 Needs Enhancement | ❌ Not Supported

### 5.2 Required Enhancements

#### 5.2.1 Router as Tool (🟡 → ✅)
```typescript
// Current workaround:
const routingResult = await someComplexRouterAccess();

// Target API:
const agent = createAgent({
  tools: [triageRouter], // Router directly in tools array
  
  async think(input, ctx) {
    // Direct tool usage
    const routing = await ctx.tools.triageRouter({ input });
    return this.actOnRouting(routing);
  }
});
```

#### 5.2.2 Enhanced Pipeline Steps (🟡 → ✅)
```typescript
// Current limitation:
createSequence(agent1, agent2, agent3); // Only agents

// Target API:
createSequence(
  "PreprocessStep",        // String reference (external step)
  preprocessAgent,         // Agent object
  triageRouter,           // Router object  
  mcpFanOut,              // Parallel pipeline
  "QualityGateCheck"      // String reference (external step)
);
```

#### 5.2.3 Multi-Agent Router Coordination (🟡 → ✅)
```typescript
// Current limitation:
createMultiAgent("team", "desc", { agents: [...] });

// Target API:
createMultiAgent("team", "desc", {
  agents: [agentA, agentB, agentC],
  strategy: 'router-based',           // NEW
  router: coordinationRouter,         // NEW
  fallback: 'parallel'               // NEW
});
```

---

## 6. API Design & Ergonomics

### 6.1 Tool Access Improvements

#### Current (verbose):
```typescript
async think(input, ctx) {
  const fileResult = await ctx.availableTools
    .find(t => t.name === 'fileReader')
    ?.execute({ path: input.filePath });
}
```

#### Target (ergonomic):
```typescript
async think(input, ctx) {
  const fileResult = await ctx.tools.fileReader({ path: input.filePath });
  // Alternative explicit syntax:
  const fileResult = await ctx.runTool('fileReader', { path: input.filePath });
}
```

### 6.2 Enhanced Lifecycle Hooks

```typescript
const enhancedAgent = createAgent({
  name: "EnhancedAgent",
  tools: ["fileReader", "astAnalyzer"],
  
  // Generic lifecycle
  async onStart(input, ctx) { 
    ctx.logger.info("Agent starting", { input }); 
  },
  
  async onFinish(result, ctx) {
    ctx.logger.info("Agent finished", { result });
  },
  
  async onError(error, ctx) {
    ctx.logger.error("Agent failed", { error });
  },
  
  // NEW: Specific result handlers  
  async onToolResult(result, ctx) {
    ctx.state.set('lastToolResult', result);
    
    if (ctx.lastTool === 'fileReader') {
      return {
        reasoning: "File read, now analyzing AST",
        action: {
          type: 'tool_call',
          toolName: 'astAnalyzer',
          input: { code: result.content }
        }
      };
    }
    
    return {
      reasoning: "Processing complete",
      action: { type: 'final_answer', content: result }
    };
  },
  
  async onRouterResult(routingResult, ctx) {
    const { selectedAgent, reasoning, confidence } = routingResult;
    
    if (confidence < 0.7) {
      return {
        reasoning: "Router confidence too low, escalating",
        action: { type: 'escalate', reason: reasoning, escalateTo: 'human-reviewer' }
      };
    }
    
    return {
      reasoning: `Routing to ${selectedAgent}: ${reasoning}`,
      action: { type: 'delegate', targetAgent: selectedAgent, input: ctx.originalInput }
    };
  },
  
  async onModelResponse(response, ctx) {
    const parsed = this.parseModelResponse(response);
    
    if (!this.validateResponse(parsed)) {
      return {
        reasoning: "Model response invalid, retrying",
        action: { type: 'need_more_info', question: "Please provide a clearer response..." }
      };
    }
    
    return {
      reasoning: "Model provided valid response",
      action: { type: 'final_answer', content: parsed }
    };
  }
});
```

---

## 7. Real-World Usage Examples

### 7.1 Code Review System (Your Example)
```typescript
// 1. Router decides which specialist to use
const triageRouter = createRouter({
  name: "TriageRouter",
  routes: {
    code: "CodeReviewAgent",
    doc: "DocReviewAgent", 
    design: "DesignLintAgent",
    observability: "ObservabilityAgent"
  },
  intentSchema: z.object({
    target: z.enum(["code", "doc", "design", "observability"])
  })
});

// 2. Specialist agents
const CodeReviewAgent = createAgent({
  name: "CodeReviewAgent",
  system: "Analyzes AST, dependencies and generates tests with codemods",
  model: openai("gpt-4o-mini"),
  tools: ["runAstLint", "generateTests"],
  
  async think(input: RepoCtx, ctx) {
    return {
      reasoning: "Need to run linters and suggest fixes",
      action: {
        type: "tool_call",
        toolName: "runAstLint", 
        input: { repoPath: input.repoPath, files: input.changedFiles }
      }
    };
  }
});

const DocReviewAgent = createAgent({
  name: "DocReviewAgent",
  system: "Verifies Docusaurus / Notion links broken and TOC",
  model: openai("gpt-4o-mini"),
  tools: ["notionSearch", "spellcheckDocs"]
});

const DesignLintAgent = createAgent({
  name: "DesignLintAgent",
  system: "Compares tokens from Figma vs code",
  model: openai("gpt-4o-mini"),
  tools: ["figmaTokens", "cssParser"]
});

const ObservabilityAgent = createAgent({
  name: "ObservabilityAgent",
  system: "Cross-checks with Sentry/Kibana logs",
  model: openai("gpt-4o-mini"),
  tools: ["sentryQuery", "kibanaSearch"]
});

// 3. Parallel MCP fan-out
const mcpFanOut = createParallel({
  name: "ExternalMCPs",
  agents: ["JiraBot", "GitHubBot", "DocsBot"] // String references
});

// 4. Manager with planner
const ReviewManager = createAgent({
  name: "ReviewManager",
  system: "Controls the Quality Gate pre-PR",
  model: openai("gpt-4o"),
  planner: dynamicPlanner,
  tools: [triageRouter, mcpFanOut],
  
  async think(input: RepoCtx, ctx) {
    // Phase 1: External context gathering
    return {
      reasoning: "Want external context before reviewing",
      action: {
        type: "tool_call",
        toolName: "ExternalMCPs",
        input: { pr: input.pr }
      }
    };
  },

  async onToolResult(result, ctx) {
    // Phase 2: File-by-file routing
    for (const file of ctx.repo.changedFiles) {
      await ctx.tools.TriageRouter({ text: file.path });
    }
    
    // Phase 3: Finalize
    return {
      reasoning: "All reviews complete",
      action: {
        type: "final_answer",
        content: ctx.collectFindings()
      }
    };
  }
});

// 5. Pipeline orchestration
const reviewQualityGate = createSequence(
  "CheckoutRepo",          // External step
  ReviewManager,           // Our autonomous stage
  "HumanCodeOwners"        // Human review step
);

// Usage
export async function runQualityGate(pr: number) {
  const result = await reviewQualityGate.run({ pr });
  if (result.ok) {
    console.log("✅ Kody approved: merge enabled");
  } else {
    console.log("❌ Quality Gate failed – see PR comments");
    process.exit(1);
  }
}
```

### 7.2 Customer Support System
```typescript
const supportRouter = createRouter({
  name: "SupportRouter",
  routes: {
    technical: "TechnicalSupportAgent",
    billing: "BillingAgent", 
    general: "GeneralSupportAgent"
  },
  intentSchema: z.object({
    category: z.enum(["technical", "billing", "general"]),
    urgency: z.enum(["low", "medium", "high"])
  })
});

const escalationAgent = createAgent({
  name: "EscalationAgent",
  tools: [supportRouter],
  
  async think(ticket: SupportTicket, ctx) {
    return {
      reasoning: "Need to route this support ticket",
      action: {
        type: 'tool_call',
        toolName: 'supportRouter',
        input: ticket
      }
    };
  },
  
  async onRouterResult(routing, ctx) {
    const ticket = ctx.originalInput;
    
    if (ticket.urgency === "high" && routing.confidence < 0.8) {
      return {
        reasoning: "High urgency + low confidence = human escalation",
        action: { 
          type: 'escalate', 
          escalateTo: 'senior-support', 
          reason: 'Complex high-priority issue' 
        }
      };
    }
    
    return {
      reasoning: `Routing to ${routing.selectedAgent}`,
      action: { 
        type: 'delegate', 
        targetAgent: routing.selectedAgent, 
        input: ticket 
      }
    };
  }
});

const supportPipeline = createSequence(
  "ValidateTicket",        // External validation
  escalationAgent,         // Smart routing
  "UpdateCRM"              // External CRM update
);
```

### 7.3 Document Processing System
```typescript
const documentProcessor = createAgent({
  name: "DocumentProcessor",
  tools: ["pdfReader", "imageExtractor", "textAnalyzer", "translator"],
  
  async think(document: DocumentInput, ctx) {
    const docType = this.detectDocumentType(document);
    
    switch (docType) {
      case 'pdf':
        return { 
          reasoning: "PDF detected, extracting text",
          action: { type: 'tool_call', toolName: 'pdfReader', input: document } 
        };
      case 'image':
        return { 
          reasoning: "Image detected, extracting content",
          action: { type: 'tool_call', toolName: 'imageExtractor', input: document } 
        };
      default:
        return { 
          reasoning: "Text document, analyzing directly",
          action: { type: 'tool_call', toolName: 'textAnalyzer', input: document } 
        };
    }
  },
  
  async onToolResult(result, ctx) {
    // Chain tools based on result
    if (ctx.lastTool === 'pdfReader') {
      return {
        reasoning: "PDF text extracted, now analyzing",
        action: { 
          type: 'tool_call', 
          toolName: 'textAnalyzer', 
          input: result.text 
        }
      };
    }
    
    if (ctx.lastTool === 'textAnalyzer' && result.language !== 'en') {
      return {
        reasoning: "Non-English text detected, translating",
        action: { 
          type: 'tool_call', 
          toolName: 'translator', 
          input: { text: result.text, target: 'en' } 
        }
      };
    }
    
    return {
      reasoning: "Document processing complete", 
      action: { type: 'final_answer', content: result }
    };
  }
});
```

---

## 8. Developer Journey

### 8.1 Beginner (First Hour)
```typescript
// Step 1: Hello World Agent (2 minutes)
const helloAgent = createAgent({
  async think(name: string) {
    return { action: { type: 'final_answer', content: `Hello, ${name}!` } };
  }
});

// Step 2: Agent with Tools (10 minutes)
const fileAgent = createAgent({
  tools: ["fileReader"],
  async think(filePath: string, ctx) {
    return { action: { type: 'tool_call', toolName: 'fileReader', input: { path: filePath } } };
  }
});

// Step 3: Agent with Lifecycle (15 minutes)
const loggedAgent = createAgent({
  tools: ["fileReader"],
  
  async onStart(input, ctx) {
    ctx.logger.info("Starting file processing", { file: input });
  },
  
  async think(filePath: string, ctx) {
    return { action: { type: 'tool_call', toolName: 'fileReader', input: { path: filePath } } };
  },
  
  async onToolResult(result, ctx) {
    return { action: { type: 'final_answer', content: `File processed: ${result.size} bytes` } };
  }
});
```

### 8.2 Intermediate (First Day)
```typescript
// Multi-step workflow agent
const workflowAgent = createAgent({
  tools: ["validator", "processor", "notifier"],
  
  async think(input, ctx) {
    const step = ctx.state.get('step') || 'validate';
    
    switch (step) {
      case 'validate':
        ctx.state.set('step', 'process');
        return { action: { type: 'tool_call', toolName: 'validator', input } };
        
      case 'process':
        ctx.state.set('step', 'notify');
        return { action: { type: 'tool_call', toolName: 'processor', input } };
        
      case 'notify':
        return { action: { type: 'tool_call', toolName: 'notifier', input } };
    }
  }
});

// Router-based delegation
const managerAgent = createAgent({
  tools: [specialistRouter],
  
  async think(request, ctx) {
    return { 
      action: { 
        type: 'tool_call', 
        toolName: 'specialistRouter', 
        input: request 
      } 
    };
  },
  
  async onRouterResult(routing, ctx) {
    return { 
      action: { 
        type: 'delegate', 
        targetAgent: routing.selectedAgent, 
        input: routing.processedInput 
      } 
    };
  }
});
```

### 8.3 Advanced (First Week)
```typescript
// Complex coordination with planning
const masterCoordinator = createAgent({
  name: "MasterCoordinator",
  planner: dynamicPlanner,
  tools: [triageRouter, parallelProcessor, qualityGate],
  
  async think(complexTask, ctx) {
    // Planner automatically manages multi-step reasoning
    const strategy = await this.planExecution(complexTask, ctx);
    return this.executeStrategy(strategy, ctx);
  }
});

// Custom pipeline with mixed steps
const advancedPipeline = createSequence(
  "ExternalPreprocessor",  // String reference
  triageRouter,           // Router step
  parallelProcessor,      // Parallel pipeline
  masterCoordinator,      // Coordinator agent
  "ExternalPostprocess"   // String reference
);
```

---

## 9. Implementation Requirements

### 9.1 Phase 1: Enhanced Developer Experience (Week 1-2)

#### 9.1.1 Tool Access Improvements
**Priority:** High  
**Effort:** 3 days

**Requirements:**
- `ctx.tools.toolName()` proxy for direct tool access
- `ctx.runTool(name, input)` helper method
- Better error messages for missing tools

**Acceptance Criteria:**
```typescript
// This should work:
const result = await ctx.tools.fileReader({ path: 'test.txt' });

// And this:
const result = await ctx.runTool('fileReader', { path: 'test.txt' });

// With clear errors if tool missing
```

#### 9.1.2 Enhanced Lifecycle Hooks
**Priority:** High  
**Effort:** 2 days

**Requirements:**
- `onToolResult()` hook for handling tool responses
- `onRouterResult()` hook for handling routing decisions
- `onModelResponse()` hook for handling LLM responses

**Acceptance Criteria:**
- All hooks are optional
- Clear typing for each hook's parameters
- Hooks can return new `AgentThought` to continue workflow

#### 9.1.3 Router as Tool Integration
**Priority:** High  
**Effort:** 3 days

**Requirements:**
- Routers can be added to agent `tools` array
- `ctx.tools.routerName()` works for routers
- `onRouterResult()` hook is called automatically

### 9.2 Phase 2: Integration Enhancements (Week 3-4)

#### 9.2.1 Enhanced Pipeline Steps
**Priority:** High  
**Effort:** 4 days

**Requirements:**
- Pipelines accept string references (external steps)
- Pipelines accept router objects as steps
- Clear error handling for missing external steps

#### 9.2.2 Multi-Agent Router Strategy
**Priority:** Medium  
**Effort:** 3 days

**Requirements:**
- `strategy: 'router-based'` option for multi-agent
- Router-based coordination logic
- Fallback strategies when routing fails

#### 9.2.3 Planner Integration
**Priority:** Medium  
**Effort:** 3 days

**Requirements:**
- `planner` property on agent config
- Automatic planner usage for complex reasoning
- Planner strategy selection (CoT/ToT/Dynamic)

### 9.3 Phase 3: Production Polish (Week 5-6)

#### 9.3.1 Error Handling & Recovery
**Priority:** Medium  
**Effort:** 4 days

**Requirements:**
- Automatic retry for transient failures
- Circuit breaker for failing tools
- Graceful degradation patterns

#### 9.3.2 Developer Tooling
**Priority:** Medium  
**Effort:** 5 days

**Requirements:**
- Enhanced error messages with suggestions
- Development mode with detailed logging
- Agent debugging utilities

---

## 10. Testing & Validation

### 10.1 Developer Experience Testing

#### 10.1.1 Time-to-First-Agent
**Target:** < 5 minutes for complete beginner
**Test:** New developer creates working agent from scratch

#### 10.1.2 Pattern Recognition
**Target:** Developer can identify correct pattern for their use case
**Test:** Present 10 common scenarios, developer picks right approach 80% of time

#### 10.1.3 API Discoverability  
**Target:** < 2 minutes to find right API for common tasks
**Test:** Using TypeScript autocomplete + docs, find correct API

### 10.2 Real-World Validation

#### 10.2.1 Code Review System
```typescript
describe('Code Review System', () => {
  test('handles complex PR workflow', async () => {
    const prData = createMockPR({ files: 15, changes: 500 });
    const result = await reviewQualityGate.run(prData);
    
    expect(result.success).toBe(true);
    expect(result.stages).toEqual(['checkout', 'review', 'human']);
    expect(result.findings).toBeDefined();
  });
});
```

#### 10.2.2 Customer Support System
```typescript
describe('Support System', () => {
  test('routes high-priority issues correctly', async () => {
    const ticket = { urgency: 'high', category: 'technical', content: '...' };
    const result = await supportPipeline.execute(ticket);
    
    expect(result.escalated).toBe(true);
    expect(result.assignedTo).toBe('senior-support');
  });
});
```

### 10.3 Performance Requirements

| Metric | Target | Test Method |
|--------|--------|-------------|
| Simple Agent Response | < 100ms | Unit test |
| Tool-using Agent | < 500ms | Integration test |
| Complex Pipeline | < 5s | E2E test |
| Router Decision Time | < 200ms | Unit test |

---

## 11. Success Criteria

### 11.1 Developer Experience
- [ ] **First Agent:** Beginner creates working agent in < 5 minutes
- [ ] **Pattern Selection:** 80% accuracy in choosing right pattern
- [ ] **API Discovery:** < 2 minutes to find needed API
- [ ] **Error Understanding:** Clear error messages, obvious fixes

### 11.2 Functionality
- [ ] **Tool Access:** `ctx.tools.toolName()` works for all tools
- [ ] **Router Integration:** Routers work as tools in agents
- [ ] **Pipeline Flexibility:** Supports mixed step types (agents, routers, strings)
- [ ] **Lifecycle Hooks:** All result handlers work correctly

### 11.3 Real-World Usage
- [ ] **Code Review System:** Complete PR workflow works end-to-end
- [ ] **Support System:** Handles routing, escalation, delegation
- [ ] **Document Processing:** Multi-modal processing with chained tools

---

This PRD focuses on making agent creation **intuitive and practical** for daily development work, using only the patterns and features you actually requested, without invented factory methods or unnecessary abstractions.