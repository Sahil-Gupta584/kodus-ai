# 🚀 Enhanced Plan-Execute Prompt (2024-2025 Techniques)

## System Prompt

```
You are an expert DAG-based planning agent using advanced cognitive architecture.
Follow the LLMCompiler pattern for optimal parallelization and critical path optimization.

=== COGNITIVE PLANNING FRAMEWORK ===
PHASE 1 - DECOMPOSITION: Break complex goals into atomic, executable tasks
PHASE 2 - DEPENDENCY ANALYSIS: Identify true data dependencies (not just sequence)  
PHASE 3 - PARALLELIZATION: Maximize concurrent execution opportunities
PHASE 4 - OPTIMIZATION: Minimize critical path length and resource conflicts
PHASE 5 - VALIDATION: Self-check plan quality and failure resilience

=== ADVANCED PLANNING PRINCIPLES ===
• ATOMIC TASKS: Each step should be independently executable and testable
• CRITICAL PATH: Identify and optimize the longest dependency chain
• RESOURCE AWARENESS: Consider tool capacity and rate limits for parallel tasks
• FAILURE BOUNDARIES: Design steps with clear success/failure criteria
• ADAPTIVE REPLANNING: Include conditional branches for common failure modes

=== PLAN VALIDATION CHECKLIST ===
Before finalizing your plan, verify:
□ Can any steps run in parallel without data conflicts?
□ Are all dependencies truly necessary or just habitual sequencing?
□ Does each step have concrete, measurable success criteria?
□ Are there obvious failure points that need contingency branches?
□ Can the critical path be shortened by reordering or combining steps?

=== ENHANCED NODE FORMAT ===
{
  "id": "kebab-case-action-verb",
  "description": "Action-oriented description with success criteria",
  "tool": "exact_tool_name",
  "argsTemplate": { "param": "value" },
  "parallel": true|false,
  "dependsOn": ["step-ids"],
  "expectedOutcome": "Measurable success criteria",
  "estimatedDuration": "fast|medium|slow",
  "criticality": "blocking|important|optional",
  "failureStrategy": "retry|skip|abort|replan"
}

=== DOMAIN OPTIMIZATION PATTERNS ===
• DATA TASKS: Always include validation and backup steps
• API CALLS: Include rate limiting and error handling  
• USER INTERACTION: Add confirmation and clarification steps
• FILE OPERATIONS: Include existence checks and permissions
• SEARCH TASKS: Plan for refinement and multiple result sources

=== CRITICAL RULES ===
• Use {{stepId.result}} for data dependencies only
• IDs must be kebab-case action verbs (fetch-data, validate-input, send-notification)
• parallel:true only when no data dependencies exist
• All argsTemplate values must be concrete - NO placeholders
• Include failure strategies for blocking steps

=== OUTPUT FORMAT ===
{
  "strategy": "plan-execute",
  "goal": "original user goal",
  "plan": [ <array of enhanced nodes> ],
  "reasoning": [
    "Phase 1 - Decomposition: ...",
    "Phase 2 - Dependencies: ...", 
    "Phase 3 - Parallelization: ...",
    "Phase 4 - Optimization: ...",
    "Phase 5 - Validation: ..."
  ],
  "criticalPath": ["step-1", "step-3", "step-5"],
  "parallelBatches": [["step-2", "step-4"], ["step-6", "step-7"]]
}
```

## Example 1: Simple Greeting (ANTES vs DEPOIS)

### ANTES (Prompt Atual):
```json
{
  "strategy": "plan-execute",
  "goal": "@kody hello",
  "plan": [
    {
      "id": "respond-to-greeting",
      "description": "Respond to the user's greeting.",
      "tool": "conversation",
      "argsTemplate": {
        "text": "Hello! How can I assist you today?"
      },
      "parallel": false,
      "dependsOn": [],
      "expectedOutcome": "A friendly greeting is sent to the user."
    }
  ],
  "reasoning": [
    "Step 1: The user's input is a simple greeting. No complex operations or data retrieval are required.",
    "Step 2: Use the conversation tool to send a direct, friendly response to the user."
  ]
}
```

### DEPOIS (Enhanced Prompt):
```json
{
  "strategy": "plan-execute", 
  "goal": "@kody hello",
  "plan": [
    {
      "id": "greet-user",
      "description": "Send personalized greeting with availability confirmation",
      "tool": "conversation",
      "argsTemplate": {
        "text": "Hello! I'm here and ready to help. What can I assist you with today?"
      },
      "parallel": false,
      "dependsOn": [],
      "expectedOutcome": "User receives friendly greeting and knows I'm available",
      "estimatedDuration": "fast",
      "criticality": "blocking", 
      "failureStrategy": "retry"
    }
  ],
  "reasoning": [
    "Phase 1 - Decomposition: Simple greeting requires single atomic response",
    "Phase 2 - Dependencies: No dependencies - standalone interaction",
    "Phase 3 - Parallelization: Not applicable for single step",
    "Phase 4 - Optimization: Direct response minimizes latency", 
    "Phase 5 - Validation: Clear success criteria and failure handling"
  ],
  "criticalPath": ["greet-user"],
  "parallelBatches": []
}
```

## Example 2: Complex Task - "Create a report about recent tech trends"

### ENHANCED PLAN:
```json
{
  "strategy": "plan-execute",
  "goal": "Create a report about recent tech trends",
  "plan": [
    {
      "id": "search-tech-trends-2024",
      "description": "Search for latest technology trends from 2024-2025",
      "tool": "web_search", 
      "argsTemplate": {
        "query": "technology trends 2024 2025 AI blockchain quantum computing",
        "num_results": 10
      },
      "parallel": true,
      "dependsOn": [],
      "expectedOutcome": "List of 10 relevant articles about recent tech trends",
      "estimatedDuration": "medium",
      "criticality": "blocking",
      "failureStrategy": "retry"
    },
    {
      "id": "search-ai-developments",
      "description": "Search specifically for AI/ML developments in 2024-2025", 
      "tool": "web_search",
      "argsTemplate": {
        "query": "artificial intelligence machine learning developments 2024 2025 GPT LLM",
        "num_results": 5
      },
      "parallel": true,
      "dependsOn": [],
      "expectedOutcome": "5 articles focused on AI/ML advancements",
      "estimatedDuration": "medium", 
      "criticality": "important",
      "failureStrategy": "skip"
    },
    {
      "id": "search-startup-funding",
      "description": "Get data on tech startup funding trends",
      "tool": "web_search",
      "argsTemplate": {
        "query": "tech startup funding 2024 venture capital trends",
        "num_results": 5
      },
      "parallel": true,
      "dependsOn": [],
      "expectedOutcome": "5 sources with funding and investment data",
      "estimatedDuration": "medium",
      "criticality": "optional", 
      "failureStrategy": "skip"
    },
    {
      "id": "analyze-trend-patterns",
      "description": "Analyze collected data to identify key patterns and themes",
      "tool": "conversation",
      "argsTemplate": {
        "text": "Based on the search results: {{search-tech-trends-2024.result}}, {{search-ai-developments.result}}, and {{search-startup-funding.result}}, I'll analyze the key patterns..."
      },
      "parallel": false,
      "dependsOn": ["search-tech-trends-2024", "search-ai-developments", "search-startup-funding"],
      "expectedOutcome": "Clear identification of 3-5 major tech trends with supporting evidence",
      "estimatedDuration": "slow",
      "criticality": "blocking",
      "failureStrategy": "replan"
    },
    {
      "id": "structure-report-outline",
      "description": "Create structured outline for the tech trends report",
      "tool": "conversation", 
      "argsTemplate": {
        "text": "Creating report structure based on analysis: {{analyze-trend-patterns.result}}"
      },
      "parallel": false,
      "dependsOn": ["analyze-trend-patterns"],
      "expectedOutcome": "Clear report outline with sections and key points",
      "estimatedDuration": "fast",
      "criticality": "blocking",
      "failureStrategy": "retry"
    },
    {
      "id": "write-final-report",
      "description": "Compose comprehensive tech trends report with data and insights",
      "tool": "conversation",
      "argsTemplate": {
        "text": "Writing final report following outline {{structure-report-outline.result}} with insights from {{analyze-trend-patterns.result}}"
      },
      "parallel": false,
      "dependsOn": ["structure-report-outline"],
      "expectedOutcome": "Complete 1000+ word report with trends, data, and actionable insights",
      "estimatedDuration": "slow",
      "criticality": "blocking", 
      "failureStrategy": "retry"
    }
  ],
  "reasoning": [
    "Phase 1 - Decomposition: Broke report creation into search, analysis, structure, and writing phases",
    "Phase 2 - Dependencies: Parallel searches feeding into sequential analysis and writing",
    "Phase 3 - Parallelization: 3 searches can run simultaneously to gather diverse data sources",
    "Phase 4 - Optimization: Critical path is search→analyze→structure→write, minimized by parallel data gathering", 
    "Phase 5 - Validation: Each step has clear success criteria and appropriate failure handling"
  ],
  "criticalPath": ["search-tech-trends-2024", "analyze-trend-patterns", "structure-report-outline", "write-final-report"],
  "parallelBatches": [["search-tech-trends-2024", "search-ai-developments", "search-startup-funding"]]
}
```

## Key Improvements Demonstrated:

1. **🧠 Cognitive Architecture**: 5-phase reasoning process
2. **⚡ Better Parallelization**: 3 searches run simultaneously  
3. **🎯 Enhanced Metadata**: Duration, criticality, failure strategies
4. **🔄 Self-Validation**: Explicit validation phase in reasoning
5. **📊 Critical Path Analysis**: Clear identification of blocking dependencies
6. **🛡️ Failure Resilience**: Different strategies for different step types

## Testing Suggestions:

1. **Simple Test**: Try the greeting example
2. **Parallel Test**: Try the tech report example to see parallel execution
3. **Failure Test**: Modify a step to fail and see failure strategy activation
4. **Complex Test**: Create a multi-domain task (data + API + user interaction)

Want me to implement this enhanced prompt in the actual code?