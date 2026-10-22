'use client';

/**
 * Formulários da tela de Categorias (I.1a): criar, e as ações de uma linha (subir, descer, renomear, desativar ou reativar,
 * excluir). Tudo vai como texto e o servidor decide (permissão `insumos.categorias`, nome único sem caixa nem acento, a do
 * sistema que não se mexe, excluir só sem uso). Erro volta ao lado do campo, sem apagar o que foi digitado. Um painel de ação
 * por vez por linha, aberto por botão (`aria-expanded`), e os botões têm 44 px no toque.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { LinhaDeCategoria } from '@/lib/erp/categorias';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { FormSituacao } from '../cadastro/form-situacao';
import { ErroGeral } from '../cadastro/erros';
import { SalvandoAnunciado, useAcaoSegura } from '../cadastro/anuncio';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';

export function FormNovaCategoria({ acao, bloqueio }: { acao: AcaoDeCadastro; bloqueio: string | null }) {
  const segura = useAcaoSegura(acao);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(segura, null);
  const erros = estado?.erros ?? {};
  return (
    <form action={enviar} noValidate className="space-y-3">
      <SalvandoAnunciado />
      <ErroGeral estado={estado} recarregar="" />
      <fieldset disabled={!!bloqueio} className="min-w-0">
        <label htmlFor="categoria-nome" className={ROTULO}>
          Nome da categoria<span className="font-normal text-suave"> (obrigatório)</span>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="categoria-nome"
            name="nome"
            required
            aria-required="true"
            maxLength={60}
            autoComplete="off"
            placeholder="Ex.: Frios e queijos"
            className={`${CAMPO} sm:max-w-sm`}
            aria-invalid={!!erros.nome}
            aria-describedby={['categoria-nome-ajuda', erros.nome ? 'categoria-nome-erro' : ''].filter(Boolean).join(' ')}
          />
          <BotaoEnviar className="sm:min-w-44" pendente="Criando…">
            Criar categoria
          </BotaoEnviar>
        </div>
        <p id="categoria-nome-ajuda" className={AJUDA}>
          Vale para a rede inteira. Entra antes de “Outros / a classificar”; use Subir e Descer para pôr onde quiser.
        </p>
        <Erro id="categoria-nome-erro" texto={erros.nome} />
      </fieldset>
      {bloqueio && <p className="text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}

type Painel = 'renomear' | 'situacao' | 'excluir' | null;

/** Subir ou descer uma posição: form de verdade (funciona sem JS), botão de 44 px no toque. */
function BotaoDeOrdem({ acao, sentido, nome, desabilitado }: { acao: () => Promise<void>; sentido: 'subir' | 'descer'; nome: string; desabilitado: boolean }) {
  const Seta = sentido === 'subir' ? ArrowUp : ArrowDown;
  return (
    <form action={acao}>
      <button
        type="submit"
        disabled={desabilitado}
        aria-label={`${sentido === 'subir' ? 'Subir' : 'Descer'} ${nome} na lista`}
        className={classeDeBotao('secundario', 'w-11 px-0 sm:min-h-10')}
      >
        <Seta size={16} aria-hidden />
      </button>
    </form>
  );
}

function FormRenomear({ acao, nome, versao }: { acao: AcaoDeCadastro; nome: string; versao: string }) {
  const segura = useAcaoSegura(acao);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(segura, null);
  const erros = estado?.erros ?? {};
  const id = `renomear-${versao.replace(/\W/g, '')}`;
  return (
    <form action={enviar} noValidate className="space-y-3">
      <input type="hidden" name="versao" value={versao} />
      <SalvandoAnunciado />
      <ErroGeral estado={estado} recarregar="" />
      <div>
        <label htmlFor={id} className={ROTULO}>
          Novo nome
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={id}
            name="nome"
            required
            aria-required="true"
            maxLength={60}
            autoComplete="off"
            defaultValue={nome}
            className={`${CAMPO} sm:max-w-sm`}
            aria-invalid={!!erros.nome}
            aria-describedby={erros.nome ? `${id}-erro` : undefined}
          />
          <BotaoEnviar className="sm:min-w-36" pendente="Salvando…">
            Salvar nome
          </BotaoEnviar>
        </div>
        <Erro id={`${id}-erro`} texto={erros.nome} />
      </div>
    </form>
  );
}

function FormExcluir({ acao, nome }: { acao: AcaoDeCadastro; nome: string }) {
  const segura = useAcaoSegura(acao);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(segura, null);
  return (
    <form action={enviar} className="space-y-3">
      <SalvandoAnunciado texto="Excluindo…" />
      <p className="text-sm text-suave">
        Excluir apaga “{nome}” de vez. Só dá para excluir uma categoria que nunca foi usada: se algum insumo já esteve nela, o histórico guarda isso e o caminho é
        desativar.
      </p>
      <ErroGeral estado={estado} recarregar="" />
      <BotaoEnviar variante="perigo" pendente="Excluindo…">
        Excluir categoria
      </BotaoEnviar>
    </form>
  );
}

export interface AcoesDaLinha {
  renomear: AcaoDeCadastro;
  situacao: AcaoDeCadastro;
  excluir: AcaoDeCadastro;
  subir: () => Promise<void>;
  descer: () => Promise<void>;
}

/** Os botões de uma linha da lista, e o painel da ação aberta (um de cada vez). */
export function AcoesDaCategoria({ categoria: c, acoes, primeira, ultima }: { categoria: LinhaDeCategoria; acoes: AcoesDaLinha; primeira: boolean; ultima: boolean }) {
  const [aberto, setAberto] = useState<Painel>(null);
  const alternar = (p: Exclude<Painel, null>) => setAberto((a) => (a === p ? null : p));
  const idPainel = `acao-${c.id}`;
  if (c.sistema) {
    return <p className="text-[12px] text-suave lg:max-w-[18rem] lg:text-right">Do sistema: fica sempre por último e não muda de nome, não se desativa e não se exclui.</p>;
  }
  const botao = (p: Exclude<Painel, null>, rotulo: string) => (
    <button
      type="button"
      onClick={() => alternar(p)}
      aria-expanded={aberto === p}
      aria-controls={idPainel}
      className={classeDeBotao(aberto === p ? 'primario' : 'secundario', 'sm:min-h-10')}
    >
      {rotulo}
      <span className="sr-only"> “{c.nome}”</span>
    </button>
  );
  return (
    <div className="min-w-0 lg:flex lg:flex-col lg:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <BotaoDeOrdem acao={acoes.subir} sentido="subir" nome={c.nome} desabilitado={primeira} />
        <BotaoDeOrdem acao={acoes.descer} sentido="descer" nome={c.nome} desabilitado={ultima} />
        {botao('renomear', 'Renomear')}
        {botao('situacao', c.ativa ? 'Desativar' : 'Reativar')}
        {c.nInsumos === 0 && botao('excluir', 'Excluir')}
      </div>
      {aberto && (
        <div id={idPainel} className="mt-3 w-full rounded-[10px] border border-linha bg-forte/40 p-3 sm:p-4 lg:max-w-xl">
          {aberto === 'renomear' && <FormRenomear acao={acoes.renomear} nome={c.nome} versao={c.versao} />}
          {aberto === 'situacao' && (
            <FormSituacao
              acao={acoes.situacao}
              ativo={c.ativa}
              oQue="categoria"
              idBase={`situacao-${c.id}`}
              textos={{
                desativar: `Desativar tira “${c.nome}” da lista que se oferece ao cadastrar. Nada é apagado: ${c.nInsumos === 0 ? 'nenhum insumo está nela agora' : c.nInsumos === 1 ? 'o insumo que está nela continua nela' : `os ${c.nInsumos} insumos que estão nela continuam nela`} e o histórico fica.`,
                reativar: `“${c.nome}” está desativada. Reativar volta a oferecê-la nos cadastros novos.`,
              }}
            />
          )}
          {aberto === 'excluir' && <FormExcluir acao={acoes.excluir} nome={c.nome} />}
        </div>
      )}
      {c.nInsumos > 0 && (
        <p className="mt-2 text-[12px] text-suave lg:text-right">Tem insumos, por isso não se exclui; dá para desativar.</p>
      )}
    </div>
  );
}
