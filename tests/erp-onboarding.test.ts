/**
 * ERP 0.5 · onboarding — as regras puras do pedido de acesso (sem banco): o que
 * o lead digita é limpo e validado, o link do WhatsApp e o e-mail só se montam
 * de dado conferido, o atraso conta no calendário do Rio e o texto do
 * consentimento é o decidido.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: () => new Headers({ 'x-real-ip': '10.0.0.1' }) }));
import {
  CAMPO_ARMADILHA,
  CONSENTIMENTO,
  caiuNaArmadilha,
  diasDeAtrasoDoPedido,
  formatarWhatsapp,
  fraseJaDecidido,
  guardadoAte,
  lerAtivacao,
  lerMotivo,
  lerPedido,
  limparTexto,
  linkDoEmail,
  linkDoWhatsApp,
  mensagemDoConvite,
  textoDaEtapa,
  textoDoEvento,
} from '@/lib/erp/pedido-campos';

const BOM = {
  nomeGrupo: "Grupo Valentin's",
  responsavel: 'Maria Souza',
  whatsapp: '(21) 99641-6060',
  email: 'Maria@Restaurante.com.br',
  lojas: '4',
  marcas: '2',
  cidade: 'Rio de Janeiro/RJ',
  consentimento: 'sim',
};

describe('ERP 0.5 · limpar o que o lead digita', () => {
  it('tira controle, zero-width e marcas de direção; espaço repetido vira um', () => {
    expect(limparTexto('  Grupo​   do‮ Zé\u0000\n\tBurger ')).toBe('Grupo do Zé Burger');
    expect(limparTexto('a⁦b⁩c‎d‏e')).toBe('abcde');
    expect(limparTexto(undefined)).toBe('');
    expect(limparTexto(42)).toBe('');
  });
  it('lê no máximo 500 caracteres de qualquer campo', () => {
    expect(limparTexto('x'.repeat(5000)).length).toBe(500);
  });
  it('<script> continua texto (quem escapa é o React), mas sem caractere de direção', () => {
    expect(limparTexto('<script>alert(1)</script>‮')).toBe('<script>alert(1)</script>');
  });
});

describe('ERP 0.5 · validar o pedido', () => {
  it('pedido bom: WhatsApp em E.164, e-mail minúsculo, números inteiros', () => {
    const r = lerPedido(BOM, { exigirConsentimento: true });
    expect(r).toEqual({
      ok: true,
      dados: {
        nomeGrupo: "Grupo Valentin's",
        responsavel: 'Maria Souza',
        whatsapp: '5521996416060',
        email: 'maria@restaurante.com.br',
        lojas: 4,
        marcas: 2,
        cidade: 'Rio de Janeiro/RJ',
      },
    });
  });
  it('sem a caixa de consentimento: erro no campo (só na landing)', () => {
    const { consentimento: _c, ...sem } = BOM;
    const r = lerPedido(sem, { exigirConsentimento: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros)).toEqual(['consentimento']);
    expect(lerPedido(sem, { exigirConsentimento: false }).ok).toBe(true);
    expect(lerPedido({ ...BOM, consentimento: 'nao' }, { exigirConsentimento: true }).ok).toBe(false);
  });
  it('fixo, DDD inexistente, e-mail torto e números fora da faixa são recusados, cada um no seu campo', () => {
    const r = lerPedido(
      { ...BOM, whatsapp: '(21) 3333-4444', email: 'sem-arroba', lojas: '0', marcas: '51', nomeGrupo: 'a', cidade: '', responsavel: ' ' },
      { exigirConsentimento: true },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(['cidade', 'email', 'lojas', 'marcas', 'nomeGrupo', 'responsavel', 'whatsapp']);
    for (const lojas of ['201', '-1', '1,5', '1e2', 'abc', '']) {
      expect(lerPedido({ ...BOM, lojas }, { exigirConsentimento: true }).ok, `lojas=${lojas}`).toBe(false);
    }
    expect(lerPedido({ ...BOM, lojas: '200', marcas: '50' }, { exigirConsentimento: true }).ok).toBe(true);
  });
  it('nome com bidi e <script> fica limpo e inteiro', () => {
    const r = lerPedido({ ...BOM, nomeGrupo: '<b>Grupo</b>‮<script>x</script>' }, { exigirConsentimento: true });
    expect(r.ok && r.dados.nomeGrupo).toBe('<b>Grupo</b><script>x</script>');
  });
  it('a armadilha só dispara com o campo preenchido', () => {
    expect(caiuNaArmadilha({ ...BOM })).toBe(false);
    expect(caiuNaArmadilha({ ...BOM, [CAMPO_ARMADILHA]: '' })).toBe(false);
    expect(caiuNaArmadilha({ ...BOM, [CAMPO_ARMADILHA]: '   ' })).toBe(false);
    expect(caiuNaArmadilha({ ...BOM, [CAMPO_ARMADILHA]: 'http://spam' })).toBe(true);
  });
  it('o consentimento é o texto decidido, com versão', () => {
    expect(CONSENTIMENTO.texto).toBe('Autorizo a FlowFoods a usar estes dados só para falar comigo sobre a consultoria e o sistema.');
    expect(CONSENTIMENTO.versao).toBe('v1');
  });
});

describe('ERP 0.5 · recusa e ativação', () => {
  it('motivo da recusa: obrigatório, 3 a 200', () => {
    expect(lerMotivo('').ok).toBe(false);
    expect(lerMotivo('ab').ok).toBe(false);
    expect(lerMotivo('x'.repeat(201)).ok).toBe(false);
    expect(lerMotivo('  fora do perfil  ')).toEqual({ ok: true, motivo: 'fora do perfil' });
  });
  it('ativação: slug gerado do nome quando vazio; e-mail do dono minúsculo; versão obrigatória', () => {
    const r = lerAtivacao({ nomeParceiro: "Grupo Valentin's", slug: '', donoNome: 'Maria', donoEmail: 'MARIA@x.com.br', versao: '3' });
    expect(r).toEqual({ ok: true, dados: { nomeParceiro: "Grupo Valentin's", slug: 'grupo-valentins', donoNome: 'Maria', donoEmail: 'maria@x.com.br', versao: 3 } });
    const ruim = lerAtivacao({ nomeParceiro: 'G', slug: 'Ab c', donoNome: '', donoEmail: 'x', versao: 'zero' });
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(Object.keys(ruim.erros).sort()).toEqual(['donoEmail', 'donoNome', 'geral', 'nomeParceiro', 'slug']);
  });
  it('a frase de quem chegou depois diz quem decidiu', () => {
    expect(fraseJaDecidido('ATIVADO', 'Rodolfo', new Date('2026-10-16T15:00:00Z'))).toBe('Este pedido já foi ativado por Rodolfo em 16/10. Nada foi criado de novo.');
    expect(fraseJaDecidido('RECUSADO', null, null)).toBe('Este pedido já foi recusado. Nada foi criado de novo.');
  });
});

describe('ERP 0.5 · links montados no servidor', () => {
  it('WhatsApp: só dígitos e a mensagem codificada; número estranho não vira link', () => {
    expect(linkDoWhatsApp('5521996416060', 'oi & tchau?')).toBe('https://wa.me/5521996416060?text=oi%20%26%20tchau%3F');
    expect(linkDoWhatsApp('55 21 99641-6060')).toBe('https://wa.me/5521996416060');
    expect(linkDoWhatsApp('')).toBeNull();
    expect(linkDoWhatsApp('123')).toBeNull();
    expect(linkDoWhatsApp('javascript:alert(1)')).toBeNull();
  });
  it('mailto: só de e-mail válido; o endereço não escapa do esquema', () => {
    expect(linkDoEmail('maria@restaurante.com.br')).toBe('mailto:maria@restaurante.com.br');
    expect(linkDoEmail('a b@x.com')).toBeNull();
    expect(linkDoEmail('')).toBeNull();
  });
  it('mensagem do convite leva o primeiro nome e o link', () => {
    const m = mensagemDoConvite('Maria Souza', 'https://x/entrar/primeiro-acesso/T');
    expect(m).toContain('Oi, Maria!');
    expect(m).toContain('https://x/entrar/primeiro-acesso/T');
  });
});

describe('ERP 0.5 · atraso (Novo > 2 dias, Em conversa > 7 dias, calendário do Rio)', () => {
  const agora = new Date('2026-10-16T15:00:00Z'); // 12:00 no Rio
  const haDias = (n: number) => new Date(agora.getTime() - n * 86_400_000);
  it('Novo criado há 3 dias: 1d de atraso; há 2 dias, ainda não', () => {
    expect(diasDeAtrasoDoPedido({ status: 'NOVO', etapaDesde: haDias(3) }, agora)).toBe(1);
    expect(diasDeAtrasoDoPedido({ status: 'NOVO', etapaDesde: haDias(2) }, agora)).toBe(0);
    expect(diasDeAtrasoDoPedido({ status: 'NOVO', etapaDesde: haDias(0) }, agora)).toBe(0);
  });
  it('Em conversa sem movimento há 9 dias: 2d de atraso; há 7, ainda não', () => {
    expect(diasDeAtrasoDoPedido({ status: 'EM_CONVERSA', etapaDesde: haDias(9) }, agora)).toBe(2);
    expect(diasDeAtrasoDoPedido({ status: 'EM_CONVERSA', etapaDesde: haDias(7) }, agora)).toBe(0);
  });
  it('Ativado e Recusado nunca atrasam', () => {
    expect(diasDeAtrasoDoPedido({ status: 'ATIVADO', etapaDesde: haDias(90) }, agora)).toBe(0);
    expect(diasDeAtrasoDoPedido({ status: 'RECUSADO', etapaDesde: haDias(90) }, agora)).toBe(0);
  });
  it('conta dias de calendário do Rio, não de 24 h: 23:00 de ontem e 01:00 de hoje já são "outro dia"', () => {
    const tarde = new Date('2026-10-14T02:00:00Z'); // 23:00 de 13/10 no Rio
    const cedo = new Date('2026-10-16T04:00:00Z'); // 01:00 de 16/10 no Rio
    expect(diasDeAtrasoDoPedido({ status: 'NOVO', etapaDesde: tarde }, cedo)).toBe(1); // 3 dias de calendário - 2
    expect(textoDaEtapa(haDias(0), agora)).toBe('hoje');
    expect(textoDaEtapa(haDias(3), agora)).toBe('há 3d');
  });
  it('o recusado fica guardado 180 dias', () => {
    expect(guardadoAte(new Date('2026-10-16T00:00:00Z')).toISOString().slice(0, 10)).toBe('2027-04-14');
  });
});

describe('ERP 0.5 · apresentação do pedido', () => {
  it('WhatsApp com máscara; fora do formato, como veio', () => {
    expect(formatarWhatsapp('5521996416060')).toBe('(21) 99641-6060');
    expect(formatarWhatsapp('')).toBe('');
  });
  it('o histórico diz a etapa de antes e de depois, o motivo e nada de dado pessoal', () => {
    expect(textoDoEvento({ acao: 'CRIOU', antes: null, depois: { etapa: 'NOVO', origem: 'LANDING' }, motivo: null })).toBe('Pedido recebido pelo site');
    expect(textoDoEvento({ acao: 'CRIOU', antes: null, depois: { origem: 'MANUAL' }, motivo: null })).toBe('Pedido digitado');
    expect(textoDoEvento({ acao: 'MOVEU', antes: { etapa: 'NOVO' }, depois: { etapa: 'EM_CONVERSA' }, motivo: null })).toBe('Novo → Em conversa');
    expect(textoDoEvento({ acao: 'REENVIOU', antes: null, depois: { reenvios: 2 }, motivo: null })).toBe('Mandou de novo (2ª vez)');
    expect(textoDoEvento({ acao: 'RECUSOU', antes: { etapa: 'NOVO' }, depois: { etapa: 'RECUSADO' }, motivo: 'fora da região' })).toBe('Recusado');
    expect(textoDoEvento({ acao: 'MOVEU', antes: { etapa: '<script>' }, depois: null, motivo: null })).toBe('— → —');
  });
});

describe('ERP 0.5 · a landing sem banco responde com o WhatsApp, sem erro', () => {
  const original = process.env.DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });
  it('sem DATABASE_URL: "indisponível" com a saída pelo WhatsApp, nada estoura', async () => {
    const { enviarPedido } = await import('@/app/comecar/actions'); // o Prisma lê o .env ao carregar: tirar a variável DEPOIS
    delete process.env.DATABASE_URL;
    const f = new FormData();
    f.set('nomeGrupo', 'Grupo');
    const r = await enviarPedido(null, f);
    expect(r).toEqual({ tipo: 'indisponivel', mensagem: 'O formulário está fora do ar por enquanto. Fale pelo WhatsApp.', vez: 1 });
  });
});
