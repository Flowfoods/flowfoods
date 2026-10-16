'use client';

/**
 * Cadastro de insumo (formulário da 0.2, só reestilizado no shell; o
 * formulário completo da 1.1 é o Cartão B). Peças do design system do ERP:
 * nada de rótulo, campo ou botão copiado aqui.
 */

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro, ROTULO } from '../../ui/campos';
import { Segmentos } from '../../ui/segmentos';
import type { EstadoCadastro } from './estado';
import {
  UNIDADES,
  custoPorUnidadeBase,
  formatarDinheiro,
  lerDinheiro,
  lerQuantidade,
  type Unidade,
} from '@/lib/erp/unidades';

/** `acao`: a server action de quem usa a tela (nível 1 por slug, ou a pessoa do parceiro pela sessão). */
export function FormInsumo({
  acao: acaoDoServidor,
}: {
  acao: (anterior: EstadoCadastro, form: FormData) => Promise<EstadoCadastro>;
}) {
  const [estado, acao] = useFormState<EstadoCadastro, FormData>(acaoDoServidor, null);
  const [unidade, setUnidade] = useState<Unidade>('KG');
  const [conteudo, setConteudo] = useState('');
  const [preco, setPreco] = useState('');
  const nomeRef = useRef<HTMLInputElement>(null);

  // Depois de salvar: limpa e devolve o foco ao nome, pronto para o próximo.
  useEffect(() => {
    if (estado?.ok) {
      setConteudo('');
      setPreco('');
      if (nomeRef.current) {
        nomeRef.current.value = '';
        nomeRef.current.focus();
      }
    }
  }, [estado]);

  const erros = estado && !estado.ok ? estado.erros : {};
  const u = UNIDADES[unidade];

  // Só prévia: o custo que vale é o que o servidor calcula e grava.
  const q = lerQuantidade(conteudo);
  const p = lerDinheiro(preco);
  const previa = q && p !== null ? formatarDinheiro(custoPorUnidadeBase(p, q)) : null;

  return (
    <form action={acao} className="space-y-4" noValidate>
      <div>
        <label htmlFor="nome" className={ROTULO}>
          Nome do insumo
        </label>
        <input
          ref={nomeRef}
          id="nome"
          name="nome"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Ex.: Blend bovino 180 g"
          className={CAMPO}
          aria-invalid={!!erros.nome}
          aria-describedby="nome-erro"
        />
        <Erro id="nome-erro" texto={erros.nome} />
      </div>

      <Segmentos
        nome="unidade"
        legenda="Unidade base"
        opcoes={(Object.keys(UNIDADES) as Unidade[]).map((k) => [k, UNIDADES[k].nome] as const)}
        valor={unidade}
        aoMudar={setUnidade}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="conteudo" className={ROTULO}>
            Embalagem
          </label>
          <div className="relative">
            <input
              id="conteudo"
              name="conteudo"
              inputMode="decimal"
              placeholder="5"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              className={`${CAMPO} pr-10 text-right tabular-nums`}
              aria-invalid={!!erros.conteudo}
              aria-describedby="conteudo-erro"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-suave">
              {u.sigla}
            </span>
          </div>
          <Erro id="conteudo-erro" texto={erros.conteudo} />
        </div>
        <div>
          <label htmlFor="preco" className={ROTULO}>
            Preço pago
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[12px] text-suave">
              R$
            </span>
            <input
              id="preco"
              name="preco"
              inputMode="decimal"
              placeholder="89,90"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              className={`${CAMPO} pl-9 text-right tabular-nums`}
              aria-invalid={!!erros.preco}
              aria-describedby="preco-erro"
            />
          </div>
          <Erro id="preco-erro" texto={erros.preco} />
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-linha pt-3 text-[13px]">
        <span className="text-suave">Custo por {u.sigla}</span>
        <span className="font-display text-lg font-bold tabular-nums text-texto">
          {previa ?? <span className="text-suave">—</span>}
        </span>
      </div>

      {erros.geral && <p className="text-[13px] text-erro">{erros.geral}</p>}
      <BotaoEnviar className="w-full">Cadastrar insumo</BotaoEnviar>
      <p aria-live="polite" className="min-h-[1.25rem] text-center text-[13px] text-ok">
        {estado?.ok ? `“${estado.nome}” cadastrado.` : ''}
      </p>
    </form>
  );
}
