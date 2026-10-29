/**
 * Cliente iFood (INT-1.3, decisões 485 e 487) — limitador por família de rota, no processo (o worker é um processo só; decisão
 * 11). Janela deslizante de 60 s: em QUALQUER intervalo de 60 s passam no máximo 90% do limite oficial da família. (O balde de
 * fichas anterior começava cheio e repunha no mesmo ritmo: depois de um minuto parado, o primeiro minuto deixava passar quase o
 * dobro.) Fila por família: duas chamadas ao mesmo tempo não ocupam a mesma vaga.
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
const JANELA_MS = 60_000;

export class Limitador {
  /** Quando cada vaga da janela foi usada, em ordem. */
  private usos = new Map<Familia, number[]>();
  private filas = new Map<Familia, Promise<void>>();

  constructor(
    private readonly relogio: () => number = Date.now,
    private readonly dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly limites: Record<Familia, number> = LIMITES_POR_MINUTO,
  ) {}

  /** Quantas chamadas cabem em qualquer janela de 60 s. */
  capacidade(f: Familia) {
    return Math.max(1, Math.floor(this.limites[f] * FOLGA));
  }

  /** Espera a vez da família (sem passar do teto em nenhuma janela de 60 s) e ocupa a vaga. */
  esperarVez(f: Familia): Promise<void> {
    const anterior = this.filas.get(f) ?? Promise.resolve();
    const minha = anterior.then(async () => {
      const usos = this.usos.get(f) ?? [];
      this.usos.set(f, usos);
      const cap = this.capacidade(f);
      for (;;) {
        const agora = this.relogio();
        while (usos.length > 0 && usos[0] <= agora - JANELA_MS) usos.shift();
        if (usos.length < cap) {
          usos.push(agora);
          return;
        }
        // A vaga mais antiga sai da janela 60 s depois de usada.
        await this.dormir(Math.max(1, usos[0] + JANELA_MS - agora + 1));
      }
    });
    // A fila segue mesmo se alguém lá atrás falhar.
    this.filas.set(f, minha.catch(() => {}));
    return minha;
  }
}
