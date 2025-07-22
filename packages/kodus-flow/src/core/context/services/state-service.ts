/**
 * State Service Interface
 */

export interface StateService {
    get<T = unknown>(key: string): T | undefined;
    set<T = unknown>(key: string, value: T): void;
    delete(key: string): boolean;
    clear(): void;
    has(key: string): boolean;
    keys(): string[];
    values(): unknown[];
    entries(): Array<[string, unknown]>;
}

/**
 * State Service Implementation
 *
 * Provides namespaced state management with WeakMap-based isolation
 * Implements the StateManager interface from thread-safe-state.ts
 */

import type { StateManager } from '../../../utils/thread-safe-state.js';

/**
 * Context-based state service using WeakMap for automatic cleanup
 */
export class ContextStateService implements StateManager {
    private readonly stateMap = new WeakMap<
        object,
        Map<string, Map<string, unknown>>
    >();
    private readonly maxNamespaceSize: number;
    private readonly maxNamespaces: number;

    constructor(
        private readonly contextKey: object,
        options: {
            maxNamespaceSize?: number;
            maxNamespaces?: number;
        } = {},
    ) {
        this.maxNamespaceSize = options.maxNamespaceSize ?? 1000; // Prevent namespace from growing too large
        this.maxNamespaces = options.maxNamespaces ?? 100; // Prevent too many namespaces
    }

    /**
     * Get a value from a specific namespace
     */
    async get<T>(namespace: string, key: string): Promise<T | undefined> {
        // ✅ ADD: Log detalhado para debug
        console.log('🔧 CONTEXT STATE SERVICE - GET OPERATION', {
            namespace,
            key,
            contextKeyExists: !!this.contextKey,
            namespacesCount: this.stateMap.get(this.contextKey)?.size || 0,
            trace: {
                source: 'context-state-service',
                step: 'get-operation-start',
                timestamp: Date.now(),
            },
        });

        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            console.log(
                '🔧 CONTEXT STATE SERVICE - GET FAILED - NO NAMESPACES',
                {
                    namespace,
                    key,
                    trace: {
                        source: 'context-state-service',
                        step: 'get-no-namespaces',
                        timestamp: Date.now(),
                    },
                },
            );
            return undefined;
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            console.log(
                '🔧 CONTEXT STATE SERVICE - GET FAILED - NO NAMESPACE',
                {
                    namespace,
                    key,
                    availableNamespaces: Array.from(namespaces.keys()),
                    trace: {
                        source: 'context-state-service',
                        step: 'get-no-namespace',
                        timestamp: Date.now(),
                    },
                },
            );
            return undefined;
        }

        const value = namespaceMap.get(key) as T | undefined;

        // ✅ ADD: Log após get
        console.log('🔧 CONTEXT STATE SERVICE - GET RESULT', {
            namespace,
            key,
            valueFound: !!value,
            valueType: typeof value,
            namespaceSize: namespaceMap.size,
            trace: {
                source: 'context-state-service',
                step: 'get-result',
                timestamp: Date.now(),
            },
        });

        return value;
    }

    /**
     * Set a value in a specific namespace
     */
    async set(namespace: string, key: string, value: unknown): Promise<void> {
        // Validate inputs for security
        if (!namespace || typeof namespace !== 'string') {
            throw new Error('Namespace must be a non-empty string');
        }
        if (!key || typeof key !== 'string') {
            throw new Error('Key must be a non-empty string');
        }

        // ✅ ADD: Log detalhado para debug
        console.log('🔧 CONTEXT STATE SERVICE - SET OPERATION', {
            namespace,
            key,
            valueType: typeof value,
            hasValue: !!value,
            contextKeyExists: !!this.contextKey,
            namespacesCount: this.stateMap.get(this.contextKey)?.size || 0,
            trace: {
                source: 'context-state-service',
                step: 'set-operation-start',
                timestamp: Date.now(),
            },
        });

        // CRÍTICO: Operação atômica para evitar race conditions
        let namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            namespaces = new Map();
            this.stateMap.set(this.contextKey, namespaces);
            console.log(
                '🔧 CONTEXT STATE SERVICE - CREATED NEW NAMESPACES MAP',
                {
                    namespace,
                    key,
                    trace: {
                        source: 'context-state-service',
                        step: 'create-namespaces-map',
                        timestamp: Date.now(),
                    },
                },
            );
        }

        // Check namespace limit ANTES de criar novo namespace
        if (
            !namespaces.has(namespace) &&
            namespaces.size >= this.maxNamespaces
        ) {
            throw new Error(
                `Maximum number of namespaces (${this.maxNamespaces}) exceeded`,
            );
        }

        let namespaceMap = namespaces.get(namespace);

        if (!namespaceMap) {
            namespaceMap = new Map();
            namespaces.set(namespace, namespaceMap);
            console.log('🔧 CONTEXT STATE SERVICE - CREATED NEW NAMESPACE', {
                namespace,
                key,
                namespacesCount: namespaces.size,
                trace: {
                    source: 'context-state-service',
                    step: 'create-namespace',
                    timestamp: Date.now(),
                },
            });
        }

        // Check namespace size limit ANTES de adicionar nova key
        if (
            !namespaceMap.has(key) &&
            namespaceMap.size >= this.maxNamespaceSize
        ) {
            throw new Error(
                `Maximum namespace size (${this.maxNamespaceSize}) exceeded for namespace '${namespace}'`,
            );
        }

        namespaceMap.set(key, value);

        // ✅ ADD: Log após set bem-sucedido
        console.log('🔧 CONTEXT STATE SERVICE - SET SUCCESS', {
            namespace,
            key,
            valueType: typeof value,
            namespaceSize: namespaceMap.size,
            totalNamespaces: namespaces.size,
            trace: {
                source: 'context-state-service',
                step: 'set-success',
                timestamp: Date.now(),
            },
        });
    }

    /**
     * Delete a specific key from a namespace
     */
    async delete(namespace: string, key: string): Promise<boolean> {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return false;
        }

        const namespaceMap = namespaces.get(namespace);

        if (!namespaceMap) {
            return false;
        }

        return namespaceMap.delete(key);
    }

    /**
     * Clear all keys in a namespace, or all namespaces if none specified
     */
    async clear(namespace?: string): Promise<void> {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return;
        }

        if (namespace) {
            const namespaceMap = namespaces.get(namespace);
            if (namespaceMap) {
                namespaceMap.clear();
            }
        } else {
            namespaces.clear();
        }
    }

    /**
     * Check if a key exists in a namespace
     */
    async has(namespace: string, key: string): Promise<boolean> {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            return false;
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            return false;
        }

        return namespaceMap.has(key);
    }

    /**
     * Get all keys in a namespace (required by StateManager interface)
     */
    async keys(namespace: string): Promise<string[]> {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            return [];
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            return [];
        }

        return Array.from(namespaceMap.keys());
    }

    /**
     * Get size of a namespace or total size (required by StateManager interface)
     */
    async size(namespace?: string): Promise<number> {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            return 0;
        }

        if (namespace) {
            const namespaceMap = namespaces.get(namespace);
            return namespaceMap ? namespaceMap.size : 0;
        } else {
            let total = 0;
            for (const namespaceMap of namespaces.values()) {
                total += namespaceMap.size;
            }
            return total;
        }
    }

    /**
     * Get all data from a specific namespace
     */
    getNamespace(namespace: string): Record<string, unknown> {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return {};
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            return {};
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of namespaceMap) {
            result[key] = value;
        }

        return result;
    }

    /**
     * Get all namespaces and their data
     */
    getAllNamespaces(): Record<string, Record<string, unknown>> {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return {};
        }

        const result: Record<string, Record<string, unknown>> = {};
        for (const [namespace, namespaceMap] of namespaces) {
            result[namespace] = {};

            for (const [key, value] of namespaceMap) {
                result[namespace][key] = value;
            }
        }

        return result;
    }

    /**
     * Check if a namespace exists
     */
    hasNamespace(namespace: string): boolean {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return false;
        }

        return namespaces.has(namespace);
    }

    /**
     * Get size of a namespace
     */
    getNamespaceSize(namespace: string): number {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            return 0;
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            return 0;
        }

        return namespaceMap.size;
    }

    /**
     * List all namespace names
     */
    getNamespaceNames(): string[] {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return [];
        }

        return Array.from(namespaces.keys());
    }
}

/**
 * Global state service using a global key for shared state
 */
export class GlobalStateService implements StateManager {
    private static readonly globalState = new Map<
        string,
        Map<string, unknown>
    >();

    async get<T>(namespace: string, key: string): Promise<T | undefined> {
        const namespaceMap = GlobalStateService.globalState.get(namespace);

        if (!namespaceMap) {
            return undefined;
        }

        return namespaceMap.get(key) as T | undefined;
    }

    async set(namespace: string, key: string, value: unknown): Promise<void> {
        let namespaceMap = GlobalStateService.globalState.get(namespace);

        if (!namespaceMap) {
            namespaceMap = new Map();
            GlobalStateService.globalState.set(namespace, namespaceMap);
        }

        namespaceMap.set(key, value);
    }

    async delete(namespace: string, key: string): Promise<boolean> {
        const namespaceMap = GlobalStateService.globalState.get(namespace);

        if (!namespaceMap) {
            return false;
        }

        return namespaceMap.delete(key);
    }

    async clear(namespace?: string): Promise<void> {
        if (namespace) {
            const namespaceMap = GlobalStateService.globalState.get(namespace);

            if (namespaceMap) {
                namespaceMap.clear();
            }
        } else {
            GlobalStateService.globalState.clear();
        }
    }

    async has(namespace: string, key: string): Promise<boolean> {
        const namespaceMap = GlobalStateService.globalState.get(namespace);
        return namespaceMap ? namespaceMap.has(key) : false;
    }

    async keys(namespace: string): Promise<string[]> {
        const namespaceMap = GlobalStateService.globalState.get(namespace);
        return namespaceMap ? Array.from(namespaceMap.keys()) : [];
    }

    async size(namespace?: string): Promise<number> {
        if (namespace) {
            const namespaceMap = GlobalStateService.globalState.get(namespace);
            return namespaceMap ? namespaceMap.size : 0;
        } else {
            let total = 0;
            for (const namespaceMap of GlobalStateService.globalState.values()) {
                total += namespaceMap.size;
            }
            return total;
        }
    }

    getNamespace(namespace: string): Record<string, unknown> {
        const namespaceMap = GlobalStateService.globalState.get(namespace);

        if (!namespaceMap) {
            return {};
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of namespaceMap) {
            result[key] = value;
        }

        return result;
    }
}

/**
 * Factory function to create a state service for a specific context
 */
export function createStateService(
    contextKey: object,
    options?: {
        maxNamespaceSize?: number;
        maxNamespaces?: number;
    },
): StateManager {
    return new ContextStateService(contextKey, options);
}

/**
 * Factory function to create a global state service
 */
export function createGlobalStateService(): StateManager {
    return new GlobalStateService();
}
