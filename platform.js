(() => {
  const cfg = window.APP_CONFIG;
  const $ = s => document.querySelector(s);
  const APP_VERSION='7.8';
  let auth, db, currentUser, currentProfile = {}, currentPayment = null, selectedPlanId = null, selectedPlan = null, presenceTimer = null, presenceRef = null, pixCheckTimer = null, pixChecking = false, mp = null, cardBrickController = null, paymentFlowStarted = false;

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

  function versionParts(v){return String(v||'0').split(/[^0-9]+/).filter(Boolean).map(Number)}
  function compareVersions(a,b){const x=versionParts(a),y=versionParts(b),n=Math.max(x.length,y.length);for(let i=0;i<n;i++){const d=(x[i]||0)-(y[i]||0);if(d)return d>0?1:-1}return 0}
  function applyForceUpdate(settings){
    const min=String(settings?.minimumVersion||settings?.latestVersion||APP_VERSION);
    const enabled=settings?.forceUpdate!==false;
    const outdated=enabled&&compareVersions(APP_VERSION,min)<0;
    const gate=$('#forceUpdateGate');if(!gate)return;
    $('#installedVersion').textContent=APP_VERSION;$('#requiredVersion').textContent=min;
    $('#forceUpdateMessage').textContent=settings?.message||'Uma atualização importante está disponível. Atualize para continuar usando o aplicativo.';
    const btn=$('#forceUpdateNow');btn.onclick=()=>{const url=clean(settings?.apkUrl||settings?.updateUrl);if(!url)return toast('O link da atualização ainda não foi configurado.',true);location.href=url};
    gate.classList.toggle('hidden',!outdated);document.documentElement.style.overflow=outdated?'hidden':'';document.body.style.overflow=outdated?'hidden':'';
  }
  function watchAppUpdate(){db.ref('appUpdate').on('value',snap=>applyForceUpdate(snap.val()||{}),()=>applyForceUpdate({forceUpdate:false}))}

  function renderPlans(){const box=$('#planButtons');if(!box)return;box.innerHTML=Object.entries(cfg.plans||{}).map(([id,p])=>`<button type="button" class="pix-plan" data-plan="${id}"><span>${p.name}</span><b>${money(p.value)}</b><small>${p.days>=36500?'Acesso permanente':p.days+' dias de acesso'}</small></button>`).join('');box.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>selectPlan(b.dataset.plan))}
  function selectPlan(planId){paymentFlowStarted=true;selectedPlanId=planId;selectedPlan=cfg.plans?.[planId];if(!selectedPlan)return toast('Plano inválido.',true);$('#plansArea').classList.add('hidden');$('#paymentMethodPanel').classList.remove('hidden');$('#pixPanel').classList.add('hidden');$('#cardPanel').classList.add('hidden');$('#tryPixAfterCard')?.classList.add('hidden')}
  function backToPlans(){paymentFlowStarted=false;stopPixAutoCheck();currentPayment=null;selectedPlanId=null;selectedPlan=null;cardBrickController?.unmount?.();cardBrickController=null;$('#paymentMethodPanel').classList.add('hidden');$('#pixPanel').classList.add('hidden');$('#cardPanel').classList.add('hidden');$('#plansArea').classList.remove('hidden')}
  function backToMethods(){stopPixAutoCheck();currentPayment=null;cardBrickController?.unmount?.();cardBrickController=null;$('#pixPanel').classList.add('hidden');$('#cardPanel').classList.add('hidden');$('#paymentMethodPanel').classList.remove('hidden')}
  function updateAccount(u){
    $('#clientName') && ($('#clientName').textContent=u.name||'Aluno');
    $('#accountName') && ($('#accountName').textContent=u.name||'Aluno');
    $('#accountEmail') && ($('#accountEmail').textContent=u.email||currentUser?.email||'');
    $('#accountPlan') && ($('#accountPlan').textContent=cfg.plans?.[u.plan]?.name||u.plan||'Sem plano');
    const d=daysLeft(u.expiresAt); $('#accountExpiry') && ($('#accountExpiry').textContent=u.expiresAt?new Date(u.expiresAt).toLocaleDateString('pt-BR')+(d!==null?` • ${d} dias restantes`:''):'Sem vencimento');
  }
  function resetPaymentEntry(){stopPixAutoCheck();currentPayment=null;selectedPlanId=null;selectedPlan=null;cardBrickController?.unmount?.();cardBrickController=null;$('#paymentMethodPanel')?.classList.add('hidden');$('#pixPanel')?.classList.add('hidden');$('#cardPanel')?.classList.add('hidden');$('#tryPixAfterCard')?.classList.add('hidden');$('#plansArea')?.classList.remove('hidden')}
  function render(u){currentProfile=u||{};updateAccount(currentProfile);if(active(u)){show('appContent');loadPaymentHistory();return}show('accessGate');$('#accessName').textContent=(u?.name||'Aluno').split(' ')[0];$('#accessStatus').textContent=u?.status==='bloqueado'?'Seu acesso está bloqueado ou vencido.':'Seu cadastro está aguardando pagamento ou liberação.';$('#accessDetail').textContent='Escolha um plano e a forma de pagamento. O Pix só será gerado quando você tocar em pagar.';renderPlans();if(!paymentFlowStarted)resetPaymentEntry()}

  async function api(path,opts={}){if(!currentUser)throw new Error('Faça login novamente.');const token=await currentUser.getIdToken();const base=clean(cfg.functionsBaseUrl).replace(/\/$/,'');if(!base)throw new Error('Configure a URL do backend do Render em firebase-config.js.');const r=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...opts.headers}});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||'Não foi possível concluir a operação.');return out}
  async function createPix(planId=selectedPlanId){try{stopPixAutoCheck();setPixLoading(true);const out=await api('/createPix',{method:'POST',body:JSON.stringify({planId})});currentPayment=out.payment;showPix(out.payment);startPixAutoCheck()}catch(e){toast(e.message,true);setPixLoading(false)}}
  function setPixLoading(on){$('#paymentMethodPanel').classList.add('hidden');$('#cardPanel').classList.add('hidden');$('#pixPanel').classList.remove('hidden');$('#pixLoading').classList.toggle('hidden',!on);$('#pixQr').classList.add('hidden');$('#pixCode').value='';$('#plansArea').classList.toggle('hidden',on)}
  function showPix(p){setPixLoading(false);$('#plansArea').classList.add('hidden');$('#pixPlanName').textContent=p.planName||cfg.plans?.[p.planId]?.name||'Plano';$('#pixAmount').textContent=money(p.amount);$('#pixCode').value=p.qrCode||'';if(p.qrCodeBase64){$('#pixQr').src='data:image/png;base64,'+p.qrCodeBase64;$('#pixQr').classList.remove('hidden')}$('#pixExpires').textContent=p.expiresAt?'Pix válido até '+new Date(p.expiresAt).toLocaleString('pt-BR'):'';setStatus(p.status)}
  function setStatus(st){const el=$('#pixStatus'),map={pending:'Aguardando pagamento…',in_process:'Pagamento em análise…',approved:'Pagamento aprovado! Liberando acesso…',rejected:'Pagamento recusado.',cancelled:'Pagamento cancelado.',expired:'Pix expirado. Gere outro.'};el.textContent=map[st]||'Status: '+st;el.className='pix-status '+(st==='approved'?'approved':(['rejected','cancelled','expired'].includes(st)?'rejected':'pending'))}
  function stopPixAutoCheck(){if(pixCheckTimer){clearInterval(pixCheckTimer);pixCheckTimer=null}pixChecking=false}
  async function checkPixAuto(){
    if(!currentPayment||pixChecking)return;
    if(!['pending','in_process','authorized'].includes(currentPayment.status)){stopPixAutoCheck();return}
    pixChecking=true;
    try{
      const out=await api('/paymentStatus?id='+encodeURIComponent(currentPayment.id));
      currentPayment={...currentPayment,...out.payment};
      if(currentPayment.paymentMethod==='card'){setStatusCard(currentPayment.status,currentPayment.statusDetail)}else{showPix(currentPayment)};
      if(out.payment.status==='approved'){
        stopPixAutoCheck();
        toast('Pagamento aprovado! Acesso liberado.');
        const snap=await db.ref('users/'+currentUser.uid).once('value');
        render(snap.val()||{});
      }else if(!['pending','in_process','authorized'].includes(out.payment.status)){
        stopPixAutoCheck();
      }
    }catch(e){console.warn('Falha ao consultar Pix:',e.message)}
    finally{pixChecking=false}
  }
  function startPixAutoCheck(){
    stopPixAutoCheck();
    if(!currentPayment||!['pending','in_process','authorized'].includes(currentPayment.status))return;
    checkPixAuto();
    pixCheckTimer=setInterval(checkPixAuto,5000);
  }
  async function openCardPayment(){
    if(!selectedPlanId||!selectedPlan)return toast('Escolha um plano.',true);
    if(!window.MercadoPago||!cfg.mercadoPagoPublicKey)return toast('Pagamento por cartão não configurado.',true);
    stopPixAutoCheck();$('#paymentMethodPanel').classList.add('hidden');$('#pixPanel').classList.add('hidden');$('#cardPanel').classList.remove('hidden');
    $('#cardPlanName').textContent=selectedPlan.name;$('#cardAmount').textContent=money(selectedPlan.value);$('#cardStatus').textContent='';$('#tryPixAfterCard')?.classList.add('hidden');
    try{
      cardBrickController?.unmount?.();
      mp=mp||new MercadoPago(cfg.mercadoPagoPublicKey,{locale:'pt-BR'});
      cardBrickController=await mp.bricks().create('cardPayment','cardPaymentBrick_container',{
        initialization:{amount:Number(selectedPlan.value)},
        customization:{visual:{style:{theme:'default'}},paymentMethods:{maxInstallments:12}},
        callbacks:{
          onReady:()=>{},
          onSubmit:async cardFormData=>{
            const el=$('#cardStatus');el.textContent='Processando pagamento…';el.className='pix-status pending';
            try{
              const out=await api('/createCardPayment',{method:'POST',body:JSON.stringify({planId:selectedPlanId,...cardFormData})});
              currentPayment=out.payment;setStatusCard(out.payment.status,out.payment.statusDetail);
              if(out.payment.status==='approved'){
                toast('Pagamento aprovado! Acesso liberado.');
                const snap=await db.ref('users/'+currentUser.uid).once('value');render(snap.val()||{});
              }else if(['pending','in_process','authorized'].includes(out.payment.status)){
                startPixAutoCheck();
              }
              return out;
            }catch(e){setStatusCard('rejected',e.message);throw e}
          },
          onError:error=>{console.error(error);setStatusCard('rejected','Não foi possível carregar ou processar o cartão.')}
        }
      });
    }catch(e){toast(e.message||'Não foi possível abrir o pagamento por cartão.',true);backToMethods()}
  }
  function friendlyCardMessage(status){
    const map={
      approved:'Pagamento aprovado! Liberando seu acesso…',
      pending:'Pagamento pendente. Aguarde a confirmação.',
      in_process:'Pagamento em análise. Assim que for aprovado, seu acesso será liberado automaticamente.',
      authorized:'Pagamento autorizado. Estamos aguardando a confirmação final.',
      rejected:'Pagamento não aprovado. Por motivos de segurança, a operadora ou o Mercado Pago não autorizou esta compra. Tente outro cartão ou pague via Pix.',
      cancelled:'Pagamento cancelado. Você pode tentar novamente ou pagar via Pix.',
      refunded:'Pagamento reembolsado.'
    };
    return map[status]||'Não foi possível concluir o pagamento. Tente novamente ou escolha Pix.';
  }
  function setStatusCard(status,detail=''){
    const el=$('#cardStatus');
    el.textContent=friendlyCardMessage(status);
    el.className='pix-status '+(status==='approved'?'approved':(['rejected','cancelled','refunded'].includes(status)?'rejected':'pending'));
    $('#tryPixAfterCard')?.classList.toggle('hidden',!['rejected','cancelled'].includes(status));
    if(detail)console.warn('Detalhe técnico do pagamento:',detail);
  }
  async function loadPaymentHistory(){if(!db||!currentUser||!$('#paymentHistory'))return;try{const s=await db.ref('payments').orderByChild('userId').equalTo(currentUser.uid).limitToLast(10).once('value');const a=Object.entries(s.val()||{}).map(([id,v])=>({id,...v})).sort((x,y)=>new Date(y.createdAt||0)-new Date(x.createdAt||0));$('#paymentHistory').innerHTML=a.length?a.map(p=>`<div class="history-row"><span><b>${p.planName||p.planId||'Plano'} • ${p.paymentMethod==='card'?'Cartão':'Pix'}</b><small>${p.createdAt?new Date(p.createdAt).toLocaleString('pt-BR'):''}</small></span><strong>${money(p.amount)}</strong><em class="status-${p.status}">${p.status||'—'}</em></div>`).join(''):'<p>Nenhum pagamento encontrado.</p>'}catch(e){$('#paymentHistory').innerHTML='<p>Não foi possível carregar o histórico.</p>'}}


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

  async function register(e){e.preventDefault();const btn=e.submitter;btn&&(btn.disabled=true);const d=Object.fromEntries(new FormData(e.target));d.name=clean(d.name);d.email=clean(d.email).toLowerCase();d.phone=digits(d.phone);d.cpf=digits(d.cpf);if(d.name.split(/\s+/).length<2){toast('Informe nome e sobrenome.',true);btn&&(btn.disabled=false);return}if(!validCpf(d.cpf)){toast('CPF inválido.',true);btn&&(btn.disabled=false);return}if(d.phone.length<10){toast('Telefone inválido.',true);btn&&(btn.disabled=false);return}let created=null;try{created=await auth.createUserWithEmailAndPassword(d.email,d.password);await created.user.updateProfile({displayName:d.name});const trialExpiresAt=new Date(Date.now()+3*86400000).toISOString();await db.ref('users/'+created.user.uid).set({name:d.name,email:d.email,phone:d.phone,cpf:d.cpf,status:'ativo',role:'user',plan:'promocional_3_dias',planName:'Acesso promocional de 3 dias',trial:true,accessLevel:'limitado',expiresAt:trialExpiresAt,createdAt:firebase.database.ServerValue.TIMESTAMP,lastAccess:firebase.database.ServerValue.TIMESTAMP,updatedAt:firebase.database.ServerValue.TIMESTAMP});toast('Cadastro criado! Você ganhou 3 dias de acesso promocional.')}catch(err){if(created?.user)await created.user.delete().catch(()=>{});toast(err.code==='auth/email-already-in-use'?'Este e-mail já está cadastrado.':err.message,true)}finally{btn&&(btn.disabled=false)}}
  async function login(e){e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await auth.signInWithEmailAndPassword(clean(d.email),d.password)}catch{toast('E-mail ou senha inválidos.',true)}}
  async function resetPassword(){const email=clean($('#loginPanel [name=email]')?.value);if(!email)return toast('Digite seu e-mail primeiro.',true);try{await auth.sendPasswordResetEmail(email);toast('Link de recuperação enviado para seu e-mail.')}catch(e){toast('Não foi possível enviar a recuperação.',true)}}
  async function logout(){paymentFlowStarted=false;currentPayment=null;stopPixAutoCheck();stopPresence();await auth.signOut()}
  function init(){firebase.initializeApp(cfg.firebase);auth=firebase.auth();db=firebase.database();watchAppUpdate();db.ref('guideVideos').on('value',snap=>{window.PT_GUIDE_VIDEOS=snap.val()||{};window.dispatchEvent(new Event('pt-guide-videos-updated'))});auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});auth.onAuthStateChanged(async u=>{currentUser=u;paymentFlowStarted=false;if(!u){stopPresence();resetPaymentEntry();return show('authGate')}startPresence(u);await db.ref('users/'+u.uid).update({lastAccess:firebase.database.ServerValue.TIMESTAMP}).catch(()=>{});db.ref('users/'+u.uid).on('value',s=>{if(!s.exists()){show('authGate');toast('Cadastro não encontrado no banco de dados.',true);return}render(s.val())})})}

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
    $('#payWithPix')?.addEventListener('click',()=>createPix(selectedPlanId));$('#payWithCard')?.addEventListener('click',openCardPayment);$('#tryPixAfterCard')?.addEventListener('click',()=>{cardBrickController?.unmount?.();cardBrickController=null;createPix(selectedPlanId)});$('#changePlan')?.addEventListener('click',backToPlans);$('#cancelPix')?.addEventListener('click',backToMethods);$('#cancelCard')?.addEventListener('click',backToMethods);
    init();
  });
})();
