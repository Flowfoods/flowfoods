'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { IdentidadeDoCabecalho } from '@/lib/erp/marca-cabecalho';
import type { PropsDoShell } from './tipos';
import { MenuUsuario } from './MenuUsuario';
import { Popover } from './Popover';
import { ImagemDeIdentidade } from './ImagemDeIdentidade';

export function CabecalhoIdentidade({ props, slug, inicio, menuRecolhido }: { props: PropsDoShell; slug: string | null; inicio: string; menuRecolhido: boolean }) {
  const identidade = props.identidade;
  const chave = `${props.chaveDoContexto ?? ''}:${slug ?? ''}`;
  const [carregado, setCarregado] = useState<{ chave: string; dados: IdentidadeDoCabecalho } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  const geracao = useRef(0);
  const carregar = identidade?.modo === 'nivel1' ? identidade.carregar : null;
  const revisao = identidade?.modo === 'nivel1' ? identidade.revisao : null;

  useEffect(() => {
    let vigente = true;
    geracao.current++;
    setPendente(false);
    setFalha(null);
    setCarregado(null);
    if (carregar && slug) {
      void carregar(slug).then((dados) => {
        if (vigente) setCarregado({ chave, dados });
      }).catch(() => { if (vigente) setFalha('Não foi possível carregar as marcas. Recarregue a página.'); });
    }
    return () => { vigente = false; geracao.current++; };
  }, [carregar, slug, chave, revisao]);

  const dados = identidade?.modo === 'parceiro' ? identidade.dados : carregado?.chave === chave ? carregado.dados : null;
  // O cookie altera e revalida o layout. A seleção vem sempre do servidor,
  // inclusive após refresh motivado por outra aba; não manter uma cópia otimista antiga.
  const id = dados?.selecionada;
  const marca = dados?.marcas.find((m) => m.id === id) ?? dados?.marcas[0];

  async function escolher(id: string, fechar: () => void) {
    if (!identidade || pendente || !dados?.marcas.some((m) => m.id === id)) return;
    const atual = geracao.current;
    setPendente(true);
    setFalha(null);
    try {
      const r = identidade.modo === 'parceiro' ? await identidade.escolher(id) : slug ? await identidade.escolher(slug, id) : null;
      if (atual !== geracao.current) return;
      if (!r?.ok) { setFalha(r?.mensagem ?? 'Não foi possível trocar a marca. Tente novamente.'); return; }
      fechar();
    } catch { if (atual === geracao.current) setFalha('Não foi possível trocar a marca. Tente novamente.'); }
    finally { if (atual === geracao.current) setPendente(false); }
  }

  return (
    <header className="ff-cabecalho-identidade ff-material" data-menu={menuRecolhido ? 'recolhido' : 'expandido'} aria-label="Identidade do sistema">
      <div className="ff-cabecalho-grade">
        <Link href={inicio} className="ff-assinatura-central" aria-label="FlowFoods — início. BARNEY OS">
          <span className="ff-logo-janela" aria-hidden>
            {/* Originais recortados com transparência; o CSS acompanha o tema antes da hidratação. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ff-logo-claro" src="/identidade/flowfoods-claro-transparente.png" alt="" width={1080} height={1080} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ff-logo-escuro" src="/identidade/flowfoods-escuro-transparente.png" alt="" width={1080} height={1080} />
          </span>
          <span className="ff-barney-os">BARNEY <span>OS</span></span>
        </Link>
        <div className="ff-cabecalho-marca" aria-busy={pendente}>
          {dados ? <Popover
            rotulo={`Marca no cabeçalho: ${marca?.nome ?? 'nenhuma cadastrada'}`}
            classeDoWrapper="w-full"
            classeDoBotao="ff-marca-selecionada ff-transicao"
            alinhar="esquerda"
            conteudoDoBotao={<>
              <span className="ff-marca-imagem" aria-hidden><ImagemDeIdentidade key={marca?.logoUrl ?? marca?.id} url={marca?.logoUrl} nome={marca?.nome ?? dados.nomeParceiro} /></span>
              <span className="sr-only">Marca selecionada</span>
              <span className="ff-marca-nome">{marca?.nome ?? dados.nomeParceiro}</span>
              <ChevronDown size={15} className="ff-marca-seta" aria-hidden />
            </>}
          >{(fechar) => <div>
            <p className="px-3 py-2 text-[12px] text-suave">Marca no cabeçalho</p>
            <ul>{dados.marcas.map((m) => <li key={m.id}><button type="button" disabled={pendente} aria-pressed={marca?.id === m.id} onClick={() => void escolher(m.id, fechar)} className="flex min-h-11 w-full items-center gap-3 rounded-botao px-3 py-2 text-left text-[13px] hover:bg-texto/5 aria-pressed:bg-forte disabled:opacity-60">
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-forte" aria-hidden><ImagemDeIdentidade key={m.logoUrl ?? m.id} url={m.logoUrl} nome={m.nome} /></span><span className="min-w-0 break-words">{m.nome}</span>
            </button></li>)}</ul>
            {dados.perfilHref && <Link onClick={fechar} href={dados.perfilHref} className="mt-2 block rounded-botao border-t border-linha px-3 py-3 text-[13px] hover:bg-texto/5">Identidade visual das marcas</Link>}
            {dados.marcas.length === 0 && <p className="px-3 py-2 text-[13px] text-suave">Nenhuma marca cadastrada.</p>}
          </div>}</Popover> : <p className="text-center text-[12px] text-suave">{slug && carregar ? 'Carregando marca…' : 'FlowFoods'}</p>}
          {falha && <p role="alert" className="mt-2 text-center text-[12px] text-erro">{falha}</p>}
        </div>
        <div className="ff-cabecalho-conta"><MenuUsuario usuario={props.usuario} tema={props.tema} links={props.links} sair={props.sair} /></div>
      </div>
    </header>
  );
}
