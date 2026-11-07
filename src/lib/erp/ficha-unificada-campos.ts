/** Contratos puros da edição integrada: os dados financeiros só atravessam com precos.ver. */
import { ehCanalComEmbalagem, type CanalComEmbalagem, type CanalVenda, type EmbalagemDigitada } from './canal-campos';
import type { CortesDoFarol } from './cmv-faixas-campos';
import type { EntradaDaFicha } from './ficha-campos';
import type { Erros } from './insumo-campos';
import { SIGLAS_DIGITAVEIS, type CustoExato, type Unidade } from './unidades';

export interface LinhaMaterialDaFicha {
  canal: CanalComEmbalagem;
  insumoId: string;
  quantidade: string;
  unidade: string;
}

export interface OpcaoMaterialDaFicha {
  id: string;
  nome: string;
  unidade: Unidade;
  ativo: boolean;
  embalagem: boolean;
  custo: CustoExato | null;
}

export interface PrecoDaFichaParaPrevia {
  metaBp: number | null;
  precoCentavos: number | null;
  ofertado: boolean;
  cortesDoFarol: CortesDoFarol | null;
}

export interface ContextoMateriaisDaFicha {
  /** CAS das associações na abertura. Não substituir ao recuperar um rascunho antigo. */
  versao: string;
  linhas: LinhaMaterialDaFicha[];
  opcoes: OpcaoMaterialDaFicha[];
  precos: Record<CanalVenda, PrecoDaFichaParaPrevia>;
}

export interface EntradaMateriaisDaFicha {
  versao: unknown;
  linhas: readonly EmbalagemDigitada[];
}

export type EntradaFichaUnificada = EntradaDaFicha & {
  versao?: unknown;
  chaveEnvio?: unknown;
  /** Ausência preserva materiais; presença com linhas vazias retira explicitamente. */
  materiais?: EntradaMateriaisDaFicha;
};

export type ResultadoFichaUnificada =
  | { ok: true; id: string; nome: string; mudou: string[]; repetido: false; versao: string; versaoMateriais: string }
  | { ok: true; id: string; mudou: []; repetido: true }
  | { ok: false; erros: Erros; conflito?: boolean; indeterminado?: boolean; naoEncontrado?: boolean; desativadoId?: string };

export type EstadoFichaUnificada =
  | null
  | { ok: false; vez: number; erros: Erros; conflito?: boolean; indeterminado?: boolean }
  | ({
      ok: true;
      vez: number;
      id: string;
      mensagem: string;
      /** Rota interna produzida pelo servidor conforme as permissões atuais. */
      destino: string;
    } & ({ repetido: false; versao: string; versaoMateriais: string | null } | { repetido: true }));

export type AcaoFichaUnificada = (anterior: EstadoFichaUnificada, form: FormData) => Promise<EstadoFichaUnificada>;

/** Lista operacional mínima: nenhum custo, preço, configuração ou identificador de catálogo. */
export interface MaterialDaFichaNoPapel {
  canal: CanalComEmbalagem;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
}

export const MARCADOR_MATERIAIS_DA_FICHA = 'materiaisNoFormulario';
export const MENSAGEM_ENVIO_INDETERMINADO = 'Não foi possível confirmar o salvamento. Confira a ficha antes de tentar novamente; seu rascunho foi mantido.';

/** Campos paralelos precisam estar íntegros; omissão não pode parecer retirada. */
export function materiaisDoFormulario(form: FormData): { ok: true; materiais: EntradaMateriaisDaFicha | undefined } | { ok: false; erros: Erros } {
  const marcadores = form.getAll(MARCADOR_MATERIAIS_DA_FICHA);
  if (marcadores.length === 0) return { ok: true, materiais: undefined };
  const recusar = () => ({ ok: false as const, erros: { materiais: 'Confira as embalagens e tente salvar novamente.' } });
  if (marcadores.length !== 1 || marcadores[0] !== 'sim') return recusar();
  const versoes = form.getAll('versaoMateriais');
  if (versoes.length !== 1 || typeof versoes[0] !== 'string') return recusar();
  const nomes = ['emb_canal', 'emb_insumo', 'emb_quantidade', 'emb_unidade'] as const;
  const listas = nomes.map(nome => form.getAll(nome));
  if (listas.some(lista => lista.length !== listas[0].length || lista.some(valor => typeof valor !== 'string'))) return recusar();
  const [canais, insumos, quantidades, unidades] = listas as string[][];
  const recebidas = canais.map((canal, i) => ({ canal, insumoId: insumos[i], quantidade: quantidades[i], unidade: unidades[i] }));
  if (recebidas.some(linha => !ehCanalComEmbalagem(linha.canal))) return recusar();
  const siglas: readonly string[] = Object.values(SIGLAS_DIGITAVEIS).flat();
  if (recebidas.some(linha => !linha.insumoId && !linha.quantidade && linha.unidade !== '' && !siglas.includes(linha.unidade))) return recusar();
  // Só o placeholder exatamente vazio é dispensado. Espaços/IDs/quantidades inválidos seguem para o domínio.
  const linhas = recebidas.filter(linha => linha.insumoId !== '' || linha.quantidade !== '');
  return { ok: true, materiais: { versao: versoes[0], linhas } };
}
