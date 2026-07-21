(() => {
  const cfg=window.APP_CONFIG,$=s=>document.querySelector(s); let auth,db,currentUser,currentProfile,currentPayment=null,paymentTimer=null;
  const maskCpf=v=>String(v||'').replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2').slice(0,14);
  function validCpf(cpf){cpf=String(cpf).replace(/\D/g,'');if(cpf.length!==11||/^(\d)\1+$/.test(cpf))return false;const calc=n=>{let s=0;for(let i=0;i<n;i++)s+=Number(cpf[i])*(n+1-i);let r=(s*10)%11;return r===10?0:r};return calc(9)===+cpf[9]&&calc(10)===+cpf[10]}
  function toast(msg,bad=false){const x=document.createElement('div');x.className='auth-toast'+(bad?' bad':'');x.textContent=msg;document.body.appendChild(x);setTimeout(()=>x.remove(),3300)}
  function show(id){['authGate','accessGate','appContent'].forEach(x=>$('#'+x)?.classList.add('hidden'));$('#'+id)?.classList.remove('hidden')}
  function active(u){return u&&u.status==='ativo'&&(!u.expiresAt||new Date(u.expiresAt)>new Date())}
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function renderPlans(){const box=$('#planButtons');if(!box)return;box.innerHTML=Object.entries(cfg.plans||{}).map(([id,p])=>`<button type="button" class="pix-plan" data-plan="${id}"><span>${p.name}</span><b>${money(p.value)}</b><small>${p.days>=36500?'Acesso permanente':p.days+' dias de acesso'}</small></button>`).join('');box.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>createPix(b.dataset.plan))}
  function render(u){currentProfile=u||{};if(active(u)){clearInterval(paymentTimer);show('appContent');$('#clientName').textContent=u.name||'Aluno';return}show('accessGate');$('#accessName').textContent=(u?.name||'Aluno').split(' ')[0];$('#accessStatus').textContent=u?.status==='bloqueado'?'Seu acesso está bloqueado ou vencido.':'Seu cadastro está aguardando pagamento ou liberação.';$('#accessDetail').textContent='Escolha um plano e pague somente por Pix. O acesso será liberado após a confirmação segura do Mercado Pago.';renderPlans();loadLatestPayment()}
  async function api(path,opts={}){if(!currentUser)throw new Error('Faça login novamente.');const token=await currentUser.getIdToken();const base=String(cfg.functionsBaseUrl||'').replace(/\/$/,'');if(!base)throw new Error('Endereço do servidor Pix ainda não configurado.');const r=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...opts.headers}});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||'Não foi possível concluir a operação.');return out}
  async function createPix(planId){if(cfg.demoMode)return demoPix(planId);try{setPixLoading(true);const out=await api('/createPix',{method:'POST',body:JSON.stringify({planId})});currentPayment=out.payment;showPix(out.payment);watchPayment()}catch(e){toast(e.message,true);setPixLoading(false)}}
  function demoPix(planId){const p=cfg.plans[planId];currentPayment={id:'DEMO-'+Date.now(),planId,planName:p.name,amount:p.value,status:'pending',qrCode:'00020126DEMONSTRACAO-PIX-SEM-VALOR-REAL',qrCodeBase64:'',expiresAt:new Date(Date.now()+30*60000).toISOString()};showPix(currentPayment);toast('Pix demonstrativo criado. Nenhum valor será cobrado.')}
  function setPixLoading(on){$('#pixPanel').classList.remove('hidden');$('#pixLoading').classList.toggle('hidden',!on);$('#pixQr').classList.add('hidden');$('#pixCode').value='';$('#plansArea').classList.toggle('hidden',on)}
  function showPix(p){setPixLoading(false);$('#plansArea').classList.add('hidden');$('#pixPlanName').textContent=p.planName||cfg.plans?.[p.planId]?.name||'Plano';$('#pixAmount').textContent=money(p.amount);$('#pixCode').value=p.qrCode||'';if(p.qrCodeBase64){$('#pixQr').src='data:image/png;base64,'+p.qrCodeBase64;$('#pixQr').classList.remove('hidden')}else $('#pixQr').classList.add('hidden');$('#pixExpires').textContent=p.expiresAt?'Pix válido até '+new Date(p.expiresAt).toLocaleString('pt-BR'):'';setStatus(p.status)}
  function setStatus(st){const el=$('#pixStatus'),map={pending:'Aguardando pagamento…',in_process:'Pagamento em análise…',approved:'Pagamento aprovado! Liberando acesso…',rejected:'Pagamento recusado ou cancelado.',cancelled:'Pagamento cancelado.',expired:'Pix expirado. Gere outro.'};el.textContent=map[st]||'Status: '+st;el.className='pix-status '+(st==='approved'?'approved':(['rejected','cancelled','expired'].includes(st)?'rejected':'pending'))}
  async function checkPix(){if(!currentPayment)return toast('Gere um Pix primeiro.',true);if(cfg.demoMode){currentPayment.status='approved';setStatus('approved');let a=JSON.parse(localStorage.ptUsers||'[]');a=a.map(u=>u.email===localStorage.ptSession?{...u,status:'ativo',plan:currentPayment.planId,expiresAt:new Date(Date.now()+(cfg.plans[currentPayment.planId].days*86400000)).toISOString()}:u);localStorage.ptUsers=JSON.stringify(a);return render(a.find(u=>u.email===localStorage.ptSession))}try{const out=await api('/paymentStatus?id='+encodeURIComponent(currentPayment.id));currentPayment={...currentPayment,...out.payment};showPix(currentPayment);if(out.payment.status==='approved')toast('Pagamento aprovado!')}catch(e){toast(e.message,true)}}
  async function loadLatestPayment(){if(cfg.demoMode||!currentUser||!cfg.functionsBaseUrl)return;try{const out=await api('/latestPayment');if(out.payment&&out.payment.status!=='approved'){currentPayment=out.payment;showPix(currentPayment);watchPayment()}}catch(e){console.warn(e.message)}}
  function watchPayment(){clearInterval(paymentTimer);paymentTimer=setInterval(checkPix,12000)}
  async function register(e){e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.cpf=d.cpf.replace(/\D/g,'');if(!validCpf(d.cpf))return toast('CPF inválido.',true);if(cfg.demoMode||!cfg.firebase.apiKey){let a=JSON.parse(localStorage.ptUsers||'[]');if(a.some(u=>u.email.toLowerCase()===d.email.toLowerCase()))return toast('E-mail já cadastrado.',true);const u={id:'demo_'+Date.now(),name:d.name,email:d.email,phone:d.phone,cpf:d.cpf,status:'pendente',role:'user',createdAt:new Date().toISOString()};a.push(u);localStorage.ptUsers=JSON.stringify(a);localStorage.ptSession=d.email;return render(u)}try{const c=await auth.createUserWithEmailAndPassword(d.email,d.password);await db.ref('users/'+c.user.uid).set({name:d.name,email:d.email,phone:d.phone,cpf:d.cpf,status:'pendente',role:'user',createdAt:firebase.database.ServerValue.TIMESTAMP,lastAccess:firebase.database.ServerValue.TIMESTAMP})}catch(err){toast(err.message,true)}}
  async function login(e){e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(cfg.demoMode||!cfg.firebase.apiKey){const a=JSON.parse(localStorage.ptUsers||'[]'),u=a.find(x=>x.email.toLowerCase()===d.email.toLowerCase());if(!u)return toast('Conta não encontrada.',true);localStorage.ptSession=u.email;return render(u)}try{await auth.signInWithEmailAndPassword(d.email,d.password)}catch{toast('E-mail ou senha inválidos.',true)}}
  async function logout(){clearInterval(paymentTimer);currentPayment=null;if(cfg.demoMode||!cfg.firebase.apiKey){localStorage.removeItem('ptSession');show('authGate')}else await auth.signOut()}
  function init(){if(cfg.demoMode||!cfg.firebase.apiKey){const email=localStorage.ptSession,u=(JSON.parse(localStorage.ptUsers||'[]')).find(x=>x.email===email);return u?render(u):show('authGate')}firebase.initializeApp(cfg.firebase);auth=firebase.auth();db=firebase.database();auth.onAuthStateChanged(u=>{currentUser=u;if(!u)return show('authGate');db.ref('users/'+u.uid).on('value',s=>render(s.val()))})}
  document.addEventListener('DOMContentLoaded',()=>{
    const cpf=$('#cpf'),registerForm=$('#registerPanel'),loginForm=$('#loginPanel');
    cpf?.addEventListener('input',e=>e.target.value=maskCpf(e.target.value));
    registerForm?.addEventListener('submit',register);
    loginForm?.addEventListener('submit',login);
    $('#showRegister')?.addEventListener('click',()=>{
      $('#loginPanel')?.classList.add('hidden');
      $('#registerPanel')?.classList.remove('hidden');
    });
    $('#showLogin')?.addEventListener('click',()=>{
      $('#registerPanel')?.classList.add('hidden');
      $('#loginPanel')?.classList.remove('hidden');
    });
    document.querySelectorAll('[data-logout]').forEach(b=>b.addEventListener('click',logout));
    $('#copyPix')?.addEventListener('click',async()=>{
      const v=$('#pixCode')?.value;if(!v)return;
      try{await navigator.clipboard.writeText(v)}catch{const t=$('#pixCode');t?.select();document.execCommand('copy')}
      toast('Pix copiado.');
    });
    $('#checkPix')?.addEventListener('click',checkPix);
    $('#cancelPix')?.addEventListener('click',()=>{
      $('#pixPanel')?.classList.add('hidden');
      $('#plansArea')?.classList.remove('hidden');
      clearInterval(paymentTimer);
    });
    init();
  })
})();
