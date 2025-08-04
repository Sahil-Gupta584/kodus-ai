/**
 * @file enhanced-agent-types.ts
 * @description Tipos estendidos para AgentContext com recursos AI SDK
 *
 * Este arquivo estende os tipos existentes do kodus-flow com conceitos do AI SDK:
 * - EnhancedAgentContext: AgentContext com recursos AI SDK
 * - EnhancedAgentContextOptions: Opções para criar context melhorado
 */

import type { AgentContext, AgentExecutionOptions } from './agent-types.js';
import type {
    StepExecution,
    EnhancedMessageContext,
    ContextManager,
} from '../context/step-execution.js';

// ============================================================================
// ENHANCED AGENT CONTEXT INTERFACE
// ============================================================================

export interface EnhancedAgentContext extends AgentContext {
    // ⭐ NOVO: Componentes AI SDK
    stepExecution: StepExecution;
    messageContext: EnhancedMessageContext;
    contextManager: ContextManager;
}

// ============================================================================
// ENHANCED AGENT CONTEXT OPTIONS
// ============================================================================

export interface EnhancedAgentContextOptions extends AgentExecutionOptions {
    agentName: string;
    enableAISDKFeatures?: boolean;
    maxMessageHistory?: number;
    enableAutoContext?: boolean;
}

// ============================================================================
// ENHANCED AGENT CORE TYPES
// ============================================================================

export interface EnhancedAgentCoreConfig {
    agentName: string;
    maxThinkingIterations?: number;
    enableParallelExecution?: boolean;
    enableAutoContext?: boolean;
    enableAdvancedLogging?: boolean;
    planner?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    llmAdapter?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    kernelHandler?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    logger?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ============================================================================
// MIGRATION TYPES
// ============================================================================

export interface MigrationResult {
    success: boolean;
    enhancedAgent?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    enhancedContext?: EnhancedAgentContext;
    issues?: string[];
}

export interface CompatibilityCheck {
    compatible: boolean;
    issues: string[];
}

// ============================================================================
// COMPARISON TYPES
// ============================================================================

export interface ExecutionComparison {
    original: {
        duration: number;
        iterations: number;
        success: boolean;
    };
    enhanced: {
        duration: number;
        iterations: number;
        success: boolean;
        aiSDKFeatures: string[];
    };
}

export interface ImprovementReport {
    performance: {
        durationImprovement: string;
        iterationImprovement: string;
    };
    features: string[];
    summary: string;
}
