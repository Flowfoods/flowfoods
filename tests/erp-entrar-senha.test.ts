/**
 * Decisão 515 · mostrar e ocultar a senha (/entrar, link de senha e /rodolfo/login) e o texto honesto do
 * "Esqueci minha senha", SEM banco: o HTML que sai do servidor. O botão nunca envia o formulário, começa
 * desligado e aponta para o campo; o campo começa oculto e guarda o `autocomplete`; nenhum envio novo.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AJUDA_DE_ACESSO_ERP } from '@/lib/constants';

let estadoDoForm: unknown = null;
vi.mock('react-dom', async (orig) => ({
  ...(await orig<typeof import('react-dom')>()),
  useFormState: (_a: unknown, inicial: unknown) => [estadoDoForm ?? inicial, undefined],
  useFormStatus: () => ({ pending: false }),
}));
// As actions de entrar não rodam aqui: só o que a tela mostra.
vi.mock('@/app/entrar/actions', () => ({
  acaoEntrar: vi.fn(),
  acaoDefinirSenha: vi.fn(),
  acaoOpcoesDoRosto: vi.fn(),
  acaoEntrarComRosto: vi.fn(),
}));
vi.mock('@/lib/erp/sessao', () => ({ sessaoDaRequisicao: async () => null }));
vi.mock('@/lib/erp/rosto', () => ({ configDoRosto: () => ({}), rostoPossivel: () => false }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useSearchParams: () => new URLSearchParams() }));
vi.mock('next-auth/react', () => ({ signIn: vi.fn() }));

const { CampoDeSenha } = await import('@/components/erp/ui/campo-senha');
const { FormEntrar } = await import('@/app/entrar/form-entrar');
const { FormSenha } = await import('@/app/entrar/primeiro-acesso/[token]/form-senha');
const { default: EntrarPage } = await import('@/app/entrar/page');
const { default: LoginDoRodolfo } = await import('@/app/rodolfo/(acesso)/login/page');

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, ' ');
/** As tags <button …> do HTML. */
const botoes = (h: string) => h.match(/<button[^>]*>/g) ?? [];
const campo = (h: string, id: string) => h.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
const alternador = (h: string, id: string) => botoes(h).find((b) => b.includes(`aria-controls="${id}"`)) ?? '';
/** Valor de um atributo na tag; o nome é sem caixa (o React 18 escreve `autoComplete`, o HTML lê igual). */
const attr = (tag: string, nome: string) => tag.match(new RegExp(`\\s${nome}="([^"]*)"`, 'i'))?.[1];

/** O que todo botão de mostrar/ocultar tem de ter, e o campo que ele controla. */
function conferir(h: string, id: string, autocomplete: string, nome: string) {
  const b = alternador(h, id);
  expect(attr(b, 'type')).toBe('button');
  expect(b).toContain('aria-pressed="false"');
  expect(b).toContain(`aria-label="${nome}"`);
  expect(b).toContain('h-11 w-11'); // alvo de 44 px
  expect(b).not.toMatch(/\sname=|formaction=|type="submit"/i);
  const c = campo(h, id);
  expect(attr(c, 'type')).toBe('password');
  expect(attr(c, 'autocomplete')).toBe(autocomplete);
  expect(attr(c, 'spellcheck')).toBe('false');
  expect(attr(c, 'autocapitalize')).toBe('none');
  expect(attr(c, 'autocorrect')).toBe('off');
}

describe('515 · mostrar e ocultar a senha', () => {
  it('o campo isolado: oculto, botão desligado ligado ao campo, sem envio e sem guardar o valor', () => {
    const h = html(createElement(CampoDeSenha, { id: 'x', name: 'x', autoComplete: 'current-password', className: 'c' }));
    conferir(h, 'x', 'current-password', 'Mostrar senha');
    expect(botoes(h)).toHaveLength(1);
    expect(h).toContain('<svg'); // o olho (lucide), decorativo
    expect(h).toMatch(/<svg[^>]*aria-hidden="true"/);
    // Só interface: nada de log, armazenamento ou rede no componente.
    const fonte = readFileSync('src/components/erp/ui/campo-senha.tsx', 'utf8');
    expect(fonte).not.toMatch(/console\.|localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon|document\.cookie/);
  });

  it('/entrar: um botão no campo de senha, um único envio (Entrar), e-mail intacto', () => {
    estadoDoForm = null;
    const h = html(createElement(FormEntrar, { aviso: null, rosto: false }));
    conferir(h, 'senha', 'current-password', 'Mostrar senha');
    expect(campo(h, 'senha')).toContain('name="senha"');
    expect(campo(h, 'senha')).toContain('required');
    expect(h.match(/<form/g)).toHaveLength(1);
    expect(botoes(h).filter((b) => b.includes('type="submit"'))).toHaveLength(1);
    expect(botoes(h)).toHaveLength(2);
    expect(attr(campo(h, 'email'), 'autocomplete')).toBe('username webauthn');
  });

  it('/entrar depois de um erro: o HTML do servidor começa com o campo oculto, com o erro ligado a ele', () => {
    estadoDoForm = { erro: 'E-mail ou senha incorretos.', email: 'a@b.com', vez: 1 };
    try {
      const h = html(createElement(FormEntrar, { aviso: null, rosto: false }));
      conferir(h, 'senha', 'current-password', 'Mostrar senha');
      expect(campo(h, 'senha')).toContain('aria-invalid="true"');
      expect(campo(h, 'senha')).toContain('aria-describedby="entrar-erro"');
      expect(h).toContain('E-mail ou senha incorretos.');
    } finally {
      estadoDoForm = null;
    }
  });

  it('link de senha: um botão por campo, cada um com o seu nome, os dois new-password', () => {
    const h = html(createElement(FormSenha, { token: 't', email: 'maria@casa.com', primeiraVez: false }));
    conferir(h, 'senha', 'new-password', 'Mostrar senha');
    conferir(h, 'confirmacao', 'new-password', 'Mostrar senha repetida');
    // Os nomes que a action lê (actions.ts): sem eles o envio quebraria em silêncio.
    expect(campo(h, 'senha')).toContain('name="senha"');
    expect(campo(h, 'confirmacao')).toContain('name="confirmacao"');
    expect(attr(campo(h, 'senha'), 'minlength')).toBe('10');
    expect(campo(h, 'senha')).toContain('aria-describedby="senha-dica"');
    expect(h).toMatch(/<input[^>]*type="email"[^>]*autocomplete="username"/i); // o e-mail escondido para o gerenciador de senhas
    expect(h.match(/<form/g)).toHaveLength(1);
    expect(botoes(h).filter((b) => b.includes('type="submit"'))).toHaveLength(1);
    expect(botoes(h)).toHaveLength(3);
  });

  it('/rodolfo/login: o mesmo botão no campo de senha, e o envio continua sendo só o Entrar', () => {
    const h = html(createElement(LoginDoRodolfo));
    conferir(h, 'senha', 'current-password', 'Mostrar senha');
    expect(botoes(h).filter((b) => b.includes('type="submit"'))).toHaveLength(1);
    expect(botoes(h)).toHaveLength(2);
  });
});

describe('515 · "Esqueci minha senha" assistido no /entrar', () => {
  it('diz quem gera o link novo, que não há e-mail automático e a validade; o pedido é o WhatsApp de sempre', async () => {
    const h = html(await EntrarPage({ searchParams: {} }));
    expect(h).toContain('Esqueci minha senha');
    expect(h).toContain('A troca de senha é assistida: a FlowFoods ou quem administra a equipe da sua empresa no ERP gera um link novo para você definir outra senha.');
    expect(h).toContain('Não há envio automático por e-mail.');
    expect(h).toContain('O link vale por 72 horas e funciona uma vez só.');
    expect(h).toContain(`href="${AJUDA_DE_ACESSO_ERP.url.replace(/&/g, '&amp;')}"`);
    expect(h).toContain('Fale com a FlowFoods');
    // Nenhum serviço novo: um formulário (o de entrar), nenhum link para outra rota de senha.
    expect(h.match(/<form/g)).toHaveLength(1);
    expect(h).not.toMatch(/href="\/entrar\/[^"]*senha|enviamos|enviaremos|receberá um e-mail|vai receber um e-mail/i);
    expect(h).not.toContain('Senha criada.');
  });

  it('/entrar?senha=criada mantém a confirmação que já existia', async () => {
    const h = html(await EntrarPage({ searchParams: { senha: 'criada' } }));
    expect(h).toContain('Senha criada. Agora entre com o seu e-mail e a senha nova.');
    expect(h).toContain('role="status"');
  });
});
