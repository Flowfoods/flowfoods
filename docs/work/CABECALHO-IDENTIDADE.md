# Cabeçalho e identidade visual

Entrega autorizada em 20/11/2026 sobre a base `fa7d7401506786a010e93a9931e18684c7615efd`.

## Contrato

- Cabeçalho compartilhado do parceiro e da gestão FlowFoods: imagem original FlowFoods com 96 px de largura; assinatura BARNEY OS com intervalo vertical de 18 px. Sem ERP na composição da marca. Correção de 20/11 durante a implementação: FlowFoods menor e à esquerda substitui a referência anterior centralizada de 145 px.
- Revisão de 20/11 após a publicação: a faixa acompanha claro, escuro e sistema do próprio ERP, revogando a exceção anterior de fundo sempre escuro. Herda os tokens e o material da direção Apple (decisão 530), com fundo sólido quando transparência reduzida ou sem suporte. As variantes originais da logo mudam por CSS; a preferência manual prevalece sobre o aparelho. Logos de clientes e fotos pessoais não recebem filtros nem recoloração.
- FlowFoods fica à esquerda. Na lateral expandida (desktop a partir de 900 px), o conjunto FlowFoods e BARNEY OS fica centralizado sobre a coluna de 232 px. Na lateral recolhida de 68 px e no celular, mantém 96 px de largura e o respiro à esquerda para preservar a legibilidade. A marca cliente fica no centro geométrico do cabeçalho; até 540 px, ocupa uma segunda linha centralizada. Conta pessoal à direita.
- A logo cliente tem área de 128 × 64 px, preservando proporção e nome legível. Faixa com 12 px de respiro vertical, reduzindo a altura sem perder alvos de toque; rótulo redundante da seleção é apenas acessível.
- A seleção da marca é uma preferência visual validada no servidor, com escopo de usuário e parceiro. Não altera a visão de lojas nem filtros de negócio. Respostas de contextos anteriores não substituem a marca atual.
- Lojas e marcas contém Identidade visual. A logo pertence à Marca canônica, compartilhada pela rede conforme o modelo existente. Escrita exige `lojas.gerir` e parceiro liberado para escrita.
- Meu perfil permite enviar, substituir e remover a foto da própria pessoa. UsuarioErp e User mantêm fotos distintas; a foto pessoal não muda com a marca ou parceiro. Sem foto/imagem indisponível, aparecem iniciais.

## Persistência e proteção

Migration aditiva com campos opcionais `Marca.logoArquivo`, `UsuarioErp.fotoArquivo` e `User.fotoArquivo`. Conteúdo no volume privado já existente (`ERP_ARQUIVOS_DIR`, padrão `/data/erp`), em namespaces separados por dono. Upload JPG/PNG/WebP estático, até 8 MiB, 4096 px por lado e 16 megapixels. Validação por bytes, limpeza de metadados, nomes aleatórios e gravação condicional à versão anterior. Sem URL externa.

Rotas de leitura e escrita conferem a sessão e o dono; as escritas conferem origem antes de ler o corpo. Respostas privadas sem cache. Troca e remoção invalidam a imagem anterior; erro não substitui a imagem salva. A logo não concede acesso a módulos ou lojas.

## Validação e reversão

Testes focados cobrem preferência visual, autenticação, permissões, isolamento, formatos, limites, concorrência e estados da interface. QA do aplicativo usa apenas contas, marcas e banco sintéticos descartáveis. O portão integral em `.github/workflows/deploy.yml` permanece obrigatório, inclusive migrations nos três perfis e build.

Revisão independente e evidências do portão são vinculadas ao PR. Integração e deployment exigem confirmação separada. Safari/iPhone físico e adoção pelo operador não são comprovados pela emulação de viewport.

Reversão por commit da aplicação, mantendo as colunas opcionais e o volume privado. Não remover dados por rollback do cabeçalho.
