/**
 * Cliente iFood (INT-1.3) — limitador por família de rota, no processo (o worker é um processo só; decisão 11). Balde de fichas
 * que se repõe continuamente, com folga de 10% abaixo do limite oficial, e fila por família: duas chamadas ao mesmo tempo não
 * gastam a mesma ficha.
 *
 * Limites oficiais (por minuto): autenticação 100, Analytics 500, Merchant 100 (GET /merchants), Review 2.000, Financial
 * 1.000 (plano de execução, seções 1 e 13). Seguimos o menor número quando a documentação diverge.
 */

export type Familia = 'autenticacao' | 'analytics' | 'merchant' | 'review' | 'financial';

export const LIMITES_POR_MINUTO: Record<Familia, number> = {
  autenticacao: 100,
  analytics: 500,
  merchant: 100,
  review: 2000,
  financial: 1000,
};

const FOLGA = 0.9;

export class Limitador {
  private fichas = new Map<Familia, number>();
  private ultimo = new Map<Familia, number>();
  private filas = new Map<Familia, Promise<void>>();

  constructor(
    private readonly relogio: () => number = Date.now,
    private readonly dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly limites: Record<Familia, number> = LIMITES_POR_MINUTO,
  ) {}

  private capacidade(f: Familia) {
    return Math.max(1, Math.floor(this.limites[f] * FOLGA));
  }

  private repor(f: Familia) {
    const agora = this.relogio();
    const cap = this.capacidade(f);
    const antes = this.ultimo.get(f);
    const atual = this.fichas.get(f) ?? cap;
    const ganho = antes === undefined ? 0 : ((agora - antes) * cap) / 60_000;
    this.fichas.set(f, Math.min(cap, atual + ganho));
    this.ultimo.set(f, agora);
  }

  /** Espera a vez da família (sem estourar o limite) e gasta uma ficha. */
  esperarVez(f: Familia): Promise<void> {
    const anterior = this.filas.get(f) ?? Promise.resolve();
    const minha = anterior.then(async () => {
      this.repor(f);
      let fichas = this.fichas.get(f)!;
      if (fichas < 1) {
        const ms = Math.ceil(((1 - fichas) * 60_000) / this.capacidade(f));
        await this.dormir(ms);
        this.repor(f);
        fichas = this.fichas.get(f)!;
      }
      this.fichas.set(f, Math.max(0, fichas - 1));
    });
    // A fila segue mesmo se alguém lá atrás falhar.
    this.filas.set(f, minha.catch(() => {}));
    return minha;
  }
}
