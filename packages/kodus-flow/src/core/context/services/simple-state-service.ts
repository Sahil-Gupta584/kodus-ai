import {
    STATE_NAMESPACES,
    StateManager,
    StateNamespace,
} from '@/core/types/allTypes.js';
import { createLogger } from '../../../observability/index.js';

export class SimpleContextStateService implements StateManager {
    private readonly stateMap = new WeakMap<
        object,
        Map<string, Map<string, unknown>>
    >();
    private readonly logger = createLogger('simple-context-state-service');

    constructor(private readonly contextKey: object) {
        this.logger.debug('SimpleContextStateService initialized');
    }

    /**
     * Get a value from a specific namespace
     */
    async get<T>(namespace: string, key: string): Promise<T | undefined> {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            return undefined;
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            return undefined;
        }

        return namespaceMap.get(key) as T | undefined;
    }

    /**
     * Set a value in a specific namespace
     */
    async set(namespace: string, key: string, value: unknown): Promise<void> {
        // Validate inputs
        if (!namespace || typeof namespace !== 'string') {
            throw new Error('Namespace must be a non-empty string');
        }
        if (!key || typeof key !== 'string') {
            throw new Error('Key must be a non-empty string');
        }

        // Warn about non-standard namespace usage
        if (
            !Object.values(STATE_NAMESPACES).includes(
                namespace as StateNamespace,
            )
        ) {
            this.logger.warn('Using non-standard namespace', {
                namespace,
                standardNamespaces: Object.values(STATE_NAMESPACES),
            });
        }

        let namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            namespaces = new Map();
            this.stateMap.set(this.contextKey, namespaces);
        }

        let namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            namespaceMap = new Map();
            namespaces.set(namespace, namespaceMap);
        }

        namespaceMap.set(key, value);
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
     * Get all keys in a namespace
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
     * Get size of a namespace or total size
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
     * Persist state data to external storage
     * For simple implementation, this could be localStorage, sessionStorage, or external API
     */
    async persist(namespace?: string): Promise<void> {
        const data = namespace
            ? { [namespace]: this.getNamespace(namespace) }
            : this.getAllNamespaces();

        this.logger.debug('Persisting state data', {
            namespace,
            dataKeys: Object.keys(data),
            size: JSON.stringify(data).length,
        });

        // TODO: Implement actual persistence mechanism based on requirements
        // This could be:
        // - sessionStorage.setItem('kodus-flow-state', JSON.stringify(data))
        // - await externalAPI.saveState(data)
        // - await fs.writeFile(`${sessionId}.state.json`, JSON.stringify(data))

        // For now, just log that persistence would happen
        this.logger.info('State persistence completed', {
            namespace,
            keysCount: Object.keys(data).length,
        });
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
 * Factory function to create a simplified state service
 */
export function createSimpleStateService(contextKey: object): StateManager {
    return new SimpleContextStateService(contextKey);
}
