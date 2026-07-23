// Configuração pública do Firebase Web.
window.APP_CONFIG = {
  demoMode: false,
  firebase: {
    apiKey: "AIzaSyCdI11L3Y2GFCy4XzbpSwYGchEtFBzj6Sw",
    authDomain: "ferramentas-projeto.firebaseapp.com",
    databaseURL: "https://ferramentas-projeto.firebaseio.com",
    projectId: "ferramentas-projeto",
    storageBucket: "ferramentas-projeto.appspot.com",
    messagingSenderId: "877191590019",
    appId: "1:877191590019:web:e060a55b704e510d53abb6",
    measurementId: "G-23LG8QCPP8"
  },
  // Preencha com a URL pública do backend no Render, sem barra no final.
  // Exemplo: https://personal-trainer-pix.onrender.com
  functionsBaseUrl: "https://personal-trainer-pix-backend-5.onrender.com",
  currency: "BRL",
  mercadoPagoPublicKey: "APP_USR-d01253a3-d065-420b-8b74-d9d4e6cec0f8",
  plans: {
    mensal: { name: "Plano Mensal", value: 19.90, days: 30 },
    trimestral: { name: "Plano Trimestral", value: 49.90, days: 90 },
    anual: { name: "Plano Anual", value: 149.90, days: 365 },
    vitalicio: { name: "Acesso Vitalício", value: 299.90, days: 36500 }
  }
};
