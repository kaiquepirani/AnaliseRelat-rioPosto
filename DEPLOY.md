# ETCO Frota — Guia de Deploy

## O que você vai precisar (tudo gratuito)
- Conta no GitHub: https://github.com
- Conta no Vercel: https://vercel.com (faça login com o GitHub)
- Chave de API do Claude: https://console.anthropic.com

---

## Passo 1 — Subir o código no GitHub

1. Acesse https://github.com e clique em **New repository**
2. Nome: `etco-frota`
3. Deixe como **Private** e clique em **Create repository**
4. No seu computador, descompacte a pasta `etco-frota`
5. Abra o terminal dentro da pasta e execute:

```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/etco-frota.git
git push -u origin main
```

---

## Passo 2 — Criar o banco de dados (Vercel KV)

1. Acesse https://vercel.com e faça login
2. No menu lateral, clique em **Storage**
3. Clique em **Create Database** → escolha **KV (Redis)**
4. Nome: `etco-frota-db` → clique em **Create**
5. Anote as variáveis que aparecem: `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`

---

## Passo 3 — Fazer o deploy no Vercel

1. No Vercel, clique em **Add New → Project**
2. Conecte ao GitHub e selecione o repositório `etco-frota`
3. Clique em **Deploy** (o Vercel detecta Next.js automaticamente)
4. Aguarde o build finalizar (cerca de 2 minutos)

---

## Passo 4 — Configurar as variáveis de ambiente

1. No Vercel, acesse seu projeto → **Settings → Environment Variables**
2. Adicione as seguintes variáveis:

| Nome | Valor |
|------|-------|
| `ANTHROPIC_API_KEY` | sua chave do console.anthropic.com |
| `KV_URL` | valor copiado no Passo 2 |
| `KV_REST_API_URL` | valor copiado no Passo 2 |
| `KV_REST_API_TOKEN` | valor copiado no Passo 2 |
| `KV_REST_API_READ_ONLY_TOKEN` | valor copiado no Passo 2 |

3. Após adicionar, vá em **Deployments** e clique em **Redeploy** no último deploy

---

## Passo 5 — Acessar o site

Após o redeploy, seu site estará disponível em:
`https://etco-frota.vercel.app`

Compartilhe esse link com os diretores. O site é responsivo e funciona em celular também.

---

## Como usar

1. Acesse o link do site
2. Clique em **Enviar extrato PDF** no canto superior direito (ou arraste o arquivo)
3. Aguarde o processamento (cerca de 30–60 segundos por extrato)
4. O dashboard atualiza automaticamente com os novos dados

---

## Atualizar a relação de frota

Quando precisar atualizar os veículos da frota, edite o arquivo `lib/frota.ts`,
faça commit e push para o GitHub — o Vercel fará o redeploy automaticamente.

---

## Custo estimado

- Vercel: gratuito (plano Hobby)
- Vercel KV: gratuito até 30.000 requests/mês
- Anthropic API: ~R$ 0,50 a R$ 1,50 por extrato processado (claude-opus-4-5)

---

## Suporte

Em caso de problemas, verifique:
1. Se a `ANTHROPIC_API_KEY` está correta e tem créditos
2. Se as variáveis do KV foram adicionadas corretamente
3. Os logs em Vercel → seu projeto → **Functions** → **Logs**
