'use client';

/**
 * I.1b — "Insumo que falta: cadastrar", na nota de compra, na ficha técnica e nas embalagens de um prato.
 *
 * Antes o atalho abria o cadastro em branco, sem o nome e sem caminho de volta: a pessoa saía da nota, cadastrava e tinha de
 * reabrir tudo. Agora: o nome é dito UMA vez, aqui (campo opcional que aparece ao tocar) e chega pronto no cadastro; o caminho de
 * volta (`?volta=`, só caminho interno do ERP, conferido de novo no servidor) leva de volta a esta mesma tela com o insumo já na
 * lista; e o que estava preenchido é guardado (`rascunho.tsx`) antes de sair.
 *
 * Não é um `<form>` porque vive DENTRO do formulário da nota ou da ficha (formulário dentro de formulário não existe em HTML);
 * Enter no campo do nome vai ao cadastro, não envia a nota.
 */

import Link from 'next/link';
import { useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PARAMETRO_INSUMO_CRIADO } from '@/lib/erp/volta';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { CAMPO } from '../../ui/campos';

export function AtalhoNovoInsumo({
  href,
  aoSair,
  tipo,
  rotulo = 'Insumo que falta: cadastrar',
  idDoCampo = 'atalho-novo-insumo-nome',
}: {
  /** O cadastro de insumo de quem usa a tela (`/erp/insumos/novo` ou `/rodolfo/erp/<slug>/insumos/novo`). */
  href: string;
  /** Guarda o que está preenchido, antes de sair. */
  aoSair: () => void;
  /** Pré-escolhe o tipo no cadastro (as embalagens do prato pedem uma Embalagem). */
  tipo?: 'EMBALAGEM';
  rotulo?: string;
  /** Mais de um atalho na mesma tela (um por item da nota fiscal): cada campo de nome tem o seu id. */
  idDoCampo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const ir = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname() ?? '';
  const busca = useSearchParams();

  // O endereço do cadastro com o nome (uma vez só), o tipo e o caminho de volta (esta mesma tela, sem o aviso do insumo anterior).
  const destino = (() => {
    const p = new URLSearchParams();
    const limpo = nome.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (limpo) p.set('nome', limpo);
    if (tipo) p.set('tipo', tipo);
    const daqui = new URLSearchParams(busca?.toString() ?? '');
    daqui.delete(PARAMETRO_INSUMO_CRIADO);
    if (pathname) p.set('volta', daqui.toString() ? `${pathname}?${daqui}` : pathname);
    return `${href}?${p}`;
  })();

  if (!aberto) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => {
          setAberto(true);
          // O campo nasce no próximo desenho: o foco vai para ele assim que existir.
          setTimeout(() => campo.current?.focus(), 0);
        }}
        className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center text-left sm:min-h-0 [@media(pointer:coarse)]:min-h-11`}
      >
        {rotulo}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      <label htmlFor={idDoCampo} className="sr-only">
        Nome do insumo que falta (opcional)
      </label>
      <input
        id={idDoCampo}
        ref={campo}
        value={nome}
        maxLength={80}
        autoComplete="off"
        placeholder="Nome do insumo que falta"
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Enter aqui vai ao cadastro (o link abaixo), e não envia a nota ou a ficha que está em volta.
            e.preventDefault();
            ir.current?.click();
          } else if (e.key === 'Escape') {
            setAberto(false);
          }
        }}
        className={`${CAMPO} sm:w-64`}
      />
      <div className="flex gap-2">
        <Link ref={ir} href={destino} onClick={aoSair} className={classeDeBotao('secundario')}>
          Ir para o cadastro
        </Link>
        <button type="button" onClick={() => setAberto(false)} className={classeDeBotao('fantasma')}>
          Fechar
        </button>
      </div>
      <p className="text-[12px] text-suave sm:basis-full">Você volta para esta tela depois de salvar, e o que preencheu aqui é recuperado.</p>
    </div>
  );
}

/** Na tela de origem: o insumo que acabou de ser cadastrado já está na lista (e foi escolhido numa linha vazia, quando havia). */
export function AvisoInsumoCriado({ nome, escolhido }: { nome: string; escolhido: boolean }) {
  return (
    <div role="status" className="rounded-[10px] border border-linha-forte px-4 py-3 text-sm">
      <p className="font-semibold text-texto">Insumo salvo com sucesso: {nome}</p>
      <p className="mt-0.5 text-suave">{escolhido ? 'Ele já está na lista e foi escolhido numa linha vazia. Confira e siga.' : 'Ele já está na lista de insumos desta tela.'}</p>
    </div>
  );
}
