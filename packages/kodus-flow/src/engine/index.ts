/**
 * @module engine
 * @description Engine Layer - Motor de execução simplificado e organizado
 *
 * Estrutura simplificada:
 * - core/: Motor principal e interface com Kernel
 * - agents/: Motor de agentes e lifecycle
 * - tools/: Motor de ferramentas
 * - workflows/: Motor de workflows
 * - routing/: Router inteligente
 * - planning/: Planejador
 */

// ===== CORE - Motor principal =====
// ExecutionEngine removido - funcionalidades migradas para MultiKernelHandler
export {
    MultiKernelHandler,
    createMultiKernelHandler,
    createDefaultMultiKernelHandler,
    type MultiKernelHandlerConfig,
    type MultiKernelExecutionResult,
} from './core/multi-kernel-handler.js';

// ===== AGENTS - Motor de agentes =====
export { AgentEngine, createAgent } from './agents/agent-engine.js';

export {
    AgentCore,
    createAgentCore,
    type AgentCoreConfig,
} from './agents/agent-core.js';

export {
    AgentLifecycleHandler,
    createAgentLifecycleHandler,
    type AgentRegistryEntry,
    type LifecycleStats,
} from './agents/agent-lifecycle.js';

// ===== MULTI-AGENT TYPES =====
export type {
    AgentCapability,
    AgentMessage,
    AgentCoordinationStrategy,
    AgentSelectionCriteria,
    MultiAgentContext,
    MultiAgentResult,
    WorkflowStep,
    WorkflowStepContext,
    MessageStatus,
    TrackedMessage,
    DelegationContext,
    DelegationResult,
} from './agents/multi-agent-types.js';

// ===== AGENT EXECUTION =====
export { AgentExecutor, createWorkflowAgent } from './agents/agent-executor.js';

// ===== TOOLS - Motor de ferramentas =====
export { ToolEngine, defineTool } from './tools/tool-engine.js';

// ===== WORKFLOWS - Motor de workflows =====
export {
    WorkflowEngine,
    WorkflowBuilder,
    defineWorkflow,
    type Step,
    type StepContext,
    type WorkflowDefinition,
} from './workflows/workflow-engine.js';

// ===== ROUTING - Router inteligente =====
export {
    Router,
    createRouter,
    routerAsAgent,
    type RouterConfig,
    type RoutingResult,
} from './routing/router.js';

// ===== AGENT ROUTING =====
// AgentRouter temporarily disabled - using main Router instead

// ===== PLANNING - Planejador =====
export {
    PlannerHandler as Planner,
    CoTPlanner,
    ToTPlanner,
    GraphPlanner,
    createPlannerHandler,
    createContextAwarePlanner,
    createPlanningContext,
    type PlanningStrategy,
    type Plan,
    type PlanStep,
    type PlanExecutionResult,
    type PlannerOptions,
    type PlanningAgent,
    type PlanningContext,
} from './planning/planner.js';

// ===== TYPES - Re-export de tipos comuns =====
export type {
    AgentContext,
    AgentThought,
    AgentAction,
} from '../core/types/common-types.js';

export type { AgentMetrics } from '../core/types/agent-types.js';
