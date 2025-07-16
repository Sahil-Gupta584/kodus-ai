/**
 * @module core/services/service-access
 * @description Service access helpers for agents - memory, state, session only
 *
 * PRINCIPLES:
 * - Focused on core services: memory, state, session
 * - Graceful degradation when services unavailable
 * - Simple save/load primitives for agents
 */

import type { AgentRuntime } from './service-registry.js';

/**
 * Service access helpers for agents
 * Provides save/load primitives using available services
 */
export class ServiceAccess {
    constructor(private runtime: AgentRuntime) {}

    /**
     * Save data (uses best available service)
     * Priority: memory -> state -> error
     */
    async save(
        key: string,
        value: unknown,
        options?: {
            namespace?: string;
            tenantId?: string;
            sessionId?: string;
        },
    ): Promise<void> {
        const { memory, state } = this.runtime.services;

        // Try memory service first (persistent)
        if (memory) {
            await memory.store({
                key,
                content: value,
                tenantId: options?.tenantId,
                sessionId: options?.sessionId,
            });
            return;
        }

        // Fallback to state service (temporary)
        if (state) {
            const namespace = options?.namespace || 'default';
            await state.set(namespace, key, value);
            return;
        }

        throw new Error('No storage service available for save operation');
    }

    /**
     * Load data (uses best available service)
     * Priority: memory -> state -> undefined
     */
    async load(
        key: string,
        options?: {
            namespace?: string;
            tenantId?: string;
            sessionId?: string;
        },
    ): Promise<unknown> {
        const { memory, state } = this.runtime.services;

        // Try memory service first (persistent)
        if (memory) {
            const results = await memory.query({
                tenantId: options?.tenantId,
                sessionId: options?.sessionId,
                limit: 1,
            });
            const item = results.find((r) => r.key === key);
            return item?.value;
        }

        // Fallback to state service (temporary)
        if (state) {
            const namespace = options?.namespace || 'default';
            return await state.get(namespace, key);
        }

        return undefined;
    }

    /**
     * Check if services are available
     */
    hasMemory(): boolean {
        return !!this.runtime.services.memory;
    }

    hasState(): boolean {
        return !!this.runtime.services.state;
    }

    hasSession(): boolean {
        return !!this.runtime.services.session;
    }
}

/**
 * Create service access helper from runtime
 */
export function createServiceAccess(runtime: AgentRuntime): ServiceAccess {
    return new ServiceAccess(runtime);
}
