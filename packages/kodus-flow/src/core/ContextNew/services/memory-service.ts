/**
 * 🧠 MEMORY SERVICE INTERFACES
 *
 * Memory management service interfaces for agent runtime
 * Implements hierarchical memory architecture with retrieval and compression
 */

import type {
    HierarchicalMemoryContext,
    ShortTermMemory,
    LongTermMemory,
    EpisodicMemory,
    ContextRetrievalEngine,
    MemoryCompressionEngine,
    MemoryIndexingEngine,
    MemoryRetentionManager,
} from '../types/memory-types.js';

import type {
    ContextMemoryOperations,
    MemoryType,
    MemoryItem,
    MemoryResult,
    MemoryRetrievalOptions,
    SelectedContext,
    CompressedContext,
    MemoryPatternAnalysis,
} from '../types/context-types.js';

// ===============================================
// 🎯 MEMORY SERVICE INTERFACES
// ===============================================

/**
 * Master memory service that coordinates all memory operations
 */
export interface MemoryService extends ContextMemoryOperations {
    // Memory lifecycle
    initialize(sessionId: string, config: MemoryServiceConfig): Promise<void>;
    shutdown(): Promise<void>;
    reset(): Promise<void>;

    // Memory layer access
    getShortTermMemory(): ShortTermMemory;
    getLongTermMemory(): LongTermMemory;
    getEpisodicMemory(): EpisodicMemory;

    // Memory operations
    storeMemory(memory: MemoryItem, type: MemoryType): Promise<void>;
    retrieveRelevantMemories(
        query: string,
        options?: MemoryRetrievalOptions,
    ): Promise<MemoryResult[]>;

    // Context engineering
    selectContextForLLM(maxTokens: number): Promise<SelectedContext>;
    compressContext(compressionRatio: number): Promise<CompressedContext>;

    // Memory analysis
    analyzeMemoryPatterns(): Promise<MemoryPatternAnalysis>;
    getMemoryHealth(): Promise<MemoryHealthReport>;

    // Memory maintenance
    cleanupExpiredMemories(): Promise<MemoryCleanupResult>;
    optimizeMemoryStorage(): Promise<MemoryOptimizationResult>;

    // Memory persistence
    persistMemories(): Promise<void>;
    loadPersistedMemories(): Promise<void>;
}

/**
 * Short-term memory service
 */
export interface ShortTermMemoryService {
    // Memory operations
    store(item: MemoryItem): Promise<void>;
    retrieve(
        query: string,
        options?: RetrievalOptions,
    ): Promise<MemoryResult[]>;
    update(itemId: string, updates: Partial<MemoryItem>): Promise<void>;
    remove(itemId: string): Promise<boolean>;

    // Capacity management
    getCapacity(): number;
    getUtilization(): Promise<MemoryUtilization>;
    evictOldest(): Promise<MemoryItem[]>;
    evictLeastRelevant(): Promise<MemoryItem[]>;

    // Context selection
    selectRecentContext(maxItems: number): Promise<MemoryItem[]>;
    selectRelevantContext(
        query: string,
        maxItems: number,
    ): Promise<MemoryItem[]>;

    // Memory transfer
    promoteToLongTerm(itemId: string): Promise<void>;
    promoteToEpisodic(itemIds: string[], episodeId: string): Promise<void>;

    // Analytics
    getAccessPatterns(): Promise<AccessPattern[]>;
    getRetentionMetrics(): Promise<RetentionMetrics>;
}

/**
 * Long-term memory service
 */
export interface LongTermMemoryService {
    // Memory operations
    store(item: MemoryItem, category?: string): Promise<void>;
    retrieve(
        query: string,
        options?: LongTermRetrievalOptions,
    ): Promise<MemoryResult[]>;
    update(itemId: string, updates: Partial<MemoryItem>): Promise<void>;
    remove(itemId: string): Promise<boolean>;

    // Categorization
    categorizeMemory(item: MemoryItem): Promise<string>;
    getCategories(): Promise<MemoryCategory[]>;
    getCategoryMemories(category: string): Promise<MemoryItem[]>;

    // Knowledge extraction
    extractKnowledge(): Promise<KnowledgeBase>;
    buildKnowledgeGraph(): Promise<KnowledgeGraph>;

    // Semantic operations
    findSimilarMemories(
        item: MemoryItem,
        threshold: number,
    ): Promise<MemoryResult[]>;
    findRelatedMemories(itemId: string): Promise<MemoryResult[]>;

    // Consolidation
    consolidateMemories(itemIds: string[]): Promise<MemoryItem>;
    identifyDuplicates(): Promise<DuplicateGroup[]>;

    // Analytics
    getSemanticClusters(): Promise<SemanticCluster[]>;
    getKnowledgeMetrics(): Promise<KnowledgeMetrics>;
}

/**
 * Episodic memory service
 */
export interface EpisodicMemoryService {
    // Episode operations
    createEpisode(
        description: string,
        context: Record<string, unknown>,
    ): Promise<Episode>;
    completeEpisode(episodeId: string, summary: string): Promise<void>;
    getEpisode(episodeId: string): Promise<Episode | null>;
    getCurrentEpisode(): Promise<Episode | null>;

    // Episode memory operations
    addMemoryToEpisode(episodeId: string, memory: MemoryItem): Promise<void>;
    getEpisodeMemories(episodeId: string): Promise<MemoryItem[]>;

    // Episode retrieval
    findSimilarEpisodes(
        query: string,
        options?: EpisodeRetrievalOptions,
    ): Promise<EpisodeResult[]>;
    getRecentEpisodes(count: number): Promise<Episode[]>;

    // Episode analysis
    analyzeEpisodePatterns(): Promise<EpisodePatternAnalysis>;
    extractEpisodeLessons(episodeId: string): Promise<EpisodeLessons>;

    // Episode relationships
    findRelatedEpisodes(episodeId: string): Promise<Episode[]>;
    buildEpisodeTimeline(): Promise<EpisodeTimeline>;

    // Episode metrics
    getEpisodeMetrics(): Promise<EpisodeMetrics>;
    getEpisodeHealth(episodeId: string): Promise<EpisodeHealth>;
}

// ===============================================
// 🔍 MEMORY RETRIEVAL INTERFACES
// ===============================================

/**
 * Memory retrieval service
 */
export interface MemoryRetrievalService extends ContextRetrievalEngine {
    // Multi-layer retrieval
    retrieveAcrossLayers(
        query: string,
        options: CrossLayerRetrievalOptions,
    ): Promise<LayeredMemoryResult>;

    // Semantic retrieval
    semanticSearch(
        query: string,
        options: SemanticSearchOptions,
    ): Promise<MemoryResult[]>;

    // Temporal retrieval
    temporalSearch(
        timeRange: TimeRange,
        options?: TemporalSearchOptions,
    ): Promise<MemoryResult[]>;

    // Contextual retrieval
    contextualSearch(
        context: Record<string, unknown>,
        options?: ContextualSearchOptions,
    ): Promise<MemoryResult[]>;

    // Hybrid retrieval
    hybridSearch(query: HybridSearchQuery): Promise<HybridSearchResult>;

    // Retrieval optimization
    optimizeRetrieval(
        query: string,
        feedback: RetrievalFeedback,
    ): Promise<OptimizedRetrievalResult>;

    // Retrieval analytics
    getRetrievalMetrics(): Promise<RetrievalMetrics>;
    analyzeRetrievalPatterns(): Promise<RetrievalPatternAnalysis>;
}

// ===============================================
// 🗜️ MEMORY COMPRESSION INTERFACES
// ===============================================

/**
 * Memory compression service
 */
export interface MemoryCompressionService extends MemoryCompressionEngine {
    // Context compression
    compressContext(
        memories: MemoryItem[],
        compressionRatio: number,
    ): Promise<CompressedContext>;

    // Selective compression
    selectiveCompress(
        memories: MemoryItem[],
        criteria: CompressionCriteria,
    ): Promise<CompressedContext>;

    // Hierarchical compression
    hierarchicalCompress(
        memories: MemoryItem[],
        levels: CompressionLevel[],
    ): Promise<HierarchicalCompression>;

    // Lossy compression
    lossyCompress(
        memories: MemoryItem[],
        qualityThreshold: number,
    ): Promise<LossyCompression>;

    // Compression evaluation
    evaluateCompression(
        original: MemoryItem[],
        compressed: CompressedContext,
    ): Promise<CompressionEvaluation>;

    // Compression optimization
    optimizeCompression(
        memories: MemoryItem[],
        constraints: CompressionConstraints,
    ): Promise<OptimizedCompression>;
}

// ===============================================
// 📇 MEMORY INDEXING INTERFACES
// ===============================================

/**
 * Memory indexing service
 */
export interface MemoryIndexingService extends MemoryIndexingEngine {
    // Index management
    createIndex(config: IndexConfig): Promise<MemoryIndex>;
    updateIndex(indexId: string, memories: MemoryItem[]): Promise<void>;
    rebuildIndex(indexId: string): Promise<void>;
    deleteIndex(indexId: string): Promise<void>;

    // Index operations
    indexMemory(memory: MemoryItem): Promise<void>;
    removeFromIndex(memoryId: string): Promise<void>;
    searchIndex(query: IndexQuery): Promise<IndexResult[]>;

    // Index optimization
    optimizeIndex(indexId: string): Promise<IndexOptimizationResult>;
    analyzeIndexPerformance(indexId: string): Promise<IndexPerformanceAnalysis>;

    // Index health
    getIndexHealth(indexId: string): Promise<IndexHealth>;
    validateIndex(indexId: string): Promise<IndexValidationResult>;
}

// ===============================================
// 🧹 MEMORY MAINTENANCE INTERFACES
// ===============================================

/**
 * Memory retention service
 */
export interface MemoryRetentionService extends MemoryRetentionManager {
    // Retention policies
    applyRetentionPolicy(policy: RetentionPolicy): Promise<RetentionResult>;
    evaluateRetention(memory: MemoryItem): Promise<RetentionDecision>;

    // Memory lifecycle
    markForExpiry(memoryId: string, expiryTime: number): Promise<void>;
    renewMemory(memoryId: string, extensionTime: number): Promise<void>;

    // Cleanup operations
    cleanupExpiredMemories(): Promise<CleanupResult>;
    archiveOldMemories(archivePolicy: ArchivePolicy): Promise<ArchiveResult>;

    // Retention analytics
    getRetentionMetrics(): Promise<RetentionAnalytics>;
    analyzeRetentionPatterns(): Promise<RetentionPatternAnalysis>;
}

// ===============================================
// 📊 MEMORY ANALYTICS INTERFACES
// ===============================================

/**
 * Memory analytics service
 */
export interface MemoryAnalyticsService {
    // Usage analytics
    getUsageAnalytics(timeRange?: TimeRange): Promise<MemoryUsageAnalytics>;
    getAccessPatterns(): Promise<MemoryAccessPatterns>;

    // Performance analytics
    getPerformanceMetrics(): Promise<MemoryPerformanceMetrics>;
    analyzeBottlenecks(): Promise<MemoryBottleneck[]>;

    // Content analytics
    analyzeContent(): Promise<ContentAnalysis>;
    identifyTrends(): Promise<ContentTrend[]>;

    // Quality analytics
    assessMemoryQuality(): Promise<MemoryQualityAssessment>;
    identifyQualityIssues(): Promise<QualityIssue[]>;

    // Predictive analytics
    predictMemoryNeeds(): Promise<MemoryNeedsPrediction>;
    forecastGrowth(): Promise<MemoryGrowthForecast>;

    // Health analytics
    getMemoryHealth(): Promise<MemoryHealthReport>;
    generateHealthScore(): Promise<number>;
}

// ===============================================
// 🔧 CONFIGURATION INTERFACES
// ===============================================

/**
 * Memory service configuration
 */
export interface MemoryServiceConfig {
    // Capacity settings
    shortTermCapacity: number;
    longTermCapacity?: number;
    episodicCapacity?: number;

    // Retention policies
    defaultRetentionPolicy: RetentionPolicy;
    categoryRetentionPolicies: Record<string, RetentionPolicy>;

    // Retrieval settings
    defaultSimilarityThreshold: number;
    maxRetrievalResults: number;
    retrievalTimeout: number;

    // Compression settings
    compressionEnabled: boolean;
    defaultCompressionRatio: number;
    compressionThreshold: number;

    // Indexing settings
    indexingEnabled: boolean;
    indexingStrategy: 'immediate' | 'batch' | 'lazy';
    indexRebuildInterval: number;

    // Performance settings
    cacheEnabled: boolean;
    cacheSize: number;
    backgroundProcessing: boolean;

    // Persistence settings
    persistenceEnabled: boolean;
    persistenceInterval: number;
    backupEnabled: boolean;
}

// ===============================================
// 🏷️ SUPPORTING TYPES
// ===============================================

/**
 * Retrieval options
 */
export interface RetrievalOptions {
    maxResults?: number;
    similarityThreshold?: number;
    includeMetadata?: boolean;
    sortBy?: 'relevance' | 'recency' | 'importance';
    filters?: Record<string, unknown>;
}

/**
 * Long-term retrieval options
 */
export interface LongTermRetrievalOptions extends RetrievalOptions {
    categories?: string[];
    semanticSearch?: boolean;
    knowledgeGraphTraversal?: boolean;
}

/**
 * Cross-layer retrieval options
 */
export interface CrossLayerRetrievalOptions {
    layers: ('short_term' | 'long_term' | 'episodic')[];
    weightByLayer?: Record<string, number>;
    mergeStrategy: 'relevance' | 'temporal' | 'balanced';
    maxPerLayer?: number;
}

/**
 * Memory utilization
 */
export interface MemoryUtilization {
    used: number;
    capacity: number;
    utilizationPercent: number;
    itemCount: number;
    averageItemSize: number;
}

/**
 * Access pattern
 */
export interface AccessPattern {
    pattern: string;
    frequency: number;
    lastAccessed: number;
    averageRelevance: number;
    typicalContext: Record<string, unknown>;
}

/**
 * Retention metrics
 */
export interface RetentionMetrics {
    averageRetentionTime: number;
    retentionRate: number;
    evictionRate: number;
    promotionRate: number;
}

/**
 * Memory category
 */
export interface MemoryCategory {
    name: string;
    description: string;
    itemCount: number;
    averageRelevance: number;
    lastUpdated: number;
}

/**
 * Knowledge base
 */
export interface KnowledgeBase {
    concepts: Concept[];
    relationships: ConceptRelationship[];
    facts: Fact[];
    rules: Rule[];
}

/**
 * Knowledge graph
 */
export interface KnowledgeGraph {
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
    clusters: KnowledgeCluster[];
    metrics: GraphMetrics;
}

/**
 * Concept
 */
export interface Concept {
    id: string;
    name: string;
    description: string;
    confidence: number;
    instances: string[];
    properties: Record<string, unknown>;
}

/**
 * Concept relationship
 */
export interface ConceptRelationship {
    fromConcept: string;
    toConcept: string;
    relationshipType: string;
    strength: number;
    evidence: string[];
}

/**
 * Fact
 */
export interface Fact {
    id: string;
    statement: string;
    confidence: number;
    source: string;
    verified: boolean;
    timestamp: number;
}

/**
 * Rule
 */
export interface Rule {
    id: string;
    condition: string;
    conclusion: string;
    confidence: number;
    applicability: string[];
}

/**
 * Knowledge node
 */
export interface KnowledgeNode {
    id: string;
    label: string;
    type: string;
    properties: Record<string, unknown>;
    weight: number;
}

/**
 * Knowledge edge
 */
export interface KnowledgeEdge {
    fromNode: string;
    toNode: string;
    relationship: string;
    weight: number;
    properties: Record<string, unknown>;
}

/**
 * Knowledge cluster
 */
export interface KnowledgeCluster {
    id: string;
    name: string;
    nodes: string[];
    centrality: number;
    cohesion: number;
}

/**
 * Graph metrics
 */
export interface GraphMetrics {
    nodeCount: number;
    edgeCount: number;
    clusterCount: number;
    density: number;
    averageClustering: number;
    averagePathLength: number;
}

/**
 * Episode
 */
export interface Episode {
    id: string;
    description: string;
    startTime: number;
    endTime?: number;
    context: Record<string, unknown>;
    memories: MemoryItem[];
    summary?: string;
    insights: string[];
    status: 'active' | 'completed' | 'archived';
}

/**
 * Episode result
 */
export interface EpisodeResult {
    episode: Episode;
    relevanceScore: number;
    similarityScore: number;
    applicabilityScore: number;
}

/**
 * Episode retrieval options
 */
export interface EpisodeRetrievalOptions {
    maxResults?: number;
    similarityThreshold?: number;
    includeCompleted?: boolean;
    includeActive?: boolean;
    timeRange?: TimeRange;
}

/**
 * Time range
 */
export interface TimeRange {
    start: number;
    end: number;
}

// ===============================================
// 📈 ANALYTICS RESULT TYPES
// ===============================================

/**
 * Memory health report
 */
export interface MemoryHealthReport {
    overallHealth: 'healthy' | 'warning' | 'critical';

    // Layer health
    shortTermHealth: LayerHealth;
    longTermHealth: LayerHealth;
    episodicHealth: LayerHealth;

    // Performance indicators
    retrievalPerformance: PerformanceIndicator;
    storagePerformance: PerformanceIndicator;

    // Issues and recommendations
    issues: MemoryHealthIssue[];
    recommendations: string[];

    // Metrics
    totalMemoryUsage: number;
    memoryEfficiency: number;
    lastHealthCheck: number;
}

/**
 * Layer health
 */
export interface LayerHealth {
    status: 'healthy' | 'warning' | 'critical';
    utilizationPercent: number;
    performanceScore: number;
    errorRate: number;
    issues: string[];
}

/**
 * Performance indicator
 */
export interface PerformanceIndicator {
    current: number;
    target: number;
    trend: 'improving' | 'stable' | 'degrading';
    status: 'good' | 'warning' | 'critical';
}

/**
 * Memory health issue
 */
export interface MemoryHealthIssue {
    severity: 'low' | 'medium' | 'high' | 'critical';
    component: string;
    description: string;
    impact: string;
    recommendation: string;
}

/**
 * Memory cleanup result
 */
export interface MemoryCleanupResult {
    itemsRemoved: number;
    memoryFreed: number;
    categoriesAffected: string[];
    duration: number;
    errors: string[];
}

/**
 * Memory optimization result
 */
export interface MemoryOptimizationResult {
    itemsOptimized: number;
    spaceSaved: number;
    performanceImprovement: number;
    optimizationActions: string[];
    duration: number;
}
