import { createRuntime } from './src/runtime/index.js';
import { createWorkflowContext } from './src/core/context/index.js';
import { getObservability } from './src/observability/index.js';

async function debugTest() {
    console.log('=== DEBUG TEST ===');

    const observability = getObservability({ environment: 'test' });
    const context = createWorkflowContext({
        executionId: 'test-execution',
        tenantId: 'test-tenant',
        startTime: Date.now(),
        status: 'RUNNING',
        stream: {
            [Symbol.asyncIterator]: async function* () {},
            filter: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
            map: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
            until: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
            takeUntil: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
            toArray: () => Promise.resolve([]),
            withMiddleware: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
            debounce: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
            throttle: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
            batch: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
            merge: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
            combineLatest: () =>
                ({ [Symbol.asyncIterator]: async function* () {} }) as any,
        } as any,
        sendEvent: async () => {},
        emit: () => {},
        resourceManager: {
            addTimer: () => {},
            addInterval: () => {},
            addCleanupCallback: () => {},
            removeTimer: () => false,
            removeInterval: () => false,
            removeCleanupCallback: () => false,
        },
        pause: async () => '',
        resume: async () => {},
    });

    const runtime = createRuntime(context, observability);

    let handlerCalled = false;

    runtime.on('test.event', async (event) => {
        console.log('Handler called with event:', event);
        handlerCalled = true;
    });

    console.log('Emitting event...');
    runtime.emit('test.event', { data: 'test' });

    // Aguardar um pouco para o enqueue assíncrono completar
    await new Promise((resolve) => setTimeout(resolve, 10));

    console.log('Processing events...');
    await runtime.process();

    console.log('Handler called:', handlerCalled);
    console.log('Runtime stats:', runtime.getStats());
}

debugTest().catch(console.error);
