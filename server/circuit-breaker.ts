/**
 * PRODUCTION HARDENING: Circuit Breaker Pattern
 * 
 * Prevents cascading failures when external services (M-Pesa, etc.) fail.
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is down, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private nextRetryTime: number = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private stateChangeListeners: Array<(name: string, oldState: CircuitState, newState: CircuitState) => void> = [];
  
  constructor(
    private name: string,
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      resetTimeout: 60000,
    }
  ) {}

  onStateChange(listener: (name: string, oldState: CircuitState, newState: CircuitState) => void): void {
    this.stateChangeListeners.push(listener);
  }

  private notifyStateChange(oldState: CircuitState, newState: CircuitState): void {
    this.stateChangeListeners.forEach(listener => {
      try { listener(this.name, oldState, newState); } catch (e) { console.error(`[CircuitBreaker:${this.name}] State change listener error:`, e); }
    });
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;
    
    if (this.state === "OPEN") {
      if (Date.now() < this.nextRetryTime) {
        throw new CircuitBreakerOpenError(
          `Circuit breaker ${this.name} is OPEN. Retry after ${Math.ceil((this.nextRetryTime - Date.now()) / 1000)}s`
        );
      }
      this.state = "HALF_OPEN";
      console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
    }
    
    try {
      const result = await this.withTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
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

  private onSuccess(): void {
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
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
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

  getStats(): CircuitStats {
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

  reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.successes = 0;
    console.log(`[CircuitBreaker:${this.name}] Manually reset to CLOSED`);
  }

  isOpen(): boolean {
    return this.state === "OPEN" && Date.now() < this.nextRetryTime;
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

export const mpesaCircuitBreaker = new CircuitBreaker("mpesa", {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  resetTimeout: 30000,
});

export const mpesaB2CCircuitBreaker = new CircuitBreaker("mpesa-b2c", {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 45000,
  resetTimeout: 120000,
});

export function getAllCircuitBreakerStats(): Record<string, CircuitStats> {
  return {
    mpesa: mpesaCircuitBreaker.getStats(),
    "mpesa-b2c": mpesaB2CCircuitBreaker.getStats(),
  };
}
