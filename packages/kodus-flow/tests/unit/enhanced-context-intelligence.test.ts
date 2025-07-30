/**
 * Enhanced Context Intelligence - Unit Tests
 *
 * Tests for intelligence-enhanced context features including:
 * - Tool execution hints generation
 * - Learning pattern storage and retrieval
 * - Enhanced memory service integration
 * - Intelligence context lifecycle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    createIntelligentContextFactory,
    createEnhancedAgentContext,
} from '../../src/core/context/context-factory.js';
import type { EnhancedContext } from '../../src/core/context/enhancements/enhanced-context.js';
import type { ExecutionPattern } from '../../src/core/context/enhancements/intelligence-context.js';

describe('Enhanced Context Intelligence', () => {
    let intelligentFactory: ReturnType<typeof createIntelligentContextFactory>;
    let enhancedContext: EnhancedContext;

    beforeEach(() => {
        intelligentFactory = createIntelligentContextFactory();
        enhancedContext = createEnhancedAgentContext({
            agentName: 'test-intelligent-agent',
            tenantId: 'test-tenant',
        });
    });

    describe('Tool Execution Hints', () => {
        it('should generate basic tool execution hints', async () => {
            const tools = ['tool1', 'tool2', 'tool3'];
            const hints =
                await enhancedContext.intelligence.getToolExecutionHints(tools);

            expect(hints).toBeDefined();
            expect(hints.recommendedStrategy).toMatch(
                /^(parallel|sequential|conditional|adaptive)$/,
            );
            expect(hints.confidence).toBeGreaterThanOrEqual(0);
            expect(hints.confidence).toBeLessThanOrEqual(1);
            expect(hints.reasoning).toContain('similar executions');
            expect(Array.isArray(hints.parallelizable)).toBe(true);
            expect(Array.isArray(hints.sequential)).toBe(true);
        });

        it('should respect priority requirements in hints', async () => {
            const tools = ['fast-tool', 'slow-tool'];
            const speedHints =
                await enhancedContext.intelligence.getToolExecutionHints(
                    tools,
                    {
                        priority: 'speed',
                    },
                );
            const reliabilityHints =
                await enhancedContext.intelligence.getToolExecutionHints(
                    tools,
                    {
                        priority: 'reliability',
                    },
                );

            expect(speedHints.performance.estimatedDuration).toBeDefined();
            expect(reliabilityHints.performance.riskLevel).toBeDefined();
            expect(speedHints.constraints.timeout).toBeDefined();
            expect(reliabilityHints.constraints.retryPolicy).toBeDefined();
        });

        it('should apply execution constraints correctly', async () => {
            const tools = ['tool1', 'tool2', 'tool3', 'tool4'];
            const hints =
                await enhancedContext.intelligence.getToolExecutionHints(
                    tools,
                    {
                        priority: 'efficiency',
                        constraints: {
                            maxConcurrency: 2,
                            timeout: 15000,
                        },
                    },
                );

            expect(hints.constraints.maxConcurrency).toBe(2);
            expect(hints.constraints.timeout).toBe(15000);
        });
    });

    describe('Learning Pattern Management', () => {
        it('should store execution patterns successfully', async () => {
            const pattern: ExecutionPattern = {
                id: 'pattern-1',
                context: {
                    tools: ['tool1', 'tool2'],
                    inputSize: 1000,
                    complexity: 'moderate',
                    tenantId: 'test-tenant',
                },
                execution: {
                    strategy: 'parallel',
                    duration: 2500,
                    success: true,
                    resourceUsage: {
                        cpu: 0.7,
                        memory: 0.5,
                        io: 0.3,
                    },
                },
                timestamp: Date.now(),
                agentName: 'test-intelligent-agent',
            };

            await expect(
                enhancedContext.intelligence.storeLearningPattern(pattern),
            ).resolves.not.toThrow();
        });

        it('should learn from successful patterns', async () => {
            // Store a successful parallel execution pattern
            const successPattern: ExecutionPattern = {
                id: 'success-pattern',
                context: {
                    tools: ['parallel-tool1', 'parallel-tool2'],
                    inputSize: 500,
                    complexity: 'simple',
                    tenantId: 'test-tenant',
                },
                execution: {
                    strategy: 'parallel',
                    duration: 1000,
                    success: true,
                    resourceUsage: { cpu: 0.4, memory: 0.3, io: 0.2 },
                },
                timestamp: Date.now(),
                agentName: 'test-intelligent-agent',
            };

            await enhancedContext.intelligence.storeLearningPattern(
                successPattern,
            );

            // Request hints for similar tools
            const hints =
                await enhancedContext.intelligence.getToolExecutionHints([
                    'parallel-tool1',
                    'parallel-tool2',
                ]);

            // Should prefer parallel strategy due to learned pattern
            expect(hints.parallelizable).toContain('parallel-tool1');
            expect(hints.parallelizable).toContain('parallel-tool2');
        });

        it('should learn from failed patterns', async () => {
            // Store a failed parallel execution pattern
            const failurePattern: ExecutionPattern = {
                id: 'failure-pattern',
                context: {
                    tools: ['unreliable-tool1', 'unreliable-tool2'],
                    inputSize: 2000,
                    complexity: 'complex',
                    tenantId: 'test-tenant',
                },
                execution: {
                    strategy: 'parallel',
                    duration: 5000,
                    success: false,
                    errors: ['Timeout error', 'Resource exhaustion'],
                    resourceUsage: { cpu: 0.9, memory: 0.8, io: 0.7 },
                },
                timestamp: Date.now(),
                agentName: 'test-intelligent-agent',
            };

            await enhancedContext.intelligence.storeLearningPattern(
                failurePattern,
            );

            // Request hints for similar tools
            const hints =
                await enhancedContext.intelligence.getToolExecutionHints([
                    'unreliable-tool1',
                    'unreliable-tool2',
                ]);

            // Should prefer sequential strategy and have lower confidence
            expect(hints.sequential).toContain('unreliable-tool1');
            expect(hints.sequential).toContain('unreliable-tool2');
            expect(hints.performance.riskLevel).toBe('high');
        });
    });

    describe('Learning Insights', () => {
        it('should provide learning insights', async () => {
            const insights =
                await enhancedContext.intelligence.getLearningInsights();

            expect(insights).toBeDefined();
            expect(Array.isArray(insights.topStrategies)).toBe(true);
            expect(Array.isArray(insights.commonPatterns)).toBe(true);
            expect(Array.isArray(insights.optimizationOpportunities)).toBe(
                true,
            );
        });

        it('should track strategy effectiveness over time', async () => {
            // Store multiple patterns with different strategies
            const patterns: ExecutionPattern[] = [
                {
                    id: 'parallel-success-1',
                    context: {
                        tools: ['tool1', 'tool2'],
                        inputSize: 100,
                        complexity: 'simple',
                        tenantId: 'test-tenant',
                    },
                    execution: {
                        strategy: 'parallel',
                        duration: 1000,
                        success: true,
                        resourceUsage: { cpu: 0.3, memory: 0.2, io: 0.1 },
                    },
                    timestamp: Date.now() - 3000,
                    agentName: 'test-intelligent-agent',
                },
                {
                    id: 'parallel-success-2',
                    context: {
                        tools: ['tool3', 'tool4'],
                        inputSize: 150,
                        complexity: 'simple',
                        tenantId: 'test-tenant',
                    },
                    execution: {
                        strategy: 'parallel',
                        duration: 1200,
                        success: true,
                        resourceUsage: { cpu: 0.4, memory: 0.3, io: 0.2 },
                    },
                    timestamp: Date.now() - 2000,
                    agentName: 'test-intelligent-agent',
                },
                {
                    id: 'sequential-success-1',
                    context: {
                        tools: ['tool5'],
                        inputSize: 200,
                        complexity: 'moderate',
                        tenantId: 'test-tenant',
                    },
                    execution: {
                        strategy: 'sequential',
                        duration: 2000,
                        success: true,
                        resourceUsage: { cpu: 0.5, memory: 0.4, io: 0.3 },
                    },
                    timestamp: Date.now() - 1000,
                    agentName: 'test-intelligent-agent',
                },
            ];

            for (const pattern of patterns) {
                await enhancedContext.intelligence.storeLearningPattern(
                    pattern,
                );
            }

            const insights =
                await enhancedContext.intelligence.getLearningInsights();

            // Should have strategy statistics
            expect(insights.topStrategies.length).toBeGreaterThan(0);

            const parallelStrategy = insights.topStrategies.find(
                (s) => s.strategy === 'parallel',
            );
            if (parallelStrategy) {
                expect(parallelStrategy.successRate).toBeGreaterThan(0);
                expect(parallelStrategy.avgDuration).toBeGreaterThan(0);
            }
        });
    });

    describe('Intelligence Context Lifecycle', () => {
        it('should maintain intelligence context throughout execution', () => {
            const intelligenceContext =
                enhancedContext.intelligence.getIntelligenceContext();

            expect(intelligenceContext).toBeDefined();
            expect(intelligenceContext.patterns).toBeDefined();
            expect(intelligenceContext.learning).toBeDefined();
            expect(intelligenceContext.metrics).toBeDefined();
        });

        it('should update metrics as patterns are learned', async () => {
            // Add a successful pattern
            const successPattern: ExecutionPattern = {
                id: 'metrics-test-pattern',
                context: {
                    tools: ['metric-tool'],
                    inputSize: 50,
                    complexity: 'simple',
                    tenantId: 'test-tenant',
                },
                execution: {
                    strategy: 'sequential',
                    duration: 800,
                    success: true,
                    resourceUsage: { cpu: 0.2, memory: 0.1, io: 0.1 },
                },
                timestamp: Date.now(),
                agentName: 'test-intelligent-agent',
            };

            await enhancedContext.intelligence.storeLearningPattern(
                successPattern,
            );

            const updatedContext =
                enhancedContext.intelligence.getIntelligenceContext();

            // Metrics should reflect the new pattern
            expect(updatedContext.patterns.recent.length).toBeGreaterThan(0);
            expect(updatedContext.patterns.successful.length).toBeGreaterThan(
                0,
            );
        });
    });

    describe('Context Factory Integration', () => {
        it('should create intelligent contexts through factory', () => {
            const context = intelligentFactory.createIntelligentAgentContext({
                agentName: 'factory-test-agent',
                tenantId: 'factory-test-tenant',
            });

            expect(context.intelligence).toBeDefined();
            expect(typeof context.intelligence.getToolExecutionHints).toBe(
                'function',
            );
            expect(typeof context.intelligence.storeLearningPattern).toBe(
                'function',
            );
            expect(typeof context.intelligence.getLearningInsights).toBe(
                'function',
            );
        });

        it('should support both regular and enhanced contexts', () => {
            // Regular context
            const regularContext = intelligentFactory.createAgentContext({
                agentName: 'regular-agent',
                tenantId: 'regular-tenant',
            });

            // Enhanced context
            const enhancedContext =
                intelligentFactory.createIntelligentAgentContext({
                    agentName: 'enhanced-agent',
                    tenantId: 'enhanced-tenant',
                });

            expect('intelligence' in regularContext).toBe(false);
            expect('intelligence' in enhancedContext).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle missing intelligence gracefully', async () => {
            // The enhanced context always has intelligence enabled
            // This test validates that it works even without historical data
            const basicContext = createEnhancedAgentContext({
                agentName: 'basic-agent',
                tenantId: 'basic-tenant',
            });

            // Should provide hints based on heuristics when no patterns exist
            const hints = await basicContext.intelligence.getToolExecutionHints(
                ['tool1'],
            );
            expect(hints.reasoning).toContain('similar executions');
            expect(hints.recommendedStrategy).toMatch(
                /^(parallel|sequential|conditional|adaptive)$/,
            );
            expect(hints.confidence).toBeGreaterThanOrEqual(0);
        });

        it('should validate execution patterns', async () => {
            const invalidPattern = {
                id: '', // Invalid: empty id
                context: {
                    tools: [],
                    inputSize: -1,
                    complexity: 'invalid',
                    tenantId: '',
                },
                execution: {
                    strategy: 'invalid',
                    duration: -1,
                    success: true,
                    resourceUsage: { cpu: 0, memory: 0, io: 0 },
                },
                timestamp: -1,
                agentName: '',
            } as ExecutionPattern;

            // Should handle invalid patterns gracefully
            await expect(
                enhancedContext.intelligence.storeLearningPattern(
                    invalidPattern,
                ),
            ).resolves.not.toThrow();
        });
    });
});
