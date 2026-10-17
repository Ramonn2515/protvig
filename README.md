# ProtVig — versão 3 (teste local + retenção automática)

Site institucional + portal de ocorrências com banco SQLite, sessões de login e arquivos privados.

## Instalação

Requer Node.js 20+ e npm.

1. `npm install`
2. Copie `.env.example` para `.env` e altere `ADMIN_EMAIL` e `ADMIN_PASSWORD` (senha forte de pelo menos 12 caracteres).
3. Configure as variáveis de ambiente no serviço de hospedagem (o Node **não** carrega `.env` automaticamente). Para desenvolvimento local, use `node --env-file=.env server.js` ou `npm run server` com variáveis exportadas.
4. Em outro terminal: `npm run dev` e abra `http://localhost:5173`.
5. Para produção: `npm run build` e `NODE_ENV=production node --env-file=.env server.js` (ou `npm start` com variáveis definidas na hospedagem). Abra a porta 3000 via HTTPS/reverse proxy.

O primeiro administrador é criado automaticamente na primeira inicialização se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem definidos. Não existem contas de demonstração ou senhas padrão. Para criar clientes: entre como administrador, cadastre um mercado e vincule um cliente a ele.

## Atenção antes de usar em produção

É uma base funcional inicial, **não uma implantação auditada para dados sensíveis**. Configure HTTPS, armazenamento persistente e backups do diretório `data`, controle de acesso ao servidor, política de retenção e privacidade/LGPD. Acrescente rate limiting no login, CSRF para rotas mutáveis, verificação de conteúdo real dos arquivos, antivírus, recuperação segura de senhas, trilha de auditoria e monitoramento operacional antes de receber imagens reais. O limite de arquivos é 5 por solicitação, 100 MB cada. O serviço não captura câmeras nem faz análise automática; o administrador envia registros manualmente.


## Testar no Windows (passo a passo)

1. Instale **Node.js 22 LTS** em https://nodejs.org e reinicie o terminal.
2. Extraia este ZIP para uma pasta, por exemplo `C:\ProtVig` (onde ficam `package.json` e `server.js`).
3. Abra o PowerShell nessa pasta e execute `npm install`.
4. Copie `.env.example` para `.env` com `Copy-Item .env.example .env`.
5. Edite `.env` e substitua `ADMIN_EMAIL` pelo seu e-mail e `ADMIN_PASSWORD` por uma senha **forte com 12 caracteres ou mais**. Mantenha `NODE_ENV=production` para testar cookies em produção **somente após HTTPS**; para testar localmente, troque para `NODE_ENV=development`.
6. Execute `npm run build`.
7. Execute `node --env-file=.env server.js` e mantenha o PowerShell aberto.
8. Abra `http://localhost:3000` no navegador. Entre com o e-mail e senha definidos no passo 5.
9. Cadastre um mercado, um cliente e publique uma ocorrência de teste.

Se a porta 3000 estiver ocupada, altere `PORT` no `.env`.

## Exclusão automática após 30 dias

- A contagem começa na **data de publicação** da ocorrência (`created_at`), não na data em que a câmera gravou o vídeo.
- A limpeza é executada quando o servidor inicia e a cada **24 horas** enquanto estiver em funcionamento.
- Exclui o registro da ocorrência, sua descrição e os vínculos de fotos/vídeos no SQLite, além dos arquivos físicos em `data/uploads`.
- Se houver falha na remoção de algum arquivo, o sistema registra o erro e tenta novamente na próxima limpeza.
- Não exclui mercados, contas de clientes ou administradores.
- **Exclusão definitiva:** o sistema não oferece recuperação. Faça download antes do vencimento. Backups externos podem manter cópias e exigem uma política de expiração própria.
- Para testar a limpeza sem esperar 30 dias, publique uma ocorrência de teste, pare o servidor, abra o SQLite e altere apenas o `created_at` dessa ocorrência para mais de 30 dias atrás. Ao reiniciar, ela será excluída. Faça isso apenas com dados fictícios.
- O período é de **30 dias corridos** (aproximação operacional de um mês), não um mês de calendário.

## Limitações

Este projeto ainda é uma base de teste local, não uma plataforma pronta para hospedar vídeos reais de vigilância. Falta endurecimento de segurança (CSRF, rate limiting, validação de conteúdo de uploads, antivírus, auditoria), HTTPS e revisão de privacidade/LGPD. O navegador não precisa acessar câmeras: a publicação é manual.
