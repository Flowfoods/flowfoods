/**
 * Configuração operacional do Barney.
 *
 * Esta é a fronteira onde `/rodolfo/config` encosta nas regras rígidas. Tudo o
 * que entra passa por `apertar()`, que só deixa a configuração ser MAIS
 * restritiva que o padrão. Não existe caminho por onde um valor salvo suba um
 * teto: nem por formulário, nem por API, nem por alguém editando a linha do
 * `Setting` no banco à mão — porque o aperto acontece na LEITURA também.
 */

import { prisma } from '@/lib/db';
import {
  INTERVALO_MIN_S,
  INTERVALO_PADRAO_MAX_S,
  INTERVALO_PADRAO_MIN_S,
  MAX_POR_DIA,
  MAX_POR_HORA,
} from '@/lib/barney/regras';
import { apertarJanela, janelaPadrao, type Janela } from '@/lib/barney/janela';

export interface ConfigBarney {
  /** Chave geral. Nasce false — o portal é mudo até o Rodolfo ligar. */
  disparoAtivo: boolean;
  /** Lote do dia exige aprovação manual. Nasce true. */
  modoAprovacao: boolean;
  janela: Janela;
  intervaloMinS: number;
  intervaloMaxS: number;
  maxPorDia: number;
  maxPorHora: number;
}

export const CONFIG_PADRAO: ConfigBarney = {
  disparoAtivo: false,
  modoAprovacao: true,
  janela: janelaPadrao(),
  intervaloMinS: INTERVALO_PADRAO_MIN_S,
  intervaloMaxS: INTERVALO_PADRAO_MAX_S,
  maxPorDia: MAX_POR_DIA,
  maxPorHora: MAX_POR_HORA,
};

const CHAVE = 'barney.config';

/**
 * Aperta uma configuração contra os tetos rígidos.
 *
 * Aplicado na escrita E na leitura. Aplicar só na escrita deixaria um valor
 * inserido direto no banco passar por cima das regras — e o `Setting` é uma
 * tabela como outra qualquer, alcançável por qualquer um com acesso ao Postgres.
 */
export function apertar(pedida: Partial<ConfigBarney>): ConfigBarney {
  const intervaloMin = Math.max(INTERVALO_MIN_S, pedida.intervaloMinS ?? CONFIG_PADRAO.intervaloMinS);
  const intervaloMax = Math.max(intervaloMin, pedida.intervaloMaxS ?? CONFIG_PADRAO.intervaloMaxS);

  return {
    disparoAtivo: pedida.disparoAtivo === true,
    // Desligar a aprovação manual é possível, mas é opt-in explícito: qualquer
    // valor que não seja `false` cravado mantém a trava ligada.
    modoAprovacao: pedida.modoAprovacao !== false,
    janela: apertarJanela(pedida.janela ?? {}),
    intervaloMinS: intervaloMin,
    intervaloMaxS: intervaloMax,
    // Teto só desce.
    maxPorDia: Math.min(MAX_POR_DIA, pedida.maxPorDia ?? MAX_POR_DIA),
    maxPorHora: Math.min(MAX_POR_HORA, pedida.maxPorHora ?? MAX_POR_HORA),
  };
}

export async function lerConfig(): Promise<ConfigBarney> {
  const linha = await prisma.setting.findUnique({ where: { chave: CHAVE } });
  if (!linha) return { ...CONFIG_PADRAO };
  return apertar((linha.valor ?? {}) as Partial<ConfigBarney>);
}

export async function salvarConfig(pedida: Partial<ConfigBarney>): Promise<ConfigBarney> {
  const atual = await lerConfig();
  const nova = apertar({ ...atual, ...pedida });

  await prisma.setting.upsert({
    where: { chave: CHAVE },
    create: { chave: CHAVE, valor: nova as unknown as object },
    update: { valor: nova as unknown as object },
  });

  return nova;
}
