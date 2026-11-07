'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AcaoBuscarClassificacao, PaginaDeClassificacao, PedidoBuscaClassificacao, RegistroDeClassificacao } from '@/lib/erp/ficha-secoes-campos';
import type { OpcaoDoSeletor } from '@/lib/erp/seletor-campos';

import { criarBuscaClassificacao, PAGINA_VAZIA } from './busca-classificacao-estado';
export { PAGINA_VAZIA } from './busca-classificacao-estado';

export function opcaoDaClassificacao({ nivel, registro }: RegistroDeClassificacao): OpcaoDoSeletor {
  const arquivada = !registro.ativa || (nivel === 'subsecao' && !registro.secaoAtiva);
  return { valor: registro.id, nome: registro.nome, grupo: nivel === 'secao' ? 'Seções' : 'Subseções', ordemDoGrupo: 1, detalhe: arquivada ? 'arquivada' : null };
}

/** Cada busca invalida a anterior: uma resposta de outro pai/texto nunca troca a página atual. */
export function useBuscaClassificacao(buscar: AcaoBuscarClassificacao, pedido: Omit<PedidoBuscaClassificacao, 'q' | 'cursor'>, inicial = PAGINA_VAZIA) {
  const selecionados = (pedido.selecionados ?? []).join(',');
  const { contexto, nivel, secaoId } = pedido;
  const identidade = JSON.stringify([contexto, nivel, secaoId ?? null]);
  // Revalidar a página pode trocar a referência da action e das opções iniciais.
  // Isso renova os dados, mas só trocar de contexto/pai deve limpar o texto.
  const consulta = useRef({ identidade, texto: '' });
  const ultimaPagina = useRef(inicial);
  const controle = useMemo(() => {
    const ids = selecionados ? selecionados.split(',') : [];
    const fixados = [...inicial.selecionados, ...ultimaPagina.current.selecionados, ...ultimaPagina.current.itens]
      .filter((r) => ids.includes(r.registro.id) && r.nivel === nivel && (r.nivel !== 'subsecao' || r.registro.secaoId === secaoId));
    return criarBuscaClassificacao(buscar, { contexto, nivel, secaoId, selecionados: ids }, { ...inicial, selecionados: fixados });
  }, [buscar, contexto, nivel, secaoId, selecionados, inicial]);
  const [estado, setEstado] = useState(controle.estado);
  useEffect(() => {
    const parar = controle.observar((novo) => { ultimaPagina.current = novo.pagina; setEstado(novo); });
    const texto = consulta.current.identidade === identidade ? consulta.current.texto : '';
    consulta.current = { identidade, texto };
    void controle.buscar(texto);
    return () => { controle.invalidar(); parar(); };
  }, [controle, identidade]);
  return { ...estado, recarregar: controle.recarregar, buscaExterna: {
    aoBuscar: (q: string) => { consulta.current = { identidade, texto: q }; void controle.buscar(q); }, carregando: estado.carregando, temMais: !!estado.pagina.proximoCursor,
    aoCarregarMais: () => { void controle.carregarMais(); },
  } };
}
