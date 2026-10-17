# ProtVig — Publicação pelo navegador no Render

## Antes de começar
- Não publique imagens reais de clientes até testar isolamento de contas, autorização e exclusão automática.
- Render com disco persistente exige serviço pago. O arquivo `render.yaml` solicita plano `starter` e disco de 5 GB; confirme preços no painel antes de aceitar.
- Guarde credenciais fora do GitHub. O Render pedirá `ADMIN_EMAIL` e `ADMIN_PASSWORD` na implantação.

## 1. Subir projeto no GitHub
1. Entre em https://github.com e crie conta, se necessário.
2. Clique em **New repository**, escolha `protvig` e marque **Private**.
3. Faça upload dos arquivos deste pacote **na raiz do repositório** (inclusive `render.yaml`). Não envie o arquivo ZIP como único arquivo.
4. Confirme o commit.

## 2. Publicar no Render
1. Entre em https://dashboard.render.com e conecte sua conta GitHub.
2. Escolha **New > Blueprint** e selecione o repositório privado `protvig`.
3. O Render lerá `render.yaml`. Confira o plano pago e disco persistente antes de aprovar.
4. Informe `ADMIN_EMAIL` (seu e-mail) e `ADMIN_PASSWORD` (senha forte com 12+ caracteres) quando solicitado.
5. Aguarde o deploy e abra a URL fornecida pelo Render, em `onrender.com`.

## 3. Validar com dados fictícios
- Faça login como administrador.
- Cadastre dois mercados, cada um com seu cliente.
- Lance ocorrências de teste, envie mídias fictícias e confira se o cliente A não vê dados do cliente B.
- Reinicie o serviço e confirme que registros e anexos continuam disponíveis.
- A limpeza dos dados ocorre na inicialização e a cada 24 horas; os registros expiram 30 dias após a publicação.

## Atenção antes do uso real
Este é um protótipo que precisa de testes e revisão de segurança, políticas de retenção, backups e privacidade/LGPD. A exclusão de dados ativos não garante eliminação imediata de snapshots/backups do provedor.
