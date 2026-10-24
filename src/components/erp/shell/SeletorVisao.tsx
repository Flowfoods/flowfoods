'use client';

/**
 * Seletor de visão da barra superior: "Rede Completa" ↔ loja.
 *
 * As opções vêm do servidor já filtradas pelo alcance (0.4), e a escolha é
 * conferida de novo na action antes de virar cookie: este componente nunca
 * concede nada. Nível 1: primeiro escolhe o parceiro (navega para ele) e,
 * dentro dele, a loja (as lojas do parceiro são lidas sob demanda).
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
// avoid-ai-design-ignore: I3 — Check marca estado (opção escolhida, mensagem entregue), não é enfeite.
import { Check, ChevronDown, Store } from 'lucide-react';
import { slugNoCaminho } from '@/lib/rodolfo/modulos';
import type { OpcaoDeVisao } from '@/lib/erp/visao';
import { Popover } from './Popover';
import type { VisaoDoNivel1, VisaoDoParceiro } from './tipos';

const GATILHO =
  'ff-transicao flex min-h-11 w-full items-center gap-2 rounded-[7px] border border-linha px-2.5 text-[13px] text-texto hover:border-linha-forte aria-expanded:border-linha-forte sm:px-3';

export function SeletorVisao({ visao }: { visao: VisaoDoParceiro | VisaoDoNivel1 }) {
  return visao.modo === 'parceiro' ? <DoParceiro visao={visao} /> : <DoNivel1 visao={visao} />;
}

function ListaDeOpcoes({
  opcoes,
  valor,
  aoEscolher,
  erro,
}: {
  opcoes: OpcaoDeVisao[];
  valor: string | null;
  aoEscolher: (v: string) => void;
  erro: string | null;
}) {
  return (
    <>
      <ul aria-label="Visão" className="max-h-[60vh] overflow-y-auto">
        {opcoes.map((o) => (
          <li key={o.valor}>
            <button
              type="button"
              aria-pressed={o.valor === valor}
              onClick={() => aoEscolher(o.valor)}
              className="ff-transicao flex min-h-11 w-full items-center justify-between gap-3 rounded-[8px] px-3 text-left text-[14px] hover:bg-texto/5"
            >
              <span className="min-w-0 truncate">
                {o.rotulo}
                {!o.ativa && <span className="ml-1.5 text-[12px] text-suave">(inativa)</span>}
              </span>
              {o.valor === valor && <Check size={16} aria-hidden className="shrink-0" />}
            </button>
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="px-3 pb-2 pt-1 text-[13px] text-erro">
          {erro}
        </p>
      )}
    </>
  );
}

function DoParceiro({ visao }: { visao: VisaoDoParceiro }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const atual = visao.opcoes.find((o) => o.valor === visao.valor);
  // Uma opção só (a única loja de quem é N3): mostra, sem fingir que dá para trocar.
  if (visao.opcoes.length <= 1) {
    return (
      <span className="flex min-h-11 max-w-[11rem] items-center gap-2 truncate px-1 text-[13px] text-suave sm:max-w-[16rem]">
        <Store size={16} aria-hidden className="shrink-0" />
        <span className="truncate">{atual?.rotulo ?? 'Sem loja no seu acesso'}</span>
      </span>
    );
  }
  return (
    <Popover
      classeDoWrapper="min-w-0 shrink-0 max-w-[11rem] sm:max-w-[16rem]"
      rotulo={`Visão: ${atual?.rotulo ?? ''}. Trocar`}
      classeDoBotao={GATILHO}
      largura="w-64"
      conteudoDoBotao={
        <>
          <Store size={16} aria-hidden className="shrink-0 text-suave" />
          <span className="truncate">
            {pendente ? (
              'Trocando…'
            ) : (
              <>
                {/* No celular, "Rede Completa" vira "Rede": o nome inteiro não cabe ao lado dos botões e cortava. */}
                {/* 24/10: até 1280 px (tablet) o topo é disputado pela trilha: "Rede" curto; o nome inteiro só no computador. */}
                <span className="xl:hidden">{atual?.rotulo === 'Rede Completa' ? 'Rede' : atual?.rotulo}</span>
                <span className="hidden xl:inline">{atual?.rotulo}</span>
              </>
            )}
          </span>
          <ChevronDown size={14} aria-hidden className="shrink-0 text-suave" />
        </>
      }
    >
      {(fechar) => (
        <ListaDeOpcoes
          opcoes={visao.opcoes}
          valor={visao.valor}
          erro={erro}
          aoEscolher={(v) =>
            iniciar(async () => {
              const r = await visao.escolher(v);
              if (!r.ok) return setErro(r.mensagem);
              setErro(null);
              fechar();
              router.refresh();
            })
          }
        />
      )}
    </Popover>
  );
}

function DoNivel1({ visao }: { visao: VisaoDoNivel1 }) {
  const router = useRouter();
  const caminho = usePathname();
  const slug = slugNoCaminho(caminho);
  const parceiro = slug ? visao.parceiros.find((p) => p.slug === slug) : undefined;
  const [lojas, setLojas] = useState<{ opcoes: OpcaoDeVisao[]; valor: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const carregar = useRef(visao.carregar);
  carregar.current = visao.carregar;
  const slugDoParceiro = parceiro?.slug;
  useEffect(() => {
    setLojas(null);
    if (!slugDoParceiro) return;
    let vivo = true;
    carregar.current(slugDoParceiro).then((r) => vivo && setLojas(r));
    return () => {
      vivo = false;
    };
  }, [slugDoParceiro]);

  const rotuloDaLoja = lojas?.opcoes.find((o) => o.valor === lojas.valor)?.rotulo;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Popover
        classeDoWrapper="min-w-0 max-w-[11rem] sm:max-w-[16rem]"
        rotulo={`Parceiro: ${parceiro?.nome ?? 'FlowFoods, todos'}. Trocar`}
        classeDoBotao={GATILHO}
        largura="w-72"
        conteudoDoBotao={
          <>
            <span className="truncate">{parceiro?.nome ?? 'FlowFoods · todos'}</span>
            <ChevronDown size={14} aria-hidden className="shrink-0 text-suave" />
          </>
        }
      >
        {(fechar) => (
          <ul aria-label="Parceiros" className="max-h-[60vh] overflow-y-auto">
            <li>
              <Link
                href="/rodolfo/erp"
                onClick={fechar}
                className="ff-transicao flex min-h-11 items-center rounded-[8px] px-3 text-[14px] hover:bg-texto/5"
              >
                FlowFoods · todos os parceiros
              </Link>
            </li>
            {visao.parceiros.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/rodolfo/erp/${p.slug}`}
                  onClick={fechar}
                  aria-current={p.slug === slug ? 'true' : undefined}
                  className="ff-transicao flex min-h-11 items-center justify-between gap-3 rounded-[8px] px-3 text-[14px] hover:bg-texto/5 aria-[current=true]:font-semibold"
                >
                  <span className="truncate">{p.nome}</span>
                  <span className="shrink-0 text-[12px] text-suave">{p.rotuloStatus}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Popover>
      {parceiro && lojas && lojas.opcoes.length > 1 && (
        <Popover
          classeDoWrapper="min-w-0 max-w-[11rem] sm:max-w-[16rem]"
          rotulo={`Visão: ${rotuloDaLoja ?? ''}. Trocar`}
          classeDoBotao={`${GATILHO} hidden md:flex`}
          largura="w-64"
          conteudoDoBotao={
            <>
              <Store size={16} aria-hidden className="shrink-0 text-suave" />
              <span className="truncate">{pendente ? 'Trocando…' : rotuloDaLoja}</span>
              <ChevronDown size={14} aria-hidden className="shrink-0 text-suave" />
            </>
          }
        >
          {(fechar) => (
            <ListaDeOpcoes
              opcoes={lojas.opcoes}
              valor={lojas.valor}
              erro={erro}
              aoEscolher={(v) =>
                iniciar(async () => {
                  const r = await visao.escolher(parceiro.slug, v);
                  if (!r.ok) return setErro(r.mensagem);
                  setErro(null);
                  setLojas({ ...lojas, valor: v });
                  fechar();
                  router.refresh();
                })
              }
            />
          )}
        </Popover>
      )}
    </div>
  );
}
