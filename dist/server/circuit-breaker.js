"use strict";
/**
 * PRODUCTION HARDENING: Circuit Breaker Pattern
 *
 * Prevents cascading failures when external services (M-Pesa, etc.) fail.
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is down, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mpesaB2CCircuitBreaker = exports.mpesaCircuitBreaker = exports.CircuitBreakerOpenError = exports.CircuitBreaker = void 0;
exports.getAllCircuitBreakerStats = getAllCircuitBreakerStats;
class CircuitBreaker {
    constructor(name, config = {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
    }) {
        this.name = name;
        this.config = config;
        this.state = "CLOSED";
        this.failures = 0;
        this.successes = 0;
        this.lastFailure = null;
        this.lastSuccess = null;
        this.nextRetryTime = 0;
        this.totalCalls = 0;
        this.totalFailures = 0;
        this.totalSuccesses = 0;
        this.stateChangeListeners = [];
    }
    onStateChange(listener) {
        this.stateChangeListeners.push(listener);
    }
    notifyStateChange(oldState, newState) {
        this.stateChangeListeners.forEach(listener => {
            try {
                listener(this.name, oldState, newState);
            }
            catch (e) {
                console.error(`[CircuitBreaker:${this.name}] State change listener error:`, e);
            }
        });
    }
    async execute(fn) {
        this.totalCalls++;
        if (this.state === "OPEN") {
            if (Date.now() < this.nextRetryTime) {
                throw new CircuitBreakerOpenError(`Circuit breaker ${this.name} is OPEN. Retry after ${Math.ceil((this.nextRetryTime - Date.now()) / 1000)}s`);
            }
            this.state = "HALF_OPEN";
            console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
        }
        try {
            const result = await this.withTimeout(fn);
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    async withTimeout(fn) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Circuit breaker ${this.name} timeout after ${this.config.timeout}ms`));
            }, this.config.timeout);
            fn()
                .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    onSuccess() {
        this.lastSuccess = new Date();
        this.totalSuccesses++;
        if (this.state === "HALF_OPEN") {
            this.successes++;
            if (this.successes >= this.config.successThreshold) {
                const oldState = this.state;
                this.state = "CLOSED";
                this.failures = 0;
                this.successes = 0;
                console.log(`[CircuitBreaker:${this.name}] Recovered, transitioning to CLOSED`);
                this.notifyStateChange(oldState, "CLOSED");
            }
        }
        else {
            this.failures = 0;
        }
    }
    onFailure() {
        this.lastFailure = new Date();
        this.totalFailures++;
        this.failures++;
        if (this.state === "HALF_OPEN" || this.failures >= this.config.failureThreshold) {
            const oldState = this.state;
            this.state = "OPEN";
            this.nextRetryTime = Date.now() + this.config.resetTimeout;
            this.successes = 0;
            console.log(`[CircuitBreaker:${this.name}] Too many failures, transitioning to OPEN`);
            this.notifyStateChange(oldState, "OPEN");
        }
    }
    getStats() {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailure: this.lastFailure,
            lastSuccess: this.lastSuccess,
            totalCalls: this.totalCalls,
            totalFailures: this.totalFailures,
            totalSuccesses: this.totalSuccesses,
        };
    }
    reset() {
        this.state = "CLOSED";
        this.failures = 0;
        this.successes = 0;
        console.log(`[CircuitBreaker:${this.name}] Manually reset to CLOSED`);
    }
    isOpen() {
        return this.state === "OPEN" && Date.now() < this.nextRetryTime;
    }
}
exports.CircuitBreaker = CircuitBreaker;
class CircuitBreakerOpenError extends Error {
    constructor(message) {
        super(message);
        this.name = "CircuitBreakerOpenError";
    }
}
exports.CircuitBreakerOpenError = CircuitBreakerOpenError;
exports.mpesaCircuitBreaker = new CircuitBreaker("mpesa", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 30000,
});
exports.mpesaB2CCircuitBreaker = new CircuitBreaker("mpesa-b2c", {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 45000,
    resetTimeout: 120000,
});
function getAllCircuitBreakerStats() {
    return {
        mpesa: exports.mpesaCircuitBreaker.getStats(),
        "mpesa-b2c": exports.mpesaB2CCircuitBreaker.getStats(),
    };
}
