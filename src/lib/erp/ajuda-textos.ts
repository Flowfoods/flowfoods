/**
 * Ajuda contextual (0.6) — SÓ texto. Uma entrada por tela (ou por telas que
 * se explicam do mesmo jeito: novo e editar). Chave = rota relativa à base.
 *
 * Como mexer (regra da casa, toda subfase):
 *  - tela nova ou rota nova: entrada nova aqui, no MESMO diff (o teste reprova rota sem ajuda);
 *  - função da tela mudou: ajuste o texto E suba a `versao` da entrada, depois rode
 *    `npm run ajuda:lock`. A caixa volta, com "MUDOU", para quem já tinha fechado;
 *  - texto curto, carioca, sem jargão: "a conta é refeita na hora de salvar", nunca "o servidor refaz";
 *  - sem "!", sem emoji, sem HTML, sem markdown. Até 320 caracteres por bloco; 1 a 4 frases para todos.
 *
 * `para` = quem tem QUALQUER uma dessas permissões lê o bloco (o operador não lê sobre preço).
 * É conforto: a permissão de verdade é decidida na página.
 */

import type { EntradaDeAjuda } from './ajuda';

export const ENTRADAS: EntradaDeAjuda[] = [
  {
    chave: 'inicio',
    area: 'inicio',
    rotas: [''],
    titulo: 'Áreas da Rede',
    versao: 1,
    aula: [
      { texto: 'Aqui ficam as áreas do restaurante: cadastros e cardápio, compras e fornecedores, estoque e movimentações, rede e equipe.' },
      { texto: 'Cada card abre na primeira tela que você pode usar. As outras telas da área ficam nas abas, no alto.' },
      { texto: 'Só aparece o que o seu acesso libera.' },
    ],
  },
  {
    chave: 'acesso',
    area: 'rede',
    rotas: ['acesso'],
    titulo: 'Seu acesso',
    versao: 1,
    aula: [
      { texto: 'Aqui estão os seus dados, o que você pode fazer no ERP e a entrada pelo rosto no celular.' },
      { texto: 'Trocou de aparelho? Ative o rosto de novo nele. Senha esquecida: fale com a FlowFoods.' },
    ],
    secoes: [
      {
        id: 'dicas',
        titulo: 'As caixas de dica',
        blocos: [
          { texto: 'Cada tela pode abrir uma caixinha explicando como ela funciona. Fechou uma, ela não volta, a não ser que o texto mude.' },
          { texto: 'No quadro Dicas, desta tela, você liga e desliga as caixinhas ou pede para ver de novo as que fechou. O botão ? no alto continua sempre à mão.' },
        ],
      },
    ],
  },
  {
    chave: 'insumos',
    area: 'cadastros',
    rotas: ['insumos'],
    titulo: 'Insumos',
    versao: 1,
    aula: [
      { texto: 'Tudo o que a casa compra e usa: ingrediente, embalagem e pré-preparo.' },
      { texto: 'O custo vem da última nota lançada. Sem nota, vale o preço cadastrado.' },
      { texto: '“Sem preço” quer dizer que falta cadastrar: as fichas que usam esse insumo ficam incompletas.' },
      { texto: 'Cadastre do jeito que você compra: a caixa de 5 kg, não o grama.', para: ['insumos.editar'] },
    ],
  },
  {
    chave: 'insumo-novo',
    area: 'cadastros',
    rotas: ['insumos/novo', 'insumos/[id]/editar'],
    titulo: 'Cadastrar insumo',
    versao: 1,
    aula: [
      { texto: 'Diga o que é, onde guarda e como compra: embalagem, preço e frete.' },
      { texto: 'A conta do custo por unidade aparece enquanto você digita.' },
      { texto: 'Ainda não sabe o preço? Marque “Ainda não sei o preço”.' },
    ],
  },
  {
    chave: 'insumo',
    area: 'cadastros',
    rotas: ['insumos/[id]'],
    titulo: 'Detalhe do insumo',
    versao: 1,
    aula: [
      { texto: 'O custo de hoje, de onde ele vem e quanto tem em cada loja do seu acesso.' },
      { texto: 'Mais embaixo, o que você pagou em cada nota e qual fornecedor saiu mais barato.', para: ['compras.ver'] },
    ],
  },
  {
    chave: 'insumo-embalagem',
    area: 'cadastros',
    rotas: ['insumos/[id]/embalagens/[varianteId]'],
    titulo: 'Outra embalagem',
    versao: 1,
    aula: [
      { texto: 'É outra forma de comprar o mesmo insumo: caixa, fardo, outra marca.' },
      { texto: 'A tela do insumo diz qual embalagem sai mais barata.' },
    ],
  },
  {
    chave: 'fichas',
    area: 'cadastros',
    rotas: ['fichas'],
    titulo: 'Fichas e produtos',
    versao: 1,
    aula: [
      { texto: 'Cada receita da casa, com o custo por porção.' },
      { texto: 'Pré-preparo (molho, base) entra dentro de outras fichas e leva o custo junto.' },
      { texto: '“Incompleto” quer dizer que falta preço em algum insumo.' },
      { texto: 'A margem de cada canal aparece ao lado; em cinza quando vale o preço sugerido.', para: ['precos.ver'] },
    ],
  },
  {
    chave: 'ficha-nova',
    area: 'cadastros',
    rotas: ['fichas/nova', 'fichas/[id]/editar'],
    titulo: 'Montar a ficha',
    versao: 2,
    aula: [
      { texto: 'Monte a receita com a quantidade limpa, sem casca e sem osso. O fator de correção cobre a perda da limpeza: cebola 1,18 quer dizer que 354 g sujas dão 300 g limpas.' },
      { texto: 'Pré-preparo diz quanto rende pronto. Diga também onde guarda e quanto dura.' },
    ],
  },
  {
    chave: 'ficha-importar',
    area: 'cadastros',
    rotas: ['fichas/importar'],
    titulo: 'Importar planilha',
    versao: 1,
    aula: [
      { texto: 'Baixe o modelo, preencha uma linha por insumo e envie.' },
      { texto: 'Antes de gravar, você vê o que é novo, o que muda e o que tem erro. Enviar a mesma planilha de novo não duplica nada.' },
    ],
  },
  {
    chave: 'ficha',
    area: 'cadastros',
    rotas: ['fichas/[id]'],
    titulo: 'Detalhe da ficha',
    versao: 2,
    aula: [
      { texto: 'Foto, receita e custo por porção, com a conta à mostra.' },
      { texto: 'Em “Preço e margem por canal” estão o custo de cada canal (loja, delivery, iFood), o preço sugerido pela margem-alvo e se o prato está no alvo.', para: ['precos.ver'] },
      { texto: 'Preço em branco vale o sugerido e acompanha o custo. Só quem edita preço muda o preço de venda.', para: ['precos.ver'] },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'Embalagem entra inteira, pelo custo de referência (o último preço pago). A taxa do iFood é comissão mais pagamento online, sobre o preço.', para: ['precos.ver'] },
          { texto: 'A margem bruta é o preço menos os insumos e as embalagens. A margem líquida é a bruta menos a taxa do canal: o que sobra para pagar a casa e o lucro. Despesa fixa não entra nesta conta.', para: ['precos.ver'] },
          { texto: 'O preço sugerido é o custo dividido pelo que sobra depois da taxa e da margem-alvo, arredondado para cima no centavo: é o menor preço que atinge o alvo. Campo vazio vale o sugerido e acompanha o custo.', para: ['precos.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'ficha-embalagens',
    area: 'cadastros',
    rotas: ['fichas/[id]/canais'],
    titulo: 'Embalagens por canal',
    versao: 1,
    aula: [
      { texto: 'O que vai no saco em cada canal: caixa, sacola, guardanapo.' },
      { texto: 'Delivery e iFood têm listas próprias. A loja não leva embalagem.' },
    ],
  },
  {
    chave: 'precificacao',
    area: 'cadastros',
    rotas: ['fichas/canais'],
    titulo: 'Precificação',
    versao: 1,
    aula: [
      { texto: 'Quanto o iFood leva (comissão e pagamento online) e a margem que você quer em cada canal.' },
      { texto: 'Sem a taxa do iFood, o custo dele fica incompleto.' },
      { texto: 'Confira os números no seu contrato com o iFood.', para: ['precos.editar'] },
    ],
  },
  {
    chave: 'compras',
    area: 'compras',
    rotas: ['compras'],
    titulo: 'Compras',
    versao: 1,
    aula: [
      { texto: 'As notas de compra de cada loja.' },
      { texto: 'Nota lançada muda o custo do insumo e entra no estoque, se a loja já abriu o estoque.' },
      { texto: 'A mesma nota não entra duas vezes.', para: ['compras.lancar'] },
    ],
  },
  {
    chave: 'compra-nova',
    area: 'compras',
    rotas: ['compras/nova', 'compras/[id]/editar'],
    titulo: 'Lançar nota',
    versao: 1,
    aula: [
      { texto: 'Digite o valor total de cada linha, como está na nota.' },
      { texto: 'O frete é dividido entre os itens, e a soma tem que bater com o total da nota.' },
      { texto: '“Conferir o impacto” mostra o que muda de custo antes de lançar.' },
    ],
  },
  {
    chave: 'compra',
    area: 'compras',
    rotas: ['compras/[id]'],
    titulo: 'Detalhe da nota',
    versao: 1,
    aula: [
      { texto: 'A nota, o frete de cada item e o que ela fez no estoque.' },
      { texto: 'Errou? Edite ou cancele com o motivo: o custo e o estoque voltam.', para: ['compras.lancar'] },
    ],
  },
  {
    chave: 'fornecedores',
    area: 'compras',
    rotas: ['compras/fornecedores'],
    titulo: 'Fornecedores',
    versao: 1,
    aula: [
      { texto: 'Quem vende para a casa e o último preço de cada insumo.' },
      { texto: 'O CNPJ é opcional. Desativar não apaga a história.' },
    ],
  },
  {
    chave: 'fornecedor-novo',
    area: 'compras',
    rotas: ['compras/fornecedores/novo', 'compras/fornecedores/[id]/editar'],
    titulo: 'Cadastrar fornecedor',
    versao: 1,
    aula: [
      { texto: 'Nome, CNPJ ou CPF (se tiver) e contato. O nome não pode repetir.' },
    ],
  },
  {
    chave: 'fornecedor',
    area: 'compras',
    rotas: ['compras/fornecedores/[id]'],
    titulo: 'Detalhe do fornecedor',
    versao: 1,
    aula: [
      { texto: 'O que esse fornecedor já vendeu, com o último preço de cada insumo, e as últimas notas das lojas que você vê.' },
    ],
  },
  {
    chave: 'estoque',
    area: 'estoque',
    rotas: ['estoque'],
    titulo: 'Estoque: visão geral',
    versao: 1,
    aula: [
      { texto: 'Cada loja e a situação do estoque dela: não aberto, em contagem ou aberto.' },
      { texto: 'Depois de aberto, nota lançada e requisição mexem no saldo sozinhas.' },
    ],
    secoes: [
      {
        id: 'abertura',
        titulo: 'Como abre o estoque de uma loja',
        blocos: [
          { texto: '1. Contar. Quem conta abre a lista no celular e digita o que tem: caixas fechadas e o solto. Salva sozinho, e dá para contar em várias vezes e com várias pessoas.' },
          { texto: '2. Conferir. O gerente vê o que falta, o que deu zero e o valor do estoque pelo custo de referência.' },
          { texto: '3. Concluir. A contagem vira o saldo inicial. Daí em diante, nota lançada na loja entra no estoque na hora.' },
        ],
      },
    ],
  },
  {
    chave: 'estoque-contagens',
    area: 'estoque',
    rotas: ['estoque/contagens'],
    titulo: 'Contagens',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver a contagem dela: cobertura do período, contagens abertas e fechamento.' },
      { texto: 'Com uma loja só no seu acesso, você já cai no período dela.' },
    ],
  },
  {
    chave: 'estoque-loja',
    area: 'estoque',
    rotas: ['estoque/[lojaId]'],
    titulo: 'Estoque da loja',
    versao: 1,
    aula: [
      { texto: 'O saldo e o valor de cada insumo na loja, e o livro de tudo o que entrou e saiu.' },
      { texto: 'Planeje a contagem do dia a dia e acompanhe se o período chega ao piso. “Recontar” corrige um número que ficou errado.', para: ['estoque.ajustar'] },
    ],
  },
  {
    chave: 'estoque-abertura',
    recolhida: true,
    area: 'estoque',
    rotas: ['estoque/[lojaId]/abertura'],
    titulo: 'Contagem de abertura',
    versao: 1,
    aula: [
      { texto: 'Conte o que tem na loja agora. Caixa fechada vai em embalagens; o aberto, no solto.' },
      { texto: 'Deixe vazio o que ainda não contou; o que não tem, marque “Não tem”.' },
      { texto: 'A tela salva sozinha, até sem sinal.' },
    ],
  },
  {
    chave: 'estoque-abertura-conferir',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/abertura/conferir'],
    titulo: 'Conferir a abertura',
    versao: 1,
    aula: [
      { texto: 'O que falta contar, o que deu zero e o valor do estoque.' },
      { texto: 'Concluir transforma a contagem no saldo inicial e não se desfaz. Correção depois é uma contagem nova.' },
    ],
  },
  {
    chave: 'contagem-nova',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/nova'],
    titulo: 'Planejar a contagem',
    versao: 1,
    aula: [
      { texto: 'Escolha o lugar (seco, refrigerado...) e quais insumos contar: os vencidos, todos do lugar ou só os mais caros.' },
      { texto: 'Um pedaço por vez. Um insumo só entra em uma contagem aberta.' },
    ],
  },
  {
    chave: 'contagem',
    recolhida: true,
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/[contagemId]'],
    titulo: 'Contagem',
    versao: 1,
    aula: [
      { texto: 'Conte o que tem agora. O número é comparado com o que o livro dizia na hora em que você contou; nota que chegar depois continua no estoque.' },
      { texto: 'Se tudo bater, a contagem fecha sozinha.' },
      { texto: 'No fechamento do período, conte o que falta: os marcados “para o piso” são os mais caros e levam a cobertura ao mínimo.' },
    ],
  },
  {
    chave: 'contagem-conferir',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/[contagemId]/conferir'],
    titulo: 'Conferir a contagem',
    versao: 1,
    aula: [
      { texto: 'O contado contra o que o livro dizia, em quilo e em reais. Perda aparece em vermelho e sobra em verde.' },
      { texto: 'Aplicar acerta o saldo. O fechamento do período só aplica com a cobertura no piso.' },
    ],
  },
  {
    chave: 'periodo',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/periodo'],
    titulo: 'Período e contagens',
    versao: 1,
    aula: [
      { texto: 'Quanto do estoque foi contado no período, por valor e por itens.' },
      { texto: 'O fechamento só vale com a cobertura acima do piso da loja.' },
      { texto: 'As regras da contagem (piso, frequência, tolerância) ficam aqui; só quem cadastra lojas muda.', para: ['lojas.gerir'] },
    ],
  },
  {
    chave: 'requisicoes',
    area: 'estoque',
    rotas: ['estoque/requisicoes', 'estoque/[lojaId]/requisicoes'],
    titulo: 'Requisições',
    versao: 2,
    aula: [
      { texto: 'O setor pede, o estoque entrega e o saldo baixa na entrega.' },
      { texto: 'Pedido atrasado ganha uma faixa vermelha.' },
    ],
  },
  {
    chave: 'requisicao-nova',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/nova'],
    titulo: 'Nova requisição',
    versao: 1,
    aula: [
      { texto: 'Diga o setor, para quando e o que precisa.' },
      { texto: 'Vai produzir uma receita? “Puxar de uma ficha técnica” já traz os insumos.' },
    ],
  },
  {
    chave: 'requisicao',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/[requisicaoId]'],
    titulo: 'Detalhe da requisição',
    versao: 1,
    aula: [
      { texto: 'O pedido, o que saiu, o que voltou e o que falta.' },
      { texto: 'Sobrou? “Receber de volta” devolve ao estoque.', para: ['requisicao.atender'] },
    ],
  },
  {
    chave: 'requisicao-atender',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/[requisicaoId]/atender'],
    titulo: 'Entregar a requisição',
    versao: 1,
    aula: [
      { texto: 'Entregue o que está saindo; pode ser em partes.' },
      { texto: 'Se o livro diz que não tem mas o produto está aí, confirme: o saldo negativo vira alerta nas divergências.' },
    ],
  },
  {
    chave: 'divergencias',
    area: 'estoque',
    rotas: ['estoque/divergencias', 'estoque/[lojaId]/divergencias'],
    titulo: 'Divergências',
    versao: 1,
    aula: [
      { texto: 'O que a contagem acusa sem requisição, em reais.' },
      { texto: '“Pequeno e repetido” é a diferença que passa despercebida. Por setor mostra onde olhar, não quem culpar.' },
    ],
  },
  {
    chave: 'lojas',
    area: 'rede',
    rotas: ['lojas'],
    titulo: 'Lojas e marcas',
    versao: 1,
    aula: [
      { texto: 'As lojas e as marcas do grupo. Estoque, compras e contagem são sempre de uma loja.' },
      { texto: 'Cadastrar loja ou marca é com quem tem a rede inteira.', para: ['lojas.gerir'] },
    ],
  },
  {
    chave: 'equipe',
    area: 'rede',
    rotas: ['equipe'],
    titulo: 'Equipe',
    versao: 1,
    aula: [
      { texto: 'Quem entra, com que perfil e em quais lojas.' },
      { texto: 'O setor só organiza, não dá acesso. O link de primeiro acesso aparece uma vez: copie ou mande no WhatsApp.' },
    ],
  },
  {
    chave: 'historico',
    area: 'rede',
    rotas: ['historico'],
    titulo: 'Histórico',
    versao: 1,
    aula: [
      { texto: 'Toda mudança, com quem fez, quando e o antes e o depois.' },
      { texto: 'Nada aqui se apaga.' },
    ],
  },
  {
    chave: 'cadastro-do-parceiro',
    area: 'rede',
    rotas: ['cadastro'],
    titulo: 'Cadastro do parceiro',
    versao: 1,
    soNivel1: true,
    aula: [
      { texto: 'Nome e situação do parceiro.' },
      { texto: 'Suspender pede o motivo. Parceiro suspenso entra no ERP e só consulta.' },
    ],
  },
];
