// 1€ filter (Casiez et al.) — own pure-TS implementation (tech-stack §1, no dep).
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(o: { minCutoff: number; beta: number; dCutoff: number }) {
    this.minCutoff = o.minCutoff;
    this.beta = o.beta;
    this.dCutoff = o.dCutoff;
  }

  private alpha(cutoff: number, dtMs: number): number {
    const te = dtMs / 1000;
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / te);
  }

  filter(x: number, tsMs: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = tsMs;
      return x;
    }
    const dt = Math.max(tsMs - this.tPrev, 1);
    this.tPrev = tsMs;
    const dx = (x - this.xPrev) / (dt / 1000);
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    this.dxPrev = dxHat;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    return xHat;
  }
}
