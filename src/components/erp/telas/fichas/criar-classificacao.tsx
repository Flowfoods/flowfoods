'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AcaoGerirClassificacao, EstadoGestaoClassificacao, RegistroDeClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { LIMITE_NOME_CLASSIFICACAO } from '@/lib/erp/ficha-secoes-campos';
import { CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';

/** Irmão do GET de filtros: criar um nome não envia nem limpa os filtros. */
export function CriarClassificacao({ nivel, secaoId, gerir, aoCriar, aoFechar }: {
  nivel: 'secao' | 'subsecao'; secaoId?: string; gerir: AcaoGerirClassificacao;
  aoCriar: (registro: RegistroDeClassificacao) => void; aoFechar: () => void;
}) {
  const painel = useRef<HTMLDialogElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const enviando = useRef(false);
  const [nome, setNome] = useState('');
  const [pendente, setPendente] = useState(false);
  const [estado, setEstado] = useState<EstadoGestaoClassificacao>(null);
  const rotulo = nivel === 'secao' ? 'seção' : 'subseção';
  useEffect(() => {
    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogo = painel.current;
    dialogo?.showModal();
    campo.current?.focus();
    return () => { dialogo?.close(); origem?.focus(); };
  }, []);
  function fechar() { if (!enviando.current) aoFechar(); }
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando.current) return;
    const form = new FormData(e.currentTarget);
    enviando.current = true;
    setPendente(true);
    try {
      const resposta = await gerir(estado, form);
      setEstado(resposta);
      if (resposta?.ok && resposta.alterado) aoCriar(resposta.alterado);
    } catch {
      setEstado({ vez: (estado?.vez ?? 0) + 1, ok: false, erros: { geral: 'Não foi possível confirmar a criação. Tente novamente com o mesmo nome.' } });
    } finally { enviando.current = false; setPendente(false); }
  }
  const erros = estado && !estado.ok ? estado.erros : {};
  return <dialog ref={painel} aria-labelledby="criar-classificacao-titulo" onCancel={event => { event.preventDefault(); fechar(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const r = event.currentTarget.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) fechar();
  }} className="m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-[10px] border border-linha bg-fundo p-4 text-texto shadow-xl backdrop:bg-texto/20 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="criar-classificacao-titulo" className="font-display text-xl font-bold">Nova {rotulo}</h2>
        <button type="button" disabled={pendente} onClick={fechar} aria-label="Fechar criação" className={classeDeBotao('fantasma', 'h-11 w-11 px-0')}><X size={18} aria-hidden /></button>
      </div>
      <p className="mb-4 text-sm text-suave">O nome ficará disponível para as fichas da rede. Depois de criar, clique em Aplicar filtros para aplicar a seleção.</p>
      <form onSubmit={enviar} className="space-y-3">
        <input type="hidden" name="intencao" value="criar" /><input type="hidden" name="nivel" value={nivel} />
        {secaoId && <input type="hidden" name="secaoId" value={secaoId} />}
        <label className="block"><span className={ROTULO}>Nome da {rotulo}</span><input ref={campo} name="nome" value={nome} onChange={e => setNome(e.target.value)} maxLength={LIMITE_NOME_CLASSIFICACAO} required disabled={pendente} className={`${CAMPO} sm:!min-h-11`} aria-invalid={!!erros.nome} aria-describedby={erros.nome ? 'criar-classificacao-nome' : undefined} /></label>
        {Object.entries(erros).map(([chave, texto]) => <Erro key={chave} id={`criar-classificacao-${chave}`} texto={texto} />)}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={pendente} onClick={fechar} className={classeDeBotao('secundario', 'sm:!min-h-11')}>Cancelar</button>
          <button type="submit" disabled={pendente} className={classeDeBotao('primario', 'sm:!min-h-11')}>{pendente ? 'Criando…' : `Criar ${rotulo}`}</button>
        </div>
      </form>
  </dialog>;
}
