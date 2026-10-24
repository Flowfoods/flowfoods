'use client';

/**
 * F4 — "Fotos da ficha": a principal (a capa) e as de apoio, com escolha explícita da principal, legenda, ordem e
 * remoção. Câmera ou galeria; a foto é redesenhada aqui (como no formulário) e enviada pela rota própria antes de
 * entrar na ficha. Cada botão é um formulário com a versão lida: tela velha dá conflito no servidor.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { FotosDaFicha } from '@/lib/erp/ficha-fotos';
import { LEGENDA_MAX, MAXIMO_DE_APOIOS } from '@/lib/erp/ficha-fotos-campos';
import { LIMITE_DA_FOTO } from '@/lib/erp/foto';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Aviso, Painel, Vazio } from '../../ui/superficies';
import type { EstadoDasFotos } from './estado';
import { enviarFoto, reduzir } from './campo-foto';

type Acao = (anterior: EstadoDasFotos, form: FormData) => Promise<EstadoDasFotos>;

const ICONE = 'ff-transicao inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[7px] border border-linha-forte text-texto hover:bg-texto/5 disabled:opacity-40';

export function TelaFotosDaFicha({ fotos: f, base, acao, bloqueio }: { fotos: FotosDaFicha; base: string; acao: Acao; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoDasFotos, FormData>(acao, null);
  const [enviando, setEnviando] = useState(false);
  const [erroDoEnvio, setErroDoEnvio] = useState<string | null>(null);
  const url = (arquivo: string, apoio: boolean) => `${base}/${f.id}/foto?${apoio ? `apoio=${arquivo}` : `v=${arquivo.slice(0, 12)}`}`;
  const travado = !!bloqueio || !f.ativa;
  const cheio = f.apoios.length >= MAXIMO_DE_APOIOS;
  const V = <input type="hidden" name="versao" value={f.versao} />;

  async function escolheu(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    e.target.value = '';
    setErroDoEnvio(null);
    if (!original) return;
    setEnviando(true);
    try {
      const pronta = await reduzir(original);
      const r = pronta.size > LIMITE_DA_FOTO ? { erro: 'Foto acima de 8 MB: escolha outra.' } : await enviarFoto(`${base}/fotos`, pronta);
      if ('erro' in r) return setErroDoEnvio(r.erro);
      const form = new FormData();
      form.set('tipo', 'adicionar');
      form.set('versao', f.versao);
      form.set('enviada', r.arquivo);
      enviar(form);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      {estado && (
        <div role="status" aria-live="polite">
          <Aviso tom={estado.ok ? 'ok' : 'alerta'} titulo={estado.frase} />
        </div>
      )}
      {!f.ativa && <Aviso tom="alerta" titulo="Ficha desativada: reative no detalhe antes de mexer nas fotos." />}
      {bloqueio && <Aviso tom="alerta" titulo={bloqueio} />}

      <Painel titulo="Foto principal" subtitulo="A capa da ficha: aparece na lista, no detalhe e na impressão">
        {f.principal ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto privada servida pelo portão do parceiro. */}
            <img src={url(f.principal.arquivo, false)} alt={`Foto principal de ${f.nome}`} className="aspect-[4/3] w-full rounded-[10px] border border-linha object-cover sm:w-72" />
            <form action={enviar} className="min-w-0 flex-1 space-y-3">
              {V}
              <input type="hidden" name="tipo" value="removerPrincipal" />
              <p className="text-sm text-suave">Para tirar a principal, diga qual fica no lugar dela. As fotos de apoio não são apagadas.</p>
              <div>
                <label htmlFor="substituta" className={ROTULO}>
                  No lugar dela
                </label>
                <select id="substituta" name="substituta" required defaultValue="" className={`${CAMPO} pr-8`} disabled={travado}>
                  <option value="" disabled>
                    Escolha
                  </option>
                  {f.apoios.map((a, n) => (
                    <option key={a.arquivo} value={a.arquivo}>
                      Foto de apoio {n + 1}
                      {a.legenda ? `: ${a.legenda}` : ''}
                    </option>
                  ))}
                  <option value="nenhuma">Ficar sem foto principal</option>
                </select>
              </div>
              <BotaoEnviar variante="secundario" pendente="Tirando…" disabled={travado}>
                Tirar a principal
              </BotaoEnviar>
            </form>
          </div>
        ) : (
          <p className="text-sm text-texto">
            Sem foto principal. {f.apoios.length > 0 ? 'Escolha uma das fotos de apoio abaixo em “Tornar principal”.' : 'Envie uma foto e depois escolha “Tornar principal”.'}
          </p>
        )}
      </Painel>

      <Painel titulo="Fotos de apoio" subtitulo={`Detalhe do prato, corte, montagem ou etapas · ${f.apoios.length} de ${MAXIMO_DE_APOIOS}`} semRespiro>
        {f.apoios.length === 0 ? (
          <Vazio>Nenhuma foto de apoio ainda.</Vazio>
        ) : (
          <ol className="divide-y divide-linha">
            {f.apoios.map((a, n) => (
              <li key={a.arquivo} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto privada servida pelo portão do parceiro. */}
                <img src={url(a.arquivo, true)} alt={a.legenda ? `Foto de apoio ${n + 1}: ${a.legenda}` : `Foto de apoio ${n + 1} de ${f.nome}`} className="aspect-[4/3] w-full rounded-[8px] border border-linha object-cover sm:w-44" />
                <div className="min-w-0 flex-1 space-y-2">
                  <form action={enviar} className="flex gap-2">
                    {V}
                    <input type="hidden" name="tipo" value="legenda" />
                    <input type="hidden" name="arquivo" value={a.arquivo} />
                    <label htmlFor={`legenda-${n}`} className="sr-only">
                      Legenda da foto de apoio {n + 1}
                    </label>
                    <input id={`legenda-${n}`} name="legenda" defaultValue={a.legenda ?? ''} maxLength={LEGENDA_MAX} placeholder="Legenda (opcional): ex. ponto da carne" className={`${CAMPO} min-w-0 flex-1`} disabled={travado} />
                    <BotaoEnviar variante="secundario" pendente="Salvando…" disabled={travado}>
                      Salvar
                    </BotaoEnviar>
                  </form>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={enviar}>
                      {V}
                      <input type="hidden" name="tipo" value="mover" />
                      <input type="hidden" name="arquivo" value={a.arquivo} />
                      <input type="hidden" name="para" value="cima" />
                      <button type="submit" className={ICONE} aria-label={`Subir a foto de apoio ${n + 1}`} title="Subir" disabled={travado || n === 0}>
                        <ArrowUp size={16} aria-hidden />
                      </button>
                    </form>
                    <form action={enviar}>
                      {V}
                      <input type="hidden" name="tipo" value="mover" />
                      <input type="hidden" name="arquivo" value={a.arquivo} />
                      <input type="hidden" name="para" value="baixo" />
                      <button type="submit" className={ICONE} aria-label={`Descer a foto de apoio ${n + 1}`} title="Descer" disabled={travado || n === f.apoios.length - 1}>
                        <ArrowDown size={16} aria-hidden />
                      </button>
                    </form>
                    <form action={enviar}>
                      {V}
                      <input type="hidden" name="tipo" value="principal" />
                      <input type="hidden" name="arquivo" value={a.arquivo} />
                      <BotaoEnviar variante="secundario" pendente="Trocando…" disabled={travado}>
                        Tornar principal
                      </BotaoEnviar>
                    </form>
                    <form action={enviar}>
                      {V}
                      <input type="hidden" name="tipo" value="remover" />
                      <input type="hidden" name="arquivo" value={a.arquivo} />
                      <BotaoEnviar variante="fantasma" pendente="Removendo…" disabled={travado}>
                        Remover
                      </BotaoEnviar>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="space-y-2 border-t border-linha px-4 py-4 sm:px-5">
          {cheio ? (
            <p className="text-sm text-suave">Chegou a {MAXIMO_DE_APOIOS} fotos de apoio: remova uma para pôr outra.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <label className={`${classeDeBotao('secundario')} cursor-pointer ${travado || enviando ? 'pointer-events-none opacity-50' : ''}`}>
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={escolheu} disabled={travado || enviando} />
                Tirar foto
              </label>
              <label className={`${classeDeBotao('secundario')} cursor-pointer ${travado || enviando ? 'pointer-events-none opacity-50' : ''}`}>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={escolheu} disabled={travado || enviando} />
                Escolher da galeria
              </label>
            </div>
          )}
          <p className="text-[12px] text-suave" aria-live="polite">
            {enviando ? 'Enviando a foto…' : 'JPG, PNG ou WebP. A foto entra como apoio; para virar a capa, use “Tornar principal”.'}
          </p>
          {erroDoEnvio && <p className="text-[13px] text-erro">{erroDoEnvio}</p>}
        </div>
      </Painel>
    </div>
  );
}
