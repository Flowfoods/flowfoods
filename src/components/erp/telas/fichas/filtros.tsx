'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CANAIS, ORDEM_DOS_CANAIS } from '@/lib/erp/canal-campos';
import { STATUS_DO_CMV } from '@/lib/erp/cmv-produto-campos';
import { ESTADOS_DAS_FAIXAS_DO_CMV, FAIXAS_DO_CMV, valorDoFiltroDaFaixaDoCmv } from '@/lib/erp/cmv-faixas-campos';
import { APRESENTACAO_DA_FAIXA } from './farol';
import { STATUS_DO_FILTRO_DE_CMV, temFiltroDeFicha, TIPOS_DE_FICHA, valorDoFiltroDoCmv, type FiltrosDeFicha } from '@/lib/erp/ficha-campos';
import type { AcaoBuscarClassificacao, PaginaDeClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { CAMPO, MARCAR, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { FiltrosRecolhiveis } from '../insumos/filtros-recolhiveis';
import { SeletorDeItem } from './seletor-de-item';
import { opcaoDaClassificacao, PAGINA_VAZIA, useBuscaClassificacao } from './busca-classificacao';

export type ClassificacaoDosFiltros = { secoesIniciais: PaginaDeClassificacao; subsecoesIniciais: PaginaDeClassificacao | null; buscar: AcaoBuscarClassificacao };

function FiltroClassificacao({ nivel, valor, secaoId, aoEscolher, classificacao }: { nivel: 'secao' | 'subsecao'; valor: string | null; secaoId?: string; aoEscolher: (id: string) => void; classificacao: ClassificacaoDosFiltros }) {
  const dados = useBuscaClassificacao(classificacao.buscar, { contexto: 'filtro', nivel, secaoId, selecionados: valor && valor !== 'sem' ? [valor] : [] }, nivel === 'secao' ? classificacao.secoesIniciais : classificacao.subsecoesIniciais ?? PAGINA_VAZIA);
  const rotulo = nivel === 'secao' ? 'Seção' : 'Subseção';
  const fixas = [{ valor: '', nome: `Todas as ${nivel === 'secao' ? 'seções' : 'subseções'}`, grupo: 'Filtro', ordemDoGrupo: -1 }, { valor: 'sem', nome: `Sem ${rotulo.toLowerCase()}`, grupo: 'Filtro', ordemDoGrupo: 0 }];
  const selecionada = [...dados.pagina.selecionados, ...dados.pagina.itens].find((r) => r.registro.id === valor);
  return <div className="min-w-0"><label htmlFor={`filtros-${nivel}`} className={ROTULO}>{rotulo}</label><SeletorDeItem id={`filtros-${nivel}`} name={nivel} valor={valor ?? ''} aoEscolher={aoEscolher} opcoes={[...fixas, ...dados.pagina.itens.map(opcaoDaClassificacao)]} selecionada={selecionada ? opcaoDaClassificacao(selecionada) : valor && valor !== 'sem' ? { valor, nome: `${rotulo} indisponível`, grupo: 'Filtro', ordemDoGrupo: 0 } : null} rotulo={rotulo} placeholder={`Todas as ${nivel === 'secao' ? 'seções' : 'subseções'}`} vazio="Nenhum registro encontrado." desabilitado={nivel === 'subsecao' && !secaoId} buscaExterna={dados.buscaExterna} />{dados.erro && <p role="status" className="mt-1 text-[12px] text-erro">{dados.erro}</p>}</div>;
}

/** Um GET, pares explícitos de canal/status. Nenhuma combinação é criada implicitamente. */
export function FiltrosDasFichas({ base, filtros: f, verCustos = true, classificacao }: { base: string; filtros: FiltrosDeFicha; verCustos?: boolean; classificacao?: ClassificacaoDosFiltros }) {
  const [secao, setSecao] = useState(f.secao);
  const [subsecao, setSubsecao] = useState(f.subsecao);
  const [cmv, setCmv] = useState(verCustos ? f.cmv : []);
  const [faixas, setFaixas] = useState(verCustos ? f.faixasCmv : []);
  const ativos = Number(!!f.tipo) + Number(f.situacao !== 'ativas') + Number(!!secao) + Number(!!subsecao) + cmv.length + faixas.length + Number(verCustos && f.incompleto);
  return <form role="search" action={base} className="space-y-3">
    <div className="flex gap-2"><label htmlFor="fichas-q" className="sr-only">Buscar ficha pelo nome</label><input id="fichas-q" name="q" type="search" defaultValue={f.q} placeholder="Buscar pelo nome" className={`${CAMPO} min-w-0 flex-1`} /><button type="submit" className={classeDeBotao('secundario', 'shrink-0')}>Filtrar</button>{temFiltroDeFicha(f) && <Link href={base} className={classeDeBotao('fantasma', 'shrink-0 px-3')}>Limpar</Link>}</div>
    <FiltrosRecolhiveis id="fichas-filtros" ativos={ativos} grade="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      <div><label htmlFor="fichas-tipo" className={ROTULO}>Tipo</label><select id="fichas-tipo" name="tipo" defaultValue={f.tipo ?? ''} className={CAMPO}><option value="">Todos os tipos</option>{Object.entries(TIPOS_DE_FICHA).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></div>
      <div><label htmlFor="fichas-situacao" className={ROTULO}>Situação</label><select id="fichas-situacao" name="situacao" defaultValue={f.situacao} className={CAMPO}>{Object.entries({ ativas: 'Ativas', desativadas: 'Desativadas', todas: 'Todas' }).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></div>
      {classificacao && <><FiltroClassificacao nivel="secao" valor={secao} aoEscolher={(id) => { setSecao(id || null); setSubsecao(null); }} classificacao={classificacao} /><FiltroClassificacao nivel="subsecao" valor={subsecao} secaoId={secao && secao !== 'sem' ? secao : undefined} aoEscolher={(id) => setSubsecao(id || null)} classificacao={classificacao} /></>}
      {verCustos && <>
        <details className="relative sm:col-span-2"><summary className={`${CAMPO} cursor-pointer list-none`}>Comparação com a meta{cmv.length ? ` (${cmv.length})` : ''}</summary><div className="mt-1 space-y-3 rounded-[7px] border border-linha-forte bg-fundo p-3"><p className="text-[12px] text-suave">Basta corresponder a uma das opções escolhidas.</p>{ORDEM_DOS_CANAIS.map((canal) => <fieldset key={canal}><legend className="text-[13px] font-semibold">{CANAIS[canal].rotulo}</legend><div className="grid sm:grid-cols-2">{STATUS_DO_FILTRO_DE_CMV.map((status) => {
          const par = { canal, status }, valor = valorDoFiltroDoCmv(par), marcado = cmv.some((v) => valorDoFiltroDoCmv(v) === valor);
          return <label key={status} className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm"><input type="checkbox" name="cmv" value={valor} checked={marcado} onChange={(e) => setCmv((antes) => e.target.checked ? [...antes, par] : antes.filter((v) => valorDoFiltroDoCmv(v) !== valor))} className={MARCAR} />{STATUS_DO_CMV[status].rotulo}</label>;
        })}</div></fieldset>)}</div></details>
        <details className="relative sm:col-span-2"><summary className={`${CAMPO} cursor-pointer list-none`}>Faixa do farol{faixas.length ? ` (${faixas.length})` : ''}</summary><div className="mt-1 space-y-3 rounded-[7px] border border-linha-forte bg-fundo p-3"><p className="text-[12px] text-suave">Basta corresponder a uma das opções escolhidas.</p>{ORDEM_DOS_CANAIS.map(canal => <fieldset key={canal}><legend className="text-[13px] font-semibold">{CANAIS[canal].rotulo}</legend><div className="grid sm:grid-cols-2">{[...FAIXAS_DO_CMV, ...ESTADOS_DAS_FAIXAS_DO_CMV].map(faixa => {
          const par = { canal, faixa }, valor = valorDoFiltroDaFaixaDoCmv(par), marcado = faixas.some(v => valorDoFiltroDaFaixaDoCmv(v) === valor);
          return <label key={faixa} className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm"><input type="checkbox" name="faixaCmv" value={valor} checked={marcado} onChange={e => setFaixas(antes => e.target.checked ? [...antes, par] : antes.filter(v => valorDoFiltroDaFaixaDoCmv(v) !== valor))} className={MARCAR} />{APRESENTACAO_DA_FAIXA[faixa].rotulo}</label>;
        })}</div></fieldset>)}</div></details>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[7px] border border-linha-forte bg-campo px-3 text-sm text-texto sm:col-span-2"><input type="checkbox" name="custo" value="incompleto" defaultChecked={f.incompleto} className={MARCAR} /><span>Só custo incompleto</span></label>
      </>}
    </FiltrosRecolhiveis>
    {cmv.length > 0 && faixas.length > 0 && <p className="text-[12px] text-suave">Corresponde a uma comparação com a meta e a uma faixa escolhida. Os canais podem ser diferentes.</p>}
    {cmv.length > 0 && <div className="space-y-1"><p className="text-[12px] font-semibold text-suave">Comparação com a meta</p><div className="flex flex-wrap items-center gap-2" aria-label="Comparações selecionadas">{cmv.map((par) => <button key={valorDoFiltroDoCmv(par)} type="button" className={classeDeBotao('secundario', 'min-h-11 whitespace-normal text-[12px]')} aria-label={`Tirar comparação ${CANAIS[par.canal].curto}: ${STATUS_DO_CMV[par.status].rotulo}`} onClick={() => setCmv((antes) => antes.filter((v) => valorDoFiltroDoCmv(v) !== valorDoFiltroDoCmv(par)))}>{CANAIS[par.canal].curto} · {STATUS_DO_CMV[par.status].rotulo}<span aria-hidden>×</span></button>)}<button type="button" className={classeDeBotao('fantasma')} onClick={() => setCmv([])}>Limpar comparação</button></div></div>}
    {faixas.length > 0 && <div className="space-y-1"><p className="text-[12px] font-semibold text-suave">Faixa do farol</p><div className="flex flex-wrap items-center gap-2" aria-label="Faixas selecionadas">{faixas.map(par => <button key={valorDoFiltroDaFaixaDoCmv(par)} type="button" className={classeDeBotao('secundario', 'min-h-11 whitespace-normal text-[12px]')} aria-label={`Tirar faixa ${CANAIS[par.canal].curto}: ${APRESENTACAO_DA_FAIXA[par.faixa].rotulo}`} onClick={() => setFaixas(antes => antes.filter(v => valorDoFiltroDaFaixaDoCmv(v) !== valorDoFiltroDaFaixaDoCmv(par)))}>{CANAIS[par.canal].curto} · {APRESENTACAO_DA_FAIXA[par.faixa].rotulo}<span aria-hidden>×</span></button>)}<button type="button" className={classeDeBotao('fantasma')} onClick={() => setFaixas([])}>Limpar faixas</button></div></div>}
  </form>;
}
