'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AcaoBuscarClassificacao, AcaoGerirClassificacao, EstadoGestaoClassificacao, RegistroDeClassificacao, ResultadoGestaoClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { LIMITE_NOME_CLASSIFICACAO } from '@/lib/erp/ficha-secoes-campos';
import { CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { useBuscaClassificacao } from './busca-classificacao';

/** Irmão do formulário de ficha. A resposta altera apenas o catálogo local e conserva a receita. */
export function PainelClassificacao({ buscar, gerir, aoFechar, aoAlterar }: {
  buscar: AcaoBuscarClassificacao; gerir: AcaoGerirClassificacao; aoFechar: () => void;
  aoAlterar: (resultado: Extract<ResultadoGestaoClassificacao, { ok: true }>) => void;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const [secao, setSecao] = useState<RegistroDeClassificacao | null>(null);
  const [operacao, setOperacao] = useState<{ registro: RegistroDeClassificacao; intencao: 'renomear' | 'arquivar' | 'restaurar' | 'excluir' } | null>(null);
  const [estado, setEstado] = useState<EstadoGestaoClassificacao>(null);
  const [pendente, setPendente] = useState(false);
  const [nome, setNome] = useState('');
  const dados = useBuscaClassificacao(buscar, { contexto: 'gestao', nivel: secao ? 'subsecao' : 'secao', secaoId: secao?.registro.id });
  useEffect(() => {
    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    painel.current?.focus();
    return () => origem?.focus();
  }, []);
  // Salvar, trocar de nível ou terminar a paginação pode remover o botão focado.
  // Recupera o foco do diálogo sem interferir com um campo que ainda está ativo.
  useEffect(() => {
    if (painel.current && !painel.current.contains(document.activeElement)) painel.current.focus();
  });

  function fechar() { if (!pendente) aoFechar(); }
  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    if (e.key !== 'Tab') return;
    const alvos = painel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex="0"]');
    if (!alvos?.length) { e.preventDefault(); return; }
    const primeiro = alvos[0], ultimo = alvos[alvos.length - 1];
    if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === painel.current)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  }
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pendente) return;
    const form = new FormData(e.currentTarget);
    setPendente(true);
    try {
      const r = await gerir(estado, form);
      setEstado(r);
      if (r?.ok) { aoAlterar(r); setOperacao(null); await dados.recarregar(); }
    } catch { setEstado({ vez: (estado?.vez ?? 0) + 1, ok: false, erros: { geral: 'Não foi possível salvar agora. Tente novamente.' } }); }
    finally { setPendente(false); }
  }
  const erros = estado && !estado.ok ? estado.erros : {};
  return <div className="fixed inset-0 z-40 flex justify-end" role="presentation" onKeyDown={tecla}>
    <div className="absolute inset-0 bg-texto/20" aria-hidden onClick={fechar} />
    <div ref={painel} role="dialog" aria-modal="true" aria-labelledby="gestao-secoes-titulo" tabIndex={-1} className="relative flex h-full w-full max-w-lg flex-col border-l border-linha bg-fundo shadow-xl outline-none">
      <div className="flex items-center justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
        <h2 id="gestao-secoes-titulo" className="font-display text-[20px] font-bold">Gerenciar seções</h2>
        <button type="button" disabled={pendente} onClick={fechar} className={classeDeBotao('fantasma', 'h-11 w-11 px-0')} aria-label="Fechar gestão de seções"><X size={18} aria-hidden /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        <p className="text-sm text-suave">As alterações valem para as fichas da rede. Para criar uma seção ou subseção, preencha o nome na ficha e salve a receita.</p>
        {secao && <div className="space-y-1"><button type="button" disabled={pendente} className={classeDeBotao('fantasma', 'px-0')} onClick={() => { setSecao(null); setOperacao(null); setEstado(null); }}>Voltar às seções</button><h3 className="break-words font-semibold">Subseções de {secao.registro.nome}</h3></div>}
        <label className="block"><span className={ROTULO}>Buscar {secao ? 'subseção' : 'seção'}</span><input type="search" className={CAMPO} placeholder="Digite o nome" disabled={pendente} key={secao?.registro.id ?? 'secoes'} onChange={(e) => { setOperacao(null); dados.buscaExterna.aoBuscar(e.target.value); }} /></label>
        {estado?.ok && <p role="status" className="text-sm text-suave">{estado.mensagem}</p>}
        {dados.erro && <p role="alert" className="text-sm text-erro">{dados.erro}</p>}
        <Erro id="gestao-classificacao-geral" texto={erros.geral} />
        {estado && !estado.ok && estado.conflito && <div role="alert" className="space-y-2 text-sm text-suave">
          <p>Este registro mudou durante a edição.{estado.existente ? ` Nome atual: “${estado.existente.registro.nome}”.` : ''} A receita continua preenchida.</p>
          <button type="button" disabled={pendente} className={classeDeBotao('secundario')} onClick={() => {
            const existente = estado.existente;
            if (existente && operacao) setOperacao({ ...operacao, registro: existente });
            else setOperacao(null);
            setEstado(null);
            void dados.recarregar();
          }}>Rever versão atual</button>
        </div>}
        <ul className="divide-y divide-linha">
          {dados.pagina.itens.map((r) => {
            const selecionada = operacao?.registro.registro.id === r.registro.id;
            const impacto = dados.pagina.impacto?.[r.registro.id];
            return <li key={r.registro.id} className="space-y-2 py-3">
              <p className="break-words font-semibold">{r.registro.nome}{!r.registro.ativa && <span className="ml-2 text-[12px] font-normal text-suave">Arquivada</span>}</p>
              {impacto && <p className="text-[12px] text-suave">{impacto.fichas} {impacto.fichas === 1 ? 'ficha' : 'fichas'}{r.nivel === 'secao' ? ` · ${impacto.subsecoes} subseções` : ''}</p>}
              {selecionada ? <form onSubmit={enviar} className="space-y-2">
                <input type="hidden" name="nivel" value={r.nivel} /><input type="hidden" name="id" value={r.registro.id} /><input type="hidden" name="versao" value={operacao.registro.registro.versao} /><input type="hidden" name="intencao" value={operacao.intencao} />
                {operacao.intencao === 'renomear' ? <label className="block"><span className={ROTULO}>Novo nome</span><input name="nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={LIMITE_NOME_CLASSIFICACAO} className={CAMPO} required disabled={pendente} autoFocus /><Erro id="gestao-classificacao-nome" texto={erros.nome} /></label> : <p className="text-sm text-suave">{operacao.intencao === 'excluir' ? `Excluir “${r.registro.nome}”? Só é possível quando não há fichas nem subseções vinculadas.` : operacao.intencao === 'arquivar' ? `Arquivar “${r.registro.nome}”? Os vínculos atuais permanecem; novas fichas não poderão escolher este registro${r.nivel === 'secao' ? ' nem suas subseções' : ''}.` : `Restaurar “${r.registro.nome}” para novas escolhas?${r.nivel === 'subsecao' && !r.registro.secaoAtiva ? ' A seção também precisa estar ativa.' : ''}`}</p>}
                {Object.entries(erros).filter(([k]) => !['geral', 'nome'].includes(k)).map(([k, v]) => <Erro key={k} id={`gestao-classificacao-${k}`} texto={v} />)}
                <div className="flex flex-wrap gap-2"><button type="submit" disabled={pendente} className={classeDeBotao('primario')}>{pendente ? 'Salvando…' : operacao.intencao === 'renomear' ? 'Salvar nome' : 'Confirmar'}</button><button type="button" disabled={pendente} className={classeDeBotao('secundario')} onClick={() => { setOperacao(null); setEstado(null); }}>Cancelar</button></div>
              </form> : <div className="flex flex-wrap gap-2">
                {r.nivel === 'secao' && <button type="button" disabled={pendente} className={classeDeBotao('secundario')} onClick={() => { setSecao(r); setOperacao(null); setEstado(null); }}>Subseções</button>}
                {(['renomear', r.registro.ativa ? 'arquivar' : 'restaurar', 'excluir'] as const).map((intencao) => <button type="button" key={intencao} disabled={pendente} className={classeDeBotao('fantasma')} onClick={() => { setEstado(null); setNome(r.registro.nome); setOperacao({ registro: r, intencao }); }}>{({ renomear: 'Renomear', arquivar: 'Arquivar', restaurar: 'Restaurar', excluir: 'Excluir' })[intencao]}</button>)}
              </div>}
            </li>;
          })}
        </ul>
        {!dados.carregando && !dados.erro && dados.pagina.itens.length === 0 && <p className="text-sm text-suave">Nenhum registro encontrado.</p>}
        {dados.carregando && <p role="status" className="text-sm text-suave">Buscando…</p>}
        {dados.buscaExterna.temMais && <button type="button" disabled={dados.carregando || pendente} className={classeDeBotao('secundario')} onClick={dados.buscaExterna.aoCarregarMais}>Carregar mais</button>}
      </div>
    </div>
  </div>;
}
