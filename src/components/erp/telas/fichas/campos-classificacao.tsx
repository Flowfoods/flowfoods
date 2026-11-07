'use client';

import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import type { AcaoBuscarClassificacao, AcaoGerirClassificacao, ClassificacaoDaFicha, ClassificacaoDigitada, EscolhaDeClassificacao, PaginaDeClassificacao, RegistroDeClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { LIMITE_NOME_CLASSIFICACAO } from '@/lib/erp/ficha-secoes-campos';
import { CAMPO, Erro, ROTULO_EM_LINHA } from '../../ui/campos';
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

function CampoDeClassificacao({ nivel, valor, aoMudar, contexto, secaoId, registros, excluidos, erros, desabilitado, podeLimpar, orientacao }: {
  nivel: 'secao' | 'subsecao'; valor: EscolhaDeClassificacao; aoMudar: (v: EscolhaDeClassificacao) => void;
  contexto: ContextoClassificacao; secaoId?: string; registros: RegistroDeClassificacao[];
  erros: Partial<Record<string, string>>; desabilitado: boolean; podeLimpar: boolean; excluidos: string[];
  orientacao?: string;
}) {
  const nome = nivel === 'secao' ? 'Seção' : 'Subseção';
  const id = `ficha-${nivel}`;
  const campoNovo = useRef<HTMLInputElement>(null);
  const focarAoCriar = useRef(false);
  useEffect(() => {
    if (valor.tipo !== 'nova' || !focarAoCriar.current) return;
    campoNovo.current?.focus();
    focarAoCriar.current = false;
  }, [valor.tipo]);
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
  const descritoPor = [orientacao && `${id}-orientacao`, erros[nivel] && `${id}-erro`].filter(Boolean).join(' ') || undefined;
  return <div className="min-w-0 space-y-1.5">
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <label htmlFor={id} className={ROTULO_EM_LINHA}>{nome}</label>
      {valor.tipo !== 'nova' && <button type="button" disabled={desabilitado} aria-controls={id} aria-describedby={orientacao ? `${id}-orientacao` : undefined} className={classeDeBotao('secundario', 'px-3 text-[13px]')} onClick={() => { focarAoCriar.current = true; aoMudar({ tipo: 'nova', nome: '' }); }}><Plus size={15} aria-hidden />{nivel === 'secao' ? 'Nova seção' : 'Nova subseção'}</button>}
    </div>
    <input type="hidden" name={`${nivel}Modo`} value={valor.tipo} />
    {valor.tipo === 'nova' ? <>
      <input ref={campoNovo} id={id} name={`${nivel}Nome`} value={valor.nome} onChange={(e) => aoMudar({ tipo: 'nova', nome: e.target.value })} maxLength={LIMITE_NOME_CLASSIFICACAO} className={CAMPO} autoComplete="off" placeholder={`Nome da nova ${nome.toLowerCase()}`} disabled={desabilitado} aria-invalid={!!erros[nivel]} aria-describedby={`${id}-nova${descritoPor ? ` ${descritoPor}` : ''}`} />
      <p id={`${id}-nova`} className="text-[12px] text-suave">A nova {nome.toLowerCase()} será criada junto com a ficha ao salvar.</p>
    </> : <SeletorDeItem id={id} name={`${nivel}Id`} valor={valor.tipo === 'existente' ? valor.id : ''} opcoes={opcoes} selecionada={atual ? opcaoDaClassificacao(atual) : valor.tipo === 'existente' ? { valor: valor.id, nome: 'Seleção indisponível', grupo: nome, ordemDoGrupo: 0 } : null} aoEscolher={(id) => aoMudar({ tipo: 'existente', id })} rotulo={nome} placeholder={`Escolha uma ${nome.toLowerCase()}`} vazio={`Nenhuma ${nome.toLowerCase()} encontrada. Use + Nova ${nome.toLowerCase()} para criar.`} desabilitado={desabilitado || (nivel === 'subsecao' && !secaoId)} invalido={!!erros[nivel]} descritoPor={descritoPor} buscaExterna={dados.buscaExterna} />}
    {orientacao && <p id={`${id}-orientacao`} className="text-[12px] text-suave">{orientacao}</p>}
    {valor.tipo !== 'nenhuma' && <button type="button" disabled={!podeLimpar} className={classeDeBotao('fantasma', 'px-0 text-[13px]')} onClick={() => aoMudar({ tipo: 'nenhuma' })}>Sem {nome.toLowerCase()}</button>}
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
  const orientacaoDaSubsecao = valor.secao.tipo === 'nenhuma' ? 'Escolha ou crie uma seção para adicionar uma subseção.'
    : paiIndisponivel ? 'Escolha uma seção ativa para criar uma subseção.'
    : valor.secao.tipo === 'nova' && valor.subsecao.tipo !== 'nova' ? 'Use + Nova subseção para criá-la junto com a nova seção ao salvar a ficha.' : undefined;
  return <div className="space-y-3 lg:col-span-2">
    <input type="hidden" name="classificacaoNoFormulario" value="sim" />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1"><p className="text-sm font-semibold">Seção e subseção</p><PontoDeAjuda ponto="classificacao" /></div>
      <button type="button" disabled={bloqueio} className={classeDeBotao('secundario')} aria-haspopup="dialog" onClick={aoGerenciar}>Gerenciar seções</button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <CampoDeClassificacao nivel="secao" valor={valor.secao} aoMudar={(secao) => aoMudar({ secao, subsecao: (secao.tipo === 'existente' && valor.secao.tipo === 'existente' && secao.id === valor.secao.id) || (secao.tipo === 'nova' && valor.secao.tipo === 'nova') ? valor.subsecao : { tipo: 'nenhuma' } })} contexto={contexto} registros={registros} excluidos={excluidos} erros={erros} desabilitado={bloqueio} podeLimpar={!bloqueio} />
      <CampoDeClassificacao nivel="subsecao" valor={valor.subsecao} aoMudar={(subsecao) => aoMudar({ ...valor, subsecao })} contexto={contexto} secaoId={secaoAtualId} registros={registros} excluidos={excluidos} erros={erros} desabilitado={bloqueio || valor.secao.tipo === 'nenhuma' || paiIndisponivel} podeLimpar={!bloqueio} orientacao={orientacaoDaSubsecao} />
    </div>
  </div>;
}
