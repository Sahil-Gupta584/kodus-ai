/**
 * @file event-store-usage.ts
 * @description Exemplo de uso do Event Store integrado com Runtime
 */

import { createRuntime } from '../src/runtime/index.js';
import { createLogger } from '../src/observability/index.js';
import { createEvent } from '../src/core/types/events.js';
import type { WorkflowContext } from '../src/core/types/workflow-types.js';

// Setup observability
const logger = createLogger('event-store-example');
const observability = {
    logger,
    metrics: {
        increment: () => {},
        histogram: () => {},
        gauge: () => {},
    },
    tracer: {
        startSpan: () => ({ end: () => {}, setStatus: () => {} }),
    },
};

// Mock workflow context
const context: WorkflowContext = {
    workflowName: 'event-store-demo',
    executionId: 'demo_execution_123',
    tenantId: 'demo-tenant',
    metadata: {},
};

async function demonstrateEventStore() {
    console.log('🚀 Event Store Demo Starting...\n');

    // Criar runtime com Event Store habilitado
    const runtime = createRuntime(context, observability, {
        enableEventStore: true,
        eventStoreConfig: {
            persistorType: 'memory',
            replayBatchSize: 10,
            maxStoredEvents: 1000,
        },
        enableObservability: true,
    });

    console.log('✅ Runtime created with Event Store enabled');

    // Registrar handler para processar eventos
    runtime.on('agent.tool.request', async (event) => {
        console.log(`🔧 Processing tool request: ${JSON.stringify(event.data)}`);
        
        // Simular processamento
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Emitir response
        await runtime.emitAsync('agent.tool.response', {
            toolName: event.data?.toolName,
            result: `Result for ${event.data?.toolName}`,
            success: true,
        });
    });

    runtime.on('agent.tool.response', async (event) => {
        console.log(`📦 Tool response received: ${JSON.stringify(event.data)}`);
    });

    console.log('✅ Event handlers registered\n');

    // === FASE 1: Emit alguns eventos ===
    console.log('📤 FASE 1: Emitting events...');
    
    const events = [
        'calculator',
        'database', 
        'file-reader',
        'api-client',
        'data-processor'
    ];

    for (const toolName of events) {
        await runtime.emitAsync('agent.tool.request', {
            toolName,
            parameters: { input: `test-${toolName}` },
            timestamp: Date.now(),
        });
        
        console.log(`  ✓ Emitted request for ${toolName}`);
        await new Promise(resolve => setTimeout(resolve, 50)); // Pequeno delay
    }

    // Processar eventos
    console.log('\n⚡ Processing all events...');
    await runtime.process();
    console.log('✅ All events processed\n');

    // === FASE 2: Verificar Event Store ===
    console.log('📊 FASE 2: Checking Event Store...');
    
    const eventStore = runtime.getEventStore();
    if (eventStore) {
        const stats = await eventStore.getStats();
        console.log(`📈 Event Store Stats:`, {
            totalStoredEvents: stats.totalStoredEvents,
            unprocessedEvents: stats.unprocessedEvents,
            oldestEvent: stats.oldestEventTimestamp ? new Date(stats.oldestEventTimestamp).toISOString() : 'none',
            newestEvent: stats.newestEventTimestamp ? new Date(stats.newestEventTimestamp).toISOString() : 'none',
        });
    }

    // === FASE 3: Event Replay ===
    console.log('\n🔄 FASE 3: Event Replay Demo...');
    
    // Replay events from 5 minutes ago
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    console.log(`🕐 Replaying events from: ${new Date(fiveMinutesAgo).toISOString()}`);
    
    let replayedBatches = 0;
    let totalReplayedEvents = 0;
    
    for await (const batch of runtime.replayEvents!(fiveMinutesAgo, {
        onlyUnprocessed: false, // Replay all events
        batchSize: 3,
    })) {
        replayedBatches++;
        totalReplayedEvents += batch.length;
        
        console.log(`  📦 Batch ${replayedBatches}: ${batch.length} events`);
        batch.forEach((event, index) => {
            console.log(`    ${index + 1}. ${event.type} (${event.id})`);
        });
    }
    
    console.log(`✅ Replay completed: ${totalReplayedEvents} events in ${replayedBatches} batches\n`);

    // === FASE 4: Simular falha e recovery ===
    console.log('💥 FASE 4: Simulating failure and recovery...');
    
    // Emit mais alguns eventos
    await runtime.emitAsync('agent.workflow.started', { 
        workflowId: 'recovery-test',
        timestamp: Date.now(),
    });
    
    await runtime.emitAsync('agent.planning.request', {
        goal: 'Test recovery scenario',
        context: { mode: 'recovery' },
    });
    
    console.log('✓ Emitted events before "crash"');
    
    // Simular que alguns eventos não foram processados (não chamar process())
    console.log('💀 Simulated system crash (events not processed)');
    
    // Replay apenas eventos não processados
    console.log('🚑 Recovery: Replaying unprocessed events...');
    
    let recoveryBatches = 0;
    let recoveredEvents = 0;
    
    for await (const batch of runtime.replayEvents!(fiveMinutesAgo, {
        onlyUnprocessed: true, // Só eventos não processados
        batchSize: 5,
    })) {
        recoveryBatches++;
        recoveredEvents += batch.length;
        
        console.log(`  🚑 Recovery batch ${recoveryBatches}: ${batch.length} unprocessed events`);
        
        // Processar eventos recuperados
        for (const event of batch) {
            console.log(`    ⚡ Reprocessing: ${event.type} (${event.id})`);
            // Aqui você reprocessaria o evento
        }
    }
    
    console.log(`✅ Recovery completed: ${recoveredEvents} events recovered\n`);

    // === CLEANUP ===
    console.log('🧹 Cleaning up...');
    await runtime.cleanup();
    console.log('✅ Demo completed successfully! 🎉');
}

// Executar demo
demonstrateEventStore().catch((error) => {
    console.error('❌ Demo failed:', error);
    process.exit(1);
});