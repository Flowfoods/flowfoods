/**
 * Relatório pesado (L.4): o teto de tempo por consulta e as vagas simultâneas.
 *
 * Um relatório que soma o livro inteiro segura UMA conexão do banco por vários segundos. Sem limite, vinte pedidos juntos esgotam o
 * pool e travam o ERP inteiro (login, requisição, cozinha). Duas travas, as duas por processo e sem dependência nova:
 * - o banco corta a consulta que passa do teto (`statement_timeout`, aplicado pelo portão em `transacao(..., { relatorio })`);
 * - só algumas transações de relatório rodam ao mesmo tempo; as outras esperam um pouco por uma vaga e, se não vier, recebem a
 *   frase "Há outro relatório grande rodando" (a vaga é pedida ANTES de abrir a transação, então quem espera não segura conexão).
 * A contagem é do processo, não do cluster: com vários processos o teto total é a soma das vagas, e o pool precisa comportá-la.
 */

/** O teto de cada consulta de relatório no banco. */
export const TETO_DO_RELATORIO_MS = 20_000;
/** Quantos relatórios pesados rodam juntos por processo (o pool padrão do Prisma tem mais conexões que isso). */
export const RELATORIOS_SIMULTANEOS = 3;
/** Quanto um pedido espera por uma vaga antes de desistir com a frase amigável. */
export const ESPERA_POR_VAGA_MS = 8_000;

/** O relatório não coube agora: grande demais (passou do teto) ou o servidor está ocupado com outros. A frase é para a pessoa. */
export class ErroDeRelatorio extends Error {
  readonly motivo: 'tempo' | 'ocupado';
  readonly titulo: string;
  readonly texto: string;
  constructor(motivo: 'tempo' | 'ocupado') {
    const [titulo, texto] =
      motivo === 'tempo'
        ? ['O relatório ficou grande demais.', 'Diminua o período ou escolha menos lojas.']
        : ['Há outro relatório grande rodando.', 'Tente em instantes.'];
    super(`${titulo} ${texto}`);
    this.name = 'ErroDeRelatorio';
    this.motivo = motivo;
    this.titulo = titulo;
    this.texto = texto;
  }
}

export interface Vagas {
  /** Espera uma vaga; devolve quem a libera. Rejeita com `ErroDeRelatorio('ocupado')` se a espera passar do limite. */
  pegar(): Promise<() => void>;
  /** Quantas estão em uso agora (para teste e diagnóstico). */
  readonly emUso: number;
}

export function criarVagas(vagas: number, esperaMs: number): Vagas {
  let emUso = 0;
  const fila: { acordar: () => void }[] = [];
  const liberar = () => {
    const proximo = fila.shift();
    if (proximo) proximo.acordar();
    else emUso -= 1;
  };
  return {
    get emUso() {
      return emUso;
    },
    pegar() {
      if (emUso < vagas) {
        emUso += 1;
        return Promise.resolve(liberarUmaVez(liberar));
      }
      return new Promise<() => void>((resolve, reject) => {
        const espera = {
          // A vaga passa direto para quem espera (emUso não muda).
          acordar: () => {
            clearTimeout(relogio);
            resolve(liberarUmaVez(liberar));
          },
        };
        const relogio = setTimeout(() => {
          const i = fila.indexOf(espera);
          if (i >= 0) fila.splice(i, 1);
          reject(new ErroDeRelatorio('ocupado'));
        }, esperaMs);
        fila.push(espera);
      });
    },
  };
}

function liberarUmaVez(liberar: () => void) {
  let liberada = false;
  return () => {
    if (liberada) return;
    liberada = true;
    liberar();
  };
}

/** As vagas do processo, usadas pelo portão. */
export const VAGAS_DO_PROCESSO: Vagas = criarVagas(RELATORIOS_SIMULTANEOS, ESPERA_POR_VAGA_MS);
