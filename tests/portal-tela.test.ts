/**
 * E5.1 · decisão 471 — o que a tela do Portal do cliente decide (`src/lib/portal/tela.ts`):
 *  - a barra sai dos cartões: um erro em qualquer cartão vence "Tudo salvo" (antes um anexo punha "Tudo salvo" com texto
 *    falhando; uma marcação que falhava deixava "Sem conexão" para sempre);
 *  - o selo diz "Não salvo" enquanto o cartão está em erro, e o nome da marcação quando marcado;
 *  - a confirmação do envio diz quando foi, em São Paulo; áudio gravado e não salvo e anexo subindo seguram o "Enviar";
 *  - o rascunho do aparelho só volta quando difere do que o servidor tem.
 */
import { describe, expect, it } from 'vitest';
import { bloqueioDoEnvio, chaveDoRascunho, rascunhosParaRecuperar, ROTULO_DA_BARRA, ROTULO_DO_CARTAO, seloDoCartao, statusGeral, textoDoEnviado } from '@/lib/portal/tela';

describe('E5.1 · Portal do cliente: estado, selo, envio e rascunho', () => {
  it('a barra sai dos cartões, com o erro na frente', () => {
    expect(statusGeral({})).toBe('ocioso');
    expect(statusGeral({ a: 'salvo', b: 'salvo' })).toBe('salvo');
    expect(statusGeral({ a: 'salvo' }, 1)).toBe('salvando');
    expect(statusGeral({ a: 'salvo', b: 'erro' }, 1)).toBe('erro');
    expect(statusGeral({ a: 'erro-marcar', b: 'salvo' })).toBe('erro-marcar');
    expect(statusGeral({ a: 'recusado', b: 'erro-marcar' })).toBe('recusado');
    expect(statusGeral({ a: 'erro', b: 'recusado' })).toBe('erro');
    expect(ROTULO_DA_BARRA['erro-marcar']).toBe('Uma marcação não salvou. Toque nela de novo.');
    expect(ROTULO_DA_BARRA.ocioso).toMatch(/Pode fechar e voltar por este link/);
    expect(ROTULO_DO_CARTAO['erro-marcar']).toBe('Não marcou. Toque de novo.');
    expect(ROTULO_DO_CARTAO.recusado).toMatch(/longo demais/);
  });

  it('o selo do cartão', () => {
    expect(seloDoCartao('RECEBIDO', 'erro', null)).toEqual({ rotulo: 'Não salvo', tom: 'erro' });
    expect(seloDoCartao('RECEBIDO', 'salvo', null)).toEqual({ rotulo: 'Respondido', tom: 'forte' });
    expect(seloDoCartao('MARCADO', 'salvo', 'Não tenho')).toEqual({ rotulo: 'Não tenho', tom: 'forte' });
    expect(seloDoCartao('PENDENTE', 'ocioso', null)).toEqual({ rotulo: 'Pendente', tom: 'suave' });
  });

  it('a confirmação do envio, em São Paulo', () => {
    expect(textoDoEnviado('2026-10-25T17:32:00.000Z')).toBe('Enviado ao Rodolfo em 25/10, às 14:32. O que você mudar continua salvo.');
  });

  it('áudio gravado e não salvo, ou anexo subindo, seguram o "Enviar"', () => {
    expect(bloqueioDoEnvio(0, 0)).toBeNull();
    expect(bloqueioDoEnvio(1, 0)).toBe('Há um áudio gravado que ainda não foi salvo. Toque em “Salvar áudio” no item.');
    expect(bloqueioDoEnvio(2, 1)).toMatch(/^Há 2 áudios gravados que ainda não foram salvos/);
    expect(bloqueioDoEnvio(0, 1)).toBe('Espere o anexo terminar de subir.');
  });

  it('o rascunho do aparelho só volta quando difere do servidor, e só para itens do formulário', () => {
    const r = rascunhosParaRecuperar({ a: 'novo texto', b: 'igual', c: 'item que não existe', d: 42 }, { a: 'antigo', b: 'igual' }, new Set(['a', 'b', 'd']));
    expect(r).toEqual({ a: 'novo texto' });
    expect(rascunhosParaRecuperar({ e: 'escrito sem conexão' }, {}, new Set(['e']))).toEqual({ e: 'escrito sem conexão' });
    expect(chaveDoRascunho('tok')).toBe('ff-portal-rascunho:tok');
  });
});
