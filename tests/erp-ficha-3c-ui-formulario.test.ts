import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValoresDaFicha } from '@/components/erp/telas/fichas/form-ficha';
const h=vi.hoisted(()=>({pendente:false,form:{},atalhos:[] as (()=>boolean|void)[],guardar:vi.fn(),valores:null as ValoresDaFicha|null,insumoCriado:null as string|null,antes:null as (()=>void)|null}));
vi.mock('react',async original=>{const r=await original<typeof import('react')>();return {...r,useRef:(v:unknown)=>r.useRef(v===null?h.form:v)};});
vi.mock('next/navigation',()=>({usePathname:()=>'/erp/fichas/f/editar',useSearchParams:()=>new URLSearchParams()}));
vi.mock('react-dom',async original=>({...await original<typeof import('react-dom')>(),useFormStatus:()=>({pending:h.pendente})}));
vi.mock('@/components/erp/telas/fichas/use-envio-ficha',()=>({useEnvioFicha:(_acao:unknown,antes:()=>void)=>{h.antes=antes;return {estado:null,enviar:undefined,pendente:h.pendente};}}));
vi.mock('@/components/erp/telas/cadastro/rascunho',()=>({useRascunhoDaTela:()=>({chave:'escopo:editar',valores:h.valores,versaoMudou:true,versaoDeOrigem:'receita-antiga',insumoCriado:h.insumoCriado,descartar:vi.fn()}),guardarRascunho:h.guardar,descartarRascunho:vi.fn()}));
vi.mock('@/components/erp/telas/insumos/atalho-novo-insumo',()=>({AtalhoNovoInsumo:(p:{aoSair:()=>boolean|void})=>{h.atalhos.push(p.aoSair);return null;},AvisoInsumoCriado:()=>null}));
import { FormFicha } from '@/components/erp/telas/fichas/form-ficha';
const BaseFormData=FormData;
const rascunho:ValoresDaFicha={nome:'Nome do rascunho',tipo:'PRATO',descricao:'Descrição crua',modoPreparo:'Modo anterior',passos:['Passo cru'],rendimento:'2',rendimentoUnidade:'porcao',itens:[{escolha:'i',quantidade:'inválida',unidade:'g',fator:'1,x'}],validades:null,validadeDigitada:{principal:'REFRIGERADO',linhas:{REFRIGERADO:{marcada:true,quantidade:'2,x',em:'dias'}}},materiais:[{chave:0,canal:'DELIVERY_PROPRIO',insumoId:'',quantidade:'2',unidade:'un'},{chave:7,canal:'IFOOD',insumoId:'',quantidade:'3,x',unidade:'un'}],versaoDaFicha:'receita-antiga',versaoMateriais:'materiais-antigos',chaveEnvio:'chave-original',foto:{tipo:'nova',arquivo:'pendente.jpg'},retorno:{bloco:'embalagens',canal:'IFOOD',chave:7}};
const preco={metaBp:null,precoCentavos:null,ofertado:true,cortesDoFarol:null};
const props={acao:async()=>null,modo:'editar' as const,base:'/erp/fichas',aqui:'/erp/fichas/f/editar',cancelar:'/erp/fichas/f',verCustos:true,versao:'receita-nova',novoInsumo:'/erp/insumos/novo',opcoes:[{id:'i',nome:'Ingrediente',unidade:'KG' as const,ativo:true,custo:null,categoria:null}],inicial:{...rascunho,materiais:[],versaoDaFicha:'receita-nova',versaoMateriais:'materiais-novos'},materiais:{versao:'materiais-novos',linhas:[],opcoes:[{id:'nova',nome:'Embalagem nova',unidade:'UN' as const,ativo:true,embalagem:true,custo:null}],precos:{LOJA:preco,DELIVERY_PROPRIO:preco,IFOOD:preco}}};
beforeEach(()=>{h.pendente=false;h.valores=null;h.insumoCriado=null;h.atalhos=[];h.guardar.mockReset().mockReturnValue(true);vi.stubGlobal('FormData',class extends BaseFormData {constructor(form?:unknown){super();if(form===h.form){if(h.pendente)throw Error('Não pode ler campos desabilitados');this.set('nome','Nome atual');this.set('descricao','Texto atual');this.append('passo','Etapa atual');}}});});
afterEach(()=>vi.unstubAllGlobals());
describe('3C · rascunho e atalho no formulário real',()=>{
 it('link de catálogo previamente aberto durante envio não lê FormData vazio, não regrava nem sai',()=>{
  h.pendente=true;renderToStaticMarkup(createElement(FormFicha,props));expect(h.atalhos.length).toBeGreaterThan(0);
  for(const sair of h.atalhos)expect(sair()).toBe(false);expect(()=>h.antes?.()).not.toThrow();expect(h.guardar).not.toHaveBeenCalled();
 });
 it('antes do envio persiste campos livres e token/versões; rascunho não depende de resposta bem-sucedida',()=>{
  h.valores=rascunho;renderToStaticMarkup(createElement(FormFicha,props));h.antes?.();expect(h.guardar).toHaveBeenCalledWith('escopo:editar',expect.objectContaining({nome:'Nome atual',descricao:'Texto atual',passos:['Etapa atual'],foto:{tipo:'nova',arquivo:'pendente.jpg'},versaoDaFicha:'receita-antiga',versaoMateriais:'materiais-antigos',chaveEnvio:'chave-original',itens:rascunho.itens,materiais:rascunho.materiais}),'receita-antiga');
 });
 it('restaura versões antigas, quantidade inválida e a embalagem somente no canal/linha de retorno',()=>{
  h.valores=rascunho;h.insumoCriado='nova';const html=renderToStaticMarkup(createElement(FormFicha,props));
  expect(html).toContain('value="receita-antiga"');expect(html).toContain('value="materiais-antigos"');expect(html).toContain('value="3,x"');expect(html).toContain('value="inválida"');expect(html).toContain('value="2,x"');expect(html).toContain('/erp/fichas/fotos?arquivo=pendente.jpg');
  expect(html).toMatch(/data-emb-linha="7"[^]*?<option value="nova" selected=""/);expect(html).toMatch(/data-emb-linha="0"[^]*?<option value="" selected=""/);expect(html).toContain('versão original');
 });
 it('rascunho antigo sem materiais preserva associações atuais; marcador vazio permanece em pré-preparo',()=>{
  const antigo={...rascunho};delete antigo.materiais;delete antigo.versaoMateriais;h.valores=antigo;
  const html=renderToStaticMarkup(createElement(FormFicha,{...props,materiais:{...props.materiais,linhas:[{canal:'IFOOD',insumoId:'nova',quantidade:'2',unidade:'un'}]}}));expect(html).toContain('value="materiais-novos"');expect(html).toContain('value="nova" selected=""');
  h.valores=null;const pre=renderToStaticMarkup(createElement(FormFicha,{...props,inicial:{...props.inicial,tipo:'PRE_PREPARO',rendimentoUnidade:'kg',materiais:[]}}));expect(pre).toContain('name="materiaisNoFormulario"');expect(pre).not.toContain('name="emb_insumo"');
 });
});
