import { ReActStrategy } from './react-strategy.js';
import { ReWooStrategy } from './rewoo-strategy.js';
import type { ExecutionStrategy } from './types.js';
import { createLogger } from '../../observability/index.js';

export class StrategyFactory {
    private static logger = createLogger('strategy-factory');
    private static strategies = new Map<
        string,
        ReActStrategy | ReWooStrategy
    >();

    /**
     * Creates execution strategy (simplificado)
     */
    static create(
        strategyType: ExecutionStrategy,
    ): ReActStrategy | ReWooStrategy {
        // Check if already registered
        if (this.strategies.has(strategyType)) {
            return this.strategies.get(strategyType)!;
        }

        let strategy: ReActStrategy | ReWooStrategy;

        switch (strategyType) {
            case 'react':
                strategy = new ReActStrategy();
                break;
            case 'rewoo':
                strategy = new ReWooStrategy();
                break;
            default:
                throw new Error(`Unknown strategy type: ${strategyType}`);
        }

        // Register for reuse
        this.strategies.set(strategyType, strategy);

        this.logger.info('Strategy created', { strategyType });
        return strategy;
    }

    /**
     * Register custom strategy
     */
    static register(
        name: string,
        strategy: ReActStrategy | ReWooStrategy,
    ): void {
        this.strategies.set(name, strategy);
        this.logger.info('Custom strategy registered', { name });
    }

    /**
     * Get available strategies
     */
    static getAvailableStrategies(): ExecutionStrategy[] {
        return ['react', 'rewoo'];
    }

    /**
     * Check if strategy exists
     */
    static hasStrategy(name: string): boolean {
        return (
            this.strategies.has(name) ||
            this.getAvailableStrategies().includes(name as ExecutionStrategy)
        );
    }

    /**
     * Remove strategy
     */
    static removeStrategy(name: string): boolean {
        const removed = this.strategies.delete(name);
        if (removed) {
            this.logger.info('Strategy removed', { name });
        }
        return removed;
    }
}
