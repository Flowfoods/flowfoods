/** Projeção pura da distribuição canônica; não calcula preço, frete ou percentual. */
import type { DistribuicaoDoRecorte } from './compras-relatorio';

export interface ComposicaoComprasHome {
  estado: 'ok' | 'sem_dados' | 'erro' | 'indisponivel';
  classificacao: 'categoria_atual_do_insumo';
  fatias: { chave: string; rotulo: string; centavos: number }[];
  outros: { quantos: number; centavos: number } | null;
  totalCentavos: number | null;
  quantos: number | null;
  aviso: string | null;
  detalhe: { href: string; rotulo: string };
}

export type LeituraDaComposicaoCompras =
  | { estado: 'lido'; distribuicao: DistribuicaoDoRecorte }
  | { estado: 'sem_dados' }
  | { estado: 'erro' }
  | { estado: 'limite'; motivo: 'tempo' | 'ocupado' };

const inteiro = (v: unknown): v is number => Number.isSafeInteger(v);
function exigir(condicao: unknown): asserts condicao {
  if (!condicao) throw new Error('Composição de compras incompatível.');
}

/** O chamador já validou autorização/contexto e preserva seu KPI independentemente desta projeção. */
export function projetarCategoriasDasCompras(
  leitura: LeituraDaComposicaoCompras | undefined,
  base: { totalCentavos: number; notas: number },
  detalhe: { href: string; rotulo: string },
): ComposicaoComprasHome {
  const vazio = (estado: ComposicaoComprasHome['estado'], aviso: string | null): ComposicaoComprasHome => ({
    estado, classificacao: 'categoria_atual_do_insumo', fatias: [], outros: null, totalCentavos: null,
    quantos: null, aviso, detalhe: { href: detalhe.href, rotulo: detalhe.rotulo },
  });
  try {
    if (!leitura) return vazio('indisponivel', 'A composição por categoria não está disponível nesta leitura.');
    if (leitura.estado === 'erro') return vazio('erro', 'Não foi possível carregar a composição por categoria. O total de compras foi preservado.');
    if (leitura.estado === 'limite') return vazio('indisponivel', leitura.motivo === 'ocupado'
      ? 'A composição por categoria está ocupada. Atualize o resumo em instantes.'
      : 'A composição por categoria atingiu o limite de tempo. Confira o relatório do mesmo recorte.');
    exigir(inteiro(base.notas) && base.notas >= 0 && inteiro(base.totalCentavos));
    if (base.notas === 0 && leitura.estado === 'sem_dados') return vazio('sem_dados', 'Nenhuma compra lançada neste recorte, pela entrada da nota.');
    exigir(leitura.estado === 'lido' && base.notas > 0);
    const d = leitura.distribuicao;
    exigir(d && typeof d === 'object' && Array.isArray(d.fatias) && d.fatias.length <= 7);
    const totalCentavos = d.totalCentavos, quantos = d.quantos;
    exigir(inteiro(totalCentavos) && totalCentavos === base.totalCentavos && inteiro(quantos) && quantos > 0);
    const chaves = new Set<string>();
    const fatias = d.fatias.map(f => {
      const { chave, rotulo, centavos } = f;
      exigir(typeof chave === 'string' && (chave === '-' || /^[a-z0-9]{1,64}$/i.test(chave))
        && !chaves.has(chave) && typeof rotulo === 'string' && rotulo.length > 0 && inteiro(centavos));
      chaves.add(chave);
      return { chave, rotulo, centavos };
    });
    let outros: ComposicaoComprasHome['outros'] = null;
    const resto = d.outros;
    if (resto !== null) {
      exigir(resto && typeof resto === 'object');
      const n = resto.quantos, centavos = resto.centavos;
      exigir(inteiro(n) && n >= 2 && inteiro(centavos) && fatias.length === 6);
      outros = { quantos: n, centavos };
    }
    exigir(fatias.length > 0 && quantos === fatias.length + (outros?.quantos ?? 0));
    // Conferência de integridade, não reconstrução de total: todos os valores vêm da mesma fonte.
    const soma = fatias.reduce((n, f) => n + BigInt(f.centavos), 0n) + BigInt(outros?.centavos ?? 0);
    exigir(soma === BigInt(totalCentavos));
    return { estado: 'ok', classificacao: 'categoria_atual_do_insumo', fatias, outros, totalCentavos, quantos,
      aviso: 'Categorias atuais dos insumos. Esta composição não é uma fotografia histórica.',
      detalhe: { href: detalhe.href, rotulo: detalhe.rotulo } };
  } catch {
    return vazio('indisponivel', 'A composição por categoria não pôde ser conferida com o total deste recorte.');
  }
}
