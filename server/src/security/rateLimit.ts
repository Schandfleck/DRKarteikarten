/**
 * Einfache Bremse gegen massenhaftes Ausprobieren von Passwörtern pro IP-Adresse.
 * Zusätzlich wird jedes einzelne Konto nach mehreren Fehlversuchen kurz gesperrt (siehe routes/auth.ts).
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
    setInterval(() => this.cleanup(), windowMs).unref();
  }

  /** Zählt einen Versuch. Gibt false zurück, wenn das Limit überschritten ist. */
  hit(key: string): boolean {
    const nowMs = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt < nowMs) {
      this.hits.set(key, { count: 1, resetAt: nowMs + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }

  reset(): void {
    this.hits.clear();
  }

  private cleanup(): void {
    const nowMs = Date.now();
    for (const [key, entry] of this.hits) if (entry.resetAt < nowMs) this.hits.delete(key);
  }
}
