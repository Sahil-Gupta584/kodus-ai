import { Observable, defer, throwError, Observer, timer } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

/**
 * Custom error type to signify that the circuit breaker is open.
 * This allows consumers to differentiate between a failure from the underlying
 * operation and a deliberate rejection by the circuit breaker.
 */
export class CircuitBreakerOpenError extends Error {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Defines the possible states of the circuit breaker.
 */
export enum CircuitBreakerState {
    CLOSED, // Allows operations and counts failures.
    OPEN, // Rejects operations immediately.
    HALF_OPEN, // Allows a single "trial" operation.
}

/**
 * Configuration options for the circuit breaker operator.
 */
export interface CircuitBreakerOptions {
    /**
     * The number of failures required to open the circuit.
     * @default 5
     */
    maxFailures?: number;
    /**
     * The time in milliseconds to wait in the OPEN state
     * before transitioning to HALF_OPEN.
     * @default 30000 (30 seconds)
     */
    resetTimeout?: number;
    /**
     * An optional observer that gets notified when the circuit opens.
     */
    openObserver?: Partial<Observer<void>>;
    /**
     * An optional observer that gets notified when the circuit closes.
     */
    closeObserver?: Partial<Observer<void>>;
    /**
     * An optional observer that gets notified when the circuit becomes half-open.
     */
    halfOpenObserver?: Partial<Observer<void>>;
}

/**
 * Creates a new RxJS pipeable operator that acts as a circuit breaker.
 *
 * @param config Configuration options for the circuit breaker.
 * @returns An RxJS operator function.
 */
export function circuitBreaker<T>(config?: CircuitBreakerOptions) {
    // --- Default Configuration ---
    const {
        maxFailures = 5,
        resetTimeout = 30000,
        openObserver,
        closeObserver,
        halfOpenObserver,
    } = config || {};

    // --- State Management per Circuit ---
    let state = CircuitBreakerState.CLOSED;
    let failures = 0;
    let resetTimer: Observable<number> | null = null;

    /**
     * Moves the circuit to the OPEN state and starts the reset timer.
     */
    const trip = () => {
        failures++;
        if (failures < maxFailures) {
            return;
        }

        state = CircuitBreakerState.OPEN;
        openObserver?.next(); // Notify observers

        // After the reset timeout, move to HALF_OPEN
        resetTimer = timer(resetTimeout);
        resetTimer.subscribe(() => {
            state = CircuitBreakerState.HALF_OPEN;
            halfOpenObserver?.next();
        });
    };

    /**
     * Resets the circuit to the CLOSED state.
     */
    const reset = () => {
        failures = 0;
        state = CircuitBreakerState.CLOSED;
        closeObserver?.next(); // Notify observers
    };

    // --- The Operator Function ---
    return (source: Observable<T>): Observable<T> => {
        // defer() ensures this logic runs for each new subscription.
        return defer(() => {
            // 1. Check the state on each subscription.
            if (state === CircuitBreakerState.OPEN) {
                return throwError(
                    () => new CircuitBreakerOpenError('Circuit is open'),
                );
            }

            // 2. If CLOSED or HALF_OPEN, allow the operation to proceed.
            return source.pipe(
                tap({
                    // A successful emission or completion resets the circuit if it was HALF_OPEN.
                    next: () => {
                        if (state === CircuitBreakerState.HALF_OPEN) {
                            reset();
                        }
                    },
                    complete: () => {
                        if (state === CircuitBreakerState.HALF_OPEN) {
                            reset();
                        }
                    },
                }),
                catchError((err) => {
                    // On any error, trip the circuit.
                    trip();
                    // Re-throw the original error to the consumer.
                    return throwError(() => err);
                }),
            );
        });
    };
}
