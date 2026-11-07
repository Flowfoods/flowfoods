'use client';

import { FormularioComAcao } from '@/components/erp/ui/formulario-com-acao';

import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CANAIS, ORDEM_DOS_CANAIS } from '@/lib/erp/canal-campos';
import { STATUS_DO_CMV } from '@/lib/erp/cmv-produto-campos';
import { ESTADOS_DAS_FAIXAS_DO_CMV, FAIXAS_DO_CMV, valorDoFiltroDaFaixaDoCmv } from '@/lib/erp/cmv-faixas-campos';
import { APRESENTACAO_DA_FAIXA } from './farol';
import { STATUS_DO_FILTRO_DE_CMV, temFiltroDeFicha, TIPOS_DE_FICHA, valorDoFiltroDoCmv, type FiltrosDeFicha } from '@/lib/erp/ficha-campos';
import type { AcaoBuscarClassificacao, AcaoGerirClassificacao, PaginaDeClassificacao, RegistroDeClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { CAMPO, MARCAR, ROTULO, ROTULO_EM_LINHA } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { FiltrosRecolhiveis } from '../insumos/filtros-recolhiveis';
import { SeletorDeItem } from './seletor-de-item';
import { CriarClassificacao } from './criar-classificacao';
import { opcaoDaClassificacao, PAGINA_VAZIA, useBuscaClassificacao } from './busca-classificacao';

export type ClassificacaoDosFiltros = { secoesIniciais: PaginaDeClassificacao; subsecoesIniciais: PaginaDeClassificacao | null; buscar: AcaoBuscarClassificacao; gerir?: AcaoGerirClassificacao };

function FiltroClassificacao({ nivel, valor, secaoId, aoEscolher, classificacao, registros, aoCriar, criacaoIndisponivel }: { nivel: 'secao' | 'subsecao'; valor: string | null; secaoId?: string; aoEscolher: (id: string, registro?: RegistroDeClassificacao) => void; classificacao: ClassificacaoDosFiltros; registros: RegistroDeClassificacao[]; aoCriar: () => void; criacaoIndisponivel?: string }) {
  const dados = useBuscaClassificacao(classificacao.buscar, { contexto: 'filtro', nivel, secaoId, selecionados: valor && valor !== 'sem' ? [valor] : [] }, nivel === 'secao' ? classificacao.secoesIniciais : classificacao.subsecoesIniciais ?? PAGINA_VAZIA);
  const rotulo = nivel === 'secao' ? 'Seção' : 'Subseção';
  const fixas = [{ valor: '', nome: `Todas as ${nivel === 'secao' ? 'seções' : 'subseções'}`, grupo: 'Filtro', ordemDoGrupo: -1 }, { valor: 'sem', nome: `Sem ${rotulo.toLowerCase()}`, grupo: 'Filtro', ordemDoGrupo: 0 }];
  const locais = registros.filter(r => r.nivel === nivel && (r.nivel !== 'subsecao' || r.registro.secaoId === secaoId));
  const itens = [...locais, ...dados.pagina.itens.filter(r => !locais.some(l => l.registro.id === r.registro.id))];
  const selecionada = [...locais, ...dados.pagina.selecionados, ...dados.pagina.itens].find((r) => r.registro.id === valor);
  const id = `filtros-${nivel}`;
  const orientacao = nivel === 'subsecao' && !secaoId ? classificacao.gerir ? 'Escolha uma seção para filtrar ou criar uma subseção.' : 'Escolha uma seção para filtrar por subseção.' : classificacao.gerir ? criacaoIndisponivel : undefined;
  return <div className="min-w-0">
    <div className={`mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 ${classificacao.gerir ? 'min-h-11' : ''}`}>
      <label htmlFor={id} className={ROTULO_EM_LINHA}>{rotulo}</label>
      {classificacao.gerir && <button type="button" disabled={!!criacaoIndisponivel || (nivel === 'subsecao' && !secaoId)} onClick={aoCriar} aria-haspopup="dialog" aria-describedby={orientacao ? `${id}-orientacao` : undefined} className={classeDeBotao('secundario', 'px-3 text-[13px]')}><Plus size={15} aria-hidden />{nivel === 'secao' ? 'Nova seção' : 'Nova subseção'}</button>}
    </div>
    <SeletorDeItem id={id} name={nivel} valor={valor ?? ''} aoEscolher={id => aoEscolher(id, [...itens, ...dados.pagina.selecionados].find(r => r.registro.id === id))} opcoes={[...fixas, ...itens.map(opcaoDaClassificacao)]} selecionada={selecionada ? opcaoDaClassificacao(selecionada) : valor && valor !== 'sem' ? { valor, nome: `${rotulo} indisponível`, grupo: 'Filtro', ordemDoGrupo: 0 } : null} rotulo={rotulo} placeholder={`Todas as ${nivel === 'secao' ? 'seções' : 'subseções'}`} vazio="Nenhum registro encontrado." desabilitado={nivel === 'subsecao' && !secaoId} descritoPor={orientacao ? `${id}-orientacao` : undefined} buscaExterna={dados.buscaExterna} />
    {orientacao && <p id={`${id}-orientacao`} className="mt-1 text-[12px] text-suave">{orientacao}</p>}
    {dados.erro && <p role="status" className="mt-1 text-[12px] text-erro">{dados.erro}</p>}
  </div>;
}

/** Um GET, pares explícitos de canal/status. Nenhuma combinação é criada implicitamente. */
export function FiltrosDasFichas({ base, filtros: f, verCustos = true, classificacao }: { base: string; filtros: FiltrosDeFicha; verCustos?: boolean; classificacao?: ClassificacaoDosFiltros }) {
  const [criando, setCriando] = useState<'secao' | 'subsecao' | null>(null);
  const [registros, setRegistros] = useState<RegistroDeClassificacao[]>([]);
  const [secaoConsultada, setSecaoConsultada] = useState<RegistroDeClassificacao>();
  const [aviso, setAviso] = useState('');
  const [secao, setSecao] = useState(f.secao);
  const [subsecao, setSubsecao] = useState(f.subsecao);
  const [cmv, setCmv] = useState(verCustos ? f.cmv : []);
  const [faixas, setFaixas] = useState(verCustos ? f.faixasCmv : []);
  const ativos = Number(!!f.tipo) + Number(f.situacao !== 'ativas') + Number(!!secao) + Number(!!subsecao) + cmv.length + faixas.length + Number(verCustos && f.incompleto);
  const secaoEscolhida = secaoConsultada?.registro.id === secao ? secaoConsultada : [...registros, ...(classificacao?.secoesIniciais.selecionados ?? []), ...(classificacao?.secoesIniciais.itens ?? [])].find(r => r.nivel === 'secao' && r.registro.id === secao);
  return <><FormularioComAcao role="search" action={base} className="space-y-3">
    <div className="flex gap-2"><label htmlFor="fichas-q" className="sr-only">Buscar ficha pelo nome</label><input id="fichas-q" name="q" type="search" defaultValue={f.q} placeholder="Buscar pelo nome" className={`${CAMPO} min-w-0 flex-1`} /><button type="submit" className={classeDeBotao('secundario', 'shrink-0')}>Filtrar</button>{temFiltroDeFicha(f) && <Link href={base} className={classeDeBotao('fantasma', 'shrink-0 px-3')}>Limpar</Link>}</div>
    <FiltrosRecolhiveis id="fichas-filtros" ativos={ativos} grade="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      <div><label htmlFor="fichas-tipo" className={`${ROTULO} ${classificacao?.gerir ? 'flex min-h-11 items-center' : ''}`}>Tipo</label><select id="fichas-tipo" name="tipo" defaultValue={f.tipo ?? ''} className={CAMPO}><option value="">Todos os tipos</option>{Object.entries(TIPOS_DE_FICHA).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></div>
      <div><label htmlFor="fichas-situacao" className={`${ROTULO} ${classificacao?.gerir ? 'flex min-h-11 items-center' : ''}`}>Situação</label><select id="fichas-situacao" name="situacao" defaultValue={f.situacao} className={CAMPO}>{Object.entries({ ativas: 'Ativas', desativadas: 'Desativadas', todas: 'Todas' }).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></div>
      {classificacao && <><FiltroClassificacao nivel="secao" valor={secao} aoEscolher={(id, registro) => {
        setSecaoConsultada(registro);
        setSecao(id || null); setSubsecao(null);
      }} classificacao={classificacao} registros={registros} aoCriar={() => setCriando('secao')} /><FiltroClassificacao nivel="subsecao" valor={subsecao} secaoId={secao && secao !== 'sem' ? secao : undefined} aoEscolher={(id) => setSubsecao(id || null)} classificacao={classificacao} registros={registros} aoCriar={() => setCriando('subsecao')} criacaoIndisponivel={secaoEscolhida?.registro.ativa === false ? 'Esta seção está arquivada. Escolha uma seção ativa para criar uma subseção.' : undefined} /></>}
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
    {aviso && <p role="status" className="text-sm text-suave">{aviso}</p>}
  </FormularioComAcao>
    {criando && classificacao?.gerir && <CriarClassificacao nivel={criando} secaoId={criando === 'subsecao' && secao && secao !== 'sem' ? secao : undefined} gerir={classificacao.gerir} aoFechar={() => setCriando(null)} aoCriar={registro => {
      setRegistros(antes => [...antes.filter(r => r.registro.id !== registro.registro.id), registro]);
      if (registro.nivel === 'secao') { setSecao(registro.registro.id); setSubsecao(null); }
      else { setSecao(registro.registro.secaoId); setSubsecao(registro.registro.id); }
      setAviso('“' + registro.registro.nome + '” está disponível e foi selecionada. Clique em Filtrar para aplicar.');
      setCriando(null);
    }} />}
  </>;
}
