# Ativar as correções AXL de 06/10/2026

O código contém venda rápida, filtros e detalhes do Dashboard, ficha comercial, contatos confirmados, pesquisa Places New, rotas, lotes, contagem, reserva, produção, conferência financeira e acesso de colaborador. A implantação real exige a atualização do banco. Não reimporte a planilha.

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

## 4. Ativar e diagnosticar Google

No projeto Google Cloud, habilite **Places API (New)** e vincule faturamento. Crie a chave do servidor, restrita à Places API (New), e configure **GOOGLE_PLACES_API_KEY** nas variáveis privadas da Vercel. Não use restrição de HTTP referrer nessa chave de servidor; restrição por IP exige infraestrutura com saída estável compatível. Faça novo deployment e use **Configurações → Testar conexão Google**.

O diagnóstico diferencia chave ausente/inválida, API desabilitada, faturamento, restrições, cota e rede. Um 403 sem causa específica é informado como acesso recusado, sem inventar o motivo. Consultas e diagnóstico usam a API paga.

Para mapa incorporado, habilite **Maps Embed API** e crie **outra chave**, restrita a essa API e ao referrer `https://axl-gestao.vercel.app/*` (inclua domínio próprio quando houver). Configure **GOOGLE_MAPS_EMBED_KEY**. Essa chave é visível ao navegador por definição; não reutilize a chave privada de Places. Sem ela, a ficha e a lista continuam oferecendo links externos Google e rota.

A busca aceita somente cidade, ou referência geográfica com raio e cidade vazia. Segmento, bairro e filtros são opcionais. Nota mínima/máxima é inclusiva; nota exata não é arredondada. “Menos de 20” exclui 20; “20 ou mais” inclui 20; “mais de 100” exclui 100. Desconhecido não vira zero. “Sem informação publicada” exige que o campo tenha sido consultado e não comprova ausência do serviço no comércio.

As páginas são limitadas e deduplicadas por Place ID. Município é verificado pelos componentes de endereço; desconhecidos ficam sinalizados e cidades diferentes são excluídas. Resultados Google permanecem na sessão; dados salvos no CRM são os confirmados pelo usuário. Distância usa referência geográfica e coordenadas, sem promessa de trajeto viário.

Documentação oficial de referência:

- https://developers.google.com/maps/documentation/places/web-service/text-search
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/choose-fields
- https://developers.google.com/maps/documentation/embed/embedding-map
- https://developers.google.com/maps/documentation/urls/guide

A especificação REST oficial foi consultada em https://github.com/googleapis/discovery-artifact-manager/blob/master/discoveries/places.v1.json: confirma `pageSize`/`pageToken`/`nextPageToken`, páginas de até 20 resultados e arredondamento de `minRating` para cima em passos de 0,5. Por isso, não enviamos `minRating` e aplicamos a comparação precisa aos resultados carregados. Também foram consultadas definições de campos/endereços no repositório `googleapis/googleapis`. O proxy recusou o portal `developers.google.com`; a adição do domínio foi salva no rascunho, sem comprovar liberação em execução. Consulta Google real não foi validada sem chave. Testes simulados estão identificados como tais.

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
