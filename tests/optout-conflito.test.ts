import { describe, expect, it } from 'vitest';
import { detectarOptOut } from '@/lib/barney/optout';
import { checarConflito } from '@/lib/barney/conflito';

describe('opt-out — palavras isoladas', () => {
  it.each(['não', 'nao', 'NÃO', 'pare', 'Pare!', 'sair', 'remover', 'stop', 'chega'])(
    'reconhece "%s" como mensagem inteira',
    (t) => {
      expect(detectarOptOut(t).optOut).toBe(true);
    },
  );

  it('NÃO confunde "não" no meio de uma frase de interesse', () => {
    const r = detectarOptOut('nao sei ainda, me manda mais informacao por favor');
    expect(r.optOut).toBe(false);
  });

  it('NÃO confunde uma recusa de agenda com pedido de saída', () => {
    expect(detectarOptOut('hoje nao consigo falar, me chama amanha').optOut).toBe(false);
  });
});

describe('opt-out — frases', () => {
  it.each([
    'não tenho interesse',
    'nao tenho interesse obrigado',
    'por favor me tira da lista',
    'pode me remover da lista',
    'para de mandar mensagem',
    'não me mande mais mensagens',
    'quero descadastrar',
    'me deixa em paz',
  ])('reconhece "%s"', (t) => {
    const r = detectarOptOut(t);
    expect(r.optOut, `falhou para "${t}"`).toBe(true);
    expect(r.regra).toBe('FRASE');
  });

  it('ignora acento, caixa e pontuação', () => {
    expect(detectarOptOut('NÃO TENHO INTERESSE!!!').optOut).toBe(true);
    expect(detectarOptOut('nao   tenho    interesse').optOut).toBe(true);
  });

  it('devolve o termo que casou, para o audit log', () => {
    expect(detectarOptOut('me tira da lista por favor').termo).toBe('me tira da lista');
  });

  it('texto vazio ou nulo não é opt-out', () => {
    expect(detectarOptOut('').optOut).toBe(false);
    expect(detectarOptOut(null).optOut).toBe(false);
    expect(detectarOptOut(undefined).optOut).toBe(false);
  });
});

describe('conflito de interesse — Grupo Bibi Sucos', () => {
  it.each([
    { categoria: 'Acai', bairro: 'Tijuca' },
    { categoria: 'Sucos', bairro: 'Botafogo' },
    { categoria: 'Saladaria', bairro: 'Tijuca' },
    { categoria: 'Açaí e Sucos', bairro: 'Rio Sul' },
  ])('bloqueia $categoria em $bairro', (e) => {
    const r = checarConflito(e);
    expect(r.emConflito).toBe(true);
    expect(r.motivo).toContain('Conflito de interesse');
  });

  it('acha o território pelo endereço quando o bairro não denuncia', () => {
    const r = checarConflito({
      nome: 'Point do Acai',
      categoria: 'Acai',
      bairro: 'Cachambi',
      endereco: 'Av. Dom Helder Camara, 5474 — Norte Shopping, Piso L3',
    });
    expect(r.emConflito).toBe(true);
    expect(r.territorio).toBe('norte shopping');
  });

  it('acha a categoria pelo nome quando a categoria vem genérica', () => {
    const r = checarConflito({
      nome: 'Mundo do Açaí',
      categoria: 'Restaurante',
      bairro: 'Botafogo',
    });
    expect(r.emConflito).toBe(true);
  });

  it('LIBERA a mesma categoria fora do território do Bibi', () => {
    expect(checarConflito({ categoria: 'Acai', bairro: 'Campo Grande' }).emConflito).toBe(false);
    expect(checarConflito({ categoria: 'Sucos', bairro: 'Bangu' }).emConflito).toBe(false);
  });

  it('LIBERA outras categorias dentro do território do Bibi', () => {
    expect(checarConflito({ categoria: 'Hamburgueria', bairro: 'Tijuca' }).emConflito).toBe(false);
    expect(checarConflito({ categoria: 'Pizzaria', bairro: 'Botafogo' }).emConflito).toBe(false);
    expect(checarConflito({ categoria: 'Japones', bairro: 'Rio Sul' }).emConflito).toBe(false);
  });

  it('entrada vazia não gera conflito', () => {
    expect(checarConflito({}).emConflito).toBe(false);
  });
});
