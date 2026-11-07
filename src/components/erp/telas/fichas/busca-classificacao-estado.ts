import type { AcaoBuscarClassificacao, PaginaDeClassificacao, PedidoBuscaClassificacao } from '@/lib/erp/ficha-secoes-campos';

export const PAGINA_VAZIA: PaginaDeClassificacao = { itens: [], selecionados: [], proximoCursor: null };
export type EstadoDaBuscaClassificacao = { pagina: PaginaDeClassificacao; carregando: boolean; erro: string };

/** Coordena pedidos assíncronos; não conhece React, navegação ou o formulário da receita. */
export function criarBuscaClassificacao(buscar: AcaoBuscarClassificacao, pedido: Omit<PedidoBuscaClassificacao, 'q' | 'cursor'>, inicial = PAGINA_VAZIA) {
  let estado: EstadoDaBuscaClassificacao = { pagina: inicial, carregando: false, erro: '' };
  let numero = 0;
  let texto = '';
  const ouvintes = new Set<(estado: EstadoDaBuscaClassificacao) => void>();
  function publicar(mudanca: Partial<EstadoDaBuscaClassificacao>) {
    estado = { ...estado, ...mudanca };
    for (const ouvir of ouvintes) ouvir(estado);
  }
  async function executar(q: string, cursor?: string) {
    const vez = ++numero;
    texto = q;
    if (pedido.nivel === 'subsecao' && !pedido.secaoId) {
      publicar({ pagina: PAGINA_VAZIA, carregando: false, erro: '' });
      return;
    }
    const anterior = estado.pagina;
    const selecionados = new Map([...anterior.selecionados, ...anterior.itens]
      .filter((r) => pedido.selecionados?.includes(r.registro.id)).map((r) => [r.registro.id, r]));
    publicar({ carregando: true, erro: '', ...(!cursor ? { pagina: { ...anterior, itens: [], proximoCursor: null, selecionados: [...selecionados.values()] } } : {}) });
    try {
      const resposta = await buscar({ ...pedido, q, cursor });
      if (vez !== numero) return;
      if (!resposta.ok) { publicar({ erro: resposta.erro }); return; }
      publicar({ pagina: {
        ...resposta.pagina,
        itens: cursor ? [...new Map([...estado.pagina.itens, ...resposta.pagina.itens].map((r) => [r.registro.id, r])).values()] : resposta.pagina.itens,
        impacto: cursor ? { ...estado.pagina.impacto, ...resposta.pagina.impacto } : resposta.pagina.impacto,
      } });
    } catch {
      if (vez === numero) publicar({ erro: 'Não foi possível buscar agora. Tente novamente.' });
    } finally {
      if (vez === numero) publicar({ carregando: false });
    }
  }
  return {
    estado: () => estado,
    observar(ouvir: (estado: EstadoDaBuscaClassificacao) => void) { ouvintes.add(ouvir); ouvir(estado); return () => { ouvintes.delete(ouvir); }; },
    buscar: (q: string) => executar(q),
    recarregar: () => executar(texto),
    carregarMais: () => estado.pagina.proximoCursor && !estado.carregando ? executar(texto, estado.pagina.proximoCursor) : Promise.resolve(),
    invalidar: () => { ++numero; },
  };
}
