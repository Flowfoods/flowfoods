'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { FormularioComAcao } from '@/components/erp/ui/formulario-com-acao';
import { CANAIS, ORDEM_DOS_CANAIS } from '@/lib/erp/canal-campos';
import { STATUS_DO_CMV } from '@/lib/erp/cmv-produto-campos';
import { ESTADOS_DAS_FAIXAS_DO_CMV, FAIXAS_DO_CMV, valorDoFiltroDaFaixaDoCmv } from '@/lib/erp/cmv-faixas-campos';
import { FILTROS_DE_FICHA_PADRAO, filtrosDaFichaPermitidos, STATUS_DO_FILTRO_DE_CMV, TIPOS_DE_FICHA, valorDoFiltroDoCmv, type FiltrosDeFicha } from '@/lib/erp/ficha-campos';
import type { AcaoBuscarClassificacao, AcaoGerirClassificacao, PaginaDeClassificacao, RegistroDeClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { CAMPO, MARCAR, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { APRESENTACAO_DA_FAIXA } from './farol';
import { SeletorDeItem } from './seletor-de-item';
import { CriarClassificacao } from './criar-classificacao';
import { opcaoDaClassificacao, PAGINA_VAZIA, useBuscaClassificacao } from './busca-classificacao';
import { assinaturaDaSelecao, resumirFiltrosAplicados, SITUACOES_DAS_FICHAS } from './filtros-resumo';

export type ClassificacaoDosFiltros = { secoesIniciais: PaginaDeClassificacao; subsecoesIniciais: PaginaDeClassificacao | null; buscar: AcaoBuscarClassificacao; gerir?: AcaoGerirClassificacao };
const CAMPO_DO_FILTRO = `${CAMPO} sm:!min-h-11`;
const BOTAO_DO_FILTRO = 'min-h-11 !whitespace-normal sm:!min-h-11';

function FiltroClassificacao({ nivel, valor, secaoId, aoEscolher, classificacao, registros, aoCriar, criacaoIndisponivel }: { nivel: 'secao' | 'subsecao'; valor: string | null; secaoId?: string; aoEscolher: (id: string, registro?: RegistroDeClassificacao) => void; classificacao: ClassificacaoDosFiltros; registros: RegistroDeClassificacao[]; aoCriar: () => void; criacaoIndisponivel?: string }) {
  const dados = useBuscaClassificacao(classificacao.buscar, { contexto: 'filtro', nivel, secaoId, selecionados: valor && valor !== 'sem' ? [valor] : [] }, nivel === 'secao' ? classificacao.secoesIniciais : classificacao.subsecoesIniciais ?? PAGINA_VAZIA);
  const rotulo = nivel === 'secao' ? 'Seção' : 'Subseção';
  const fixas = [{ valor: '', nome: `Todas as ${nivel === 'secao' ? 'seções' : 'subseções'}`, grupo: 'Filtro', ordemDoGrupo: -1 }, { valor: 'sem', nome: `Sem ${rotulo.toLowerCase()}`, grupo: 'Filtro', ordemDoGrupo: 0 }];
  const locais = registros.filter(r => r.nivel === nivel && (r.nivel !== 'subsecao' || r.registro.secaoId === secaoId));
  const itens = [...locais, ...dados.pagina.itens.filter(r => !locais.some(l => l.registro.id === r.registro.id))];
  const selecionada = [...locais, ...dados.pagina.selecionados, ...dados.pagina.itens].find(r => r.registro.id === valor);
  const id = `filtros-${nivel}`;
  const orientacao = nivel === 'subsecao' && !secaoId ? classificacao.gerir ? 'Escolha uma seção para filtrar ou criar uma subseção.' : 'Escolha uma seção para filtrar por subseção.' : classificacao.gerir ? criacaoIndisponivel : undefined;
  return <div className="min-w-0 [&_[role=combobox]]:min-h-11 [&_[role=option]]:min-h-11 [&_[role=option]>span]:whitespace-normal [&_[role=option]>span]:overflow-visible [&_[role=option]>span]:break-words">
    <label htmlFor={id} className={ROTULO}>{rotulo}</label>
    <SeletorDeItem id={id} name={nivel} valor={valor ?? ''} aoEscolher={id => aoEscolher(id, [...itens, ...dados.pagina.selecionados].find(r => r.registro.id === id))} opcoes={[...fixas, ...itens.map(opcaoDaClassificacao)]} selecionada={selecionada ? opcaoDaClassificacao(selecionada) : valor && valor !== 'sem' ? { valor, nome: `${rotulo} indisponível`, grupo: 'Filtro', ordemDoGrupo: 0 } : null} rotulo={rotulo} placeholder={`Todas as ${nivel === 'secao' ? 'seções' : 'subseções'}`} vazio="Nenhum registro encontrado." desabilitado={nivel === 'subsecao' && !secaoId} descritoPor={orientacao ? `${id}-orientacao` : undefined} buscaExterna={dados.buscaExterna} />
    {classificacao.gerir && <button type="button" disabled={!!criacaoIndisponivel || (nivel === 'subsecao' && !secaoId)} onClick={aoCriar} aria-haspopup="dialog" aria-describedby={orientacao ? `${id}-orientacao` : undefined} className={classeDeBotao('fantasma', `${BOTAO_DO_FILTRO} mt-1 justify-start px-0 text-[13px]`)}><Plus size={15} aria-hidden />{nivel === 'secao' ? 'Nova seção' : 'Nova subseção'}</button>}
    {orientacao && <p id={`${id}-orientacao`} className="mt-1 text-[12px] text-suave">{orientacao}</p>}
    {dados.erro && <p role="status" className="mt-1 text-[12px] text-erro">{dados.erro}</p>}
  </div>;
}

/** Um GET, pares explícitos de canal/status. O rascunho nunca descreve a lista aplicada. */
export function FiltrosDasFichas({ base, filtros: f, verCustos = true, classificacao }: { base: string; filtros: FiltrosDeFicha; verCustos?: boolean; classificacao?: ClassificacaoDosFiltros }) {
  const aplicados = filtrosDaFichaPermitidos(f, verCustos);
  const [selecao, setSelecao] = useState<FiltrosDeFicha>({ ...aplicados, pagina: 1 });
  const [criando, setCriando] = useState<'secao' | 'subsecao' | null>(null);
  const [registros, setRegistros] = useState<RegistroDeClassificacao[]>([]);
  const [secaoConsultada, setSecaoConsultada] = useState<RegistroDeClassificacao>();
  const [aviso, setAviso] = useState('');
  const aplicar = useRef<HTMLButtonElement>(null);
  const { secao, subsecao, cmv, faixasCmv: faixas } = selecao;
  const resumo = resumirFiltrosAplicados(base, aplicados, classificacao);
  const pendente = assinaturaDaSelecao(selecao) !== assinaturaDaSelecao(aplicados);
  const avancados = cmv.length + faixas.length + Number(selecao.incompleto);
  const secaoEscolhida = secaoConsultada?.registro.id === secao ? secaoConsultada : [...registros, ...(classificacao?.secoesIniciais.selecionados ?? []), ...(classificacao?.secoesIniciais.itens ?? [])].find(r => r.nivel === 'secao' && r.registro.id === secao);
  function mudar(campos: Partial<FiltrosDeFicha>) { setSelecao(antes => ({ ...antes, ...campos })); }

  return <><FormularioComAcao role="search" action={base} className="min-w-0 space-y-4">
    <div><label htmlFor="fichas-q" className={ROTULO}>Buscar ficha pelo nome</label><input id="fichas-q" name="q" type="search" value={selecao.q} onChange={e => mudar({ q: e.target.value })} placeholder="Buscar pelo nome" className={CAMPO_DO_FILTRO} /></div>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {classificacao && <><FiltroClassificacao nivel="secao" valor={secao} aoEscolher={(id, registro) => { setSecaoConsultada(registro); mudar({ secao: id || null, subsecao: null }); }} classificacao={classificacao} registros={registros} aoCriar={() => setCriando('secao')} /><FiltroClassificacao nivel="subsecao" valor={subsecao} secaoId={secao && secao !== 'sem' ? secao : undefined} aoEscolher={id => mudar({ subsecao: id || null })} classificacao={classificacao} registros={registros} aoCriar={() => setCriando('subsecao')} criacaoIndisponivel={secaoEscolhida?.registro.ativa === false ? 'Esta seção está arquivada. Escolha uma seção ativa para criar uma subseção.' : undefined} /></>}
      <div><label htmlFor="fichas-tipo" className={ROTULO}>Tipo</label><select id="fichas-tipo" name="tipo" value={selecao.tipo ?? ''} onChange={e => mudar({ tipo: e.target.value as FiltrosDeFicha['tipo'] || null })} className={CAMPO_DO_FILTRO}><option value="">Todos os tipos</option>{Object.entries(TIPOS_DE_FICHA).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></div>
      <div><label htmlFor="fichas-situacao" className={ROTULO}>Situação</label><select id="fichas-situacao" name="situacao" value={selecao.situacao} onChange={e => mudar({ situacao: e.target.value as FiltrosDeFicha['situacao'] })} className={CAMPO_DO_FILTRO}>{Object.entries(SITUACOES_DAS_FICHAS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></div>
    </div>

    {verCustos && <details className="group/avancados rounded-[7px] border border-linha-forte">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[7px] px-3 py-2 text-sm font-semibold text-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acao"><span>Filtros avançados <span className="font-normal text-suave">· Custo e CMV{avancados ? ` (${avancados} selecionados)` : ''}</span></span><ChevronDown size={16} aria-hidden className="shrink-0 group-open/avancados:rotate-180" /></summary>
      <div className="space-y-3 border-t border-linha p-3">
        <p className="text-[12px] text-suave">Escolha as condições e clique em Aplicar filtros para atualizar a lista.</p>
        <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-2">
          <details className="min-w-0"><summary className={`${CAMPO_DO_FILTRO} flex cursor-pointer list-none items-center justify-between gap-2`}><span>Comparação com a meta{cmv.length ? ` (${cmv.length})` : ''}</span><ChevronDown size={16} aria-hidden className="shrink-0" /></summary><div className="mt-2 space-y-3 rounded-[7px] border border-linha-forte bg-fundo p-3"><p className="text-[12px] text-suave">Basta corresponder a uma das opções escolhidas.</p>{ORDEM_DOS_CANAIS.map(canal => <fieldset key={canal}><legend className="text-[13px] font-semibold">{CANAIS[canal].rotulo}</legend><div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{STATUS_DO_FILTRO_DE_CMV.map(status => {
            const par = { canal, status }, valor = valorDoFiltroDoCmv(par), marcado = cmv.some(v => valorDoFiltroDoCmv(v) === valor);
            return <label key={status} className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm"><input type="checkbox" name="cmv" value={valor} checked={marcado} onChange={e => setSelecao(antes => ({ ...antes, cmv: e.target.checked ? [...antes.cmv, par] : antes.cmv.filter(v => valorDoFiltroDoCmv(v) !== valor) }))} className={MARCAR} />{STATUS_DO_CMV[status].rotulo}</label>;
          })}</div></fieldset>)}</div></details>
          <details className="min-w-0"><summary className={`${CAMPO_DO_FILTRO} flex cursor-pointer list-none items-center justify-between gap-2`}><span>Faixa do farol{faixas.length ? ` (${faixas.length})` : ''}</span><ChevronDown size={16} aria-hidden className="shrink-0" /></summary><div className="mt-2 space-y-3 rounded-[7px] border border-linha-forte bg-fundo p-3"><p className="text-[12px] text-suave">Basta corresponder a uma das opções escolhidas.</p>{ORDEM_DOS_CANAIS.map(canal => <fieldset key={canal}><legend className="text-[13px] font-semibold">{CANAIS[canal].rotulo}</legend><div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{[...FAIXAS_DO_CMV, ...ESTADOS_DAS_FAIXAS_DO_CMV].map(faixa => {
            const par = { canal, faixa }, valor = valorDoFiltroDaFaixaDoCmv(par), marcado = faixas.some(v => valorDoFiltroDaFaixaDoCmv(v) === valor);
            return <label key={faixa} className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm"><input type="checkbox" name="faixaCmv" value={valor} checked={marcado} onChange={e => setSelecao(antes => ({ ...antes, faixasCmv: e.target.checked ? [...antes.faixasCmv, par] : antes.faixasCmv.filter(v => valorDoFiltroDaFaixaDoCmv(v) !== valor) }))} className={MARCAR} />{APRESENTACAO_DA_FAIXA[faixa].rotulo}</label>;
          })}</div></fieldset>)}</div></details>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[7px] border border-linha-forte bg-campo px-3 py-2 text-sm text-texto"><input type="checkbox" name="custo" value="incompleto" checked={selecao.incompleto} onChange={e => mudar({ incompleto: e.target.checked })} className={MARCAR} /><span>Só custo incompleto</span></label>
        {cmv.length > 0 && faixas.length > 0 && <p className="text-[12px] text-suave">Corresponde a uma comparação com a meta e a uma faixa escolhida. Os canais podem ser diferentes.</p>}
        {cmv.length > 0 && <div className="space-y-1"><p className="text-[12px] font-semibold text-suave">Seleção de comparação com a meta</p><div className="flex flex-wrap items-center gap-2" aria-label="Comparações selecionadas">{cmv.map(par => <button key={valorDoFiltroDoCmv(par)} type="button" className={classeDeBotao('secundario', `${BOTAO_DO_FILTRO} max-w-full text-left text-[12px]`)} aria-label={`Tirar comparação ${CANAIS[par.canal].curto}: ${STATUS_DO_CMV[par.status].rotulo}`} onClick={() => mudar({ cmv: cmv.filter(v => valorDoFiltroDoCmv(v) !== valorDoFiltroDoCmv(par)) })}>{CANAIS[par.canal].curto} · {STATUS_DO_CMV[par.status].rotulo}<X size={14} aria-hidden className="shrink-0" /></button>)}<button type="button" className={classeDeBotao('fantasma', BOTAO_DO_FILTRO)} onClick={() => mudar({ cmv: [] })}>Limpar comparação</button></div></div>}
        {faixas.length > 0 && <div className="space-y-1"><p className="text-[12px] font-semibold text-suave">Seleção de faixa do farol</p><div className="flex flex-wrap items-center gap-2" aria-label="Faixas selecionadas">{faixas.map(par => <button key={valorDoFiltroDaFaixaDoCmv(par)} type="button" className={classeDeBotao('secundario', `${BOTAO_DO_FILTRO} max-w-full text-left text-[12px]`)} aria-label={`Tirar faixa ${CANAIS[par.canal].curto}: ${APRESENTACAO_DA_FAIXA[par.faixa].rotulo}`} onClick={() => mudar({ faixasCmv: faixas.filter(v => valorDoFiltroDaFaixaDoCmv(v) !== valorDoFiltroDaFaixaDoCmv(par)) })}>{CANAIS[par.canal].curto} · {APRESENTACAO_DA_FAIXA[par.faixa].rotulo}<X size={14} aria-hidden className="shrink-0" /></button>)}<button type="button" className={classeDeBotao('fantasma', BOTAO_DO_FILTRO)} onClick={() => mudar({ faixasCmv: [] })}>Limpar faixas</button></div></div>}
      </div>
    </details>}

    <section aria-labelledby="fichas-aplicados-titulo" className="min-w-0 space-y-2 border-t border-linha pt-4">
      <h2 id="fichas-aplicados-titulo" className="text-[13px] font-semibold">Filtros aplicados ({resumo.length})</h2>
      {resumo.length ? <>
        <ul className="flex min-w-0 flex-wrap gap-2" aria-label="Filtros aplicados à lista">{resumo.map(item => <li key={item.chave} className="min-w-0 max-w-full"><Link href={item.removerHref} aria-label={`Remover ${item.rotulo}${pendente ? ' e descartar alterações pendentes' : ''}`} className={classeDeBotao('secundario', `${BOTAO_DO_FILTRO} max-w-full justify-between text-left text-[12px]`)}><span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.rotulo}</span><X size={14} aria-hidden className="shrink-0" /></Link></li>)}</ul>
        {aplicados.situacao === 'ativas' && <p className="text-[12px] text-suave">Situação: Ativas (padrão).</p>}
      </> : <p className="text-[13px] text-suave">Exibindo fichas ativas, sem outros filtros.</p>}
      {pendente && resumo.length > 0 && <p className="text-[12px] text-suave">Remover um filtro aplicado atualiza a lista e descarta as alterações pendentes.</p>}
    </section>
    {pendente && <p role="status" className="text-sm font-medium text-texto">Há alterações não aplicadas. A lista continua usando os filtros aplicados acima.</p>}
    {aviso && <p role="status" className="text-sm text-suave">{aviso}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <button ref={aplicar} type="submit" className={classeDeBotao('primario', `${BOTAO_DO_FILTRO} w-full sm:w-auto`)}>Aplicar filtros</button>
      <Link href={base} onClick={event => {
        // A URL já pode ser a base; nesse caso não há remount para limpar o rascunho.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        setSelecao({ ...FILTROS_DE_FICHA_PADRAO }); setSecaoConsultada(undefined); setAviso('');
      }} className={classeDeBotao('secundario', `${BOTAO_DO_FILTRO} w-full sm:w-auto`)} aria-label={pendente ? 'Limpar filtros e descartar alterações pendentes' : 'Limpar filtros'}>Limpar</Link>
      {pendente && <button type="button" className={classeDeBotao('fantasma', `${BOTAO_DO_FILTRO} w-full sm:w-auto`)} onClick={() => { setSelecao({ ...aplicados, pagina: 1 }); setSecaoConsultada(undefined); setAviso(''); aplicar.current?.focus(); }}>Descartar alterações</button>}
    </div>
  </FormularioComAcao>
    {criando && classificacao?.gerir && <CriarClassificacao nivel={criando} secaoId={criando === 'subsecao' && secao && secao !== 'sem' ? secao : undefined} gerir={classificacao.gerir} aoFechar={() => setCriando(null)} aoCriar={registro => {
      setRegistros(antes => [...antes.filter(r => r.registro.id !== registro.registro.id), registro]);
      if (registro.nivel === 'secao') mudar({ secao: registro.registro.id, subsecao: null });
      else mudar({ secao: registro.registro.secaoId, subsecao: registro.registro.id });
      setAviso('“' + registro.registro.nome + '” está disponível e foi selecionada. Clique em Aplicar filtros para aplicar.');
      setCriando(null);
    }} />}
  </>;
}
