/**
 * 🧠 CONTEXTNEW - SIMPLIFIED & EFFICIENT
 *
 * Clean context architecture for agent runtime
 * Solves createFinalResponse context problem with minimal overhead
 */

// ===============================================
// 🎯 CORE TYPES
// ===============================================

export type {
    // Runtime context (what agent needs NOW)
    AgentRuntimeContext,
    ChatMessage,
    ToolCall,
    EntityRef,
    ConnectionStatus,

    // LLM Plan compatibility
    PlanStep,
    PlanningResult,
    PlanExecutionBridge,

    // Persistence (for recovery)
    ExecutionSnapshot,
    StepResult,

    // Context bridge (solves createFinalResponse)
    ContextBridgeService,
    FinalResponseContext,

    // Session management
    SessionManager,

    // Utilities
    ContextUpdate,
    EntityResolver,
    IntentInference,
    RecoveryStrategy,
    ContextHealth,
} from './types/context-types.js';

// ===============================================
// 🏗️ SERVICES
// ===============================================

export {
    // MongoDB implementation
    MongoDBSessionService,
} from './services/mongodb-session-service.js';

export {
    // Context bridge implementation
    ContextBridge,
    EnhancedResponseBuilder,
    ContextBridgeUsageExample,
    createContextBridge,
} from './services/context-bridge-service.js';

// ===============================================
// 🎛️ UTILITIES
// ===============================================

export {
    // Type guards and validators
    isValidRuntimeContext,
    isValidChatMessage,
    isRecoveryNeeded,
} from './types/context-types.js';

// ===============================================
// 🚀 QUICK START FACTORY
// ===============================================

import { createContextBridge } from './services/context-bridge-service.js';
import { MongoDBSessionService } from './services/mongodb-session-service.js';

/**
 * Quick setup for ContextNew with MongoDB
 */
export function createContextRuntime(mongoConnectionString: string) {
    const sessionManager = new MongoDBSessionService(mongoConnectionString);
    const contextBridge = createContextBridge(mongoConnectionString);

    return {
        sessionManager,
        contextBridge,

        // Convenience methods
        async getContext(sessionId: string) {
            return contextBridge.getRuntimeContext(sessionId);
        },

        async buildFinalResponseContext(plannerContext: any) {
            return contextBridge.buildFinalResponseContext(plannerContext);
        },

        async cleanup() {
            await sessionManager.cleanup();
        },
    };
}

// ===============================================
// 📋 SIMPLE USAGE EXAMPLE
// ===============================================

/*
// Quick setup:
const contextRuntime = createContextRuntime('mongodb://localhost:27017');

// In your plan-execute-planner.ts:
async createFinalResponse(plannerContext: PlannerExecutionContext) {
    // 🔥 THE SOLUTION - Complete context for rich responses!
    const finalContext = await contextRuntime.buildFinalResponseContext(plannerContext);
    
    // Now you have EVERYTHING:
    // - finalContext.runtime.messages (conversation)
    // - finalContext.runtime.entities (references like "esse card")
    // - finalContext.executionSummary (what was executed, success rates)
    // - finalContext.recovery (if session was recovered from gap)
    // - finalContext.inferences ("esse card" -> "PROJ-123")
    
    return {
        response: buildRichResponse(finalContext),
        confidence: calculateContextualConfidence(finalContext),
        metadata: {
            entitiesResolved: Object.keys(finalContext.inferences || {}).length,
            executionHistory: finalContext.executionSummary.totalExecutions,
            conversationLength: finalContext.runtime.messages.length
        }
    };
}
*/
