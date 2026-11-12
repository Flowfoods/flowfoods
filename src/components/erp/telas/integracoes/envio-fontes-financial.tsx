'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Campo, CAMPO } from '@/components/erp/ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '@/components/erp/ui/estilos';

export type ConexaoParaEnvio = { id: string; nome: string; modeloHref: string };

export function EnvioFontesFinancial({ conexao, base, loja, competencia, retorno }: {
  conexao: ConexaoParaEnvio; base: string; loja: string; competencia: string; retorno: string;
}) {
  const router = useRouter();
  const [ocupado, ocupar] = useState(false);
  const [aviso, avisar] = useState<{ ok: boolean; texto: string } | null>(null);
  const enviando = useRef(false);
  const query = new URLSearchParams({ loja, conexao: conexao.id, competencia });
  const destino = `${base}/fontes?${query}`;

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando.current) return;
    const form = e.currentTarget;
    const dados = new FormData(form);
    const itens = [dados.get('arquivo'), dados.get('manifesto')];
    if (itens.some(f => !(f instanceof File) || !f.size || f.size > 2 * 1024 * 1024)) {
      avisar({ ok: false, texto: 'Selecione os dois arquivos preenchidos, com até 2 MiB cada.' });
      return;
    }
    enviando.current = true;
    ocupar(true);
    avisar(null);
    try {
      const resposta = await fetch(destino, { method: 'POST', body: dados, credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (resposta.redirected || resposta.status === 401) {
        avisar({ ok: false, texto: 'Sua sessão terminou. Entre novamente na central.' });
        return;
      }
      const recibo = await resposta.json();
      if (!resposta.ok || typeof recibo.reciboId !== 'string') {
        avisar({ ok: false, texto: recibo.mensagem ?? 'Não foi possível registrar os arquivos. Tente novamente.' });
        return;
      }
      avisar({ ok: true, texto: recibo.reenvio ? `Este pacote já estava registrado. Recibo ${recibo.reciboId}.` : `Pacote recebido para conferência. Recibo ${recibo.reciboId}.` });
      form.reset();
      const busca = new URLSearchParams(window.location.search);
      if (recibo.reenvio || busca.has('pagina') || busca.has('recibo') || busca.has('erroEnvio'))
        router.replace(`${retorno}&recibo=${encodeURIComponent(recibo.reciboId)}`, { scroll: false });
      router.refresh();
    } catch {
      avisar({ ok: false, texto: 'A confirmação não chegou. Reenviar os mesmos arquivos recupera o recibo já registrado.' });
    } finally {
      enviando.current = false;
      ocupar(false);
    }
  }

  return <div className="space-y-4">
      <details className="rounded-[7px] border border-linha">
        <summary className="min-h-11 cursor-pointer p-3 text-sm font-medium">Como preparar o manifesto</summary>
        <div className="space-y-2 px-3 pb-3 text-[13px] text-suave">
          <p>O modelo traz a loja, a conexão e o mês selecionados. Preencha o protocolo, o SHA-256 e as contagens do CSV.gz recebido. Em <code>produto</code>, informe o código do produto financeiro dos eventos desta conferência.</p>
          <p>Em cada página de eventos, informe a consulta e copie a resposta original no campo de texto <code>corpo</code>. Declare todas as vigências de comissão e pagamento do mês em pontos-base. Por exemplo, 800 representa 8%.</p>
          <p>O recibo guarda as impressões dos arquivos, as contagens e as vigências declaradas. A conciliação financeira é uma etapa posterior.</p>
        </div>
      </details>
      <a href={conexao.modeloHref} download={`modelo-fontes-${competencia}.json`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Baixar modelo do manifesto</a>
      <form key={conexao.id} method="post" encType="multipart/form-data" action={destino} onSubmit={enviar} aria-label="Registrar fontes para conferência" className="space-y-3">
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <Campo id="fontes-arquivo" rotulo="Arquivo mensal CSV.gz"><input id="fontes-arquivo" type="file" name="arquivo" accept=".gz,application/gzip" required className={CAMPO} disabled={ocupado} /></Campo>
          <Campo id="fontes-manifesto" rotulo="Manifesto JSON"><input id="fontes-manifesto" type="file" name="manifesto" accept=".json,application/json" required className={CAMPO} disabled={ocupado} /></Campo>
        </div>
        <button type="submit" disabled={ocupado} className={classeDeBotao('primario')}>{ocupado ? 'Registrando…' : 'Registrar recebimento'}</button>
      </form>
      {aviso && <p role={aviso.ok ? 'status' : 'alert'} className={`break-words text-sm ${aviso.ok ? 'text-ok' : 'text-erro'}`}>{aviso.texto}</p>}
    </div>;
}
