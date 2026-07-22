E-BOOK DO CLIENTE — PERSONAL TRAINER

Projeto separado do painel administrativo.

Recursos:
- Cadastro com nome, CPF, telefone, e-mail e senha.
- Login persistente.
- Acesso somente quando status = ativo e vencimento ainda válido.
- Tela de pendência ou bloqueio.
- E-book completo, offline, progresso, favoritos, ferramentas e diário.

A parte de pagamento Pix está pausada. O administrador libera o acesso manualmente pelo painel.

Para ativar o Firebase depois:
1. Preencha firebase-config.js.
2. Defina demoMode: false.
3. Use a mesma configuração no painel administrativo.
4. Publique as regras fornecidas junto do painel.


PRESENÇA ONLINE
- O aplicativo grava presença em /presence/UID.
- Usa .info/connected e onDisconnect para marcar offline automaticamente.
- Atualiza o último sinal a cada 60 segundos.
