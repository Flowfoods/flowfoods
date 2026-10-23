'use client';

/**
 * O lote do fornecedor de um insumo da nota (3.4): registrar como está na embalagem (lote, vencimento, fabricação, marca; pelo
 * menos o lote ou o vencimento), aceitar a sugestão do XML com um toque (nada entra sozinho) ou tirar um registrado por engano
 * (só se ninguém abriu embalagem dele). A nota não muda.
 */

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { diaPorExtenso } from '@/lib/erp/etiqueta-campos';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro, ROTULO } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';
import { chaveNova } from './conteudo';

function useChave(inicial: string) {
  const [envio, setEnvio] = useState(inicial);
  useEffect(() => setEnvio(chaveNova()), []);
  return envio;
}

function ErroGeral({ estado }: { estado: EstadoEstoque }) {
  if (!estado?.erros.geral) return null;
  return (
    <p role="alert" className="text-[13px] text-erro">
      {estado.erros.geral}
    </p>
  );
}

export function FormLoteDaNota({ acao, insumoId, envioInicial, marcaReferencia }: { acao: AcaoDeEstoque; insumoId: string; envioInicial: string; marcaReferencia?: string | null }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const envio = useChave(envioInicial);
  const e = estado?.erros ?? {};
  const id = (c: string) => `lote-${insumoId}-${c}`;
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="envio" value={envio} />
      <input type="hidden" name="insumo" value={insumoId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id('codigo')} className={ROTULO}>
            Lote <span className="font-normal text-suave">(como está impresso)</span>
          </label>
          <input id={id('codigo')} name="codigo" maxLength={40} autoComplete="off" className={CAMPO} aria-invalid={!!e.codigo} aria-describedby={e.codigo ? id('codigo-erro') : undefined} />
          <Erro id={id('codigo-erro')} texto={e.codigo} />
        </div>
        <div>
          <label htmlFor={id('vencimento')} className={ROTULO}>
            Vencimento
          </label>
          <CampoData id={id('vencimento')} name="vencimento" aria-invalid={!!e.vencimento} aria-describedby={e.vencimento ? id('vencimento-erro') : undefined} />
          <Erro id={id('vencimento-erro')} texto={e.vencimento} />
        </div>
        <div>
          <label htmlFor={id('fabricacao')} className={ROTULO}>
            Fabricação <span className="font-normal text-suave">(opcional)</span>
          </label>
          <CampoData id={id('fabricacao')} name="fabricacao" aria-invalid={!!e.fabricacao} aria-describedby={e.fabricacao ? id('fabricacao-erro') : undefined} />
          <Erro id={id('fabricacao-erro')} texto={e.fabricacao} />
        </div>
        <div>
          <label htmlFor={id('marca')} className={ROTULO}>
            Marca que veio <span className="font-normal text-suave">(opcional)</span>
          </label>
          <input id={id('marca')} name="marca" maxLength={80} autoComplete="off" placeholder={marcaReferencia ?? undefined} className={CAMPO} aria-invalid={!!e.marca} aria-describedby={e.marca ? id('marca-erro') : undefined} />
          <Erro id={id('marca-erro')} texto={e.marca} />
        </div>
      </div>
      <Erro id={id('insumo-erro')} texto={e.insumo} />
      <ErroGeral estado={estado} />
      <BotaoEnviar pendente="Registrando…" variante="secundario">
        Registrar o lote
      </BotaoEnviar>
    </form>
  );
}

export function FormUsarSugestao({ acao, insumoId, envioInicial, sugestao }: { acao: AcaoDeEstoque; insumoId: string; envioInicial: string; sugestao: { codigo: string; vencimento: string | null; fabricacao: string | null } }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const envio = useChave(envioInicial);
  const e = estado?.erros ?? {};
  const erro = e.geral ?? e.codigo ?? e.vencimento ?? e.fabricacao;
  return (
    <form action={enviar} className="flex flex-col items-start gap-1.5">
      <input type="hidden" name="envio" value={envio} />
      <input type="hidden" name="insumo" value={insumoId} />
      <input type="hidden" name="codigo" value={sugestao.codigo} />
      <input type="hidden" name="vencimento" value={sugestao.vencimento ?? ''} />
      <input type="hidden" name="fabricacao" value={sugestao.fabricacao ?? ''} />
      <input type="hidden" name="xml" value="sim" />
      <BotaoEnviar pendente="Registrando…" variante="secundario">
        Registrar como no XML
      </BotaoEnviar>
      {erro && (
        <p role="alert" className="text-[13px] text-erro">
          {erro}
        </p>
      )}
      <span className="sr-only">
        Lote {sugestao.codigo}
        {sugestao.vencimento ? `, vence ${diaPorExtenso(sugestao.vencimento)}` : ''}
      </span>
    </form>
  );
}

export function FormTirarLote({ acao, loteId, rotulo }: { acao: AcaoDeEstoque; loteId: string; rotulo: string }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  return (
    <form action={enviar} className="flex flex-col items-end gap-1">
      <input type="hidden" name="lote" value={loteId} />
      <BotaoEnviar pendente="Tirando…" variante="fantasma" className="min-h-11">
        Tirar<span className="sr-only"> o {rotulo}</span>
      </BotaoEnviar>
      <ErroGeral estado={estado} />
    </form>
  );
}
