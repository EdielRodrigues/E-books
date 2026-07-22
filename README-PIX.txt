PAGAMENTO PIX

O cliente escolhe um plano, o backend gera o Pix no Mercado Pago, grava o pagamento em /payments e mostra QR Code/copia e cola. A tela consulta o status a cada 12 segundos. O webhook confirma no servidor e libera o usuário automaticamente.

Para ativar: preencher Firebase em firebase-config.js, colocar demoMode:false e informar functionsBaseUrl. O Access Token fica somente no backend-pix.
