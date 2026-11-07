'use client';

import type { AcaoBuscarClassificacao, AcaoGerirClassificacao, ClassificacaoDaFicha, ClassificacaoDigitada, EscolhaDeClassificacao, PaginaDeClassificacao, RegistroDeClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { LIMITE_NOME_CLASSIFICACAO } from '@/lib/erp/ficha-secoes-campos';
import { CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { PontoDeAjuda } from '../../ui/ponto-de-ajuda';
import { SeletorDeItem } from './seletor-de-item';
import { opcaoDaClassificacao, PAGINA_VAZIA, useBuscaClassificacao } from './busca-classificacao';

export type ContextoClassificacao = {
  atual: ClassificacaoDaFicha;
  secoesIniciais: PaginaDeClassificacao;
  subsecoesIniciais: PaginaDeClassificacao | null;
  buscar: AcaoBuscarClassificacao;
  gerir: AcaoGerirClassificacao;
};

function CampoDeClassificacao({ nivel, valor, aoMudar, contexto, secaoId, registros, excluidos, erros, desabilitado, podeLimpar }: {
  nivel: 'secao' | 'subsecao'; valor: EscolhaDeClassificacao; aoMudar: (v: EscolhaDeClassificacao) => void;
  contexto: ContextoClassificacao; secaoId?: string; registros: RegistroDeClassificacao[];
  erros: Partial<Record<string, string>>; desabilitado: boolean; podeLimpar: boolean; excluidos: string[];
}) {
  const nome = nivel === 'secao' ? 'Seção' : 'Subseção';
  const id = `ficha-${nivel}`;
  const dados = useBuscaClassificacao(contexto.buscar, { contexto: 'formulario', nivel, secaoId, selecionados: valor.tipo === 'existente' ? [valor.id] : [] }, nivel === 'secao' ? contexto.secoesIniciais : contexto.subsecoesIniciais ?? PAGINA_VAZIA);
  const todos = [...dados.pagina.itens, ...dados.pagina.selecionados, ...registros];
  const porId = new Map<string, RegistroDeClassificacao>();
  for (const r of todos.filter((r) => r.nivel === nivel)) {
    const anterior = porId.get(r.registro.id);
    if (!anterior || r.registro.versao >= anterior.registro.versao) porId.set(r.registro.id, r);
  }
  if (nivel === 'subsecao') for (const [id, r] of porId) {
    if (r.nivel !== 'subsecao') continue;
    const pai = registros.find((p) => p.nivel === 'secao' && p.registro.id === r.registro.secaoId);
    if (pai) porId.set(id, { ...r, registro: { ...r.registro, secaoAtiva: pai.registro.ativa } });
  }
  const atual = valor.tipo === 'existente' && !excluidos.includes(valor.id) ? porId.get(valor.id) : undefined;
  const opcoes = dados.pagina.itens.map((r) => porId.get(r.registro.id) ?? r).filter((r) => !excluidos.includes(r.registro.id) && r.registro.ativa && (r.nivel !== 'subsecao' || r.registro.secaoAtiva)).map(opcaoDaClassificacao);
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className={ROTULO}>{nome}</label>
    <input type="hidden" name={`${nivel}Modo`} value={valor.tipo} />
    {valor.tipo === 'nova' ? <>
      <input id={id} name={`${nivel}Nome`} value={valor.nome} onChange={(e) => aoMudar({ tipo: 'nova', nome: e.target.value })} maxLength={LIMITE_NOME_CLASSIFICACAO} className={CAMPO} autoComplete="off" disabled={desabilitado} aria-invalid={!!erros[nivel]} aria-describedby={`${id}-nova${erros[nivel] ? ` ${id}-erro` : ''}`} />
      <p id={`${id}-nova`} className="text-[12px] text-suave">A nova {nome.toLowerCase()} será criada junto com a ficha ao salvar.</p>
    </> : <SeletorDeItem id={id} name={`${nivel}Id`} valor={valor.tipo === 'existente' ? valor.id : ''} opcoes={opcoes} selecionada={atual ? opcaoDaClassificacao(atual) : valor.tipo === 'existente' ? { valor: valor.id, nome: 'Seleção indisponível', grupo: nome, ordemDoGrupo: 0 } : null} aoEscolher={(id) => aoMudar({ tipo: 'existente', id })} rotulo={nome} placeholder={`Sem ${nome.toLowerCase()}`} vazio={`Nenhuma ${nome.toLowerCase()} encontrada.`} desabilitado={desabilitado || (nivel === 'subsecao' && !secaoId)} invalido={!!erros[nivel]} descritoPor={erros[nivel] ? `${id}-erro` : undefined} buscaExterna={dados.buscaExterna} />}
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {valor.tipo !== 'nova' && <button type="button" disabled={desabilitado} className={classeDeBotao('secundario', 'text-[13px]')} onClick={() => aoMudar({ tipo: 'nova', nome: '' })}>{nivel === 'secao' ? 'Nova seção' : 'Nova subseção'}</button>}
      {valor.tipo !== 'nenhuma' && <button type="button" disabled={!podeLimpar} className={classeDeBotao('fantasma', 'px-0 text-[13px]')} onClick={() => aoMudar({ tipo: 'nenhuma' })}>Sem {nome.toLowerCase()}</button>}
    </div>
    <Erro id={`${id}-erro`} texto={erros[nivel]} />
    {dados.erro && <p role="status" className="text-[12px] text-erro">{dados.erro}</p>}
    {atual && (!atual.registro.ativa || (atual.nivel === 'subsecao' && !atual.registro.secaoAtiva)) && <p className="text-[12px] text-suave">{contexto.atual[nivel]?.id === atual.registro.id ? 'Vínculo arquivado. Pode ser mantido nesta ficha.' : 'Esta escolha foi arquivada. Escolha outro registro ou deixe sem vínculo.'}</p>}
  </div>;
}

export function CamposDeClassificacao({ valor, aoMudar, contexto, registros, excluidos, erros, bloqueio, aoGerenciar }: {
  valor: ClassificacaoDigitada; aoMudar: (v: ClassificacaoDigitada) => void; contexto: ContextoClassificacao;
  registros: RegistroDeClassificacao[]; excluidos: string[]; erros: Partial<Record<string, string>>; bloqueio: boolean; aoGerenciar: () => void;
}) {
  const secaoAtualId = valor.secao.tipo === 'existente' ? valor.secao.id : undefined;
  const pai = secaoAtualId ? registros.find((r) => r.nivel === 'secao' && r.registro.id === secaoAtualId) : undefined;
  const paiIndisponivel = !!secaoAtualId && (excluidos.includes(secaoAtualId) || pai?.registro.ativa === false);
  return <div className="space-y-3 lg:col-span-2">
    <input type="hidden" name="classificacaoNoFormulario" value="sim" />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1"><p className="text-sm font-semibold">Seção e subseção</p><PontoDeAjuda ponto="classificacao" /></div>
      <button type="button" disabled={bloqueio} className={classeDeBotao('secundario')} aria-haspopup="dialog" onClick={aoGerenciar}>Gerenciar seções</button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <CampoDeClassificacao nivel="secao" valor={valor.secao} aoMudar={(secao) => aoMudar({ secao, subsecao: (secao.tipo === 'existente' && valor.secao.tipo === 'existente' && secao.id === valor.secao.id) || (secao.tipo === 'nova' && valor.secao.tipo === 'nova') ? valor.subsecao : { tipo: 'nenhuma' } })} contexto={contexto} registros={registros} excluidos={excluidos} erros={erros} desabilitado={bloqueio} podeLimpar={!bloqueio} />
      <CampoDeClassificacao nivel="subsecao" valor={valor.subsecao} aoMudar={(subsecao) => aoMudar({ ...valor, subsecao })} contexto={contexto} secaoId={secaoAtualId} registros={registros} excluidos={excluidos} erros={erros} desabilitado={bloqueio || valor.secao.tipo === 'nenhuma' || paiIndisponivel} podeLimpar={!bloqueio} />
    </div>
    {valor.secao.tipo === 'nenhuma' && <p className="text-[12px] text-suave">Escolha ou crie uma seção para habilitar Nova subseção.</p>}
  </div>;
}
