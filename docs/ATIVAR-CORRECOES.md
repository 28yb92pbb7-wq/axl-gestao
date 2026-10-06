# Ativar as correções AXL de 06/10/2026

O código contém venda rápida, filtros e detalhes do Dashboard, ficha comercial, contatos confirmados, importação por link Maps, rotas externas, lotes, contagem, reserva, produção, conferência financeira e acesso de colaborador. A implantação real exige a atualização do banco. Não reimporte a planilha.

## 1. Atualizar o banco existente

Abra o projeto **fajcyttfolvtemlpuajf** no Supabase → SQL Editor → nova consulta. Copie todo o arquivo [update-2026-10-06.sql](../database/update-2026-10-06.sql) e clique **Run**. O arquivo usa uma transação: se falhar, nenhum trecho da atualização é confirmado. Ele pressupõe os quatro arquivos anteriores já aplicados, inclusive `supabase-import.sql`.

Não execute novamente o esquema inicial. A atualização não apaga/recalcula as 35 vendas importadas, não cria pagamentos para elas e não baixa suas 91 placas do estoque. Os seis lotes são referências históricas sem movimento de estoque/caixa. A reexecução não duplica os lotes ou soluções.

Depois, abra o site e atualize os dados. Se aparecer “atualização operacional do banco precisa ser aplicada”, o código está novo e a função de leitura v2 ainda não está disponível nesse projeto.

## 2. Publicar e acessar

Na Vercel, confirme que o projeto acompanha a branch `AXL-gestao`. Espere o deployment correspondente ao commit destas correções ficar **Ready**. Se não houver deployment automático, use **Deployments → Redeploy** da versão correta. A atualização de variáveis exige novo deployment.

O acesso permanece em https://axl-gestao.vercel.app/login, no computador ou celular. Use a conta existente de Alex e sua senha atual; esta atualização não redefine senhas. `AXL_BACKEND` deve ser `supabase`; a URL e a chave pública precisam pertencer ao mesmo projeto.

## 3. Criar a conta de Laura

Alex entra com perfil ADMIN. Em Configurações → Usuários, informa nome, e-mail real de Laura, senha inicial de pelo menos 12 caracteres e perfil **Colaborador AXL**. Compartilhe a senha diretamente com Laura, fora do código/chat. Ela entra pelo mesmo link com sua própria conta e pode trocar a senha em Configurações.

Para essa criação funcionar na Vercel, configure **SUPABASE_ADMIN_KEY** exclusivamente no servidor, com a chave administrativa do projeto, e faça novo deployment. Nunca use prefixo `NEXT_PUBLIC_` nessa chave. Sem essa chave, o sistema informa a pendência, sem criar apenas uma linha sem login.

Alternativa sem chave administrativa na Vercel: Supabase → Authentication → Users → Add user → Create user, com o e-mail de Laura e senha inicial. Depois, no SQL Editor, execute o SQL abaixo trocando apenas o e-mail. Não envia convite:

```sql
insert into public.profiles (id,email,name,role)
select id,email,'Laura','VENDEDOR' from auth.users
where lower(trim(email))=lower(trim('EMAIL_REAL_DA_LAURA'))
on conflict(id) do update set role='VENDEDOR',name='Laura'
returning email,role;
```

ADMIN administra contas e pesos. Colaborador opera o CRM, vendas, pedidos, estoque e conferências. Ambos compartilham esta única AXL. Não há isolamento de múltiplas organizações nem restrição por carteira nesta versão. Produção e Financeiro especializados continuam bloqueados. Nenhum convite foi disparado.

## 4. Importação por link Google Maps (decisão revisada)

A pesquisa ampla e os mapas incorporados foram retirados. Em Prospecção, Clientes ou Venda rápida, use **Adicionar pelo Google Maps**. Copie o link de uma ficha, cole com ou sem texto compartilhado, consulte e confirme a empresa. Links de rotas, listas, região e busca genérica não viram empresas arbitrárias. Place ID explícito permite detalhes; CID não é convertido em Place ID. Nome/endereço do link ou nome/cidade fornecidos servem para identificar até cinco candidatos, com seleção obrigatória.

**Preencher manualmente com este link** funciona sem configurar/pagar Google e sem resolver o link curto. Informe dados próprios e confirme a empresa. A mensagem indica claramente que não houve preenchimento automático. Cadastros e vendas continuam sem API.

Para preencher automaticamente: habilite Places API (New), vincule faturamento quando exigido pelo Google, configure quotas e restrinja a chave à API necessária. Guarde `GOOGLE_PLACES_API_KEY` somente no servidor Vercel, sem prefixo público e sem restrição de referrer de navegador. Faça novo deployment. **Configurações → Testar importação por link** verifica esse fluxo. Maps Embed API, Maps JavaScript API, Routes API e chave Embed não são necessárias.

O resolvedor aceita apenas HTTPS, hosts/caminhos explícitos do Google Maps, sem credenciais, IP, porta personalizada ou redirecionamentos para outros hosts. Até cinco saltos, dez segundos, respostas HEAD canceladas sem leitura/raspagem de HTML. A consulta Places tem FieldMask explícito e oito consultas por minuto por usuário/instância. Limites distribuídos globais devem ser configurados também nas quotas do Google e na hospedagem.

Os dados Google não são copiados automaticamente para campos próprios. Prévia em memória por 15 minutos, vinculada ao usuário; nenhuma ficha/nota/avaliação/foto/texto de avaliação é gravada permanentemente. Place ID, link e data/origem da consulta podem permanecer associados ao CRM. O nome próprio e dados informados pela empresa são preenchidos separadamente. Uma prévia pode expirar ou se perder entre instâncias Vercel; consulte novamente ou use cadastro manual. A atualização não reescreve campos manuais nem histórico. Reimportar Place ID/link existente abre a ficha, sem nova venda/contato.

**Filtrar minhas empresas** considera somente registros adicionados, permite todos sem filtro e combina cidade/bairro/segmento/nota/avaliações/contato/responsável. Nota 4,8 não arredonda para 5; menos de 20 exclui exatamente 20. Nota/avaliações exigem consulta atual, com atualização de até oito empresas da lista por ação. Ausência verificada e não consultado são diferentes. Maps e direções abrem externamente; a lista de visitas foi preservada.

Referências: [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details), [Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id), [políticas](https://developers.google.com/maps/documentation/places/web-service/policies), [URLs](https://developers.google.com/maps/documentation/urls/get-started). Os campos REST foram conferidos nas definições oficiais googleapis. O portal Google recusou acesso pelo proxy; validar termos/atribuição atuais antes de uso comercial público. Consulta Google real permanece pendente sem credencial.

## 5. Conferir histórico, custo, estoque e caixa

Primeiro, conte materiais em Estoque → Contagem física. Saldo ausente aparece como “a conferir”; não calcule estoque atual subtraindo 91 placas das compras. Depois confira os lotes históricos, inclusive situação atual do NFC-03, aproximado e pendente apenas na referência de 20/09/2026. “Conferir referência atual” atualiza o total já recebido sem criar entradas retroativas; só registre novos recebimentos após essa conferência.

A base/acrílico usa R$3,40 como parâmetro atual informado, **interpretação provisória somente da base**. Adesivo usa R$0,83; NFC usa R$0,79 **estimado**, substituível por lote/custo confirmado. NFC = base + adesivo + NFC; Pix QR = base + adesivo; mesa = adesivo + NFC. Serviço digital tem custo próprio, inclusive zero explícito, ou fica desconhecido. Composição/custo são editáveis. O custo aqui é de materiais/serviço informado, sem presumir mão de obra, impostos, deslocamentos ou todas as despesas.

Pacotes mantêm um total global. Sem valores por item, receita não é atribuída artificialmente a placas ou serviços. Se informar todos os valores dos itens, a soma precisa conciliar com o total final. Desconto informado já está refletido nesse total.

Solis fica preservado em 5 placas/R$165,00. A ficha sinaliza revisar 3 NFC + 2 Pix e referência aos extras R$15,00; nada foi corrigido automaticamente.

Reserva reduz disponível sem consumir físico. Produção exige aprovação e baixa uma única vez. Alterar itens antes de produzir libera reservas e preserva a venda histórica; cancelar após consumo não repõe material automaticamente. Para produto pronto, vincule um material de estoque acabado ao produto, faça contagem física e selecione essa origem: não haverá segunda baixa de componentes.

Depois confira pagamentos e saldo inicial do caixa. Vazio significa desconhecido, não recebido/pendente confirmado. Compras de estoque são investimento; consumo entra no custo da venda. Não duplique a compra também em despesa. Caixa calculado exige saldo inicial conferido no começo da data escolhida; soma movimentos confirmados dessa data em diante. Resultado bruto é parcial/estimado quando faltam custos ou há estimativas, e não representa lucro líquido completo.

WhatsApp abre com número e texto editáveis; apenas abertura é tentativa. Confirme mensagem efetivamente enviada, resposta e resultado separadamente. Contato realizado exige evento efetivo. Autoria de vendas, contatos e ajustes é registrada.

## Compatibilidade e desativação

Faça backup antes de alterações administrativas. Para desativar v2 sem apagar dados: restaure as funções de `supabase-runtime.sql` e `supabase-state.sql`, execute `disable-v2.sql` e volte ao deployment anterior na Vercel. Novos dados/colunas ficam preservados; versões anteriores podem não exibir pedidos diretos e dados v2. Não apague tabelas ou reimporte a planilha para voltar de versão. Reativar usa a atualização SQL e o código atual.

## Evidências e limites

Testes de SQLite, PostgreSQL/PGlite com Auth/Storage simulados e navegador verificam vendas, pagamentos desconhecidos, reexecução, composição, reservas, consumo único, lotes, histórico preservado, conta própria compartilhada e bloqueio de administração para colaborador. Testes Google usam fixtures, sem scraping ou respostas fictícias na aplicação publicada. Conexão Supabase real, criação real de Laura, Google real e deployment Vercel exigem configuração e validação no serviço externo.
