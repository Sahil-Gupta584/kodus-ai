/**
 * 🔄 EXEMPLO 4: STATE MANAGEMENT & RECOVERY
 *
 * Este exemplo demonstra o sistema avançado de state management
 * com checkpoints, recovery automático e state transitions inteligentes
 */

import type {
    ExecutionStateManager,
    PlanStateManager,
    CheckpointManager,
    StateTransitionManager,
    StateSnapshot,
    ActivePlanState,
    Checkpoint,
    StateValidationResult,
} from '../index.js';

import { ExecutionPhase } from '../../types/allTypes.js';

// ===============================================
// 🎯 CENÁRIO: MISSION-CRITICAL SYSTEM RECOVERY
// ===============================================

export class MissionCriticalRecoveryExample {
    async demonstrateStateManagement(
        stateManager: ExecutionStateManager,
        checkpointManager: CheckpointManager,
        transitionManager: StateTransitionManager,
    ) {
        console.log('🔄 EXEMPLO: Mission-Critical State Management\n');

        // ===== INICIALIZAÇÃO DO SISTEMA =====
        await this.initializeSystem(stateManager);

        // ===== EXECUÇÃO COM CHECKPOINTS AUTOMÁTICOS =====
        await this.executeWithAutoCheckpoints(stateManager, checkpointManager);

        // ===== SIMULAÇÃO DE FALHA CRÍTICA =====
        await this.simulateCriticalFailure(stateManager, checkpointManager);

        // ===== RECOVERY AUTOMÁTICO =====
        await this.performAutomaticRecovery(stateManager, checkpointManager);

        // ===== STATE TRANSITIONS INTELIGENTES =====
        await this.demonstrateSmartTransitions(transitionManager);

        // ===== VALIDAÇÃO E HEALTH CHECK =====
        await this.performStateValidation(stateManager);
    }

    private async initializeSystem(stateManager: ExecutionStateManager) {
        console.log('🚀 INICIALIZANDO SISTEMA MISSION-CRITICAL\n');

        await stateManager.initialize(
            'financial-processing-session',
            'high-frequency-trading-agent',
        );

        console.log('✅ SISTEMA INICIALIZADO:');
        console.log('   • Agent: High-Frequency Trading Agent');
        console.log('   • Session: financial-processing-session');
        console.log('   • Priority: CRITICAL');
        console.log('   • SLA: 99.99% uptime, <100ms response time');
        console.log('   • Checkpoint frequency: Every 30 seconds');
        console.log('   • Recovery target: <5 seconds');

        // Transition para fase de planning
        await stateManager.transitionTo(ExecutionPhase.PLANNING, {
            reason: 'System initialization complete',
            triggeredBy: 'system',
            timestamp: Date.now(),
            previousPhase: ExecutionPhase.INITIALIZATION,
            context: {
                tradingSession: 'NYSE-morning',
                marketConditions: 'volatile',
                riskLevel: 'medium',
            },
        });

        console.log(`\n🔄 STATE TRANSITION: INITIALIZATION → PLANNING`);
    }

    private async executeWithAutoCheckpoints(
        stateManager: ExecutionStateManager,
        checkpointManager: CheckpointManager,
    ) {
        console.log('\n📋 EXECUÇÃO COM AUTO-CHECKPOINTS\n');

        // Configurar checkpointing automático
        await checkpointManager.enableAutoCheckpoint({
            enabled: true,
            triggers: ['phase_change', 'time_interval', 'memory_threshold'],
            interval: 30000, // 30 segundos
            maxCheckpoints: 20,
            retentionPolicy: {
                maxAge: 3600000, // 1 hora
                maxCount: 50,
                keepMilestones: true,
                keepErrorRecoveryPoints: true,
            },
            compression: true,
        });

        console.log('✅ AUTO-CHECKPOINT CONFIGURADO:');
        console.log(
            '   • Triggers: phase_change, time_interval, memory_threshold',
        );
        console.log('   • Interval: 30s');
        console.log('   • Retention: 1h, max 50 checkpoints');
        console.log('   • Compression: enabled');

        // Simular execução com multiple phases
        const phases = [
            ExecutionPhase.PLANNING,
            ExecutionPhase.EXECUTION,
            ExecutionPhase.TOOL_CALLING,
            ExecutionPhase.OBSERVATION,
            ExecutionPhase.REASONING,
        ];

        for (let i = 0; i < phases.length; i++) {
            const phase = phases[i];
            const nextPhase = phases[i + 1];

            if (nextPhase) {
                await stateManager.transitionTo(nextPhase, {
                    reason: `Completed ${phase} phase`,
                    triggeredBy: 'execution-flow',
                    timestamp: Date.now(),
                    previousPhase: phase,
                    context: {
                        phaseDuration: Math.random() * 5000 + 1000,
                        memoryUsage: Math.random() * 0.3 + 0.4,
                        operationsCompleted: Math.floor(Math.random() * 10) + 5,
                    },
                });

                console.log(
                    `🔄 [t=${i * 30}s] Transition: ${phase} → ${nextPhase}`,
                );

                // Checkpoint automático triggerred por phase change
                const checkpoint = await checkpointManager.createCheckpoint(
                    `${nextPhase.toLowerCase()}-start`,
                    {
                        name: `${nextPhase} Phase Start`,
                        description: `Automatic checkpoint at ${nextPhase} phase start`,
                        trigger: 'phase_change',
                        milestone: true,
                        tags: [nextPhase.toLowerCase(), 'auto-checkpoint'],
                        userDefined: false,
                    },
                );

                console.log(
                    `   ✅ Checkpoint created: ${checkpoint.id} (${Math.round(checkpoint.size / 1024)}KB)`,
                );

                // Simular algum processamento
                await this.simulatePhaseProcessing(phase, stateManager);
            }
        }

        console.log('\n📊 CHECKPOINT SUMMARY:');
        const checkpoints = await checkpointManager.listCheckpoints();
        console.log(`   • Total checkpoints: ${checkpoints.length}`);
        console.log(
            `   • Milestone checkpoints: ${checkpoints.filter((c) => c.metadata.milestone).length}`,
        );
        console.log(
            `   • Total size: ${Math.round(checkpoints.reduce((sum, c) => sum + c.size, 0) / 1024)}KB`,
        );
        console.log(
            `   • Average size: ${Math.round(checkpoints.reduce((sum, c) => sum + c.size, 0) / checkpoints.length / 1024)}KB`,
        );
    }

    private async simulatePhaseProcessing(
        phase: ExecutionPhase,
        stateManager: ExecutionStateManager,
    ) {
        switch (phase) {
            case ExecutionPhase.PLANNING:
                console.log(`     ├── Market analysis completed`);
                console.log(
                    `     ├── Trading strategy selected: momentum-based`,
                );
                console.log(`     └── Risk parameters configured`);
                break;

            case ExecutionPhase.EXECUTION:
                console.log(`     ├── Order placement: 15 trades executed`);
                console.log(
                    `     ├── Portfolio rebalancing: 3 positions adjusted`,
                );
                console.log(`     └── P&L tracking: +$2,347.56`);
                break;

            case ExecutionPhase.TOOL_CALLING:
                console.log(`     ├── Market data API: 847ms avg latency`);
                console.log(
                    `     ├── Order management system: 23ms avg latency`,
                );
                console.log(`     └── Risk management API: 156ms avg latency`);
                break;

            case ExecutionPhase.OBSERVATION:
                console.log(
                    `     ├── Market conditions: Volatility increased 12%`,
                );
                console.log(
                    `     ├── Order fills: 14/15 orders filled (93.3%)`,
                );
                console.log(`     └── Risk metrics: Within acceptable limits`);
                break;

            case ExecutionPhase.REASONING:
                console.log(
                    `     ├── Performance analysis: +0.23% vs benchmark`,
                );
                console.log(
                    `     ├── Risk assessment: Low exposure maintained`,
                );
                console.log(
                    `     └── Next cycle planning: Strategy adjustment needed`,
                );
                break;
        }
    }

    private async simulateCriticalFailure(
        stateManager: ExecutionStateManager,
        checkpointManager: CheckpointManager,
    ) {
        console.log('\n💥 SIMULAÇÃO DE FALHA CRÍTICA\n');

        console.log('🚨 CRITICAL SYSTEM FAILURE DETECTED:');
        console.log('   • Type: OutOfMemoryError + Network Partition');
        console.log('   • Time: 14:27:33 UTC');
        console.log('   • Phase: TOOL_CALLING (mid-execution)');
        console.log('   • Impact: 47 active trades, $1.2M position exposure');
        console.log('   • Memory: 97% utilization');
        console.log('   • Network: 3/5 trading venues unreachable');

        // Tentar salvar snapshot de emergência
        console.log('\n🛡️  EMERGENCY PROCEDURES ACTIVATED:');

        try {
            const emergencySnapshot = await stateManager.saveState();
            console.log('   ✅ Emergency snapshot created:');
            console.log(`     • Snapshot ID: ${emergencySnapshot.id}`);
            console.log(
                `     • Size: ${Math.round(JSON.stringify(emergencySnapshot).length / 1024)}KB`,
            );
            console.log(`     • Phase captured: ${emergencySnapshot.phase}`);
            console.log(
                `     • Active executions: ${emergencySnapshot.execution.activeExecution ? 1 : 0}`,
            );
            console.log(`     • Data integrity: ${emergencySnapshot.checksum}`);

            // Checkpoints disponíveis para recovery
            const availableCheckpoints =
                await checkpointManager.listCheckpoints();
            const recentCheckpoints = availableCheckpoints
                .filter((c) => Date.now() - c.timestamp < 300000) // últimos 5 minutos
                .sort((a, b) => b.timestamp - a.timestamp);

            console.log('\n📦 RECOVERY CHECKPOINTS AVAILABLE:');
            recentCheckpoints.slice(0, 3).forEach((checkpoint) => {
                const age = Math.round(
                    (Date.now() - checkpoint.timestamp) / 1000,
                );
                console.log(
                    `     • ${checkpoint.id}: ${age}s ago, ${checkpoint.phase}, ${Math.round(checkpoint.size / 1024)}KB`,
                );
            });
        } catch (error) {
            console.log(
                '   ❌ Emergency snapshot failed - system in critical state',
            );
            console.log(
                '   ⚡ Initiating immediate recovery from last checkpoint',
            );
        }

        console.log('\n⏰ DOWNTIME STARTED: System offline');
        console.log('   • Trading halted automatically');
        console.log('   • Risk management alerts sent');
        console.log('   • Recovery procedure initiated');
    }

    private async performAutomaticRecovery(
        stateManager: ExecutionStateManager,
        checkpointManager: CheckpointManager,
    ) {
        console.log('\n🔧 AUTOMATIC RECOVERY INITIATED\n');

        // Encontrar melhor checkpoint para recovery
        const checkpoints = await checkpointManager.listCheckpoints();
        const recoveryCheckpoint = checkpoints
            .filter(
                (c) =>
                    c.metadata.milestone && Date.now() - c.timestamp < 180000,
            ) // 3 min
            .sort((a, b) => b.timestamp - a.timestamp)[0];

        if (!recoveryCheckpoint) {
            console.log('❌ No suitable recovery checkpoint found');
            return;
        }

        console.log('🎯 RECOVERY STRATEGY SELECTED:');
        console.log(`   • Checkpoint: ${recoveryCheckpoint.id}`);
        console.log(
            `   • Age: ${Math.round((Date.now() - recoveryCheckpoint.timestamp) / 1000)}s`,
        );
        console.log(`   • Phase: ${recoveryCheckpoint.phase}`);
        console.log(
            `   • Data loss: ~${Math.round((Date.now() - recoveryCheckpoint.timestamp) / 1000)}s of operations`,
        );

        // Validar checkpoint antes de restore
        console.log('\n🔍 CHECKPOINT VALIDATION:');
        const validation = await checkpointManager.validateCheckpoint(
            recoveryCheckpoint.id,
        );

        if (validation.isValid) {
            console.log('   ✅ Checkpoint integrity verified');
            console.log('   ✅ All required data present');
            console.log('   ✅ No corruption detected');
        } else {
            console.log('   ❌ Checkpoint validation failed:');
            validation.errors.forEach((error) => {
                console.log(`     • ${error}`);
            });
            return;
        }

        // Perform recovery
        console.log('\n🔄 RECOVERY IN PROGRESS:');
        console.log('   [00:00] Starting system recovery...');
        console.log('   [00:02] Restoring state from checkpoint...');

        try {
            await stateManager.loadState(recoveryCheckpoint.stateSnapshot.id);
            console.log('   [00:04] ✅ State restored successfully');

            console.log('   [00:05] Validating system state...');
            const stateValidation = await stateManager.validateState();

            if (stateValidation.isValid) {
                console.log('   [00:06] ✅ System state validation passed');

                console.log('   [00:07] Reconnecting to trading venues...');
                console.log('   [00:09] ✅ Network connectivity restored');

                console.log('   [00:10] Synchronizing market data...');
                console.log('   [00:12] ✅ Market data synchronized');

                console.log('   [00:13] Resuming trading operations...');
                console.log('   [00:15] ✅ Trading resumed successfully');

                console.log('\n✅ RECOVERY COMPLETED:');
                console.log(`   • Total downtime: 15 seconds`);
                console.log(
                    `   • Data loss: ${Math.round((Date.now() - recoveryCheckpoint.timestamp) / 1000)}s of operations`,
                );
                console.log(`   • Positions preserved: 47/47 (100%)`);
                console.log(`   • System health: Fully operational`);
                console.log(`   • SLA impact: Within 99.99% uptime target`);
            } else {
                console.log('   ❌ System state validation failed');
                console.log('   🔧 Initiating deeper recovery procedure...');
            }
        } catch (error) {
            console.log(`   ❌ Recovery failed: ${error}`);
            console.log('   🚨 Escalating to manual intervention');
        }
    }

    private async demonstrateSmartTransitions(
        transitionManager: StateTransitionManager,
    ) {
        console.log('\n🧠 SMART STATE TRANSITIONS\n');

        // Configurar validadores de transição
        console.log('⚙️  CONFIGURANDO TRANSITION VALIDATORS:');

        // Validator para transição crítica
        transitionManager.registerTransition(
            ExecutionPhase.TOOL_CALLING,
            ExecutionPhase.FINAL_ANSWER,
            async (from, to, metadata) => {
                const canTransition = Math.random() > 0.3; // 70% chance de sucesso

                return {
                    canTransition,
                    blockers: canTransition
                        ? []
                        : [
                              {
                                  reason: 'Pending tool calls not completed',
                                  component: 'tool-manager',
                                  severity: 'blocking',
                                  resolution:
                                      'Wait for all tool calls to complete or timeout',
                              },
                          ],
                    warnings: [
                        {
                            message:
                                'Some tool calls are taking longer than expected',
                            impact: 'May affect response time SLA',
                            recommendation: 'Consider timeout adjustment',
                        },
                    ],
                    requiredActions: canTransition
                        ? []
                        : [
                              'Complete pending tool calls',
                              'Validate tool outputs',
                              'Update execution context',
                          ],
                };
            },
        );

        // Pre-transition hook
        transitionManager.registerPreTransitionHook(
            ExecutionPhase.FINAL_ANSWER,
            async (from, to, metadata) => {
                console.log(`   🔀 Pre-transition hook: ${from} → ${to}`);
                console.log('     ├── Validating execution completeness');
                console.log('     ├── Preparing final response context');
                console.log('     └── Ensuring data consistency');
            },
        );

        // Post-transition hook
        transitionManager.registerPostTransitionHook(
            ExecutionPhase.FINAL_ANSWER,
            async (from, to, result) => {
                console.log(`   ✅ Post-transition hook: ${from} → ${to}`);
                console.log(
                    `     ├── Transition completed in ${result.duration}ms`,
                );
                console.log('     ├── Metrics updated');
                console.log('     └── Performance logged');
            },
        );

        console.log('   ✅ Validators and hooks registered');

        // Demonstrar transição inteligente
        console.log('\n🎯 EXECUTING SMART TRANSITION:');

        const transitionResult = await transitionManager.executeTransition(
            ExecutionPhase.FINAL_ANSWER,
            {
                reason: 'All operations completed successfully',
                triggeredBy: 'execution-flow',
                timestamp: Date.now(),
                previousPhase: ExecutionPhase.TOOL_CALLING,
                context: {
                    completionRate: 1.0,
                    qualityScore: 0.94,
                    responseTime: 1247,
                },
            },
        );

        if (transitionResult.success) {
            console.log('   ✅ Transition successful:');
            console.log(`     • Duration: ${transitionResult.duration}ms`);
            console.log(`     • From: ${transitionResult.fromPhase}`);
            console.log(`     • To: ${transitionResult.toPhase}`);
            console.log('     • All validators passed');
            console.log('     • Hooks executed successfully');
        } else {
            console.log('   ❌ Transition blocked:');
            console.log('     • Reason: Validation failed');
            console.log('     • Required actions identified');
            console.log('     • Automatic retry scheduled');
        }

        // Histórico de transições
        console.log('\n📊 TRANSITION ANALYTICS:');
        const transitionHistory =
            await transitionManager.getTransitionHistory();
        const recentTransitions = transitionHistory.slice(-5);

        console.log('   Recent transitions:');
        recentTransitions.forEach((transition) => {
            const duration = transition.duration || 0;
            const success = transition.success ? '✅' : '❌';
            console.log(
                `     ${success} ${transition.fromPhase} → ${transition.toPhase} (${duration}ms)`,
            );
        });

        // Patterns identificados
        const phaseFrequency = transitionHistory.reduce(
            (acc, t) => {
                const key = `${t.fromPhase}_${t.toPhase}`;
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        console.log('\n   Common transition patterns:');
        Object.entries(phaseFrequency)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .forEach(([pattern, count]) => {
                const [from, to] = pattern.split('_');
                console.log(`     • ${from} → ${to}: ${count} times`);
            });
    }

    private async performStateValidation(stateManager: ExecutionStateManager) {
        console.log('\n🔍 COMPREHENSIVE STATE VALIDATION\n');

        const validationResult = await stateManager.validateState();

        console.log('📋 VALIDATION RESULTS:');
        console.log(
            `   • Overall status: ${validationResult.isValid ? '✅ VALID' : '❌ INVALID'}`,
        );
        console.log(`   • Errors found: ${validationResult.errors.length}`);
        console.log(`   • Warnings: ${validationResult.warnings.length}`);

        // Component-specific validation
        console.log('\n🔧 COMPONENT VALIDATION:');

        const components = [
            {
                name: 'Execution State',
                result: validationResult.executionState,
            },
            { name: 'Planning State', result: validationResult.planningState },
            { name: 'Memory State', result: validationResult.memoryState },
        ];

        components.forEach(({ name, result }) => {
            const status = result.isValid ? '✅' : '❌';
            console.log(`   ${status} ${name}:`);
            if (result.errors.length > 0) {
                result.errors.forEach((error) => {
                    console.log(`     • Error: ${error}`);
                });
            }
            if (result.warnings.length > 0) {
                result.warnings.forEach((warning) => {
                    console.log(`     • Warning: ${warning}`);
                });
            }
            if (
                result.isValid &&
                result.errors.length === 0 &&
                result.warnings.length === 0
            ) {
                console.log('     • All checks passed');
            }
        });

        // Health metrics
        const healthReport = await stateManager.getStateHealth();

        console.log('\n🏥 SYSTEM HEALTH REPORT:');
        console.log(
            `   • Overall health: ${healthReport.overall.toUpperCase()}`,
        );
        console.log(`   • Memory usage: ${healthReport.memoryUsage}%`);
        console.log(`   • Storage usage: ${healthReport.storageUsage}%`);
        console.log(
            `   • State transition latency: ${healthReport.stateTransitionLatency}ms`,
        );
        console.log(
            `   • Checkpoint latency: ${healthReport.checkpointLatency}ms`,
        );

        console.log('\n📊 COMPONENT HEALTH:');
        healthReport.components.forEach((component) => {
            const statusIcon =
                component.status === 'healthy'
                    ? '✅'
                    : component.status === 'degraded'
                      ? '⚠️'
                      : '❌';
            console.log(`   ${statusIcon} ${component.component}:`);
            console.log(`     • Status: ${component.status}`);
            Object.entries(component.metrics).forEach(([metric, value]) => {
                console.log(`     • ${metric}: ${value}`);
            });
            if (component.issues.length > 0) {
                component.issues.forEach((issue) => {
                    console.log(`     • Issue: ${issue}`);
                });
            }
        });

        if (healthReport.recommendations.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            healthReport.recommendations.forEach((rec) => {
                console.log(`   • ${rec}`);
            });
        }

        if (healthReport.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            healthReport.warnings.forEach((warning) => {
                console.log(`   • ${warning}`);
            });
        }
    }
}

// ===============================================
// 🚀 CENÁRIO AVANÇADO: DISTRIBUTED RECOVERY
// ===============================================

export class DistributedRecoveryExample {
    async demonstrateDistributedRecovery() {
        console.log('\n🌐 EXEMPLO: Distributed System Recovery\n');

        // ===== CLUSTER STATE MANAGEMENT =====
        await this.simulateClusterFailure();

        // ===== CONSENSUS-BASED RECOVERY =====
        await this.performConsensusRecovery();

        // ===== SPLIT-BRAIN PREVENTION =====
        await this.demonstrateSplitBrainPrevention();

        // ===== DATA CONSISTENCY =====
        await this.ensureDataConsistency();
    }

    private async simulateClusterFailure() {
        console.log('🏭 CLUSTER STATE MANAGEMENT:');
        console.log('   • Nodes: 5 active (node-1 to node-5)');
        console.log('   • Consensus: Raft protocol');
        console.log('   • Leader: node-2');
        console.log('   • Replicas: 3x replication');

        console.log('\n💥 CLUSTER FAILURE SIMULATION:');
        console.log(
            '   🔥 [t=0s] Network partition: nodes {1,2} isolated from {3,4,5}',
        );
        console.log('   ⚠️  [t=1s] Split-brain risk detected');
        console.log('   🛑 [t=2s] Write operations halted automatically');
        console.log(
            '   📊 [t=3s] Partition health: Minority={1,2}, Majority={3,4,5}',
        );
        console.log(
            '   🔄 [t=4s] Leader election initiated in majority partition',
        );
        console.log('   👑 [t=7s] New leader elected: node-4');
        console.log('   ✅ [t=8s] Cluster operational with 3 nodes');
    }

    private async performConsensusRecovery() {
        console.log('\n🤝 CONSENSUS-BASED RECOVERY:');
        console.log('   📡 [t=45s] Network partition resolved');
        console.log('   🔍 [t=46s] Discovering cluster state:');
        console.log('     • Majority partition: {3,4,5} with leader node-4');
        console.log('     • Minority partition: {1,2} (read-only mode)');
        console.log('     • Log divergence: 147 entries');

        console.log('\n   🔄 [t=47s] Rejoining process initiated:');
        console.log('     • node-1: Requesting state sync from leader');
        console.log('     • node-2: Requesting state sync from leader');
        console.log('     • Leader node-4: Preparing state transfer');

        console.log('\n   📦 [t=49s] State synchronization:');
        console.log('     • Transferring 147 log entries to node-1');
        console.log('     • Transferring 147 log entries to node-2');
        console.log('     • Checksum validation: ✅ node-1, ✅ node-2');

        console.log('\n   ✅ [t=53s] Cluster fully recovered:');
        console.log('     • All 5 nodes operational');
        console.log('     • Consensus restored');
        console.log('     • Write operations resumed');
        console.log('     • Replication factor: 3x achieved');
    }

    private async demonstrateSplitBrainPrevention() {
        console.log('\n🧠 SPLIT-BRAIN PREVENTION:');
        console.log('   🛡️  Safety mechanisms active:');
        console.log('     • Quorum requirement: >50% nodes for writes');
        console.log('     • Fencing tokens: Prevent stale leaders');
        console.log('     • Lease-based leadership: 30s lease timeout');
        console.log('     • Health checks: Every 5s heartbeat');

        console.log('\n   📊 Scenario analysis:');
        console.log('     • Partition {1,2} vs {3,4,5}:');
        console.log('       ✅ Majority {3,4,5} continues operations');
        console.log('       🛑 Minority {1,2} enters read-only mode');
        console.log('     • Partition {1,2,3} vs {4,5}:');
        console.log('       ✅ Majority {1,2,3} continues operations');
        console.log('       🛑 Minority {4,5} enters read-only mode');
        console.log('     • Partition {1} vs {2,3,4,5}:');
        console.log('       ✅ Majority {2,3,4,5} continues operations');
        console.log('       🛑 Node {1} enters read-only mode');
    }

    private async ensureDataConsistency() {
        console.log('\n🔄 DATA CONSISTENCY VERIFICATION:');
        console.log('   🔍 Cross-node validation:');
        console.log('     • node-1: State hash 0x4f7a2b9c');
        console.log('     • node-2: State hash 0x4f7a2b9c ✅');
        console.log('     • node-3: State hash 0x4f7a2b9c ✅');
        console.log('     • node-4: State hash 0x4f7a2b9c ✅');
        console.log('     • node-5: State hash 0x4f7a2b9c ✅');

        console.log('\n   📊 Consistency metrics:');
        console.log('     • Consensus rounds: 1,247');
        console.log('     • Failed consensus: 3 (0.24%)');
        console.log('     • Average consensus time: 45ms');
        console.log('     • State divergence incidents: 0');
        console.log('     • Data integrity: 100%');

        console.log('\n   ✅ CONSISTENCY VERIFICATION PASSED:');
        console.log('     • All nodes have identical state');
        console.log('     • No data corruption detected');
        console.log('     • Audit trail complete');
        console.log('     • Recovery procedures validated');
    }
}

// ===============================================
// 🚀 EXEMPLO DE USO PRÁTICO
// ===============================================

export async function demonstrateStateManagementPower() {
    console.log('🔄 DEMONSTRAÇÃO: Poder do State Management\n');

    // Mock state managers
    const stateManager = createMockStateManager();
    const checkpointManager = createMockCheckpointManager();
    const transitionManager = createMockTransitionManager();

    // Demonstrar recovery mission-critical
    const missionCriticalExample = new MissionCriticalRecoveryExample();
    await missionCriticalExample.demonstrateStateManagement(
        stateManager,
        checkpointManager,
        transitionManager,
    );

    // Demonstrar recovery distribuído
    const distributedExample = new DistributedRecoveryExample();
    await distributedExample.demonstrateDistributedRecovery();

    console.log('\n🎯 BENEFÍCIOS DEMONSTRADOS:');
    console.log('✅ Recovery automático sub-15s');
    console.log('✅ Checkpoints inteligentes');
    console.log('✅ State transitions validadas');
    console.log('✅ Consistency garantida');
    console.log('✅ Split-brain prevention');
    console.log('✅ Distributed consensus');
    console.log('✅ Mission-critical reliability');
}

// Helpers para criar mock services
function createMockStateManager(): ExecutionStateManager {
    let currentPhase = ExecutionPhase.INITIALIZATION;

    return {
        async initialize(sessionId, agentId) {
            console.log(
                `Initialized state manager for ${agentId}:${sessionId}`,
            );
        },

        getCurrentPhase() {
            return currentPhase;
        },

        async transitionTo(phase, metadata) {
            currentPhase = phase;
        },

        async saveState() {
            return {
                id: `snapshot-${Date.now()}`,
                sessionId: 'financial-processing-session',
                agentId: 'high-frequency-trading-agent',
                timestamp: Date.now(),
                phase: currentPhase,
                execution: {
                    currentPhase,
                    previousPhase: ExecutionPhase.PLANNING,
                    phaseStartTime: Date.now() - 30000,
                    totalExecutionTime: 180000,
                    activeExecution: null,
                    executionHistory: [],
                    stepRegistry: {
                        totalSteps: 0,
                        completedSteps: [],
                        failedSteps: [],
                    },
                    lastError: null,
                    errorCount: 0,
                    recoveryAttempts: 0,
                },
                planning: {
                    activePlan: null,
                    planHistory: [],
                    replanCount: 0,
                    lastReplanReason: null,
                    replanContext: null,
                    metrics: {
                        totalPlans: 15,
                        completedPlans: 14,
                        failedPlans: 1,
                        averagePlanDuration: 45000,
                        totalSteps: 60,
                        averageStepsPerPlan: 4,
                        stepSuccessRate: 96.7,
                        replanRate: 6.7,
                        averageReplanAttempts: 1.2,
                        planningTime: 5000,
                        executionTime: 40000,
                        waitingTime: 2000,
                    },
                },
                memory: {
                    shortTerm: {
                        items: [],
                        capacity: 100,
                        utilizationPercent: 45,
                    },
                    longTerm: {
                        itemCount: 1247,
                        categories: {},
                        lastIndexUpdate: Date.now(),
                    },
                    episodic: { episodes: [], totalEvents: 234 },
                    totalMemoryItems: 1247,
                    memoryUtilization: 0.62,
                    lastCleanupTime: Date.now() - 3600000,
                },
                version: '1.0.0',
                checksum: 'sha256:4f7a2b9c8e1d3f6a',
                metadata: { criticality: 'high', source: 'emergency-save' },
            } as StateSnapshot;
        },

        async loadState(snapshotId) {
            console.log(`Loading state from ${snapshotId}`);
        },

        async validateState() {
            return {
                isValid: true,
                errors: [],
                warnings: [
                    {
                        code: 'MEM_USAGE_HIGH',
                        message: 'Memory usage above 80%',
                        component: 'memory-manager',
                        impact: 'Performance degradation possible',
                        suggestion: 'Consider increasing memory allocation',
                    },
                ],
                executionState: { isValid: true, errors: [], warnings: [] },
                planningState: { isValid: true, errors: [], warnings: [] },
                memoryState: {
                    isValid: true,
                    errors: [],
                    warnings: ['Memory usage high'],
                },
            } as StateValidationResult;
        },

        async getStateHealth() {
            return {
                overall: 'healthy' as const,
                components: [
                    {
                        component: 'execution-manager',
                        status: 'healthy' as const,
                        metrics: { responseTime: 45, throughput: 4.2 },
                        lastCheck: Date.now(),
                        issues: [],
                    },
                    {
                        component: 'memory-manager',
                        status: 'degraded' as const,
                        metrics: { usage: 82, efficiency: 0.76 },
                        lastCheck: Date.now(),
                        issues: ['High memory usage'],
                    },
                ],
                memoryUsage: 82,
                storageUsage: 64,
                stateTransitionLatency: 45,
                checkpointLatency: 120,
                recommendations: [
                    'Increase memory allocation',
                    'Optimize state storage compression',
                ],
                warnings: ['Memory usage trending upward'],
            };
        },
    } as any;
}

function createMockCheckpointManager(): CheckpointManager {
    let checkpointCounter = 1;
    const checkpoints: Checkpoint[] = [];

    return {
        async enableAutoCheckpoint(config) {
            console.log('Auto-checkpoint enabled with config');
        },

        async createCheckpoint(name, metadata) {
            const checkpoint: Checkpoint = {
                id: `checkpoint-${checkpointCounter++}`,
                name,
                timestamp: Date.now(),
                phase: ExecutionPhase.PLANNING,
                stateSnapshot: {} as StateSnapshot,
                metadata: metadata || ({} as any),
                size: Math.floor(Math.random() * 50000) + 10000,
                compressed: true,
            };
            checkpoints.push(checkpoint);
            return checkpoint;
        },

        async listCheckpoints() {
            return checkpoints.map((c) => ({
                id: c.id,
                name: c.name,
                timestamp: c.timestamp,
                phase: c.phase,
                size: c.size,
                metadata: c.metadata,
            }));
        },

        async validateCheckpoint(checkpointId) {
            return {
                isValid: Math.random() > 0.1, // 90% chance válido
                errors: [],
                warnings: [],
                canRestore: true,
            };
        },
    } as any;
}

function createMockTransitionManager(): StateTransitionManager {
    const history: any[] = [];

    return {
        registerTransition(from, to, validator) {
            console.log(`Transition registered: ${from} → ${to}`);
        },

        registerPreTransitionHook(phase, hook) {
            console.log(`Pre-transition hook registered for ${phase}`);
        },

        registerPostTransitionHook(phase, hook) {
            console.log(`Post-transition hook registered for ${phase}`);
        },

        async executeTransition(to, metadata) {
            const success = Math.random() > 0.2; // 80% success
            const duration = Math.floor(Math.random() * 100) + 50;

            const result = {
                success,
                fromPhase: ExecutionPhase.TOOL_CALLING,
                toPhase: to,
                duration,
                metadata: metadata!,
            };

            history.push({
                fromPhase: result.fromPhase,
                toPhase: result.toPhase,
                timestamp: Date.now(),
                duration,
                success,
                metadata,
            });

            return result;
        },

        async getTransitionHistory() {
            return [
                ...history,
                // Add some mock history
                {
                    fromPhase: ExecutionPhase.INITIALIZATION,
                    toPhase: ExecutionPhase.PLANNING,
                    timestamp: Date.now() - 300000,
                    duration: 45,
                    success: true,
                    metadata: {},
                },
                {
                    fromPhase: ExecutionPhase.PLANNING,
                    toPhase: ExecutionPhase.EXECUTION,
                    timestamp: Date.now() - 240000,
                    duration: 78,
                    success: true,
                    metadata: {},
                },
            ];
        },
    } as any;
}

// Executar demonstração
// demonstrateStateManagementPower();
