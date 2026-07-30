var firebaseConfig = {
  apiKey: "AIzaSyBnBBkFup_-MGCNMGkPx1h1TxwfpObjrtU",
  authDomain: "moneyfam-7d950.firebaseapp.com",
  projectId: "moneyfam-7d950",
  storageBucket: "moneyfam-7d950.firebasestorage.app",
  messagingSenderId: "738074612940",
  appId: "1:738074612940:web:6bcfaa3419ce5cdb7ede69"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var DOC = db.collection("familia").doc("estado");

var ACC_LABELS = {milo:'Cuenta Milo',sari:'Cuenta Sari',cash:'Caja fuerte'};
var CAT_LABELS = {vivienda:'Vivienda',mercado:'Mercado',transporte:'Transporte',salud:'Salud',educacion:'Educación',entretenimiento:'Entretenimiento',ropa:'Ropa',servicios:'Servicios',tecnologia:'Tecnología',negocio:'Click and Roll',ahorro:'Ahorro',tc:'Tarjeta crédito',otro:'Otro'};
var CAT_COLORS = {vivienda:'#378ADD',mercado:'#1D9E75',transporte:'#BA7517',salud:'#D4537E',educacion:'#534AB7',entretenimiento:'#D85A30',ropa:'#993C1D',servicios:'#639922',tecnologia:'#185FA5',negocio:'#3B6D11',ahorro:'#0F6E56',tc:'#8B3A62',otro:'#888780'};
var MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

var state = {transactions:[],goals:[],accounts:{milo:0,sari:0,cash:0},fixedExpenses:[],fixedChecks:{}};
var txnType = 'ingreso';
var editType = 'ingreso';
var editingId = null;
var editingFixedId = null;
var isSaving = false;

// ── AMOUNT FORMATTING ──
function formatAmountInput(input, fmtId) {
  var raw = input.value.replace(/\D/g,'');
  if (raw.length > 12) raw = raw.slice(0,12);
  input.value = raw;
  var fmtEl = document.getElementById(fmtId);
  if (fmtEl) {
    if (raw) {
      fmtEl.textContent = '$ ' + parseInt(raw).toLocaleString('es-CO');
    } else {
      fmtEl.textContent = '';
    }
  }
}

function getRawAmount(inputId) {
  var v = document.getElementById(inputId).value.replace(/\D/g,'');
  return v ? parseFloat(v) : 0;
}

// ── DATE FIX: no timezone offset ──
function todayStr() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,'0');
  var day = String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}

function setDate() {
  var el = document.getElementById('f-date');
  if (el) el.value = todayStr();
}

// ── SYNC STATUS ──
function syncStatus(s) {
  var dot = document.getElementById('sync-dot');
  var lbl = document.getElementById('sync-label');
  if (!dot || !lbl) return;
  dot.className = 'sync-dot'+(s==='ok'?' ok':s==='saving'?' saving':s==='err'?' err':'');
  lbl.textContent = s==='ok'?'Sincronizado':s==='saving'?'Guardando...':s==='err'?'Error':'–';
}

function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); }, 2500);
}

function fmt(n) { return '$'+Math.round(n||0).toLocaleString('es-CO'); }

// ── FIREBASE ──
function init() {
  var ml = document.getElementById('month-label');
  if (ml) ml.textContent = MONTHS[new Date().getMonth()]+' '+new Date().getFullYear();
  var fml = document.getElementById('fijos-month-label');
  if (fml) fml.textContent = MONTHS[new Date().getMonth()]+' '+new Date().getFullYear();
  setDate();

  DOC.get().then(function(snap) {
    document.getElementById('loading').classList.add('hidden');
    if (snap.exists) {
      state = snap.data();
      if (!state.accounts) state.accounts={milo:0,sari:0,cash:0};
      if (!state.transactions) state.transactions=[];
      if (!state.goals) state.goals=[];
      if (!state.fixedExpenses) state.fixedExpenses=[];
      if (!state.fixedChecks) state.fixedChecks={};
    }
    renderAll(); renderGoals(); renderFijos();
    startListener();
    syncStatus('ok');
  }).catch(function(err) {
    document.getElementById('loading').classList.add('hidden');
    syncStatus('err');
    toast('⚠️ '+err.code);
    renderAll(); renderGoals(); renderFijos();
  });
}

function startListener() {
  DOC.onSnapshot(function(snap) {
    if (!isSaving && snap.exists) {
      state = snap.data();
      if (!state.accounts) state.accounts={milo:0,sari:0,cash:0};
      if (!state.transactions) state.transactions=[];
      if (!state.goals) state.goals=[];
      if (!state.fixedExpenses) state.fixedExpenses=[];
      if (!state.fixedChecks) state.fixedChecks={};
      renderAll();
      var active = document.querySelector('.section.active');
      if (active) {
        if (active.id==='tab-movimientos') renderMovimientos();
        if (active.id==='tab-metas') renderGoals();
        if (active.id==='tab-fijos') renderFijos();
      }
    }
    syncStatus('ok');
  }, function(err){ syncStatus('err'); });
}

// ── SAVE STATE ──
function saveState(cb) {
  isSaving = true; syncStatus('saving');
  DOC.set(state).then(function(){
    syncStatus('ok'); isSaving=false; if(cb) cb();
  }).catch(function(err){
    syncStatus('err'); isSaving=false; toast('⚠️ '+err.code);
  });
}

// ── TABS ──
function showTab(id) {
  document.querySelectorAll('.section').forEach(function(s){s.classList.remove('active');});
  document.querySelectorAll('.btab').forEach(function(b){b.classList.remove('active');});
  document.getElementById('tab-'+id).classList.add('active');
  ['resumen','nuevo','movimientos','metas','fijos'].forEach(function(t,i){
    if(t===id) document.querySelectorAll('.btab')[i].classList.add('active');
  });
  if(id==='movimientos') renderMovimientos();
  if(id==='metas') renderGoals();
  if(id==='fijos') renderFijos();
}

// ── TYPE SELECTOR ──
function setType(t) {
  txnType=t;
  ['ing','eg','tr'].forEach(function(x){document.getElementById('seg-'+x).classList.remove('active');});
  document.getElementById('seg-'+{ingreso:'ing',egreso:'eg',transferencia:'tr'}[t]).classList.add('active');
  document.getElementById('row-cat').style.display=t==='transferencia'?'none':'block';
  document.getElementById('row-destino').style.display=t==='transferencia'?'block':'none';
  document.getElementById('label-cuenta').textContent=t==='transferencia'?'Cuenta origen':'Cuenta';
}

// ── SAVE TRANSACTION ──
function saveTransaction() {
  var desc=document.getElementById('f-desc').value.trim();
  var amount=getRawAmount('f-amount');
  var cuenta=document.getElementById('f-cuenta').value;
  var cat=document.getElementById('f-cat').value;
  var date=document.getElementById('f-date').value;
  var destino=document.getElementById('f-destino').value;
  if(!desc||!amount||amount<=0){alert('Completa descripción y monto');return;}
  var txn={id:Date.now(),type:txnType,desc:desc,amount:amount,cuenta:cuenta,cat:cat,date:date};
  if(txnType==='transferencia') txn.destino=destino;
  applyTxn(txn, 1);
  state.transactions.unshift(txn);
  document.getElementById('f-desc').value='';
  document.getElementById('f-amount').value='';
  document.getElementById('f-amount-fmt').textContent='';
  setDate();
  renderAll();
  saveState(function(){toast('✓ Guardado y sincronizado');});
}

function applyTxn(t, sign) {
  // sign=1 to apply, sign=-1 to reverse
  if(t.type==='ingreso') state.accounts[t.cuenta]=(state.accounts[t.cuenta]||0)+sign*t.amount;
  else if(t.type==='egreso') state.accounts[t.cuenta]=(state.accounts[t.cuenta]||0)-sign*t.amount;
  else{
    state.accounts[t.cuenta]=(state.accounts[t.cuenta]||0)-sign*t.amount;
    if(t.destino) state.accounts[t.destino]=(state.accounts[t.destino]||0)+sign*t.amount;
  }
}

// ── EDIT MODAL ──
function openEditModal(id) {
  var t=state.transactions.find(function(x){return x.id===id;});
  if(!t) return;
  editingId=id;
  setEditType(t.type);
  document.getElementById('e-desc').value=t.desc;
  document.getElementById('e-amount').value=String(Math.round(t.amount));
  document.getElementById('e-amount-fmt').textContent='$ '+Math.round(t.amount).toLocaleString('es-CO');
  document.getElementById('e-cuenta').value=t.cuenta;
  if(t.destino) document.getElementById('e-destino').value=t.destino;
  document.getElementById('e-cat').value=t.cat||'otro';
  document.getElementById('e-date').value=t.date;
  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  editingId=null;
}

function setEditType(t) {
  editType=t;
  ['ing','eg','tr'].forEach(function(x){document.getElementById('eseg-'+x).classList.remove('active');});
  document.getElementById('eseg-'+{ingreso:'ing',egreso:'eg',transferencia:'tr'}[t]).classList.add('active');
  document.getElementById('erow-cat').style.display=t==='transferencia'?'none':'block';
  document.getElementById('erow-destino').style.display=t==='transferencia'?'block':'none';
  document.getElementById('elabel-cuenta').textContent=t==='transferencia'?'Cuenta origen':'Cuenta';
}

function saveEdit() {
  if(!editingId) return;
  var old=state.transactions.find(function(x){return x.id===editingId;});
  if(!old) return;
  // reverse old effect
  applyTxn(old, -1);
  // apply new
  var amount=getRawAmount('e-amount');
  if(!amount||amount<=0){alert('Ingresa un monto válido');return;}
  old.type=editType;
  old.desc=document.getElementById('e-desc').value.trim();
  old.amount=amount;
  old.cuenta=document.getElementById('e-cuenta').value;
  old.cat=document.getElementById('e-cat').value;
  old.date=document.getElementById('e-date').value;
  if(editType==='transferencia') old.destino=document.getElementById('e-destino').value;
  else delete old.destino;
  applyTxn(old, 1);
  closeEditModal();
  renderAll(); renderMovimientos();
  saveState(function(){toast('✓ Movimiento actualizado');});
}

function deleteFromModal() {
  if(!editingId||!confirm('¿Eliminar este movimiento?')) return;
  var t=state.transactions.find(function(x){return x.id===editingId;});
  if(t) applyTxn(t,-1);
  state.transactions=state.transactions.filter(function(x){return x.id!==editingId;});
  closeEditModal();
  renderAll(); renderMovimientos();
  saveState(function(){toast('✓ Eliminado');});
}

// ── GOALS ──
function saveGoal() {
  var name=document.getElementById('g-name').value.trim();
  var target=getRawAmount('g-target');
  var saved=getRawAmount('g-saved');
  if(!name||!target||target<=0){alert('Completa nombre y monto objetivo');return;}
  state.goals.push({id:Date.now(),name:name,target:target,saved:saved});
  document.getElementById('g-name').value='';
  document.getElementById('g-target').value=''; document.getElementById('g-target-fmt').textContent='';
  document.getElementById('g-saved').value=''; document.getElementById('g-saved-fmt').textContent='';
  renderGoals();
  saveState(function(){toast('✓ Meta creada');});
}

function deleteGoal(id) {
  if(!confirm('¿Eliminar esta meta?')) return;
  state.goals=state.goals.filter(function(g){return g.id!==id;});
  renderGoals(); saveState();
}

function addToGoal(id) {
  var amt=parseFloat(prompt('¿Cuánto quieres abonar? (COP $)'));
  if(!amt||amt<=0) return;
  var g=state.goals.find(function(x){return x.id===id;});
  if(g){g.saved=Math.min(g.saved+amt,g.target);renderGoals();saveState(function(){toast('✓ Abono registrado');});}
}

// ── FIXED EXPENSES ──
function openFixedModal(id) {
  editingFixedId=id;
  if(id) {
    var fx=state.fixedExpenses.find(function(x){return x.id===id;});
    if(fx){
      document.getElementById('fx-name').value=fx.name;
      document.getElementById('fx-amount').value=String(Math.round(fx.amount));
      document.getElementById('fx-amount-fmt').textContent='$ '+Math.round(fx.amount).toLocaleString('es-CO');
      document.getElementById('fx-cat').value=fx.cat||'otro';
      document.getElementById('fixed-modal-title').textContent='Editar gasto fijo';
      document.getElementById('fixed-modal-btn').textContent='Guardar cambios';
    }
  } else {
    document.getElementById('fx-name').value='';
    document.getElementById('fx-amount').value='';
    document.getElementById('fx-amount-fmt').textContent='';
    document.getElementById('fx-cat').value='vivienda';
    document.getElementById('fixed-modal-title').textContent='Nuevo gasto fijo';
    document.getElementById('fixed-modal-btn').textContent='Agregar gasto fijo';
  }
  document.getElementById('fixed-modal').classList.add('open');
}

function closeFixedModal() {
  document.getElementById('fixed-modal').classList.remove('open');
  editingFixedId=null;
}

function saveFixedItem() {
  var name=document.getElementById('fx-name').value.trim();
  var amount=getRawAmount('fx-amount');
  var cat=document.getElementById('fx-cat').value;
  if(!name||!amount||amount<=0){alert('Completa nombre y monto');return;}
  if(editingFixedId) {
    var fx=state.fixedExpenses.find(function(x){return x.id===editingFixedId;});
    if(fx){fx.name=name;fx.amount=amount;fx.cat=cat;}
  } else {
    state.fixedExpenses.push({id:Date.now(),name:name,amount:amount,cat:cat});
  }
  closeFixedModal();
  renderFijos();
  saveState(function(){toast(editingFixedId?'✓ Gasto actualizado':'✓ Gasto fijo agregado');});
}

function deleteFixedItem(id) {
  if(!confirm('¿Eliminar este gasto fijo?')) return;
  state.fixedExpenses=state.fixedExpenses.filter(function(x){return x.id!==id;});
  // clean checks
  var key=todayStr().slice(0,7)+'-'+id;
  if(state.fixedChecks[key]!==undefined) delete state.fixedChecks[key];
  renderFijos(); saveState();
}

function toggleFixedCheck(id) {
  var key=todayStr().slice(0,7)+'-'+id;
  state.fixedChecks[key]=!state.fixedChecks[key];
  renderFijos();
  saveState();
}

function isChecked(id) {
  var key=todayStr().slice(0,7)+'-'+id;
  return !!state.fixedChecks[key];
}

// ── RENDER ──
function getThisMonth() {
  var now=new Date();
  return state.transactions.filter(function(t){
    var d=new Date(t.date+'T12:00:00');
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  });
}

function txnHTML(t,showEdit) {
  var isIng=t.type==='ingreso',isTr=t.type==='transferencia';
  var cls=isIng?'ing':isTr?'tr':'eg';
  var icon=isIng?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14"/><path d="M5 12l7 7 7-7"/></svg>':isTr?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 16l-4-4 4-4"/><path d="M17 8l4 4-4 4"/><line x1="3" y1="12" x2="21" y2="12"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
  var accB='<span class="badge badge-'+t.cuenta+'">'+(ACC_LABELS[t.cuenta]||t.cuenta)+'</span>';
  var dstB=isTr&&t.destino?' → <span class="badge badge-'+t.destino+'">'+(ACC_LABELS[t.destino]||t.destino)+'</span>':'';
  var catL=!isTr&&t.cat?' · '+(CAT_LABELS[t.cat]||t.cat):'';
  var editBtn=showEdit?'<button class="icon-btn edit" onclick="openEditModal('+t.id+')" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>':'';
  return '<div class="txn"><div class="txn-icon '+cls+'">'+icon+'</div><div class="txn-info"><div class="txn-desc">'+t.desc+'</div><div class="txn-sub">'+t.date+' '+accB+dstB+catL+'</div></div><div class="txn-amount '+cls+'">'+(isIng?'+':isTr?'↔':'-')+fmt(t.amount)+'</div><div class="txn-actions">'+editBtn+'</div></div>';
}

function renderAll() {
  var total=Object.values(state.accounts).reduce(function(a,b){return a+(b||0);},0);
  var month=getThisMonth();
  var ing=month.filter(function(t){return t.type==='ingreso';}).reduce(function(a,t){return a+t.amount;},0);
  var eg=month.filter(function(t){return t.type==='egreso';}).reduce(function(a,t){return a+t.amount;},0);
  var bal=ing-eg;
  document.getElementById('header-total').textContent=fmt(total);
  document.getElementById('acc-milo-top').textContent=fmt(state.accounts.milo||0);
  document.getElementById('acc-sari-top').textContent=fmt(state.accounts.sari||0);
  document.getElementById('acc-cash-top').textContent=fmt(state.accounts.cash||0);
  document.getElementById('m-ing').textContent=fmt(ing);
  document.getElementById('m-eg').textContent=fmt(eg);
  var balEl=document.getElementById('m-bal');
  balEl.textContent=fmt(bal); balEl.className='metric-val '+(bal>=0?'pos':'neg');
  document.getElementById('m-count').textContent=month.length;
  var egs=month.filter(function(t){return t.type==='egreso';});
  var catEl=document.getElementById('cat-bars');
  if(!egs.length){catEl.innerHTML='<div class="empty">Sin egresos este mes</div>';}
  else{
    var cats={};
    egs.forEach(function(t){cats[t.cat]=(cats[t.cat]||0)+t.amount;});
    var totEg=Object.values(cats).reduce(function(a,b){return a+b;},0);
    catEl.innerHTML=Object.entries(cats).sort(function(a,b){return b[1]-a[1];}).map(function(e){
      var pct=Math.round(e[1]/totEg*100);
      return '<div class="cat-row"><div class="cat-row-top"><span>'+(CAT_LABELS[e[0]]||e[0])+'</span><span>'+fmt(e[1])+' · '+pct+'%</span></div><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:'+pct+'%;background:'+(CAT_COLORS[e[0]]||'#888')+'"></div></div></div>';
    }).join('');
  }
  document.getElementById('recent-list').innerHTML=state.transactions.length?state.transactions.slice(0,5).map(function(t){return txnHTML(t,true);}).join(''):'<div class="empty">Sin movimientos aún</div>';
}

function renderMovimientos() {
  var ft=document.getElementById('filter-type').value,fa=document.getElementById('filter-acc').value;
  var txns=state.transactions;
  if(ft) txns=txns.filter(function(t){return t.type===ft;});
  if(fa) txns=txns.filter(function(t){return t.cuenta===fa||t.destino===fa;});
  document.getElementById('mov-list').innerHTML=txns.length?txns.map(function(t){return txnHTML(t,true);}).join(''):'<div class="empty" style="padding:20px 0">Sin movimientos</div>';
}

function renderGoals() {
  var el=document.getElementById('goals-list');
  if(!state.goals||!state.goals.length){el.innerHTML='<div class="empty">Aún no hay metas</div>';return;}
  el.innerHTML=state.goals.map(function(g){
    var pct=Math.min(Math.round(g.saved/g.target*100),100),done=pct>=100;
    return '<div class="goal-card"><div style="display:flex;justify-content:space-between;align-items:start"><div><div class="goal-name">'+(done?'✓ ':'')+g.name+'</div><div class="goal-sub">'+(done?'¡Meta alcanzada!':'Faltan '+fmt(g.target-g.saved))+'</div></div><button class="icon-btn del" onclick="deleteGoal('+g.id+')" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button></div><div class="goal-bar-bg"><div class="goal-bar-fill" style="width:'+pct+'%;background:'+(done?'var(--green)':'var(--blue)')+'"></div></div><div class="goal-footer"><span>Ahorrado: <strong>'+fmt(g.saved)+'</strong></span><strong>'+pct+'%</strong><span>Meta: <strong>'+fmt(g.target)+'</strong></span></div>'+(done?'':'<div style="margin-top:10px"><button class="btn-outline" style="width:100%;font-size:13px" onclick="addToGoal('+g.id+')">+ Abonar a esta meta</button></div>')+'</div>';
  }).join('');
}

function renderFijos() {
  var fijos=state.fixedExpenses||[];
  var month=getThisMonth();
  var ing=month.filter(function(t){return t.type==='ingreso';}).reduce(function(a,t){return a+t.amount;},0);
  var totalFijos=fijos.reduce(function(a,f){return a+f.amount;},0);
  var totalPagado=fijos.filter(function(f){return isChecked(f.id);}).reduce(function(a,f){return a+f.amount;},0);
  var totalPendiente=totalFijos-totalPagado;
  var coverage=totalFijos>0?Math.min(Math.round(ing/totalFijos*100),200):100;
  var coverageColor=ing>=totalFijos?'var(--green)':ing>=totalFijos*0.7?'var(--gold)':'var(--red)';

  // Summary
  var sumEl=document.getElementById('fijos-summary');
  sumEl.innerHTML='<div class="summary-row"><span>Total gastos fijos</span><span>'+fmt(totalFijos)+'</span></div>'+
    '<div class="summary-row"><span>✓ Pagado</span><span style="color:var(--green)">'+fmt(totalPagado)+'</span></div>'+
    '<div class="summary-row"><span>⏳ Pendiente</span><span style="color:var(--orange)">'+fmt(totalPendiente)+'</span></div>'+
    '<div class="coverage-bar-bg"><div class="coverage-fill" style="width:'+Math.min(coverage,100)+'%;background:'+coverageColor+'"></div></div>'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">Ingresos del mes cubren el '+coverage+'% de los gastos fijos</div>'+
    '<div class="summary-row"><span>Ingresos del mes</span><span style="color:'+(ing>=totalFijos?'var(--green)':'var(--red)')+'">'+fmt(ing)+'</span></div>'+
    (ing<totalFijos?'<div style="font-size:12px;color:var(--red);margin-top:4px">⚠️ Faltan '+fmt(totalFijos-ing)+' para cubrir todos los gastos fijos</div>':'<div style="font-size:12px;color:var(--green);margin-top:4px">✓ Los ingresos cubren todos los gastos fijos</div>');

  // List
  var listEl=document.getElementById('fijos-list');
  if(!fijos.length){listEl.innerHTML='<div class="empty" style="padding:20px 0">Agrega tus gastos fijos mensuales</div>';return;}
  listEl.innerHTML=fijos.map(function(f){
    var checked=isChecked(f.id);
    return '<div class="fixed-item">'+
      '<div class="fixed-check'+(checked?' checked':'')+'" onclick="toggleFixedCheck('+f.id+')">'+
        '<svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"/></svg>'+
      '</div>'+
      '<div class="fixed-info">'+
        '<div class="fixed-name'+(checked?' paid':'')+'">'+f.name+'</div>'+
        '<div class="fixed-amount">'+(CAT_LABELS[f.cat]||f.cat)+' · '+fmt(f.amount)+'</div>'+
      '</div>'+
      '<div class="fixed-actions">'+
        '<button class="icon-btn edit" onclick="openFixedModal('+f.id+')" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
        '<button class="icon-btn del" onclick="deleteFixedItem('+f.id+')" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>'+
      '</div>'+
    '</div>';
  }).join('');
}

window.addEventListener('load', function(){ init(); });