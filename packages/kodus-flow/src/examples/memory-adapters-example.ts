/**
 * @file memory-adapters-example.ts
 * @description Example of using memory adapters with different backends
 */

import { MemoryManager } from '@/core/memory/memory-manager.js';
import { StorageAdapterFactory } from '@/core/storage/factory.js';
import { createLogger } from '@/observability/index.js';

const logger = createLogger('memory-adapters-example');

/**
 * Example 1: In-Memory Adapter (Development)
 */
async function inMemoryExample() {
    logger.info('=== IN-MEMORY ADAPTER EXAMPLE ===');

    const memoryManager = new MemoryManager({
        adapterType: 'in-memory',
        autoVectorizeText: true,
    });

    await memoryManager.initialize();

    // Store some memory items
    await memoryManager.store({
        content: 'User asked about weather in São Paulo',
        type: 'conversation',
        sessionId: 'session-123',
        tenantId: 'tenant-1',
        metadata: { intent: 'weather_query', location: 'São Paulo' },
    });

    await memoryManager.store({
        content: 'Weather in São Paulo is sunny today',
        type: 'response',
        sessionId: 'session-123',
        tenantId: 'tenant-1',
        metadata: { temperature: 25, condition: 'sunny' },
    });

    // Query memory
    const results = await memoryManager.query({
        sessionId: 'session-123',
        limit: 10,
    });

    logger.info('In-memory query results:', {
        count: results.length,
        items: results.map((r) => ({
            id: r.id,
            type: r.type,
            content: r.value,
        })),
    });

    await memoryManager.cleanup();
}

/**
 * Example 2: MongoDB Adapter (Production)
 */
async function mongodbExample() {
    logger.info('=== MONGODB ADAPTER EXAMPLE ===');

    // Note: Requires MongoDB connection string
    const connectionString =
        process.env.MONGODB_URI || 'mongodb://localhost:27017/kodus-memory';

    const memoryManager = new MemoryManager({
        adapterType: 'mongodb',
        adapterConfig: {
            connectionString,
            options: {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
            },
        },
        autoVectorizeText: true,
    });

    try {
        await memoryManager.initialize();

        // Store memory items
        await memoryManager.store({
            content: 'Agent processed user request for flight booking',
            type: 'agent_action',
            sessionId: 'session-456',
            tenantId: 'tenant-2',
            metadata: {
                agent: 'booking-agent',
                action: 'flight_search',
                success: true,
            },
        });

        // Search with filters
        const results = await memoryManager.query({
            type: 'agent_action',
            sessionId: 'session-456',
            limit: 5,
        });

        logger.info('MongoDB query results:', {
            count: results.length,
            items: results.map((r) => ({
                id: r.id,
                type: r.type,
                metadata: r.metadata,
            })),
        });

        // Get statistics
        const stats = await memoryManager.getStats();
        logger.info('Memory statistics:', stats);

        // Check health
        const isHealthy = await memoryManager.isHealthy();
        logger.info('Memory manager healthy', { isHealthy });
    } catch (error) {
        logger.error(
            'MongoDB example failed',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    } finally {
        await memoryManager.cleanup();
    }
}

/**
 * Example 3: Redundant Adapters (High Availability)
 */
async function redundantAdaptersExample() {
    logger.info('=== REDUNDANT ADAPTERS EXAMPLE ===');

    const memoryManager = new MemoryManager({
        adapterType: 'in-memory', // Primary
        backupAdapter: {
            type: 'mongodb',
            config: {
                connectionString:
                    process.env.MONGODB_URI ||
                    'mongodb://localhost:27017/kodus-backup',
            },
        },
        autoVectorizeText: true,
    });

    try {
        await memoryManager.initialize();

        // Store items (will be stored in both primary and backup)
        await memoryManager.store({
            content: 'Critical user data that needs backup',
            type: 'critical_data',
            sessionId: 'session-critical',
            tenantId: 'tenant-1',
            metadata: { priority: 'high', backup: true },
        });

        // Query (will try primary first, then backup if needed)
        const results = await memoryManager.query({
            type: 'critical_data',
            limit: 10,
        });

        logger.info('Redundant adapters query results', {
            count: results.length,
            items: results.map((r) => ({
                id: r.id,
                type: r.type,
                content: r.value,
            })),
        });
    } catch (error) {
        logger.error(
            'Redundant adapters example failed',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    } finally {
        await memoryManager.cleanup();
    }
}

/**
 * Example 4: Factory Pattern Usage
 */
async function factoryExample() {
    logger.info('=== FACTORY PATTERN EXAMPLE ===');

    // Create adapter using factory
    const adapter = await StorageAdapterFactory.create({
        type: 'memory',
        maxItems: 1000,
        enableCompression: true,
        cleanupInterval: 300000,
        timeout: 5000,
        retries: 3,
        enableObservability: true,
        enableHealthChecks: true,
        enableMetrics: true,
    });

    await adapter.initialize();

    // Use adapter directly
    await adapter.store({
        id: 'test-1',
        timestamp: Date.now(),
        metadata: { test: true, content: 'Test content' },
    });

    const item = await adapter.retrieve('test-1');
    logger.info('Factory adapter result', { item });

    await adapter.cleanup();
}

/**
 * Main function to run all examples
 */
async function main() {
    try {
        // Run examples
        await inMemoryExample();
        await mongodbExample();
        await redundantAdaptersExample();
        await factoryExample();

        logger.info('All memory adapter examples completed successfully');
    } catch (error) {
        logger.error(
            'Memory adapter examples failed',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export {
    inMemoryExample,
    mongodbExample,
    redundantAdaptersExample,
    factoryExample,
};
