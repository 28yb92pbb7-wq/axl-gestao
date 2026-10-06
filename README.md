# AXL Gestão & Prospecção

**AXL NFC — Tecnologia que aproxima.** Aplicação real em português do Brasil, construída com Next.js, React e TypeScript. Esta entrega é um **MVP local executável** das fases 1 e 2, com CRM básico e primeiras operações das fases seguintes. O banco local persiste os registros em SQLite. O backend Supabase já está implementado para dados compartilhados e sessões. A conexão com um projeto real e o deploy HTTPS ainda precisam de configuração e validação.

## O que já funciona

- Login de administrador, sessão de 8 horas, logout, criação de usuários e troca de senha.
- Layout AXL responsivo, 17 módulos no menu e busca de empresas, telefones, cidades, documentos, produtos, vendedores, vendas e pedidos.
- Central do Dia com meta, faturamento, retornos pendentes/vencidos, oportunidades com score parcial, pedidos e estoque baixo.
- Clientes e leads: cadastro, edição, ficha, histórico preservado, vendas, LTV, contatos, observações e agendamento de retornos.
- Pipeline básico com alteração de etapa e motivo obrigatório ao marcar perdido.
- Catálogo editável: preço, custo, composição, SKU, categoria, unidade, flags de NFC/acrílico/estoque e ativação.
- Venda com múltiplos itens, quantidade, pagamento parcial, vendedor, custo, lucro, margem e comissão. A venda cria um pedido e converte a empresa em cliente.
- Custos e composição preservados no momento da venda; mudanças futuras no catálogo não recalculam o histórico.
- Pedidos em Kanban, prazo e observações. Produção aprovada baixa os materiais em uma transação e bloqueia baixa repetida ou estoque insuficiente.
- Materiais, movimentações, compras com custo médio ponderado e alertas de estoque.
- Financeiro básico com recebimentos parciais, saldo a receber, vencidos, despesas e saldo de caixa acumulado. Faturamento e caixa aparecem separados.
- Metas diária, semanal e mensal editáveis; cadastro de vendedores e três modelos de comissão: percentual da venda, percentual do lucro e centavos por placa.
- Rotas manuais, ordem de visitas, status por parada e links de navegação para Google Maps.
- Dashboard com filtros de período, faturamento diário, segmentos e indicadores. Rankings de cidades, segmentos e clientes.
- Pesquisa oficial Google Places via servidor, quando houver chave. Sem scraping e sem persistência permanente das respostas Google.
- Busca, ordenação, paginação e CSV nas principais tabelas; auditoria das operações.

Os valores iniciais de produtos e materiais são demonstrativos e editáveis. Empresas do seed são fictícias. Não há avaliações Google inventadas nos cadastros.

## Começar em poucos passos

Requisitos: **Node.js 24 ou superior**, npm e uma pasta de projeto com permissão de escrita.

```bash
cd /workspace/axl-gestao
npm ci
npm run db:seed
npm run dev
```

1. A preparação cria o banco em `.data/axl.sqlite`, o administrador, 11 produtos, materiais, metas e empresas fictícias.
2. Abra o arquivo local `.data/acesso-inicial.txt` para consultar o e-mail e a senha gerada. O arquivo é ignorado pelo Git, tem acesso restrito e sua senha não aparece nos logs de preparação.
3. Abra a aplicação local na porta **3000**. Na nuvem, o processo é validado por requisições internas; não há publicação automática.
4. Para testar o fluxo: **Clientes → Novo cliente → Abrir ficha → Registrar venda → Financeiro → Registrar pagamento**.
5. Para produzir: **Pedidos → Atualizar pedido → Arte aprovada → Produção → Marcar produzido**. O estoque é baixado só nessa confirmação.
6. Troque a senha em **Configurações** antes de inserir dados reais.

`npm run db:seed` é repetível: quando já existe usuário, não sobrescreve dados nem recria a senha. Arquivos de banco, sessões, senha inicial, builds e dependências estão ignorados no Git. Não apague `.data` para atualizar o projeto. As migrações locais são aplicadas na primeira abertura do banco após reiniciar o processo.

### Configuração opcional

Copie `.env.example` para `.env.local` e preencha apenas o que precisar. Nunca envie esse arquivo ao Git. A preparação lê `.env.local`; o Next.js também o lê ao iniciar.

| Variável                        | Para que serve                                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_PATH`                 | Caminho do SQLite; padrão `.data/axl.sqlite`.                                                                                                   |
| `AXL_ADMIN_EMAIL`               | E-mail do primeiro administrador, usado apenas na primeira preparação.                                                                          |
| `AXL_ADMIN_PASSWORD`            | Senha inicial opcional, mínimo recomendado de 12 caracteres. Se ausente, o seed gera uma senha aleatória.                                       |
| `AXL_DEMO_SEED`                 | `false` evita criar empresas fictícias na primeira preparação. Produtos e materiais iniciais continuam disponíveis.                             |
| `AXL_ALLOW_LOCAL_AUTH`          | Login local em build de produção exige `true`. Somente para instalação controlada com disco persistente e HTTPS; não habilita suporte à Vercel. |
| `GOOGLE_PLACES_API_KEY`         | Chave privada do servidor para a API oficial Places.                                                                                            |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL do projeto Supabase, para o backend remoto.                                                                                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública/anon do Supabase. A proteção dos dados depende de Auth e RLS; não é uma service-role key.                                         |

Não coloque chaves privadas em variáveis com prefixo `NEXT_PUBLIC_`. Nenhuma chave Google é enviada ao navegador.

## Banco e organização do projeto

- `database/local.sql`: schema relacional local, chaves estrangeiras, restrições e versão inicial.
- `lib/db.ts`: acesso ao SQLite, migrações incrementais, transações, auditoria e atividades.
- `lib/domain.ts`: validação e regras de vendas, margem, score, comissão, composição e LTV.
- `lib/service.ts`: operações de negócio, verificadas antes de gravar. Valores monetários são inteiros em **centavos**, evitando erro de ponto flutuante para preços e totais.
- `lib/auth.ts`: senha com scrypt e salt, tokens aleatórios, hash do token no banco e cookie HttpOnly/SameSite. Cookie Secure em produção.
- `app/api/*`: autenticação, dados e integração Google, com verificação de origem nas escritas.
- `components/views/*`: módulos de interface; `components/ui.tsx`: formulários, tabelas e diálogos reutilizáveis.
- `lib/integrations/supabase.ts`: funções preparadas de Supabase Auth e upload privado. Conectadas ao backend remoto; anexos ainda não têm interface.
- `database/supabase.sql`: migração PostgreSQL com 33 tabelas, UUID, Auth, relações, timestamps, soft delete onde aplicável, índices, RLS e bucket privado de arquivos.
- `tests/*`: regras, transações, PostgreSQL/RLS e jornada no navegador.
- `TODO.md`: todo o restante do escopo, por fase e referência à especificação.

No MVP local, leads e clientes compartilham `companies`, com status e flag de cliente. Itens de pedido vêm da venda. No schema remoto existem entidades separadas para suportar contatos múltiplos, produção, comissões, anexos e evolução. O backend remoto usa RPCs PostgreSQL transacionais e Supabase Auth. Importar dados anteriores de SQLite ainda exige um migrador explícito; ativar Supabase inicia uma base independente.

### Regras preservadas

- Custos da composição usam o custo médio vigente dos materiais. Na venda, ficam registrados preço, custo, margem, composição e comissão daquele instante.
- Produção usa o snapshot dos componentes, não a composição atual. Uma segunda confirmação não faz uma segunda baixa.
- Itens com `Controla estoque` desativado não têm baixa automática. O catálogo de demonstração já vem com as composições das placas e materiais controlados.
- Pagamento não pode exceder o saldo. Falhas no meio da operação revertem toda a transação.
- Atualizar empresa não apaga seu histórico ou observações anteriores.
- Retornos da interface representam horários de São Paulo; timestamps de banco ficam em UTC. Moeda, datas e percentuais usam formato brasileiro.
- CSV usa separador `;`, UTF-8 e neutralização de fórmulas. Valores monetários brutos exportados estão em centavos. XLSX e importador com mapeamento ainda estão pendentes.

## Google Places

1. No Google Cloud, habilite **Places API (New)**, faturamento, limites de uso e restrição da chave para essa API.
2. Configure `GOOGLE_PLACES_API_KEY` no ambiente do servidor e reinicie a aplicação.
3. Na nuvem, permita `places.googleapis.com` nas configurações de rede. O domínio está incluído no rascunho de configuração preparado para este fluxo.
4. Em **Prospecção**, pesquise segmento, cidade, UF, bairro ou CEP. Filtre os resultados por nota mínima/máxima, quantidade mínima/máxima de avaliações, telefone e site.

A pesquisa usa `places:searchText`, seleção explícita de campos, limite de 20 resultados e até 5 consultas por minuto por usuário. O botão de carregar mais busca a próxima página e remove duplicados por place_id. Os filtros são aplicados aos resultados carregados; a busca não garante todos os comércios da cidade. Múltiplas cidades automáticas permanecem pendentes. A ausência da chave mostra uma mensagem clara e não impede CRM, vendas ou estoque.

As respostas permanecem apenas na memória da tela e retornam com `Cache-Control: no-store`; não são exportadas. Ao criar um lead, o usuário informa dados comerciais próprios/confirmados e o sistema preserva o `place_id`. A interface mostra Google Maps e atribuições retornadas pela API. A consulta real não foi validada porque nenhuma chave estava disponível. Revisar atribuição visual e termos atuais antes de lançamento público. O schema remoto tem `google_last_synced_at` e checks de posição associados a consulta, localização e data; sua interface de sincronização/histórico ainda está pendente.

## Supabase e arquivos

Para conectar um projeto Supabase novo:

1. Execute no SQL Editor, nesta ordem: `database/supabase.sql`, `database/supabase-runtime.sql` e `database/supabase-state.sql`. O primeiro arquivo é para banco novo; não o execute sobre uma instalação existente sem revisar a migração.
2. Em **Authentication → Users → Add user**, crie seu administrador com e-mail real, senha própria e confirmação do e-mail. Guarde a senha fora do repositório.
3. No SQL Editor, execute o trecho abaixo, substituindo somente o e-mail pelo mesmo e-mail criado. A aplicação não promove usuários por rotas públicas.

```sql
insert into public.profiles (id, email, name, role)
select id, email, 'Administrador AXL', 'ADMIN'
from auth.users where email = 'SEU_EMAIL'
on conflict (id) do update set role = 'ADMIN';
```

4. Configure `AXL_BACKEND=supabase`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave publicável/anon, nunca service_role) em `.env.local` ou no ambiente da Vercel. Reinicie ou refaça o deploy após mudar variáveis.
5. Entre com o e-mail e senha criados no Supabase. O acesso local em `.data/acesso-inicial.txt` pertence apenas ao SQLite e não é transferido automaticamente.

Sessões remotas usam cookies HttpOnly e renovação pelo proxy; os dados passam por RLS e funções transacionais com verificação ADMIN. O cadastro de usuários pela interface exige `SUPABASE_ADMIN_KEY` privado no servidor; sem essa opção, cadastre-os pelo painel Supabase e provisione o profile pelo SQL Editor. A chave não é necessária para pesquisar, cadastrar empresas, vender ou controlar estoque.

A RLS inicial permite dados apenas ao ADMIN; os demais perfis ficam bloqueados até sua implementação. Cada usuário autenticado pode ler seu próprio profile. O bucket `axl-files` é privado e preparado para PNG, JPG, WebP e PDF até 10 MB. A tela de upload e o vínculo de anexos ainda não estão conectados. Nunca use `service_role` no navegador.

A migração foi executada em PostgreSQL embarcado (PGlite) com estruturas de Auth/Storage simuladas; também foram testadas as políticas, vendas, recebimentos, produção, estoque e isolamento do perfil vendedor. Isso valida SQL e relações, **não comprova integração com um projeto Supabase real**.

## Testes e build

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

O teste no navegador requer a aplicação de desenvolvimento ativa, o seed e Chromium. O ambiente de nuvem já possui `/usr/bin/chromium`:

```bash
npm run dev
# Em outro terminal:
npm run test:browser
```

Em outra máquina, ajuste o caminho do Chromium em `playwright.config.ts` ou use o navegador instalado pelo Playwright. A jornada cria registros de teste no banco local; rode em um ambiente de desenvolvimento. O runner lê o acesso inicial do arquivo ignorado; se trocar a senha, ajuste o acesso de teste de forma segura. O conjunto de regras e transações usa banco temporário isolado, sem alterar seus dados.

## Publicação e Vercel

A aplicação suporta Vercel usando exclusivamente `AXL_BACKEND=supabase`. A abertura de SQLite em Vercel é bloqueada para evitar perda de dados.

1. Conclua o provisionamento Supabase e teste o login remoto.
2. Envie o código ao repositório GitHub e importe-o na Vercel como Next.js, Node 24.
3. Defina `AXL_BACKEND=supabase`, URL e chave pública Supabase; adicione a chave Google privada para habilitar a pesquisa real. Não configure senha do banco nem acesso local.
4. Publique e configure a URL HTTPS em **Supabase Authentication → URL Configuration**. A publicação fornece a URL acessível pelo computador e pelo celular.
5. Valide login/logout, venda/pagamento/produção e Google no destino antes de usar dados reais.

O usuário publicou a aplicação em https://axl-gestao.vercel.app e aplicou as três migrações no projeto Supabase. A autenticação remota e a recuperação por e-mail ainda aguardam validação no destino. O limitador de consultas e tentativas é por processo; antes de ampliar o uso, adote limite compartilhado. Permissões dos demais perfis, arquivos e importação de dados locais permanecem pendentes.

## Limites atuais

Leitura de dados local é integral para o administrador e paginação/filtros acontecem no navegador; para uma base grande, implementar consultas paginadas no servidor. Perfis além de ADMIN não têm acesso funcional. Não há importação XLSX/CSV, parcelamento com calendário, conciliação, mapa embutido, PWA offline ou automações. Todos permanecem no escopo registrado em `TODO.md`.

## Recuperação de senha

Em Supabase Authentication → URL Configuration, configure Site URL como `https://axl-gestao.vercel.app` e permita `https://axl-gestao.vercel.app/reset-password` em Redirect URLs (ajuste ao domínio do deploy). A tela de login remoto oferece Esqueci minha senha. A página `/reset-password` recebe o link de recuperação, remove os tokens do endereço e permite senha com pelo menos 12 caracteres. O servidor valida a sessão Supabase antes de atualizar a senha e encerra as sessões após a troca. Links recebidos em `/` ou `/login` com fragmento de recuperação também são encaminhados à tela correta. Envie um novo link depois de configurar; links antigos podem estar expirados. O envio real de e-mail depende da configuração e limites do Supabase/SMTP. Não exige chave administrativa.
