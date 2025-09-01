export type {
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
// 🏗️ ENHANCED CONTEXT BUILDER (SINGLETON PATTERN)
// ===============================================

import { EnhancedSessionService } from './services/enhanced-session-service.js';
import {
    getGlobalMemoryManager,
    MemoryManager,
    setGlobalMemoryManager,
} from '../memory/memory-manager.js';
import { createLogger } from '../../observability/logger.js';
import { StorageEnum, Thread } from '../types/allTypes.js';
import {
    ContextBridge,
    createContextBridge,
} from './services/context-bridge-service.js';

const logger = createLogger('EnhancedContextBuilder');

export interface EnhancedContextBuilderConfig {
    // Database config
    connectionString?: string;
    dbName?: string;
    adapterType?: StorageEnum;

    // Collections config (customizáveis!)
    sessionsCollection?: string;
    snapshotsCollection?: string;
    memoryCollection?: string;

    // TTL config
    sessionTTL?: number;
    snapshotTTL?: number;
}

/**
 * 🧠 ENHANCED CONTEXT BUILDER - Singleton Pattern
 *
 * Segue o mesmo padrão do ContextBuilder existente, mas com ContextNew architecture
 * Usado em toda cadeia de execução do agent, não só no planner
 */
export class EnhancedContextBuilder {
    private static instance: EnhancedContextBuilder | undefined;

    private readonly config: EnhancedContextBuilderConfig;
    private memoryManager!: MemoryManager;
    private sessionManager!: EnhancedSessionService;
    private contextBridge!: ContextBridge;
    private isInitialized = false;

    private constructor(config: EnhancedContextBuilderConfig = {}) {
        this.config = {
            dbName: 'kodus-flow',
            adapterType: config.connectionString
                ? StorageEnum.MONGODB
                : StorageEnum.INMEMORY,
            sessionsCollection: 'kodus-agent-sessions', // Customizável!
            snapshotsCollection: 'kodus-execution-snapshots', // Customizável!
            memoryCollection: 'kodus-agent-memory', // Customizável!
            sessionTTL: 24 * 60 * 60 * 1000, // 24h
            snapshotTTL: 7 * 24 * 60 * 60 * 1000, // 7 dias
            ...config,
        };

        logger.info('EnhancedContextBuilder created', {
            adapterType: this.config.adapterType,
            dbName: this.config.dbName,
            sessionsCollection: this.config.sessionsCollection,
            snapshotsCollection: this.config.snapshotsCollection,
            memoryCollection: this.config.memoryCollection,
        });
    }

    static getInstance(
        config?: EnhancedContextBuilderConfig,
    ): EnhancedContextBuilder {
        if (!EnhancedContextBuilder.instance) {
            EnhancedContextBuilder.instance = new EnhancedContextBuilder(
                config,
            );
        }
        return EnhancedContextBuilder.instance;
    }

    static configure(
        config: EnhancedContextBuilderConfig,
    ): EnhancedContextBuilder {
        EnhancedContextBuilder.resetInstance();
        return EnhancedContextBuilder.getInstance(config);
    }

    static resetInstance(): void {
        EnhancedContextBuilder.instance = undefined;
    }

    getConfig(): EnhancedContextBuilderConfig {
        return this.config;
    }

    /**
     * Initialize the context infrastructure (collections, adapters, etc)
     * Should be called once during application startup
     */
    async initialize(): Promise<void> {
        await this.ensureInitialized();
    }

    private async ensureInitialized(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        logger.info('🚀 Starting ContextNew initialization', {
            adapterType: this.config.adapterType,
            connectionString: this.config.connectionString
                ? '[SET]'
                : '[NOT SET]',
            memoryCollection: this.config.memoryCollection,
            sessionsCollection: this.config.sessionsCollection,
            snapshotsCollection: this.config.snapshotsCollection,
        });

        // 1. Initialize memory manager
        logger.info('🧠 Step 1: Initializing memory manager...');
        if (this.config.adapterType === StorageEnum.MONGODB) {
            logger.info('🔗 Creating MongoDB memory manager', {
                database: this.config.dbName,
                collection: this.config.memoryCollection,
            });
            // Create MongoDB memory manager with custom collection
            this.memoryManager = new MemoryManager({
                adapterType: StorageEnum.MONGODB,
                adapterConfig: {
                    connectionString: this.config.connectionString,
                    options: {
                        database: this.config.dbName,
                        collection: this.config.memoryCollection,
                        maxItems: 10000,
                        enableCompression: true,
                        cleanupInterval: 300000,
                    },
                },
            });
            setGlobalMemoryManager(this.memoryManager);

            // Initialize memory manager to create collection
            logger.info(
                '📦 Initializing memory manager to create collection...',
            );
            await this.memoryManager.initialize();
            logger.info('✅ MongoDB memory manager created and initialized');
        } else {
            // Use existing global memory manager (InMemory case)
            this.memoryManager = getGlobalMemoryManager();
        }

        // 2. Initialize session manager with custom collections
        this.sessionManager = new EnhancedSessionService(
            this.config.connectionString,
            {
                adapterType: this.config.adapterType,
                dbName: this.config.dbName,
                sessionsCollection: this.config.sessionsCollection, // 🎯 Passa config customizada!
                snapshotsCollection: this.config.snapshotsCollection, // 🎯 Passa config customizada!
                sessionTTL: this.config.sessionTTL,
                snapshotTTL: this.config.snapshotTTL,
            },
        );

        // 3. Initialize context bridge
        this.contextBridge = createContextBridge(this.config.connectionString, {
            memoryManager: this.memoryManager,
            dbName: this.config.dbName,
            sessionsCollection: this.config.sessionsCollection, // 🎯 Passa config customizada!
            snapshotsCollection: this.config.snapshotsCollection, // 🎯 Passa config customizada!
            sessionTTL: this.config.sessionTTL,
            snapshotTTL: this.config.snapshotTTL,
        });

        logger.info(
            '📂 Step 3: Initializing session manager (creates sessions + snapshots collections)...',
        );
        await this.sessionManager.initialize();
        logger.info('✅ Session manager initialized');

        this.isInitialized = true;

        logger.info('EnhancedContextBuilder initialized', {
            memoryManager: 'ready',
            sessionManager: 'ready',
            contextBridge: 'ready',
            collectionsEnsured: this.config.adapterType === StorageEnum.MONGODB,
        });
    }

    /**
     * 🎯 MAIN METHOD: Initialize session for agent execution
     * Similar ao ContextBuilder, mas focado na sessão enhanced
     */
    async initializeAgentSession(
        threadId: Thread['id'],
        tenantId: string,
        runtimeData?: {
            availableTools?: string[];
        },
    ): Promise<void> {
        await this.ensureInitialized();

        logger.info('Initializing enhanced agent session', {
            threadId,
            tenantId,
        });

        // Create or recover session based on threadId
        const runtimeContext = await this.sessionManager.getOrCreateSession(
            threadId,
            tenantId,
        );

        // 🔧 REBUILD RUNTIME DATA (não salvo, precisa ser reconstruído)
        if (runtimeData?.availableTools) {
            runtimeContext.availableTools = runtimeData.availableTools;
        }
    }

    /**
     * 🔧 Update runtime-only data (tools, connections)
     */
    async updateRuntimeData(
        threadId: string,
        runtimeData: {
            availableTools?: string[];
            activeConnections?: Record<string, any>;
        },
    ): Promise<void> {
        await this.ensureInitialized();

        const contextBridge = this.getContextBridge();
        const currentContext = await contextBridge.getRuntimeContext(threadId);

        // Update runtime-only fields
        if (runtimeData.availableTools) {
            currentContext.availableTools = runtimeData.availableTools;
        }

        if (runtimeData.activeConnections) {
            currentContext.activeConnections = runtimeData.activeConnections;
        }

        logger.debug('Updated runtime data', {
            threadId,
            toolCount: runtimeData.availableTools?.length,
            connectionCount: Object.keys(runtimeData.activeConnections || {})
                .length,
        });
    }

    /**
     * 🔥 SOLVE createFinalResponse problem
     * Available everywhere in agent execution chain
     */
    async buildFinalResponseContext(plannerContext: any) {
        await this.ensureInitialized();
        return this.contextBridge.buildFinalResponseContext(plannerContext);
    }

    getSessionManager(): EnhancedSessionService {
        if (!this.isInitialized) {
            throw new Error('EnhancedContextBuilder not initialized');
        }
        return this.sessionManager;
    }

    getContextBridge(): ContextBridge {
        if (!this.isInitialized) {
            throw new Error('EnhancedContextBuilder not initialized');
        }
        return this.contextBridge;
    }

    getMemoryManager(): MemoryManager {
        return this.memoryManager;
    }

    async cleanup(): Promise<void> {
        if (this.isInitialized) {
            await this.sessionManager.cleanup();
            await this.memoryManager.cleanup();
            this.isInitialized = false;
            logger.info('EnhancedContextBuilder cleaned up');
        }
    }
}
