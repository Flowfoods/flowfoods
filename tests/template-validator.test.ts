import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { validarTemplate, ASSINATURA } from '@/lib/barney/template-validator';
import { SEED_TEMPLATES, renderizar, angulo, gancho } from '@/lib/barney/render';
import { TIMEZONE } from '@/lib/barney/regras';

const QUANDO = DateTime.fromISO('2026-08-25T11:00:00', { zone: TIMEZONE });

const LEAD = {
  nome: 'Katsuo Culinaria Asiatica - Campo Grande',
  bairro: 'Campo Grande',
  categoria: 'Japones',
  nota: 4.8,
  avaliacoes: 2936,
};

describe('seed de templates', () => {
  it('TODOS os templates do seed passam no validador', () => {
    for (const t of SEED_TEMPLATES) {
      const r = validarTemplate(t.corpo, { toque: t.toque, canal: t.canal });
      expect(r.violacoes, `${t.canal}/${t.toque} reprovou`).toEqual([]);
      expect(r.valido).toBe(true);
    }
  });

  it('TODOS os templates renderizados passam no validador', () => {
    for (const t of SEED_TEMPLATES) {
      const corpo = renderizar(t.corpo, LEAD, QUANDO);
      const r = validarTemplate(corpo, { toque: t.toque, canal: t.canal, renderizado: true });
      expect(r.violacoes, `${t.canal}/${t.toque} renderizado reprovou`).toEqual([]);
    }
  });
});

describe('R1 — nada gratuito', () => {
  it.each([
    'diagnóstico gratuito',
    'sem custo',
    'sem compromisso',
    'contratando ou não',
    'é de graça',
    'por cortesia',
  ])('recusa "%s"', (termo) => {
    const corpo = `Oi! Aqui é o Rodolfo. {{gancho}} Ofereço ${termo}.\n\n${ASSINATURA}`;
    const r = validarTemplate(corpo, { toque: 'D0' });
    expect(r.valido).toBe(false);
    expect(r.violacoes.map((v) => v.regra)).toContain('R1_NADA_GRATUITO');
  });
});

describe('R2 — primeira pessoa do singular', () => {
  it.each(['nós cuidamos', 'nossa equipe atende', 'nosso time', 'a gente atende'])(
    'recusa "%s"',
    (termo) => {
      const corpo = `Oi! {{gancho}} Na FlowFoods ${termo} restaurantes.\n\n${ASSINATURA}`;
      const r = validarTemplate(corpo, { toque: 'D0' });
      expect(r.violacoes.map((v) => v.regra)).toContain('R2_PRIMEIRA_PESSOA');
    },
  );

  it('NÃO confunde "a gente trabalhar junto" com plural de equipe', () => {
    const r = validarTemplate(SEED_TEMPLATES[0].corpo, { toque: 'D0' });
    expect(r.violacoes.map((v) => v.regra)).not.toContain('R2_PRIMEIRA_PESSOA');
  });
});

describe('R3 — assinatura', () => {
  it('recusa quando falta', () => {
    const r = validarTemplate('Oi! {{gancho}} Consigo falar com o responsável?', { toque: 'D0' });
    expect(r.violacoes.map((v) => v.regra)).toContain('R3_ASSINATURA');
  });

  it('recusa quando a assinatura não é a última linha', () => {
    const corpo = `Oi! {{gancho}}\n\n${ASSINATURA}\n\nAh, e mais uma coisa.`;
    const r = validarTemplate(corpo, { toque: 'D0' });
    expect(r.violacoes.map((v) => v.regra)).toContain('R3_ASSINATURA');
  });

  it('não exige assinatura do texto de Instagram — não é canal do Barney', () => {
    const ig = SEED_TEMPLATES.find((t) => t.canal === 'INSTAGRAM')!;
    expect(ig.corpo).not.toContain(ASSINATURA);
    expect(validarTemplate(ig.corpo, { toque: 'D0', canal: 'INSTAGRAM' }).valido).toBe(true);
  });
});

describe('R4 — Instagram e site depois do pedido', () => {
  it('recusa contato antes do pedido', () => {
    const corpo = [
      'Oi! Me acha no @rrodolfoac.',
      '{{gancho}}',
      'Consigo falar com o responsável pela operação?',
      '',
      ASSINATURA,
    ].join('\n\n');
    const r = validarTemplate(corpo, { toque: 'D0' });
    expect(r.violacoes.map((v) => v.regra)).toContain('R4_CONTATO_DEPOIS_DO_PEDIDO');
  });

  it('aceita contato depois do pedido', () => {
    const corpo = [
      'Oi! {{gancho}}',
      'Consigo falar com o responsável pela operação?',
      'Se quiser me conhecer: @rrodolfoac e consultoriaflowfoods.com.br',
      '',
      ASSINATURA,
    ].join('\n\n');
    const r = validarTemplate(corpo, { toque: 'D0' });
    expect(r.violacoes.map((v) => v.regra)).not.toContain('R4_CONTATO_DEPOIS_DO_PEDIDO');
  });

  it('não aplica a regra ao D10, que se despede sem pedir nada', () => {
    const d10 = SEED_TEMPLATES.find((t) => t.toque === 'D10')!;
    expect(d10.corpo).toContain('@rrodolfoac');
    expect(validarTemplate(d10.corpo, { toque: 'D10' }).valido).toBe(true);
  });
});

describe('R5 — gancho com dado real', () => {
  it('recusa template de abertura sem placeholder de dado', () => {
    const corpo = `Oi! Aqui é o Rodolfo. Consigo falar com o responsável pela operação?\n\n${ASSINATURA}`;
    const r = validarTemplate(corpo, { toque: 'D0' });
    expect(r.violacoes.map((v) => v.regra)).toContain('R5_GANCHO_COM_DADO_REAL');
  });

  it('não exige gancho no D4 nem no D10', () => {
    for (const toque of ['D4', 'D10'] as const) {
      const corpo = `Oi! Rodolfo aqui de novo.\n\n${ASSINATURA}`;
      const r = validarTemplate(corpo, { toque });
      expect(r.violacoes.map((v) => v.regra)).not.toContain('R5_GANCHO_COM_DADO_REAL');
    }
  });

  it('renderizado sem número nenhum reprova', () => {
    const corpo = `Oi! Vi o perfil de vocês no Google.\n\n${ASSINATURA}`;
    const r = validarTemplate(corpo, { toque: 'D0', renderizado: true });
    expect(r.violacoes.map((v) => v.regra)).toContain('R5_GANCHO_COM_DADO_REAL');
  });
});

describe('R7/R8 — regras vindas do anti-ban', () => {
  it('recusa mais de 3 emojis', () => {
    const corpo = `Oi! 🍔🍕🍣🥗 {{gancho}}\n\n${ASSINATURA}`;
    const r = validarTemplate(corpo, { toque: 'D0' });
    expect(r.violacoes.map((v) => v.regra)).toContain('R7_EMOJIS');
  });

  it('aceita até 3 emojis', () => {
    const corpo = `Oi! 🍔🍕🍣 {{gancho}}\n\n${ASSINATURA}`;
    expect(validarTemplate(corpo, { toque: 'D0' }).valido).toBe(true);
  });

  it.each(['bit.ly/abc', 'tinyurl.com/x', 'cutt.ly/z'])('recusa encurtador %s', (link) => {
    const corpo = `Oi! {{gancho}} Veja ${link}\n\n${ASSINATURA}`;
    const r = validarTemplate(corpo, { toque: 'D0' });
    expect(r.violacoes.map((v) => v.regra)).toContain('R8_LINK_ENCURTADO');
  });
});

describe('R9 — placeholder aberto nunca sai', () => {
  it('recusa mensagem renderizada com placeholder sobrando', () => {
    const corpo = `Oi! Vi que o {{nomeDesconhecido}} está com 4,8 e 2936 avaliações.\n\n${ASSINATURA}`;
    const r = validarTemplate(corpo, { toque: 'D0', renderizado: true });
    expect(r.violacoes.map((v) => v.regra)).toContain('R9_PLACEHOLDER_ABERTO');
  });
});

describe('render', () => {
  it('escolhe o gancho de volume-alto-nota-baixa, que é o mais forte', () => {
    const g = gancho('Casa X', 4.2, 8000, 'Bangu');
    expect(g).toContain('8 mil avaliações');
    expect(g).toContain('é processo');
  });

  it('formata a nota no padrão brasileiro', () => {
    expect(gancho('Casa X', 4.75, 900, 'Tijuca')).toContain('4,8');
  });

  it('usa o ângulo da categoria', () => {
    expect(angulo('Japones', 'Campo Grande')).toContain('ticket mais alto');
    expect(angulo('Hamburgueria', 'Bangu')).toContain('margem presa no marketplace');
  });

  it('Centro tem ângulo próprio, que vence a categoria', () => {
    expect(angulo('Hamburgueria', 'Centro')).toContain('giro de almoço');
  });

  it('resolve saudação pelo relógio e encurta o nome', () => {
    const corpo = renderizar('{{saudacao}}, {{nome}}!', LEAD, QUANDO);
    expect(corpo).toBe('Bom dia, Katsuo Culinaria Asiatica!');
  });

  it('não deixa traço órfão no nome — o script original deixa (achado #5)', () => {
    // O gancho é a primeira linha que o dono lê. "Casa X -" denuncia automação.
    const corpo = renderizar('{{nome}}', { ...LEAD, nome: 'Katsuo - Campo Grande' }, QUANDO);
    expect(corpo).toBe('Katsuo');
    expect(corpo).not.toMatch(/[-|,.]$/);
  });

  it('usa o primeiro nome do dono quando conhecido', () => {
    const corpo = renderizar('{{saudacao}}!', { ...LEAD, donoNome: 'Carlos Eduardo Silva' }, QUANDO);
    expect(corpo).toBe('Bom dia, Carlos!');
  });

  it('deixa placeholder desconhecido intacto para o R9 pegar', () => {
    expect(renderizar('{{naoExiste}}', LEAD, QUANDO)).toBe('{{naoExiste}}');
  });
});
