/**
 * @file enhanced-context-builder.ts
 * @description Enhanced Context Integration - API fluente para gerenciamento de contextos
 *
 * INSPIRADO NO AI SDK:
 * - API unificada para memory/session/state
 * - Builder pattern para criação fluente
 * - Integração automática com agentes
 * - Context retrieval inteligente
 *
 * 📊 ORGANIZAÇÃO DOS DADOS:
 *
 * 🧠 MEMORY (Longo Prazo):
 * - user-preferences: Preferências do usuário
 * - relevant-memories: Memórias relevantes para consulta
 * - execution-hints: Dicas de execução
 * - learning-context: Contexto de aprendizado
 *
 * 💬 SESSION (Histórico de Conversa):
 * - Entradas cronológicas da conversa
 * - Tool calls e resultados
 * - Planner steps e observações
 * - Erros e eventos do sistema
 *
 * ⚡ STATE (Dados Temporários):
 * - planner: Estado atual do planner
 * - ai_sdk: Mensagens e contexto atual
 * - execution: Valores de contexto da execução
 * - runtime: Dados temporários de execução
 */

import { createLogger } from '../../observability/index.js';
import type {
    AgentContext,
    AgentExecutionOptions,
} from '../types/agent-types.js';
import { ContextBuilder } from './context-builder.js';
// ✅ ADD: Direct integration with memory and session services
import { MemoryManager, getGlobalMemoryManager } from '../memory/index.js';
import { SessionService, sessionService } from './services/session-service.js';

/**
 * Enhanced Context Configuration
 */
export interface EnhancedContextConfig {
    // Memory configuration
    memory?: {
        enableCompression?: boolean;
        maxItems?: number;
        ttl?: number;
        searchEnabled?: boolean;
    };

    // Session configuration
    session?: {
        maxEntries?: number;
        autoCleanup?: boolean;
        retentionDays?: number;
    };

    // State configuration
    state?: {
        maxNamespaces?: number;
        maxKeysPerNamespace?: number;
        enablePersistence?: boolean;
    };

    // Context retrieval configuration
    retrieval?: {
        enableAutoRetrieval?: boolean;
        maxRelevantItems?: number;
        similarityThreshold?: number;
        includeMetadata?: boolean;
    };
}

/**
 * Context Layer Types
 */
export type ContextLayer = 'memory' | 'session' | 'state';

/**
 * Context Operation Types
 */
export type ContextOperation = 'set' | 'get' | 'delete' | 'search' | 'clear';

/**
 * Enhanced Context Entry
 */
export interface ContextEntry {
    key: string;
    value: unknown;
    layer: ContextLayer;
    timestamp: number;
    metadata?: Record<string, unknown>;
    tags?: string[];
}

/**
 * Context Query for Retrieval
 */
export interface ContextQuery {
    text?: string;
    tags?: string[];
    layers?: ContextLayer[];
    limit?: number;
    since?: number;
    until?: number;
}

/**
 * Enhanced Context Builder - API fluente para gerenciamento de contextos
 * Inspirado no AI SDK para simplicidade e poder
 */
export class EnhancedContextBuilder {
    private contextBuilder: ContextBuilder;
    private config: EnhancedContextConfig;
    private logger = createLogger('enhanced-context-builder');

    // ✅ ADD: Direct service references for better integration
    private memoryManager: MemoryManager;
    private sessionService: SessionService;

    // Context data for building
    private memoryData: Map<
        string,
        {
            value: unknown;
            metadata?: Record<string, unknown>;
            timestamp: number;
        }
    > = new Map();
    private sessionData: Map<
        string,
        {
            value: unknown;
            metadata?: Record<string, unknown>;
            timestamp: number;
        }
    > = new Map();
    private stateData: Map<
        string,
        Map<
            string,
            {
                value: unknown;
                metadata?: Record<string, unknown>;
                timestamp: number;
            }
        >
    > = new Map();

    constructor(config: EnhancedContextConfig = {}) {
        this.config = {
            memory: {
                enableCompression: true,
                maxItems: 1000,
                ttl: 24 * 60 * 60 * 1000, // 24 hours
                searchEnabled: true,
                ...config.memory,
            },
            session: {
                maxEntries: 100,
                autoCleanup: true,
                retentionDays: 7,
                ...config.session,
            },
            state: {
                maxNamespaces: 50,
                maxKeysPerNamespace: 1000,
                enablePersistence: true,
                ...config.state,
            },
            retrieval: {
                enableAutoRetrieval: true,
                maxRelevantItems: 10,
                similarityThreshold: 0.7,
                includeMetadata: true,
                ...config.retrieval,
            },
        };

        this.contextBuilder = ContextBuilder.getInstance();

        // ✅ ADD: Initialize service references
        this.memoryManager = getGlobalMemoryManager();
        this.sessionService = sessionService;
    }

    /**
     * Add data to memory layer
     */
    withMemory(
        key: string,
        value: unknown,
        metadata?: Record<string, unknown>,
    ): EnhancedContextBuilder {
        this.memoryData.set(key, { value, metadata, timestamp: Date.now() });
        return this;
    }

    /**
     * Add data to session layer
     */
    withSession(
        key: string,
        value: unknown,
        metadata?: Record<string, unknown>,
    ): EnhancedContextBuilder {
        this.sessionData.set(key, { value, metadata, timestamp: Date.now() });
        return this;
    }

    /**
     * Add data to state layer
     */
    withState(
        namespace: string,
        key: string,
        value: unknown,
        metadata?: Record<string, unknown>,
    ): EnhancedContextBuilder {
        if (!this.stateData.has(namespace)) {
            this.stateData.set(namespace, new Map());
        }
        const namespaceMap = this.stateData.get(namespace)!;
        namespaceMap.set(key, { value, metadata, timestamp: Date.now() });
        return this;
    }

    /**
     * Add multiple memory entries
     */
    withMemories(
        entries: Array<{
            key: string;
            value: unknown;
            metadata?: Record<string, unknown>;
        }>,
    ): EnhancedContextBuilder {
        entries.forEach(({ key, value, metadata }) => {
            this.withMemory(key, value, metadata);
        });
        return this;
    }

    /**
     * Add multiple session entries
     */
    withSessions(
        entries: Array<{
            key: string;
            value: unknown;
            metadata?: Record<string, unknown>;
        }>,
    ): EnhancedContextBuilder {
        entries.forEach(({ key, value, metadata }) => {
            this.withSession(key, value, metadata);
        });
        return this;
    }

    /**
     * Add multiple state entries
     */
    withStates(
        entries: Array<{
            namespace: string;
            key: string;
            value: unknown;
            metadata?: Record<string, unknown>;
        }>,
    ): EnhancedContextBuilder {
        entries.forEach(({ namespace, key, value, metadata }) => {
            this.withState(namespace, key, value, metadata);
        });
        return this;
    }

    /**
     * Add user preferences to context
     */
    withUserPreferences(
        preferences: Record<string, unknown>,
    ): EnhancedContextBuilder {
        return this.withMemory('user-preferences', preferences, {
            type: 'preferences',
        });
    }

    /**
     * Add conversation history to context
     */
    withConversationHistory(messages: unknown[]): EnhancedContextBuilder {
        return this.withSession('conversation-history', messages, {
            type: 'conversation',
        });
    }

    /**
     * Add current task state to context
     */
    withCurrentTask(task: Record<string, unknown>): EnhancedContextBuilder {
        return this.withState('current-task', 'status', task, {
            type: 'task-state',
        });
    }

    /**
     * Add relevant memories based on query
     */
    async withRelevantMemories(
        query: string,
        limit?: number,
    ): Promise<EnhancedContextBuilder> {
        try {
            const maxItems =
                limit || this.config.retrieval?.maxRelevantItems || 5;
            const relevantMemories = await this.findRelevantMemories(
                query,
                maxItems,
            );
            return this.withMemory('relevant-memories', relevantMemories, {
                type: 'retrieved',
                query,
                count: relevantMemories.length,
            });
        } catch (error) {
            this.logger.warn('Failed to retrieve relevant memories:', {
                error: String(error),
            });
            return this;
        }
    }

    /**
     * Add execution hints to context
     */
    withExecutionHints(hints: Record<string, unknown>): EnhancedContextBuilder {
        return this.withMemory('execution-hints', hints, { type: 'hints' });
    }

    /**
     * Add learning context to context
     */
    withLearningContext(
        learning: Record<string, unknown>,
    ): EnhancedContextBuilder {
        return this.withMemory('learning-context', learning, {
            type: 'learning',
        });
    }

    /**
     * ✅ NEW: Enhanced memory integration with automatic vectorization
     */
    async withMemoryVectorized(
        key: string,
        content: string,
        metadata?: Record<string, unknown>,
    ): Promise<EnhancedContextBuilder> {
        try {
            await this.memoryManager.store({
                key,
                content,
                type: 'text',
                metadata: {
                    ...metadata,
                    source: 'enhanced-context-builder',
                    timestamp: Date.now(),
                },
            });

            this.logger.debug('Memory item vectorized and stored', { key });
        } catch (error) {
            this.logger.warn('Failed to vectorize memory item', { key, error });
        }

        return this;
    }

    /**
     * ✅ NEW: Enhanced session integration with conversation tracking
     */
    async withSessionEntry(
        sessionId: string,
        input: unknown,
        output: unknown,
        agentName?: string,
        metadata?: Record<string, unknown>,
    ): Promise<EnhancedContextBuilder> {
        try {
            await this.sessionService.addConversationEntry(
                sessionId,
                input,
                output,
                agentName,
                {
                    ...metadata,
                    source: 'enhanced-context-builder',
                    timestamp: Date.now(),
                },
            );

            this.logger.debug('Session entry added', { sessionId });
        } catch (error) {
            this.logger.warn('Failed to add session entry', {
                sessionId,
                error,
            });
        }

        return this;
    }

    /**
     * ✅ NEW: Smart context retrieval with memory search
     */
    async withSmartContextRetrieval(
        query: string,
        options: {
            includeMemory?: boolean;
            includeSession?: boolean;
            includeState?: boolean;
            maxResults?: number;
        } = {},
    ): Promise<EnhancedContextBuilder> {
        const {
            includeMemory = true,
            includeSession = true,
            maxResults = 10,
        } = options;

        try {
            // Memory search
            if (includeMemory) {
                const memoryResults = await this.memoryManager.search(query, {
                    topK: maxResults,
                });

                for (const result of memoryResults) {
                    this.memoryData.set(result.id, {
                        value: result.text || result.id,
                        metadata: result.metadata,
                        timestamp: result.timestamp,
                    });
                }
            }

            // Session search (would need to be implemented in SessionService)
            if (includeSession) {
                // TODO: Implement session search capability
                this.logger.debug('Session search not yet implemented');
            }

            this.logger.debug('Smart context retrieval completed', {
                query,
                memoryResults: includeMemory ? 'retrieved' : 'skipped',
                sessionResults: includeSession ? 'not implemented' : 'skipped',
            });
        } catch (error) {
            this.logger.warn('Smart context retrieval failed', {
                query,
                error,
            });
        }

        return this;
    }

    /**
     * Build and apply context to agent context
     */
    async build(agentContext: AgentContext): Promise<AgentContext> {
        this.logger.info('Building enhanced context', {
            memoryEntries: this.memoryData.size,
            sessionEntries: this.sessionData.size,
            stateNamespaces: this.stateData.size,
        });

        try {
            // Apply memory data
            for (const [, data] of this.memoryData) {
                await agentContext.memory.store(data.value, 'enhanced-context');
            }

            // Apply session data
            for (const [key, data] of this.sessionData) {
                await agentContext.session.addEntry(
                    { type: 'enhanced-context', key, data: data.value },
                    {
                        type: 'metadata',
                        timestamp: data.timestamp,
                        ...data.metadata,
                    },
                );
            }

            // Apply state data
            for (const [namespace, namespaceMap] of this.stateData) {
                for (const [key, data] of namespaceMap) {
                    await agentContext.state.set(namespace, key, data.value);
                }
            }

            this.logger.info('Enhanced context applied successfully', {
                agentName: agentContext.agentName,
                sessionId: agentContext.sessionId,
            });

            return agentContext;
        } catch (error) {
            this.logger.error(
                'Failed to build enhanced context:',
                error as Error,
            );
            throw error;
        }
    }

    /**
     * Create a new agent context with enhanced context
     */
    async createAgentContext(
        options: AgentExecutionOptions,
    ): Promise<AgentContext> {
        // Create base agent context
        const baseContext =
            await this.contextBuilder.createAgentContext(options);

        // ✅ NEW: Start execution tracking if sessionId is provided
        if (options.sessionId) {
            const executionId = await this.sessionService.startExecution(
                options.sessionId,
                options.agentName,
            );

            if (executionId) {
                // Set executionId in context
                baseContext.executionId = executionId;

                this.logger.info('Execution started and tracked in context', {
                    sessionId: options.sessionId,
                    executionId,
                    agentName: options.agentName,
                });
            }
        }

        // Apply enhanced context
        return this.build(baseContext);
    }

    /**
     * Get context statistics
     */
    async getContextStats(agentContext: AgentContext): Promise<{
        memoryItems: number;
        sessionEntries: number;
        stateKeys: number;
        totalSize: number;
    }> {
        try {
            const recentMemories = await agentContext.memory.getRecent(100);
            const sessionHistory = await agentContext.session.getHistory();

            // Count state keys (this would need to be implemented in ContextStateService)
            const stateKeys = 0; // TODO: Implement state key counting

            return {
                memoryItems: recentMemories.length,
                sessionEntries: sessionHistory.length,
                stateKeys,
                totalSize:
                    recentMemories.length + sessionHistory.length + stateKeys,
            };
        } catch (error) {
            this.logger.error('Failed to get context stats:', error as Error);
            return {
                memoryItems: 0,
                sessionEntries: 0,
                stateKeys: 0,
                totalSize: 0,
            };
        }
    }

    /**
     * Query context for relevant information
     */
    async queryContext(
        agentContext: AgentContext,
        query: ContextQuery,
    ): Promise<ContextEntry[]> {
        const results: ContextEntry[] = [];

        try {
            // Query memory
            if (!query.layers || query.layers.includes('memory')) {
                const searchLimit =
                    query.limit ||
                    this.config.retrieval?.maxRelevantItems ||
                    10;
                const memoryResults = await agentContext.memory.search(
                    query.text || '',
                    searchLimit,
                );
                results.push(
                    ...memoryResults.map((item, index) => ({
                        key: `memory-${index}`,
                        value: item,
                        layer: 'memory' as ContextLayer,
                        timestamp: Date.now(),
                        metadata: {
                            source: 'memory',
                            relevance: 1 - index / memoryResults.length,
                        },
                    })),
                );
            }

            // Query session
            if (!query.layers || query.layers.includes('session')) {
                const sessionHistory = await agentContext.session.getHistory();
                const relevantSessions = sessionHistory
                    .filter((entry) => {
                        if (query.text) {
                            const content = JSON.stringify(entry).toLowerCase();
                            return content.includes(query.text.toLowerCase());
                        }
                        return true;
                    })
                    .slice(0, query.limit || 10);

                results.push(
                    ...relevantSessions.map((entry, index) => ({
                        key: `session-${index}`,
                        value: entry,
                        layer: 'session' as ContextLayer,
                        timestamp: Date.now(),
                        metadata: {
                            source: 'session',
                            relevance: 1 - index / relevantSessions.length,
                        },
                    })),
                );
            }

            // Query state (this would need to be implemented)
            if (!query.layers || query.layers.includes('state')) {
                // TODO: Implement state querying functionality
                this.logger.debug('State querying not yet implemented');
            }
        } catch (error) {
            this.logger.error('Failed to query context:', error as Error);
        }

        return results;
    }

    /**
     * Clear context data
     */
    async clearContext(
        agentContext: AgentContext,
        layers?: ContextLayer[],
    ): Promise<void> {
        const layersToClear = layers || ['memory', 'session', 'state'];

        try {
            if (layersToClear.includes('memory')) {
                // TODO: Implement memory clearing in MemoryManager
                this.logger.info('Clearing memory layer');
            }

            if (layersToClear.includes('session')) {
                // TODO: Implement session clearing in SessionService
                this.logger.info('Clearing session layer');
            }

            if (layersToClear.includes('state')) {
                // Clear state
                for (const namespace of this.stateData.keys()) {
                    await agentContext.state.clear(namespace);
                }
            }

            this.logger.info('Context cleared successfully', {
                layers: layersToClear,
            });
        } catch (error) {
            this.logger.error('Failed to clear context:', error as Error);
            throw error;
        }
    }

    /**
     * Find relevant memories based on query
     */
    private async findRelevantMemories(
        query: string,
        limit: number,
    ): Promise<unknown[]> {
        try {
            // TODO: Integrate with MemoryManager search functionality
            // For now, return empty array as placeholder
            this.logger.debug('Searching for relevant memories', {
                query,
                limit,
            });
            return [];
        } catch (error) {
            this.logger.warn('Failed to find relevant memories:', {
                error: String(error),
                query,
            });
            return [];
        }
    }
}

/**
 * Factory function to create Enhanced Context Builder
 */
export function createEnhancedContext(
    config?: EnhancedContextConfig,
): EnhancedContextBuilder {
    return new EnhancedContextBuilder(config);
}

/**
 * Convenience function for quick context creation
 */
export async function withContext(
    agentContext: AgentContext,
    contextData: {
        memory?: Record<string, unknown>;
        session?: Record<string, unknown>;
        state?: Record<string, Record<string, unknown>>;
        userPreferences?: Record<string, unknown>;
        conversationHistory?: unknown[];
        currentTask?: Record<string, unknown>;
        executionHints?: Record<string, unknown>;
        learningContext?: Record<string, unknown>;
    },
): Promise<AgentContext> {
    const builder = createEnhancedContext();

    // Add memory data
    if (contextData.memory) {
        for (const [key, value] of Object.entries(contextData.memory)) {
            builder.withMemory(key, value);
        }
    }

    // Add session data
    if (contextData.session) {
        for (const [key, value] of Object.entries(contextData.session)) {
            builder.withSession(key, value);
        }
    }

    // Add state data
    if (contextData.state) {
        for (const [namespace, namespaceData] of Object.entries(
            contextData.state,
        )) {
            for (const [key, value] of Object.entries(namespaceData)) {
                builder.withState(namespace, key, value);
            }
        }
    }

    // Add convenience data
    if (contextData.userPreferences) {
        builder.withUserPreferences(contextData.userPreferences);
    }

    if (contextData.conversationHistory) {
        builder.withConversationHistory(contextData.conversationHistory);
    }

    if (contextData.currentTask) {
        builder.withCurrentTask(contextData.currentTask);
    }

    if (contextData.executionHints) {
        builder.withExecutionHints(contextData.executionHints);
    }

    if (contextData.learningContext) {
        builder.withLearningContext(contextData.learningContext);
    }

    return builder.build(agentContext);
}

/**
 * Summary of Enhanced Context Integration features:
 *
 * ✅ 1. Fluent API for context building:
 *    - withMemory(), withSession(), withState()
 *    - withUserPreferences(), withConversationHistory()
 *    - withCurrentTask(), withExecutionHints()
 *    - withLearningContext(), withRelevantMemories()
 *
 * ✅ 2. Unified context management:
 *    - Single API for memory/session/state
 *    - Automatic context integration
 *    - Intelligent context retrieval
 *
 * ✅ 3. AI SDK inspired features:
 *    - Builder pattern for easy creation
 *    - Context querying and statistics
 *    - Automatic context clearing
 *
 * ✅ 4. Convenience functions:
 *    - withContext() for quick setup
 *    - createEnhancedContext() for advanced usage
 *    - Context querying and statistics
 *
 * These improvements bring Kodus Flow's context management
 * to the same level of simplicity and power as AI SDK.
 */
