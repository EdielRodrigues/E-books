// PREENCHA DEPOIS com os dados públicos do seu projeto Firebase.
// A apiKey do Firebase Web não é a chave secreta do Mercado Pago.
window.APP_CONFIG = {
  demoMode: true,
  firebase: {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  functionsBaseUrl: "",
  currency: "BRL",
  plans: {
    mensal: { name: "Plano Mensal", value: 19.90, days: 30 },
    trimestral: { name: "Plano Trimestral", value: 49.90, days: 90 },
    anual: { name: "Plano Anual", value: 149.90, days: 365 },
    vitalicio: { name: "Acesso Vitalício", value: 299.90, days: 36500 }
  }
};
