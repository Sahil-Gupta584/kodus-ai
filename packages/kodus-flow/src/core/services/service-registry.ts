/**
 * @module core/services/service-registry
 * @description Service Registry for clean dependency injection
 *
 * PRINCIPLES:
 * - Services are optional and injected
 * - Agent only uses what's available
 * - Clear separation of concerns
 * - No direct coupling
 */

import type { StateManager } from '../../utils/thread-safe-state.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { SessionService } from '../context/services/session-service.js';

/**
 * Core services available to agents
 * All services are optional - agents work with what's available
 */
export interface ServiceRegistry {
    /**
     * State service - temporary, request-scoped storage
     * Cleared after each execution
     */
    state?: StateManager;

    /**
     * Memory service - persistent, cross-request storage
     * Survives between executions
     */
    memory?: MemoryManager;

    /**
     * Session service - conversation tracking
     * Manages conversation history and context
     */
    session?: SessionService;
}

/**
 * Complete runtime environment for agents
 * Focused only on core services - tools/resources handled elsewhere
 */
export interface AgentRuntime {
    /**
     * Core services (all optional)
     */
    services: ServiceRegistry;
}
