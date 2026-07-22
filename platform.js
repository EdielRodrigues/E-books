(() => {
  const cfg = window.APP_CONFIG;
  const $ = s => document.querySelector(s);
  let auth, db, currentUser, currentProfile = {}, currentPayment = null, paymentTimer = null, presenceTimer = null, presenceRef = null;

  const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: cfg.currency || 'BRL' });
  const clean = v => String(v || '').trim();
  const digits = v => String(v || '').replace(/\D/g, '');
  const maskCpf = v => digits(v).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14);
  const maskPhone = v => digits(v).replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15);
  function validCpf(cpf){cpf=digits(cpf);if(cpf.length!==11||/^(\d)\1+$/.test(cpf))return false;const calc=n=>{let s=0;for(let i=0;i<n;i++)s+=Number(cpf[i])*(n+1-i);let r=(s*10)%11;return r===10?0:r};return calc(9)===+cpf[9]&&calc(10)===+cpf[10]}
  function toast(msg,bad=false){const x=document.createElement('div');x.className='auth-toast'+(bad?' bad':'');x.textContent=msg;document.body.appendChild(x);setTimeout(()=>x.remove(),3600)}
  function show(id){['authGate','accessGate','appContent'].forEach(x=>$('#'+x)?.classList.add('hidden'));$('#'+id)?.classList.remove('hidden')}
  function active(u){return u&&u.status==='ativo'&&(!u.expiresAt||new Date(u.expiresAt)>new Date())}
  function daysLeft(v){if(!v)return null;return Math.max(0,Math.ceil((new Date(v)-new Date())/86400000))}

  function renderPlans(){const box=$('#planButtons');if(!box)return;box.innerHTML=Object.entries(cfg.plans||{}).map(([id,p])=>`<button type="button" class="pix-plan" data-plan="${id}"><span>${p.name}</span><b>${money(p.value)}</b><small>${p.days>=36500?'Acesso permanente':p.days+' dias de acesso'}</small></button>`).join('');box.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>createPix(b.dataset.plan))}
  function updateAccount(u){
    $('#clientName') && ($('#clientName').textContent=u.name||'Aluno');
    $('#accountName') && ($('#accountName').textContent=u.name||'Aluno');
    $('#accountEmail') && ($('#accountEmail').textContent=u.email||currentUser?.email||'');
    $('#accountPlan') && ($('#accountPlan').textContent=cfg.plans?.[u.plan]?.name||u.plan||'Sem plano');
    const d=daysLeft(u.expiresAt); $('#accountExpiry') && ($('#accountExpiry').textContent=u.expiresAt?new Date(u.expiresAt).toLocaleDateString('pt-BR')+(d!==null?` • ${d} dias restantes`:''):'Sem vencimento');
  }
  function render(u){currentProfile=u||{};updateAccount(currentProfile);if(active(u)){clearInterval(paymentTimer);show('appContent');loadPaymentHistory();return}show('accessGate');$('#accessName').textContent=(u?.name||'Aluno').split(' ')[0];$('#accessStatus').textContent=u?.status==='bloqueado'?'Seu acesso está bloqueado ou vencido.':'Seu cadastro está aguardando pagamento ou liberação.';$('#accessDetail').textContent='Escolha um plano e pague por Pix. A confirmação libera o conteúdo automaticamente.';renderPlans();loadLatestPayment()}

  async function api(path,opts={}){if(!currentUser)throw new Error('Faça login novamente.');const token=await currentUser.getIdToken();const base=clean(cfg.functionsBaseUrl).replace(/\/$/,'');if(!base)throw new Error('Configure a URL do backend do Render em firebase-config.js.');const r=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...opts.headers}});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||'Não foi possível concluir a operação.');return out}
  async function createPix(planId){try{setPixLoading(true);const out=await api('/createPix',{method:'POST',body:JSON.stringify({planId})});currentPayment=out.payment;showPix(out.payment);watchPayment()}catch(e){toast(e.message,true);setPixLoading(false)}}
  function setPixLoading(on){$('#pixPanel').classList.remove('hidden');$('#pixLoading').classList.toggle('hidden',!on);$('#pixQr').classList.add('hidden');$('#pixCode').value='';$('#plansArea').classList.toggle('hidden',on)}
  function showPix(p){setPixLoading(false);$('#plansArea').classList.add('hidden');$('#pixPlanName').textContent=p.planName||cfg.plans?.[p.planId]?.name||'Plano';$('#pixAmount').textContent=money(p.amount);$('#pixCode').value=p.qrCode||'';if(p.qrCodeBase64){$('#pixQr').src='data:image/png;base64,'+p.qrCodeBase64;$('#pixQr').classList.remove('hidden')}$('#pixExpires').textContent=p.expiresAt?'Pix válido até '+new Date(p.expiresAt).toLocaleString('pt-BR'):'';setStatus(p.status)}
  function setStatus(st){const el=$('#pixStatus'),map={pending:'Aguardando pagamento…',in_process:'Pagamento em análise…',approved:'Pagamento aprovado! Liberando acesso…',rejected:'Pagamento recusado.',cancelled:'Pagamento cancelado.',expired:'Pix expirado. Gere outro.'};el.textContent=map[st]||'Status: '+st;el.className='pix-status '+(st==='approved'?'approved':(['rejected','cancelled','expired'].includes(st)?'rejected':'pending'))}
  async function checkPix(){if(!currentPayment)return toast('Gere um Pix primeiro.',true);try{const out=await api('/paymentStatus?id='+encodeURIComponent(currentPayment.id));currentPayment={...currentPayment,...out.payment};showPix(currentPayment);if(out.payment.status==='approved')toast('Pagamento aprovado!')}catch(e){toast(e.message,true)}}
  async function loadLatestPayment(){if(!currentUser||!cfg.functionsBaseUrl)return;try{const out=await api('/latestPayment');if(out.payment&&out.payment.status!=='approved'){currentPayment=out.payment;showPix(currentPayment);watchPayment()}}catch(e){console.warn(e.message)}}
  function watchPayment(){clearInterval(paymentTimer);paymentTimer=setInterval(checkPix,12000)}
  async function loadPaymentHistory(){if(!db||!currentUser||!$('#paymentHistory'))return;try{const s=await db.ref('payments').orderByChild('userId').equalTo(currentUser.uid).limitToLast(10).once('value');const a=Object.entries(s.val()||{}).map(([id,v])=>({id,...v})).sort((x,y)=>new Date(y.createdAt||0)-new Date(x.createdAt||0));$('#paymentHistory').innerHTML=a.length?a.map(p=>`<div class="history-row"><span><b>${p.planName||p.planId||'Plano'}</b><small>${p.createdAt?new Date(p.createdAt).toLocaleString('pt-BR'):''}</small></span><strong>${money(p.amount)}</strong><em class="status-${p.status}">${p.status||'—'}</em></div>`).join(''):'<p>Nenhum pagamento encontrado.</p>'}catch(e){$('#paymentHistory').innerHTML='<p>Não foi possível carregar o histórico.</p>'}}


  function startPresence(user){
    if(!db||!user)return;
    stopPresence();
    const sessionId=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2));
    presenceRef=db.ref('presence/'+user.uid);
    const connectedRef=db.ref('.info/connected');
    connectedRef.on('value',snap=>{
      if(snap.val()!==true)return;
      presenceRef.onDisconnect().set({
        online:false,
        lastSeen:firebase.database.ServerValue.TIMESTAMP,
        sessionId
      }).then(()=>presenceRef.set({
        online:true,
        connectedAt:firebase.database.ServerValue.TIMESTAMP,
        lastSeen:firebase.database.ServerValue.TIMESTAMP,
        sessionId,
        page:document.visibilityState==='visible'?'ebook':'background',
        userAgent:navigator.userAgent.slice(0,180)
      })).catch(console.warn);
    });
    const heartbeat=()=>presenceRef?.update({
      online:true,
      lastSeen:firebase.database.ServerValue.TIMESTAMP,
      page:document.visibilityState==='visible'?'ebook':'background'
    }).catch(()=>{});
    presenceTimer=setInterval(heartbeat,60000);
    document.addEventListener('visibilitychange',heartbeat);
  }
  function stopPresence(){
    clearInterval(presenceTimer);presenceTimer=null;
    if(presenceRef){presenceRef.update({online:false,lastSeen:firebase.database.ServerValue.TIMESTAMP}).catch(()=>{});presenceRef=null}
  }

  async function register(e){e.preventDefault();const btn=e.submitter;btn&&(btn.disabled=true);const d=Object.fromEntries(new FormData(e.target));d.name=clean(d.name);d.email=clean(d.email).toLowerCase();d.phone=digits(d.phone);d.cpf=digits(d.cpf);if(d.name.split(/\s+/).length<2){toast('Informe nome e sobrenome.',true);btn&&(btn.disabled=false);return}if(!validCpf(d.cpf)){toast('CPF inválido.',true);btn&&(btn.disabled=false);return}if(d.phone.length<10){toast('Telefone inválido.',true);btn&&(btn.disabled=false);return}let created=null;try{created=await auth.createUserWithEmailAndPassword(d.email,d.password);await created.user.updateProfile({displayName:d.name});await db.ref('users/'+created.user.uid).set({name:d.name,email:d.email,phone:d.phone,cpf:d.cpf,status:'pendente',role:'user',plan:'',expiresAt:'',createdAt:firebase.database.ServerValue.TIMESTAMP,lastAccess:firebase.database.ServerValue.TIMESTAMP,updatedAt:firebase.database.ServerValue.TIMESTAMP});toast('Cadastro criado com sucesso.')}catch(err){if(created?.user)await created.user.delete().catch(()=>{});toast(err.code==='auth/email-already-in-use'?'Este e-mail já está cadastrado.':err.message,true)}finally{btn&&(btn.disabled=false)}}
  async function login(e){e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await auth.signInWithEmailAndPassword(clean(d.email),d.password)}catch{toast('E-mail ou senha inválidos.',true)}}
  async function resetPassword(){const email=clean($('#loginPanel [name=email]')?.value);if(!email)return toast('Digite seu e-mail primeiro.',true);try{await auth.sendPasswordResetEmail(email);toast('Link de recuperação enviado para seu e-mail.')}catch(e){toast('Não foi possível enviar a recuperação.',true)}}
  async function logout(){clearInterval(paymentTimer);currentPayment=null;stopPresence();await auth.signOut()}
  function init(){firebase.initializeApp(cfg.firebase);auth=firebase.auth();db=firebase.database();auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});auth.onAuthStateChanged(async u=>{currentUser=u;if(!u){stopPresence();return show('authGate')}startPresence(u);await db.ref('users/'+u.uid).update({lastAccess:firebase.database.ServerValue.TIMESTAMP}).catch(()=>{});db.ref('users/'+u.uid).on('value',s=>{if(!s.exists()){show('authGate');toast('Cadastro não encontrado no banco de dados.',true);return}render(s.val())})})}

  document.addEventListener('DOMContentLoaded',()=>{
    const openAccount=()=>{
      $('#accountPanel')?.classList.add('open');
      $('#accountShade')?.classList.add('open');
      $('#accountPanel')?.setAttribute('aria-hidden','false');
      $('#accountToggle')?.setAttribute('aria-expanded','true');
      document.body.classList.add('account-open');
      loadPaymentHistory();
    };
    const closeAccount=()=>{
      $('#accountPanel')?.classList.remove('open');
      $('#accountShade')?.classList.remove('open');
      $('#accountPanel')?.setAttribute('aria-hidden','true');
      $('#accountToggle')?.setAttribute('aria-expanded','false');
      document.body.classList.remove('account-open');
    };
    $('#accountToggle')?.addEventListener('click',()=>$('#accountPanel')?.classList.contains('open')?closeAccount():openAccount());
    $('#closeAccount')?.addEventListener('click',closeAccount);
    $('#accountShade')?.addEventListener('click',closeAccount);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAccount()});
    $('#cpf')?.addEventListener('input',e=>e.target.value=maskCpf(e.target.value));
    $('#registerPanel [name=phone]')?.addEventListener('input',e=>e.target.value=maskPhone(e.target.value));
    $('#registerPanel')?.addEventListener('submit',register); $('#loginPanel')?.addEventListener('submit',login);
    $('#showRegister')?.addEventListener('click',()=>{$('#loginPanel').classList.add('hidden');$('#registerPanel').classList.remove('hidden')});
    $('#showLogin')?.addEventListener('click',()=>{$('#registerPanel').classList.add('hidden');$('#loginPanel').classList.remove('hidden')});
    $('#forgotPassword')?.addEventListener('click',resetPassword);
    document.querySelectorAll('[data-logout]').forEach(b=>b.addEventListener('click',logout));
    $('#copyPix')?.addEventListener('click',async()=>{const v=$('#pixCode')?.value;if(!v)return;try{await navigator.clipboard.writeText(v)}catch{$('#pixCode')?.select();document.execCommand('copy')}toast('Pix copiado.')});
    $('#checkPix')?.addEventListener('click',checkPix); $('#cancelPix')?.addEventListener('click',()=>{$('#pixPanel').classList.add('hidden');$('#plansArea').classList.remove('hidden');clearInterval(paymentTimer)});
    init();
  });
})();
