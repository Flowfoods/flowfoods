import bruto from './diagnostico.config.json';

/**
 * Acesso ÀS PERGUNTAS para o cliente (navegador).
 *
 * Existe separado de `config.ts` por um motivo de peso: aquele arquivo valida a
 * config inteira com zod no import, e zod iria junto no bundle do navegador sem
 * fazer nada de útil lá — quem valida resposta é o servidor, em `montarRespostas`.
 * Aqui é só leitura do JSON para desenhar a tela.
 */

export interface OpcaoUI {
  valor: string;
  rotulo: string;
}

export interface PerguntaUI {
  id: string;
  tipo: string;
  rotulo: string;
  ajuda?: string;
  obrigatoria: boolean;
  min?: number;
  max?: number;
  opcoes?: OpcaoUI[];
  /** A etapa a que ela pertence — é o que o HUD mostra. */
  etapa: number;
  tituloEtapa: string;
}

const ETAPAS = bruto.etapas;

export const ABERTURA = {
  chamada: ETAPAS.find((e) => e.id === 0)?.chamada ?? '',
  botao: ETAPAS.find((e) => e.id === 0)?.botao ?? 'Começar',
};

export const TOTAL_ETAPAS = ETAPAS.filter((e) => e.id !== 0).length;

/** A etapa 5 só existe para quem vende por app. */
export function etapa5Vale(canais: readonly string[]): boolean {
  const cond = ETAPAS.find((e) => e.id === 5)?.condicional;
  if (!cond) return true;
  return cond.contemAlgum.some((c) => canais.includes(c));
}

/**
 * Todas as perguntas em fila, na ordem, já filtradas pelo que este respondente
 * vai ver. Uma pergunta por tela: é o que faz caber em quatro minutos no
 * celular, e é o que o plano chama de "só toque".
 */
export function filaDePerguntas(canais: readonly string[]): PerguntaUI[] {
  const fila: PerguntaUI[] = [];
  for (const etapa of ETAPAS) {
    if (etapa.id === 0) continue;
    if (etapa.id === 5 && !etapa5Vale(canais)) continue;
    for (const p of etapa.perguntas) {
      fila.push({ ...p, etapa: etapa.id, tituloEtapa: etapa.titulo } as PerguntaUI);
    }
  }
  return fila;
}

/** Rótulo do HUD: `ETAPA 03 / 08`. */
export function rotuloEtapa(etapa: number): string {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `ETAPA ${dd(etapa)} / ${dd(TOTAL_ETAPAS)}`;
}

export const CONSENTIMENTO_TEXTO =
  ETAPAS.find((e) => e.id === 8)?.perguntas.find((p) => p.id === 'consentimento')?.rotulo ?? '';
