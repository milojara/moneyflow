var firebaseConfig = {
  apiKey: "AIzaSyBnBBkFup_-MGCNMGkPx1h1TxwfpObjrtU",
  authDomain: "moneyfam-7d950.firebaseapp.com",
  projectId: "moneyfam-7d950",
  storageBucket: "moneyfam-7d950.firebasestorage.app",
  messagingSenderId: "738074612940",
  appId: "1:738074612940:web:6bcfaa3419ce5cdb7ede69"
};
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
var db = firebase.firestore();
var auth = firebase.auth();

// Constantes de Fase 1 (Autenticación e Identidad)
const DEV_USER_ID = "hccreativo_uid"; 
const WORKSPACE_ID = "workspace_hccreativo";

var ACC_LABELS = {milo:'Cuenta Milo',sari:'Cuenta Sari',cash:'Caja fuerte'};
var CAT_LABELS = {vivienda:'Vivienda',mercado:'Mercado',transporte:'Transporte',salud:'Salud',educacion:'Educación',entretenimiento:'Entretenimiento',ropa:'Ropa',servicios:'Servicios',tecnologia:'Tecnología',negocio:'Click and Roll',ahorro:'Ahorro',tc:'Tarjeta crédito',otro:'Otro'};
var CAT_COLORS = {vivienda:'#378ADD',mercado:'#1D9E75',transporte:'#BA7517',salud:'#D4537E',educacion:'#534AB7',entretenimiento:'#D85A30',ropa:'#993C1D',servicios:'#639922',tecnologia:'#185FA5',negocio:'#3B6D11',ahorro:'#0F6E56',tc:'#8B3A62',otro:'#888780'};
var MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// Estado en memoria
var state = {transactions:[],goals:[],accounts:{},wallets:[],categories:[],fixedExpenses:[],entities:[],debts:[],instruments:[]};

state.activePeriod = { month: new Date().getMonth(), year: new Date().getFullYear() };

function getPeriodStart() { return new Date(state.activePeriod.year, state.activePeriod.month, 1, 0, 0, 0); }
function getPeriodEnd() { return new Date(state.activePeriod.year, state.activePeriod.month + 1, 0, 23, 59, 59); }
function getPeriodEndStr() { 
   var d = getPeriodEnd();
   var m = String(d.getMonth()+1).padStart(2, '0');
   var day = String(d.getDate()).padStart(2, '0');
   return d.getFullYear() + '-' + m + '-' + day;
}
function previousPeriod() {
  state.activePeriod.month--;
  if(state.activePeriod.month < 0) { state.activePeriod.month = 11; state.activePeriod.year--; }
  updatePeriodUI();
  renderAll();
}
function nextPeriod() {
  state.activePeriod.month++;
  if(state.activePeriod.month > 11) { state.activePeriod.month = 0; state.activePeriod.year++; }
  updatePeriodUI();
  renderAll();
}
function isCurrentPeriod() {
  var d = new Date();
  return state.activePeriod.month === d.getMonth() && state.activePeriod.year === d.getFullYear();
}
function updatePeriodUI() {
  var mName = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][state.activePeriod.month];
  var el = document.getElementById('active-period-label');
  if(el) el.textContent = mName + ' ' + state.activePeriod.year;
}
function getActivePeriodTransactions() {
  return state.transactions.filter(function(t){
    var d = new Date(t.date + 'T12:00:00');
    return d.getMonth() === state.activePeriod.month && d.getFullYear() === state.activePeriod.year;
  });
}

var defaultWalletId = null;
var txnType = 'ingreso';
var editType = 'ingreso';
var editingId = null;
var editingFixedId = null;
var isSaving = false;

var pendingSelectId = null;
var editingEntityId = null;

var debtType = 'to_pay';
var editingDebtId = null;
var payingDebtId = null;
var editingInstId = null;
var payingInstId = null;
var editingWalletId = null;
var archivingWalletId = null;
var selectedWalletColor = "var(--blue)";
var editingCategoryId = null;
var selectedCategoryColor = "var(--blue)";
var currentCategoryListType = "egreso";

function updateWalletSelects() {
  var activeWs = state.wallets.filter(w => w.status !== 'archived');
  var wHtml = '';
  activeWs.forEach(w => {
    wHtml += '<option value="w_'+w.id+'">'+w.name+'</option>';
  });
  
  var wOnlyHtml = '';
  activeWs.forEach(w => {
    wOnlyHtml += '<option value="'+w.id+'">'+w.name+'</option>';
  });

  var bothHtml = '<optgroup label="Cuentas (Dinero)">' + wHtml + '</optgroup>';
  if(state.instruments && state.instruments.length > 0) {
    bothHtml += '<optgroup label="Tarjetas de Crédito">';
    state.instruments.forEach(i => {
      bothHtml += '<option value="i_'+i.id+'">'+i.name+'</option>';
    });
    bothHtml += '</optgroup>';
  }

  ['f-cuenta', 'e-cuenta', 'fx-wallet'].forEach(id => {
    var el = document.getElementById(id);
    if(el) { 
       var v = el.value || (defaultWalletId ? 'w_'+defaultWalletId : ''); 
       el.innerHTML = bothHtml; 
       if(v) el.value = v; 
    }
  });

  ['f-destino', 'e-destino', 'dp-wallet', 'ip-wallet'].forEach(id => {
    var el = document.getElementById(id);
    if(el) { 
       var v = el.value; 
       el.innerHTML = wOnlyHtml; 
       if(v) el.value = v; 
    }
  });
  
  var filterHtml = '<option value="">Todas las cuentas</option>' + bothHtml;
  var filterEl = document.getElementById('filter-acc');
  if(filterEl) { var v = filterEl.value; filterEl.innerHTML = filterHtml; if(v) filterEl.value = v; }
}

function renderWalletsRow() {
  var el = document.getElementById('wallets-row');
  if(!el) return;
  var activeWs = state.wallets.filter(w => w.status !== 'archived');
  var endStr = getPeriodEndStr();
  
  var html = activeWs.map(w => {
    var bal = 0;
    if(isCurrentPeriod()) {
       bal = w.balance;
    } else {
       // Sum all txns up to end of active period
       var ing = state.transactions.filter(t => t.date <= endStr && t.type === 'ingreso' && t.cuenta === w.id).reduce((a,t)=>a+t.amount,0);
       var eg = state.transactions.filter(t => t.date <= endStr && (t.type === 'egreso' || t.type === 'cc_payment') && t.cuenta === w.id).reduce((a,t)=>a+t.amount,0);
       var trOut = state.transactions.filter(t => t.date <= endStr && t.type === 'transferencia' && t.cuenta === w.id).reduce((a,t)=>a+t.amount,0);
       var trIn = state.transactions.filter(t => t.date <= endStr && t.type === 'transferencia' && t.destino === w.id).reduce((a,t)=>a+t.amount,0);
       bal = ing + trIn - eg - trOut;
    }
    return '<div class="acc-chip"><div class="acc-dot" style="background:'+w.color+'"></div><span class="acc-chip-label">'+w.name+'</span><span class="acc-chip-val" style="color:'+w.color+'">'+fmt(bal)+'</span></div>';
  }).join('');
  el.innerHTML = html;
}

function renderInstruments() {
  var el = document.getElementById('instruments-list');
  if(!el) return;
  if(!state.instruments || state.instruments.length === 0) {
    el.innerHTML = '<div class="empty">No tienes tarjetas agregadas</div>';
    return;
  }
  
  el.innerHTML = state.instruments.map(i => {
    var endStr = getPeriodEndStr();
    var spent = state.transactions.filter(t => t.type === 'egreso' && String(t.instrumentId) === String(i.id) && t.date <= endStr).reduce((a,t)=>a+t.amount,0);
    var paid = state.transactions.filter(t => t.type === 'cc_payment' && String(t.instrumentId) === String(i.id) && t.date <= endStr).reduce((a,t)=>a+t.amount,0);
    var deuda = spent - paid;
    if(deuda < 0) deuda = 0;
    
    var disp = i.creditLimit - deuda;
    var pct = i.creditLimit > 0 ? Math.min(Math.round((deuda / i.creditLimit)*100), 100) : 0;
    
    var entObj = i.entityId ? state.entities.find(e => e.id === i.entityId) : null;
    var entStr = entObj ? entObj.name : '';
    
    return '<div class="goal-card" style="margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:start">'+
        '<div>'+
          '<div style="margin-bottom:4px"><span class="badge-status badge-pending">Crédito</span></div>'+
          '<div class="goal-name">'+i.name+'</div>'+
          '<div class="goal-sub">'+entStr+'</div>'+
        '</div>'+
        '<div style="display:flex;align-items:start">'+
          '<button class="btn-outline" style="font-size:11px;padding:5px 10px;border-radius:6px;margin-right:6px" onclick="openInstPayModal(\\''+i.id+'\\')">Pagar</button>'+
          '<button class="icon-btn edit" onclick="openInstModal(\\''+i.id+'\\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
          '<button class="icon-btn del" onclick="deleteInst(\\''+i.id+'\\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>'+
        '</div>'+
      '</div>'+
      '<div class="goal-bar-bg" style="margin-top:12px"><div class="goal-bar-fill" style="width:'+pct+'%;background:var(--red)"></div></div>'+
      '<div class="goal-footer"><span>Utilizado: <strong style="color:var(--red)">'+fmt(deuda)+'</strong></span><strong>'+pct+'%</strong><span>Disponible: <strong>'+fmt(disp)+'</strong></span></div>'+
      '<div style="font-size:11px;color:var(--text3);margin-top:8px;text-align:right">Cupo total: '+fmt(i.creditLimit)+'</div>'+
    '</div>';
  }).join('');
}

// ── AMOUNT FORMATTING ──
function formatAmountInput(input, fmtId) {
  var raw = input.value.replace(/\\D/g,'');
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

// ── MIGRACIÓN A V1 ──
async function migrateToV1() {
  const oldDocRef = db.collection("familia").doc("estado");
  const oldSnap = await oldDocRef.get();
  if (!oldSnap.exists) return true;
  const oldData = oldSnap.data();
  if (oldData.migrated_to_v1) return true;
  
  console.log("Iniciando migración a V1...");
  syncStatus('saving');
  document.getElementById('loading-msg').textContent = "Actualizando arquitectura...";
  
  try {
    const backupRef = db.collection("backups_migracion").doc("estado_backup_" + Date.now());
    await backupRef.set(oldData);
    
    const batch = db.batch();
    const wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
    
    batch.set(wsRef, {
      name: "Finanzas Familia", ownerId: DEV_USER_ID, members: [DEV_USER_ID],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    const accounts = oldData.accounts || {milo:0, sari:0, cash:0};
    const wallets = [
      { id: "milo", name: "Cuenta Milo", type: "banco", balance: accounts.milo||0, currency: "COP", status: "active", ownershipType: "personal", visibility: "owner", ownerId: "Camilo" },
      { id: "sari", name: "Cuenta Sari", type: "banco", balance: accounts.sari||0, currency: "COP", status: "active", ownershipType: "personal", visibility: "owner", ownerId: "Sarita" },
      { id: "cash", name: "Caja fuerte", type: "efectivo", balance: accounts.cash||0, currency: "COP", status: "active", ownershipType: "shared", visibility: "shared", ownerId: "Compartido" }
    ];
    wallets.forEach(w => {
      batch.set(wsRef.collection("wallets").doc(w.id), { ...w, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: DEV_USER_ID });
    });
    
    const txns = oldData.transactions || [];
    txns.forEach(t => {
      batch.set(wsRef.collection("transactions").doc(String(t.id)), {
        type: t.type, amount: t.amount, description: t.desc, date: t.date,
        walletId: t.cuenta, destinationWalletId: t.destino || null, categoryId: t.cat || 'otro',
        status: "completed", origin: "migration", createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    
    const goals = oldData.goals || [];
    goals.forEach(g => {
      batch.set(wsRef.collection("goals").doc(String(g.id)), {
        name: g.name, target: g.target, saved: g.saved, status: "active", createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    
    const fixedEx = oldData.fixedExpenses || [];
    fixedEx.forEach(f => {
      batch.set(wsRef.collection("fixed_expenses").doc(String(f.id)), {
        name: f.name, amount: f.amount, categoryId: f.cat || 'otro', walletId: "milo",
        dueDay: 28, status: "active",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    
    batch.update(oldDocRef, { migrated_to_v1: true });
    await batch.commit();
    return true;
  } catch (error) {
    console.error("Error en migración:", error);
    alert("Error crítico migrando datos. Revisa la consola.");
    return false;
  }
}

// ── FIREBASE INIT ──
async function init() {
  var ml = document.getElementById('month-label');
  if (ml) ml.textContent = MONTHS[new Date().getMonth()]+' '+new Date().getFullYear();
  var fml = document.getElementById('fijos-month-label');
  if (fml) fml.textContent = MONTHS[new Date().getMonth()]+' '+new Date().getFullYear();
  setDate();

  const migrationSuccess = await migrateToV1();
  if (migrationSuccess) {
    document.getElementById('loading').classList.add('hidden');
    startListeners();
    syncStatus('ok');
  }
}

function startListeners() {
  const wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  wsRef.collection("entities").onSnapshot(snap => {
    let ents = [];
    snap.forEach(doc => { ents.push({ id: doc.id, ...doc.data() }); });
    ents.sort((a,b) => a.name.localeCompare(b.name));
    state.entities = ents;
    renderEntitiesList();
    updateEntitySelects();
    renderAll();
  });

  wsRef.collection("wallets").onSnapshot(snap => {
    state.accounts = {};
    state.wallets = [];
    snap.forEach(doc => { 
      let d = doc.data();
      state.accounts[doc.id] = d.balance || 0;
      
      // Fallback para wallets legacy
      let wName = d.name;
      let wColor = d.color;
      let wType = d.type;
      
      if(!wName) {
         if(doc.id === 'milo') wName = 'Milo';
         else if(doc.id === 'sari') wName = 'Sari';
         else if(doc.id === 'cash') wName = 'Efectivo';
         else wName = doc.id;
      }
      if(!wColor) {
         if(doc.id === 'milo') wColor = 'var(--blue)';
         else if(doc.id === 'sari') wColor = 'var(--pink)';
         else if(doc.id === 'cash') wColor = 'var(--gold)';
         else wColor = 'var(--text1)';
      }
      if(!wType) {
         if(doc.id === 'cash') wType = 'efectivo';
         else wType = 'banco';
      }
      
      let wStatus = d.status || 'active';
      let wDefault = d.isDefault || false;
      if(wDefault && wStatus === 'active') defaultWalletId = doc.id;
      
      state.wallets.push({
        id: doc.id,
        name: wName,
        color: wColor,
        type: wType,
        balance: d.balance || 0,
        status: wStatus,
        isDefault: wDefault
      });
    });
    
    // Si no hay default y hay activas, asignamos la primera
    if(!defaultWalletId) {
      let activeWs = state.wallets.filter(w => w.status !== 'archived');
      if(activeWs.length > 0) defaultWalletId = activeWs[0].id;
    }
    
    renderWalletsRow();
    updateWalletSelects();
    renderWalletsList();
    renderAll();
  });

  wsRef.collection("categories").onSnapshot(snap => {
    state.categories = [];
    if(snap.empty) {
      // Seed categories (Fallback mapping as defaults)
      var batch = db.batch();
      var count = 0;
      Object.keys(LEGACY_CATEGORIES).forEach(k => {
         var lg = LEGACY_CATEGORIES[k];
         var ref = wsRef.collection("categories").doc(k);
         batch.set(ref, {
           name: lg.name, icon: lg.icon, color: lg.color, type: (k==='salario'||k==='ingresos' ? 'ingreso' : 'egreso'),
           group: '', status: 'active', createdAt: firebase.firestore.FieldValue.serverTimestamp()
         });
         count++;
      });
      if(count > 0) batch.commit().then(() => console.log('Categorías por defecto creadas'));
    } else {
      snap.forEach(doc => {
        var d = doc.data();
        state.categories.push({ id: doc.id, name: d.name, icon: d.icon, color: d.color, type: d.type, group: d.group, status: d.status || 'active' });
      });
    }
    updateCategorySelects();
    if(document.getElementById('category-list-modal').classList.contains('open')) {
       renderCategoryList(currentCategoryListType);
    }
    renderAll();
  });

  
  wsRef.collection("transactions").orderBy("date", "desc").onSnapshot(snap => {
    let txns = [];
    snap.forEach(doc => {
      const d = doc.data();
      txns.push({
        id: parseInt(doc.id), type: d.type, desc: d.description, amount: d.amount,
        cuenta: d.walletId, instrumentId: d.instrumentId || null, destino: d.destinationWalletId, cat: d.categoryId, date: d.date,
        entityId: d.entityId || null,
        origin: d.origin || null, commitmentId: d.commitmentId || null
      });
    });
    txns.sort((a,b) => b.id - a.id);
    state.transactions = txns;
    renderAll();
    if(document.querySelector('.section.active') && document.querySelector('.section.active').id==='tab-movimientos') renderMovimientos();
    if(document.querySelector('.section.active') && document.querySelector('.section.active').id==='tab-compromisos') { renderFijos(); renderDebts(); }
  });
  
  wsRef.collection("goals").onSnapshot(snap => {
    let goals = [];
    snap.forEach(doc => {
      const d = doc.data();
      goals.push({ id: parseInt(doc.id), name: d.name, target: d.target, saved: d.saved });
    });
    state.goals = goals;
    renderGoals();
  });
  
  wsRef.collection("fixed_expenses").onSnapshot(snap => {
    let fijos = [];
    snap.forEach(doc => {
      const d = doc.data();
      fijos.push({ 
        id: parseInt(doc.id), name: d.name, amount: d.amount, cat: d.categoryId, 
        entityId: d.entityId || null, dueDay: d.dueDay || 28, 
        walletId: d.walletId || 'milo', status: d.status || 'active' 
      });
    });
    fijos.sort((a,b) => a.dueDay - b.dueDay);
    state.fixedExpenses = fijos;
    renderFijos();
  });
  
  wsRef.collection("debts").onSnapshot(snap => {
    let dArr = [];
    snap.forEach(doc => {
      const d = doc.data();
      dArr.push({ 
        id: parseInt(doc.id), name: d.name, initialAmount: d.initialAmount, type: d.type, 
        entityId: d.entityId || null, status: d.status || 'active' 
      });
    });
    state.debts = dArr;
    renderDebts();
  });
}

  wsRef.collection("instruments").onSnapshot(snap => {
    let iArr = [];
    snap.forEach(doc => {
      const d = doc.data();
      iArr.push({ id: doc.id, name: d.name, type: d.type, creditLimit: d.creditLimit, entityId: d.entityId || null });
    });
    state.instruments = iArr;
    updateWalletSelects();
    renderInstruments();
  });


// ── GESTIÓN DE WALLETS ──
function openWalletListModal() { 
  closeConfigModal();
  renderWalletsList();
  document.getElementById('wallet-list-modal').classList.add('open'); 
}
function closeWalletListModal() { document.getElementById('wallet-list-modal').classList.remove('open'); }

function renderWalletsList() {
  var crudEl = document.getElementById('wallets-crud-list');
  var archEl = document.getElementById('wallets-archived-list');
  if(!crudEl || !archEl) return;
  
  var activeWs = state.wallets.filter(w => w.status !== 'archived');
  var archivedWs = state.wallets.filter(w => w.status === 'archived');
  
  crudEl.innerHTML = activeWs.map(w => {
    var isDef = w.isDefault ? '<span class="badge badge-milo" style="margin-left:8px;font-size:10px">Default</span>' : '';
    return '<div class="fixed-item">'+
      '<div class="fixed-info"><div class="fixed-name"><div class="acc-dot" style="background:'+w.color+';display:inline-block;margin-right:6px"></div>'+w.name+isDef+'</div><div class="fixed-amount" style="font-size:12px;font-weight:400;color:var(--text3)">Saldo: '+fmt(w.balance)+'</div></div>'+
      '<div class="fixed-actions">'+
        '<button class="icon-btn edit" onclick="openWalletCrudModal(\''+w.id+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
        '<button class="icon-btn del" onclick="openWalletArchiveModal(\''+w.id+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>'+
      '</div></div>';
  }).join('');
  
  archEl.innerHTML = archivedWs.length ? archivedWs.map(w => {
    return '<div class="fixed-item">'+
      '<div class="fixed-info"><div class="fixed-name">'+w.name+'</div><div class="fixed-amount" style="font-size:12px;font-weight:400;color:var(--text3)">Archivada</div></div>'+
      '</div>';
  }).join('') : '<div class="empty">No hay cuentas archivadas</div>';
}

function openWalletCrudModal(id) {
  editingWalletId = id;
  if(id) {
    var w = state.wallets.find(x => x.id === id);
    if(w) {
      document.getElementById('w-name').value = w.name;
      document.getElementById('w-type').value = w.type;
      document.getElementById('w-default').checked = w.isDefault;
      selectWalletColor(w.color);
      document.getElementById('wallet-crud-title').textContent = 'Editar Cuenta';
    }
  } else {
    document.getElementById('w-name').value = '';
    document.getElementById('w-type').value = 'banco';
    document.getElementById('w-default').checked = false;
    selectWalletColor('var(--blue)');
    document.getElementById('wallet-crud-title').textContent = 'Nueva Cuenta';
  }
  document.getElementById('wallet-crud-modal').classList.add('open');
}
function closeWalletCrudModal() { document.getElementById('wallet-crud-modal').classList.remove('open'); editingWalletId = null; }

function selectWalletColor(c) {
  selectedWalletColor = c;
  document.querySelectorAll('.w-color').forEach(el => {
    if(el.dataset.color === c) el.classList.add('active');
    else el.classList.remove('active');
  });
}

function saveWallet() {
  var name = document.getElementById('w-name').value.trim();
  var type = document.getElementById('w-type').value;
  var isDefault = document.getElementById('w-default').checked;
  
  if(!name) { alert('Ingresa el nombre'); return; }
  
  var wRef;
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  if(isDefault) {
    // Quitar default a las demas
    state.wallets.forEach(w => {
      if(w.isDefault && w.id !== editingWalletId) {
         batch.update(wsRef.collection("wallets").doc(w.id), { isDefault: false });
      }
    });
  }

  if(editingWalletId) {
    wRef = wsRef.collection("wallets").doc(editingWalletId);
    batch.update(wRef, { 
      name: name, type: type, color: selectedWalletColor, isDefault: isDefault, updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
  } else {
    wRef = wsRef.collection("wallets").doc('w_' + Date.now());
    batch.set(wRef, { 
      name: name, type: type, color: selectedWalletColor, balance: 0, status: 'active', isDefault: isDefault, createdAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
  }
  
  batch.commit().then(() => { closeWalletCrudModal(); toast('✓ Cuenta guardada'); }).catch(e => toast('⚠️ Error: ' + e.message));
}

function openWalletArchiveModal(id) {
  var w = state.wallets.find(x => x.id === id);
  if(!w) return;
  var activeWs = state.wallets.filter(x => x.status !== 'archived');
  if(activeWs.length <= 1) {
     alert('No puedes archivar la única cuenta activa.');
     return;
  }
  
  archivingWalletId = id;
  
  if(w.balance > 0) {
    document.getElementById('wa-balance').textContent = fmt(w.balance);
    var dHtml = '';
    activeWs.forEach(aw => {
       if(aw.id !== id) dHtml += '<option value="'+aw.id+'">'+aw.name+'</option>';
    });
    document.getElementById('wa-dest').innerHTML = dHtml;
    document.getElementById('wallet-archive-modal').classList.add('open');
  } else {
    if(confirm('¿Archivar cuenta ' + w.name + '? Ya no aparecerá en los selects.')) {
      db.collection("workspaces").doc(WORKSPACE_ID).collection("wallets").doc(id).update({
        status: 'archived', isDefault: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => toast('✓ Cuenta archivada'));
    }
  }
}

function closeWalletArchiveModal() { document.getElementById('wallet-archive-modal').classList.remove('open'); archivingWalletId = null; }

function processWalletArchive() {
  if(!archivingWalletId) return;
  var dest = document.getElementById('wa-dest').value;
  var w = state.wallets.find(x => x.id === archivingWalletId);
  if(!dest || !w) return;
  
  var txnId = String(Date.now());
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  var tRef = wsRef.collection("transactions").doc(txnId);
  batch.set(tRef, {
      type: 'transferencia', amount: w.balance, description: 'Cierre de cuenta ' + w.name, date: todayStr(),
      walletId: w.id, destinationWalletId: dest,
      categoryId: null, entityId: null,
      status: "completed", origin: "system",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: DEV_USER_ID
  });
  
  batch.update(wsRef.collection("wallets").doc(w.id), { 
      balance: 0, status: 'archived', isDefault: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
  });
  batch.update(wsRef.collection("wallets").doc(dest), { 
      balance: firebase.firestore.FieldValue.increment(w.balance), updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
  });
  
  syncStatus('saving');
  batch.commit().then(() => {
    syncStatus('ok'); toast('✓ Cuenta archivada y fondos transferidos');
    closeWalletArchiveModal();
  }).catch(e => { syncStatus('err'); toast('⚠️ ' + e.message); });
}


var LEGACY_CATEGORIES = {
   'vivienda': { name: 'Vivienda', icon: '🏠', color: 'var(--blue)' },
   'mercado': { name: 'Mercado', icon: '🛒', color: 'var(--green)' },
   'transporte': { name: 'Transporte', icon: '🚗', color: 'var(--orange)' },
   'salud': { name: 'Salud', icon: '❤️', color: 'var(--pink)' },
   'educacion': { name: 'Educación', icon: '📚', color: 'var(--purple)' },
   'entretenimiento': { name: 'Ocio', icon: '🎬', color: 'var(--gold)' },
   'ropa': { name: 'Ropa', icon: '👕', color: 'var(--blue)' },
   'servicios': { name: 'Servicios', icon: '💡', color: 'var(--gold)' },
   'tecnologia': { name: 'Tecnología', icon: '💻', color: 'var(--text1)' },
   'negocio': { name: 'Negocio', icon: '💼', color: 'var(--blue)' },
   'ahorro': { name: 'Ahorro', icon: '💰', color: 'var(--green)' },
   'tc': { name: 'Tarjeta Crédito', icon: '💳', color: 'var(--pink)' },
   'otro': { name: 'Otro', icon: '📦', color: 'var(--text3)' },
   'salario': { name: 'Salario', icon: '💵', color: 'var(--green)' },
   'ingresos': { name: 'Ingresos', icon: '💵', color: 'var(--green)' }
};

function getCategoryMeta(id) {
  if(!id) return { name: 'Sin clasificar', icon: '🏷️', color: 'var(--text3)' };
  var c = state.categories.find(x => x.id === id);
  if(c) return c;
  var leg = LEGACY_CATEGORIES[id];
  if(leg) return { id: id, name: leg.name, icon: leg.icon, color: leg.color, type: 'egreso', status: 'active' };
  return { id: id, name: id, icon: '🏷️', color: 'var(--text3)', type: 'egreso', status: 'active' };
}

// ── CATEGORIES ──
function updateCategorySelects() {
  var active = state.categories.filter(c => c.status !== 'archived');
  var ingHtml = active.filter(c => c.type === 'ingreso').map(c => '<option value="'+c.id+'">'+c.icon+' '+c.name+'</option>').join('');
  var egHtml = active.filter(c => c.type === 'egreso').map(c => '<option value="'+c.id+'">'+c.icon+' '+c.name+'</option>').join('');
  
  if(!ingHtml) ingHtml = '<option value="">Sin categorías</option>';
  if(!egHtml) egHtml = '<option value="">Sin categorías</option>';
  
  var fc = document.getElementById('f-cat');
  if(fc) fc.innerHTML = txnType === 'ingreso' ? ingHtml : egHtml;
  
  var ec = document.getElementById('e-cat');
  if(ec) ec.innerHTML = editType === 'ingreso' ? ingHtml : egHtml;
  
  var fxc = document.getElementById('fx-cat');
  if(fxc) fxc.innerHTML = egHtml;
}

function openCategoryListModal() {
  closeConfigModal();
  renderCategoryList('egreso');
  document.getElementById('category-list-modal').classList.add('open');
}
function closeCategoryListModal() { document.getElementById('category-list-modal').classList.remove('open'); }

function renderCategoryList(type) {
  currentCategoryListType = type;
  document.getElementById('cseg-egreso').classList.toggle('active', type === 'egreso');
  document.getElementById('cseg-ingreso').classList.toggle('active', type === 'ingreso');
  
  var crudEl = document.getElementById('categories-crud-list');
  var archEl = document.getElementById('categories-archived-list');
  if(!crudEl || !archEl) return;
  
  var active = state.categories.filter(c => c.status !== 'archived' && c.type === type);
  var archived = state.categories.filter(c => c.status === 'archived' && c.type === type);
  
  crudEl.innerHTML = active.map(c => {
    return '<div class="fixed-item">'+
      '<div class="fixed-info"><div class="fixed-name"><div class="acc-dot" style="background:'+c.color+';display:inline-block;margin-right:6px"></div>'+c.icon+' '+c.name+'</div><div class="fixed-amount" style="font-size:12px;font-weight:400;color:var(--text3)">'+(c.group||'Sin grupo')+'</div></div>'+
      '<div class="fixed-actions">'+
        '<button class="icon-btn edit" onclick="openCategoryCrudModal(\''+c.id+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
        '<button class="icon-btn del" onclick="archiveCategory(\''+c.id+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>'+
      '</div></div>';
  }).join('');
  
  archEl.innerHTML = archived.length ? archived.map(c => {
    return '<div class="fixed-item">'+
      '<div class="fixed-info"><div class="fixed-name">'+c.icon+' '+c.name+'</div><div class="fixed-amount" style="font-size:12px;font-weight:400;color:var(--text3)">Archivada</div></div>'+
      '</div>';
  }).join('') : '<div class="empty">No hay archivadas</div>';
}

function openCategoryCrudModal(id) {
  editingCategoryId = id;
  if(id) {
    var c = state.categories.find(x => x.id === id);
    if(c) {
      document.getElementById('c-name').value = c.name;
      document.getElementById('c-icon').value = c.icon;
      document.getElementById('c-type').value = c.type;
      document.getElementById('c-group').value = c.group || '';
      selectCategoryColor(c.color);
      document.getElementById('category-crud-title').textContent = 'Editar Categoría';
    }
  } else {
    document.getElementById('c-name').value = '';
    document.getElementById('c-icon').value = '📦';
    document.getElementById('c-type').value = currentCategoryListType;
    document.getElementById('c-group').value = '';
    selectCategoryColor('var(--blue)');
    document.getElementById('category-crud-title').textContent = 'Nueva Categoría';
  }
  document.getElementById('category-crud-modal').classList.add('open');
}
function closeCategoryCrudModal() { document.getElementById('category-crud-modal').classList.remove('open'); editingCategoryId = null; }

function selectCategoryColor(c) {
  selectedCategoryColor = c;
  document.querySelectorAll('.c-color').forEach(el => {
    if(el.dataset.color === c) el.classList.add('active');
    else el.classList.remove('active');
  });
}

function saveCategory() {
  var name = document.getElementById('c-name').value.trim();
  var icon = document.getElementById('c-icon').value.trim() || '🏷️';
  var type = document.getElementById('c-type').value;
  var group = document.getElementById('c-group').value;
  
  if(!name) { alert('Ingresa el nombre'); return; }
  
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  if(editingCategoryId) {
    var cRef = wsRef.collection("categories").doc(editingCategoryId);
    batch.update(cRef, { 
      name: name, icon: icon, type: type, group: group, color: selectedCategoryColor, updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
  } else {
    var cRef = wsRef.collection("categories").doc('c_' + Date.now());
    batch.set(cRef, { 
      name: name, icon: icon, type: type, group: group, color: selectedCategoryColor, status: 'active', createdAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
  }
  
  batch.commit().then(() => { closeCategoryCrudModal(); toast('✓ Categoría guardada'); }).catch(e => toast('⚠️ Error: ' + e.message));
}

function archiveCategory(id) {
  var c = state.categories.find(x => x.id === id);
  if(!c) return;
  if(confirm('¿Archivar la categoría ' + c.name + '? Ya no aparecerá en nuevos registros.')) {
    db.collection("workspaces").doc(WORKSPACE_ID).collection("categories").doc(id).update({
      status: 'archived', updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => toast('✓ Categoría archivada'));
  }
}

// ── CONFIG Y ENTIDADES ──

function openConfigModal() { document.getElementById('config-modal').classList.add('open'); }
function closeConfigModal() { document.getElementById('config-modal').classList.remove('open'); }

function openEntityListModal() { document.getElementById('entity-list-modal').classList.add('open'); }
function closeEntityListModal() { document.getElementById('entity-list-modal').classList.remove('open'); }

function openEntityCrudModal(id, targetSelectId) {
  editingEntityId = id;
  pendingSelectId = targetSelectId || null;
  if(id) {
    var e = state.entities.find(x => x.id === id);
    if(e) {
      document.getElementById('ent-name').value = e.name;
      document.getElementById('ent-type').value = e.type;
      document.getElementById('entity-crud-title').textContent = 'Editar Entidad';
    }
  } else {
    document.getElementById('ent-name').value = '';
    document.getElementById('ent-type').value = 'persona';
    document.getElementById('entity-crud-title').textContent = 'Nueva Entidad';
  }
  document.getElementById('entity-crud-modal').classList.add('open');
}

function closeEntityCrudModal() { 
  document.getElementById('entity-crud-modal').classList.remove('open'); 
  pendingSelectId = null;
}

function handleEntityChange(sel) {
  if (sel.value === 'NEW') {
    sel.value = ''; 
    openEntityCrudModal(null, sel.id);
  }
}

function updateEntitySelects() {
  var html = '<option value="">Sin entidad</option><option value="NEW">+ Nueva entidad...</option>';
  state.entities.forEach(e => { html += '<option value="'+e.id+'">'+e.name+'</option>'; });
  ['f-entidad', 'e-entidad', 'fx-entidad', 'd-entidad'].forEach(id => {
    var sel = document.getElementById(id);
    if(sel) {
      var val = sel.value;
      sel.innerHTML = html;
      if(val && val !== 'NEW') sel.value = val;
    }
  });
}

function renderEntitiesList() {
  var el = document.getElementById('entities-list');
  if(!el) return;
  if(!state.entities.length) { el.innerHTML = '<div class="empty">No hay entidades creadas</div>'; return; }
  el.innerHTML = state.entities.map(e => {
    return '<div class="fixed-item">'+
      '<div class="fixed-info"><div class="fixed-name">'+e.name+'</div><div class="fixed-amount" style="text-transform:capitalize">'+e.type+'</div></div>'+
      '<div class="fixed-actions"><button class="icon-btn edit" onclick="openEntityCrudModal(\''+e.id+'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></div>'+
    '</div>';
  }).join('');
}

function saveEntity() {
  var name = document.getElementById('ent-name').value.trim();
  var type = document.getElementById('ent-type').value;
  if(!name) { alert('Ingresa un nombre'); return; }
  
  var entId = editingEntityId || String(Date.now());
  var eRef = db.collection("workspaces").doc(WORKSPACE_ID).collection("entities").doc(entId);
  var data = { name: name, type: type, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: DEV_USER_ID };
  if(!editingEntityId) {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.createdBy = DEV_USER_ID;
  }
  
  syncStatus('saving');
  eRef.set(data, {merge:true}).then(() => {
    syncStatus('ok'); toast('✓ Entidad guardada');
    closeEntityCrudModal();
    if(pendingSelectId) {
      var selId = pendingSelectId;
      setTimeout(() => {
        var sel = document.getElementById(selId);
        if(sel) sel.value = entId;
      }, 300); // Dar tiempo al onSnapshot
    }
  }).catch(err => {
    syncStatus('err'); toast('⚠️ '+err.message);
  });
}

// ── TABS ──
function showTab(id) {
  document.querySelectorAll('.section').forEach(function(s){s.classList.remove('active');});
  document.querySelectorAll('.btab').forEach(function(b){b.classList.remove('active');});
  document.getElementById('tab-'+id).classList.add('active');
  ['resumen','nuevo','movimientos','metas','compromisos'].forEach(function(t,i){
    if(t===id) document.querySelectorAll('.btab')[i].classList.add('active');
  });
  if(id==='movimientos') renderMovimientos();
  if(id==='metas') renderGoals();
  if(id==='compromisos') { renderFijos(); renderDebts(); }
}

function showCompromisoTab(tabId) {
  document.getElementById('cseg-fijos').classList.remove('active');
  document.getElementById('cseg-deudas').classList.remove('active');
  document.getElementById('cseg-' + tabId).classList.add('active');
  document.getElementById('comp-fijos').style.display = tabId === 'fijos' ? 'block' : 'none';
  document.getElementById('comp-deudas').style.display = tabId === 'deudas' ? 'block' : 'none';
  if(tabId === 'fijos') renderFijos();
  if(tabId === 'deudas') renderDebts();
}

function setType(t) {
  txnType=t;
  ['ing','eg','tr'].forEach(function(x){document.getElementById('seg-'+x).classList.remove('active');});
  document.getElementById('seg-'+{ingreso:'ing',egreso:'eg',transferencia:'tr'}[t]).classList.add('active');
  document.getElementById('row-cat').style.display=t==='transferencia'?'none':'block';
  document.getElementById('row-destino').style.display=t==='transferencia'?'block':'none';
  document.getElementById('label-cuenta').textContent=t==='transferencia'?'Cuenta origen':'Cuenta / Tarjeta';
  
  if(t === 'transferencia') {
    var wOnlyHtml = '';
    Object.keys(state.accounts).forEach(k => { wOnlyHtml += '<option value="w_'+k+'">'+(ACC_LABELS[k]||k)+'</option>'; });
    var el = document.getElementById('f-cuenta');
    if(el) { var v = el.value; el.innerHTML = wOnlyHtml; if(v) el.value = v; }
  } else {
    updateWalletSelects();
  }
  updateCategorySelects();
}

// ── ATOMIC BATCH SAVES ──
function saveTransaction() {
  var desc=document.getElementById('f-desc').value.trim();
  var amount=getRawAmount('f-amount');
  var rawCuenta=document.getElementById('f-cuenta').value;
  var cat=document.getElementById('f-cat').value;
  var date=document.getElementById('f-date').value;
  var destino=document.getElementById('f-destino').value;
  var entidad=document.getElementById('f-entidad').value;
  if(!desc||!amount||amount<=0){alert('Completa descripción y monto');return;}
  
  var isInst = rawCuenta && rawCuenta.startsWith('i_');
  var cuentaId = isInst ? rawCuenta.substring(2) : (rawCuenta && rawCuenta.startsWith('w_') ? rawCuenta.substring(2) : rawCuenta);
  
  var txnId = String(Date.now());
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  var tRef = wsRef.collection("transactions").doc(txnId);
  batch.set(tRef, {
      type: txnType, amount: amount, description: desc, date: date,
      walletId: isInst ? null : cuentaId, 
      instrumentId: isInst ? cuentaId : null,
      destinationWalletId: txnType === 'transferencia' ? destino : null,
      categoryId: txnType === 'transferencia' ? null : cat, 
      entityId: entidad || null,
      status: "completed", origin: "manual",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: DEV_USER_ID
  });
  
  if(!isInst) {
    var wRef = wsRef.collection("wallets").doc(cuentaId);
    if (txnType === 'ingreso') {
      batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } else if (txnType === 'egreso') {
      batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(-amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } else if (txnType === 'transferencia') {
      batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(-amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      var destRef = wsRef.collection("wallets").doc(destino);
      batch.update(destRef, { balance: firebase.firestore.FieldValue.increment(amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
  }

  isSaving = true; syncStatus('saving');
  batch.commit().then(() => {
    isSaving = false; syncStatus('ok'); toast('✓ Guardado y sincronizado');
    document.getElementById('f-desc').value=''; document.getElementById('f-amount').value=''; updateWalletSelects();
    document.getElementById('f-amount-fmt').textContent=''; document.getElementById('f-entidad').value=''; setDate();
  }).catch(err => {
    isSaving = false; syncStatus('err'); toast('⚠️ '+err.message);
  });
}

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
  document.getElementById('e-entidad').value=t.entityId||'';
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
  updateCategorySelects();
}

function saveEdit() {
  if(!editingId) return;
  var old=state.transactions.find(function(x){return x.id===editingId;});
  if(!old) return;
  
  var amount=getRawAmount('e-amount');
  var entidad=document.getElementById('e-entidad').value;
  if(!amount||amount<=0){alert('Ingresa un monto válido');return;}
  
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  // 1. REVERSE OLD
  var oldWRef = wsRef.collection("wallets").doc(old.cuenta);
  if (old.type === 'ingreso') batch.update(oldWRef, { balance: firebase.firestore.FieldValue.increment(-old.amount) });
  else if (old.type === 'egreso') batch.update(oldWRef, { balance: firebase.firestore.FieldValue.increment(old.amount) });
  else if (old.type === 'transferencia') {
    batch.update(oldWRef, { balance: firebase.firestore.FieldValue.increment(old.amount) });
    var oldDestRef = wsRef.collection("wallets").doc(old.destino);
    batch.update(oldDestRef, { balance: firebase.firestore.FieldValue.increment(-old.amount) });
  }

  // 2. APPLY NEW
  var newCuenta = document.getElementById('e-cuenta').value;
  var newDestino = document.getElementById('e-destino').value;
  var newWRef = wsRef.collection("wallets").doc(newCuenta);
  
  if (editType === 'ingreso') batch.update(newWRef, { balance: firebase.firestore.FieldValue.increment(amount) });
  else if (editType === 'egreso') batch.update(newWRef, { balance: firebase.firestore.FieldValue.increment(-amount) });
  else if (editType === 'transferencia') {
    batch.update(newWRef, { balance: firebase.firestore.FieldValue.increment(-amount) });
    var newDestRef = wsRef.collection("wallets").doc(newDestino);
    batch.update(newDestRef, { balance: firebase.firestore.FieldValue.increment(amount) });
  }
  
  // 3. UPDATE TRANSACTION
  var tRef = wsRef.collection("transactions").doc(String(editingId));
  batch.update(tRef, {
    type: editType, amount: amount, description: document.getElementById('e-desc').value.trim(),
    date: document.getElementById('e-date').value, walletId: newCuenta,
    destinationWalletId: editType === 'transferencia' ? newDestino : null,
    categoryId: editType === 'transferencia' ? null : document.getElementById('e-cat').value,
    entityId: entidad || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: DEV_USER_ID
  });

  isSaving = true; syncStatus('saving');
  batch.commit().then(() => {
    isSaving = false; syncStatus('ok'); toast('✓ Movimiento actualizado');
    closeEditModal();
  }).catch(err => {
    isSaving = false; syncStatus('err'); toast('⚠️ '+err.message);
  });
}

function deleteFromModal() {
  if(!editingId||!confirm('¿Eliminar este movimiento?')) return;
  var old=state.transactions.find(function(x){return x.id===editingId;});
  if(!old) return;

  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  var oldWRef = wsRef.collection("wallets").doc(old.cuenta);
  if (old.type === 'ingreso') batch.update(oldWRef, { balance: firebase.firestore.FieldValue.increment(-old.amount) });
  else if (old.type === 'egreso') batch.update(oldWRef, { balance: firebase.firestore.FieldValue.increment(old.amount) });
  else if (old.type === 'transferencia') {
    batch.update(oldWRef, { balance: firebase.firestore.FieldValue.increment(old.amount) });
    var oldDestRef = wsRef.collection("wallets").doc(old.destino);
    batch.update(oldDestRef, { balance: firebase.firestore.FieldValue.increment(-old.amount) });
  }

  var tRef = wsRef.collection("transactions").doc(String(editingId));
  batch.delete(tRef);

  isSaving = true; syncStatus('saving');
  batch.commit().then(() => {
    isSaving = false; syncStatus('ok'); toast('✓ Eliminado');
    closeEditModal();
  }).catch(err => {
    isSaving = false; syncStatus('err'); toast('⚠️ '+err.message);
  });
}

function saveGoal() {
  var name=document.getElementById('g-name').value.trim();
  var target=getRawAmount('g-target');
  var saved=getRawAmount('g-saved');
  if(!name||!target||target<=0){alert('Completa nombre y monto objetivo');return;}
  
  var gId = String(Date.now());
  var gRef = db.collection("workspaces").doc(WORKSPACE_ID).collection("goals").doc(gId);
  gRef.set({ name: name, target: target, saved: saved, status: "active", createdAt: firebase.firestore.FieldValue.serverTimestamp() })
  .then(() => {
    document.getElementById('g-name').value='';
    document.getElementById('g-target').value=''; document.getElementById('g-target-fmt').textContent='';
    document.getElementById('g-saved').value=''; document.getElementById('g-saved-fmt').textContent='';
    toast('✓ Meta creada');
  });
}

function deleteGoal(id) {
  if(!confirm('¿Eliminar esta meta?')) return;
  db.collection("workspaces").doc(WORKSPACE_ID).collection("goals").doc(String(id)).delete().then(()=>{ toast('✓ Eliminada'); });
}

function addToGoal(id) {
  var amt=parseFloat(prompt('¿Cuánto quieres abonar? (COP $)'));
  if(!amt||amt<=0) return;
  var gRef = db.collection("workspaces").doc(WORKSPACE_ID).collection("goals").doc(String(id));
  gRef.update({ saved: firebase.firestore.FieldValue.increment(amt), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
  .then(() => { toast('✓ Abono registrado'); });
}

// ── COMPROMISOS (GASTOS FIJOS) ──
function openFixedModal(id) {
  editingFixedId=id;
  if(id) {
    var fx=state.fixedExpenses.find(function(x){return x.id===id;});
    if(fx){
      document.getElementById('fx-name').value=fx.name;
      document.getElementById('fx-amount').value=String(Math.round(fx.amount));
      document.getElementById('fx-amount-fmt').textContent='$ '+Math.round(fx.amount).toLocaleString('es-CO');
      document.getElementById('fx-cat').value=fx.cat||'otro';
      document.getElementById('fx-entidad').value=fx.entityId||'';
      document.getElementById('fx-day').value=fx.dueDay||28;
      document.getElementById('fx-wallet').value=fx.walletId||'milo';
      document.getElementById('fixed-modal-title').textContent='Editar gasto fijo';
      document.getElementById('fixed-modal-btn').textContent='Guardar cambios';
    }
  } else {
    document.getElementById('fx-name').value='';
    document.getElementById('fx-amount').value='';
    document.getElementById('fx-amount-fmt').textContent='';
    document.getElementById('fx-cat').value='vivienda';
    document.getElementById('fx-entidad').value='';
    document.getElementById('fx-day').value='';
    document.getElementById('fx-wallet').value='milo';
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
  var entidad=document.getElementById('fx-entidad').value;
  var dueDay=parseInt(document.getElementById('fx-day').value) || 28;
  var rawWallet=document.getElementById('fx-wallet').value;
  var wallet = rawWallet && rawWallet.startsWith('w_') ? rawWallet.substring(2) : rawWallet;
  if(!name||!amount||amount<=0){alert('Completa nombre y monto');return;}
  
  var fRef;
  if(editingFixedId) {
    fRef = db.collection("workspaces").doc(WORKSPACE_ID).collection("fixed_expenses").doc(String(editingFixedId));
    fRef.update({ 
      name: name, amount: amount, categoryId: cat, entityId: entidad||null, 
      dueDay: dueDay, walletId: wallet, updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    }).then(() => {
      closeFixedModal(); toast('✓ Gasto actualizado');
    });
  } else {
    fRef = db.collection("workspaces").doc(WORKSPACE_ID).collection("fixed_expenses").doc(String(Date.now()));
    fRef.set({ 
      name: name, amount: amount, categoryId: cat, entityId: entidad||null, 
      dueDay: dueDay, walletId: wallet, status: "active", 
      createdAt: firebase.firestore.FieldValue.serverTimestamp() 
    }).then(() => {
      closeFixedModal(); toast('✓ Gasto fijo agregado');
    });
  }
}

function deleteFixedItem(id) {
  if(!confirm('¿Archivar este gasto fijo? Dejará de aparecer en tus compromisos mensuales.')) return;
  db.collection("workspaces").doc(WORKSPACE_ID).collection("fixed_expenses").doc(String(id)).update({ status: 'archived', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

function payFixedExpense(id) {
  var fx = state.fixedExpenses.find(x => x.id === id);
  if(!fx) return;
  var isInst = fx.walletId && fx.walletId.startsWith('i_');
  var sourceId = isInst ? fx.walletId.substring(2) : fx.walletId;
  var label = isInst ? (state.instruments.find(i=>i.id==sourceId)?.name || 'Tarjeta') : (ACC_LABELS[sourceId] || sourceId);
  if(!confirm('¿Pagar ' + fx.name + ' desde ' + label + '?')) return;
  
  var txnId = String(Date.now());
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  var tRef = wsRef.collection("transactions").doc(txnId);
  batch.set(tRef, {
      type: 'egreso', amount: fx.amount, description: fx.name, date: todayStr(),
      walletId: isInst ? null : sourceId, 
      instrumentId: isInst ? sourceId : null,
      destinationWalletId: null,
      categoryId: fx.cat, entityId: fx.entityId || null,
      status: "completed", origin: "fixedExpense", commitmentId: String(id),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: DEV_USER_ID
  });
  
  if(!isInst) {
    var wRef = wsRef.collection("wallets").doc(sourceId);
    batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(-fx.amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
  
  syncStatus('saving');
  batch.commit().then(() => {
    syncStatus('ok'); toast('✓ Gasto pagado exitosamente');
  }).catch(err => {
    syncStatus('err'); toast('⚠️ '+err.message);
  });
}

// ── COMPROMISOS (DEUDAS) ──
function setDebtType(t) {
  debtType = t;
  document.getElementById('dseg-pay').classList.remove('active');
  document.getElementById('dseg-rec').classList.remove('active');
  document.getElementById(t === 'to_pay' ? 'dseg-pay' : 'dseg-rec').classList.add('active');
}

function openDebtModal(id) {
  editingDebtId = id;
  if(id) {
    var d = state.debts.find(x => x.id === id);
    if(d) {
      document.getElementById('d-name').value = d.name;
      document.getElementById('d-amount').value = String(Math.round(d.initialAmount));
      document.getElementById('d-amount-fmt').textContent = '$ ' + Math.round(d.initialAmount).toLocaleString('es-CO');
      document.getElementById('d-entidad').value = d.entityId || '';
      setDebtType(d.type || 'to_pay');
      document.getElementById('debt-modal-title').textContent = 'Editar Deuda';
      document.getElementById('debt-modal-btn').textContent = 'Guardar cambios';
    }
  } else {
    document.getElementById('d-name').value = '';
    document.getElementById('d-amount').value = '';
    document.getElementById('d-amount-fmt').textContent = '';
    document.getElementById('d-entidad').value = '';
    setDebtType('to_pay');
    document.getElementById('debt-modal-title').textContent = 'Nueva Deuda';
    document.getElementById('debt-modal-btn').textContent = 'Guardar deuda';
  }
  document.getElementById('debt-modal').classList.add('open');
}

function closeDebtModal() {
  document.getElementById('debt-modal').classList.remove('open');
  editingDebtId = null;
}

function saveDebt() {
  var name = document.getElementById('d-name').value.trim();
  var amount = getRawAmount('d-amount');
  var entidad = document.getElementById('d-entidad').value;
  if(!name || !amount || amount <= 0) { alert('Completa nombre y monto inicial'); return; }
  
  var dRef;
  if(editingDebtId) {
    dRef = db.collection("workspaces").doc(WORKSPACE_ID).collection("debts").doc(String(editingDebtId));
    dRef.update({ 
      name: name, initialAmount: amount, type: debtType, entityId: entidad || null, 
      updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    }).then(() => {
      closeDebtModal(); toast('✓ Deuda actualizada');
    });
  } else {
    dRef = db.collection("workspaces").doc(WORKSPACE_ID).collection("debts").doc(String(Date.now()));
    dRef.set({ 
      name: name, initialAmount: amount, type: debtType, entityId: entidad || null, 
      status: "active", createdAt: firebase.firestore.FieldValue.serverTimestamp() 
    }).then(() => {
      closeDebtModal(); toast('✓ Deuda creada');
    });
  }
}

function deleteDebt(id) {
  if(!confirm('¿Archivar esta deuda? Ya no aparecerá en la lista activa.')) return;
  db.collection("workspaces").doc(WORKSPACE_ID).collection("debts").doc(String(id)).update({ status: 'archived', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

function openDebtPayModal(id) {
  payingDebtId = id;
  var d = state.debts.find(x => x.id === id);
  if(!d) return;
  
  var totalPaid = state.transactions.filter(t => t.origin === 'debtPayment' && String(t.commitmentId) === String(id)).reduce((a,t) => a + t.amount, 0);
  var pending = d.initialAmount - totalPaid;
  
  document.getElementById('debt-pay-title').textContent = d.type === 'to_pay' ? 'Abonar a deuda' : 'Recibir pago';
  document.getElementById('debt-pay-info').textContent = 'Saldo pendiente: ' + fmt(pending);
  document.getElementById('dp-wallet-label').textContent = d.type === 'to_pay' ? 'Pagar desde' : 'Recibir en';
  document.getElementById('dp-amount').value = '';
  document.getElementById('dp-amount-fmt').textContent = '';
  document.getElementById('debt-pay-modal').classList.add('open');
}

function closeDebtPayModal() {
  document.getElementById('debt-pay-modal').classList.remove('open');
  payingDebtId = null;
}

function processDebtPayment() {
  if(!payingDebtId) return;
  var d = state.debts.find(x => x.id === payingDebtId);
  if(!d) return;
  
  var amount = getRawAmount('dp-amount');
  var wallet = document.getElementById('dp-wallet').value;
  if(!amount || amount <= 0) { alert('Monto inválido'); return; }
  
  var txnType = d.type === 'to_pay' ? 'egreso' : 'ingreso';
  var txnId = String(Date.now());
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  var tRef = wsRef.collection("transactions").doc(txnId);
  batch.set(tRef, {
      type: txnType, amount: amount, description: 'Abono: ' + d.name, date: todayStr(),
      walletId: wallet, destinationWalletId: null,
      categoryId: 'otro', entityId: d.entityId || null,
      status: "completed", origin: "debtPayment", commitmentId: String(d.id),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: DEV_USER_ID
  });
  
  var wRef = wsRef.collection("wallets").doc(wallet);
  if(txnType === 'egreso') {
    batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(-amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } else {
    batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
  
  syncStatus('saving');
  batch.commit().then(() => {
    syncStatus('ok'); toast('✓ Abono registrado');
    closeDebtPayModal();
  }).catch(err => {
    syncStatus('err'); toast('⚠️ '+err.message);
  });
}

function renderDebts() {
  var el = document.getElementById('debts-list');
  if(!state.debts) return;
  
  var activeDebts = state.debts.filter(d => d.status !== 'archived');
  
  if(!activeDebts.length) { 
    el.innerHTML = '<div class="empty" style="padding:20px 0">No tienes deudas activas</div>'; 
    return; 
  }
  
  el.innerHTML = activeDebts.map(d => {
    var endStr = getPeriodEndStr();
    var totalPaid = state.transactions.filter(t => t.origin === 'debtPayment' && String(t.commitmentId) === String(d.id) && t.date <= endStr).reduce((a,t) => a + t.amount, 0);
    var pending = d.initialAmount - totalPaid;
    var isPaidOff = pending <= 0;
    
    var entObj = d.entityId ? state.entities.find(e => e.id === d.entityId) : null;
    var entStr = entObj ? entObj.name : '';
    
    var typeBadge = d.type === 'to_pay' ? '<span class="badge-status badge-overdue">Yo debo</span>' : '<span class="badge-status badge-upcoming">Me deben</span>';
    var statusBadge = isPaidOff ? '<span class="badge-status badge-paid">Saldada</span>' : '';
    
    var pct = Math.min(Math.round(totalPaid / d.initialAmount * 100), 100);
    
    var payBtn = !isPaidOff ? '<button class="btn-outline" style="font-size:11px;padding:5px 10px;border-radius:6px;margin-right:6px" onclick="openDebtPayModal('+d.id+')">Abonar</button>' : '';
    
    return '<div class="goal-card" style="margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:start">'+
        '<div>'+
          '<div style="margin-bottom:4px">'+typeBadge + (statusBadge ? ' ' + statusBadge : '') +'</div>'+
          '<div class="goal-name">'+d.name+'</div>'+
          '<div class="goal-sub">'+entStr+'</div>'+
        '</div>'+
        '<div style="display:flex;align-items:start">'+
          payBtn +
          '<button class="icon-btn edit" onclick="openDebtModal('+d.id+')" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
          '<button class="icon-btn del" onclick="deleteDebt('+d.id+')" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>'+
        '</div>'+
      '</div>'+
      '<div class="goal-bar-bg" style="margin-top:12px"><div class="goal-bar-fill" style="width:'+pct+'%;background:'+(isPaidOff?'var(--green)':'var(--text2)')+'"></div></div>'+
      '<div class="goal-footer"><span>Abonado: <strong>'+fmt(totalPaid)+'</strong></span><strong>'+pct+'%</strong><span>Pendiente: <strong>'+fmt(Math.max(pending,0))+'</strong></span></div>'+
    '</div>';
  }).join('');
}


// ── INSTRUMENTOS FINANCIEROS ──
function openInstModal(id) {
  editingInstId = id;
  if(id) {
    var i = state.instruments.find(x => x.id == id);
    if(i) {
      document.getElementById('i-name').value = i.name;
      document.getElementById('i-entidad').value = i.entityId || '';
      document.getElementById('i-limit').value = String(Math.round(i.creditLimit));
      document.getElementById('i-limit-fmt').textContent = '$ ' + Math.round(i.creditLimit).toLocaleString('es-CO');
      document.getElementById('inst-modal-title').textContent = 'Editar Tarjeta';
      document.getElementById('inst-modal-btn').textContent = 'Guardar cambios';
    }
  } else {
    document.getElementById('i-name').value = '';
    document.getElementById('i-entidad').value = '';
    document.getElementById('i-limit').value = '';
    document.getElementById('i-limit-fmt').textContent = '';
    document.getElementById('inst-modal-title').textContent = 'Nueva Tarjeta';
    document.getElementById('inst-modal-btn').textContent = 'Guardar tarjeta';
  }
  document.getElementById('inst-modal').classList.add('open');
}

function closeInstModal() {
  document.getElementById('inst-modal').classList.remove('open');
  editingInstId = null;
}

function saveInstrument() {
  var name = document.getElementById('i-name').value.trim();
  var limit = getRawAmount('i-limit');
  var entidad = document.getElementById('i-entidad').value;
  if(!name || !limit || limit <= 0) { alert('Completa nombre y cupo total'); return; }
  
  var iRef;
  if(editingInstId) {
    iRef = db.collection("workspaces").doc(WORKSPACE_ID).collection("instruments").doc(String(editingInstId));
    iRef.update({ 
      name: name, creditLimit: limit, entityId: entidad || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    }).then(() => { closeInstModal(); toast('✓ Tarjeta actualizada'); });
  } else {
    iRef = db.collection("workspaces").doc(WORKSPACE_ID).collection("instruments").doc(String(Date.now()));
    iRef.set({ 
      name: name, type: 'credit_card', creditLimit: limit, entityId: entidad || null, 
      status: "active", createdAt: firebase.firestore.FieldValue.serverTimestamp() 
    }).then(() => { closeInstModal(); toast('✓ Tarjeta agregada'); });
  }
}

function deleteInst(id) {
  if(!confirm('¿Eliminar esta tarjeta? Solo hazlo si la deuda está en $0.')) return;
  db.collection("workspaces").doc(WORKSPACE_ID).collection("instruments").doc(String(id)).delete().then(() => toast('✓ Eliminada'));
}

function openInstPayModal(id) {
  payingInstId = id;
  var i = state.instruments.find(x => x.id == id);
  if(!i) return;
  
  var spent = state.transactions.filter(t => t.type === 'egreso' && String(t.instrumentId) === String(id)).reduce((a,t)=>a+t.amount,0);
  var paid = state.transactions.filter(t => t.type === 'cc_payment' && String(t.instrumentId) === String(id)).reduce((a,t)=>a+t.amount,0);
  var deuda = spent - paid;
  
  document.getElementById('inst-pay-info').textContent = 'Deuda actual: ' + fmt(Math.max(0, deuda));
  document.getElementById('ip-amount').value = '';
  document.getElementById('ip-amount-fmt').textContent = '';
  var wHtml = '';
  Object.keys(state.accounts).forEach(k => { wHtml += '<option value="'+k+'">'+(ACC_LABELS[k]||k)+'</option>'; });
  document.getElementById('ip-wallet').innerHTML = wHtml;
  document.getElementById('inst-pay-modal').classList.add('open');
}

function closeInstPayModal() {
  document.getElementById('inst-pay-modal').classList.remove('open');
  payingInstId = null;
}

function processInstPayment() {
  if(!payingInstId) return;
  var amount = getRawAmount('ip-amount');
  var wallet = document.getElementById('ip-wallet').value;
  if(!amount || amount <= 0 || !wallet) { alert('Monto o cuenta inválidos'); return; }
  
  var txnId = String(Date.now());
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  var tRef = wsRef.collection("transactions").doc(txnId);
  batch.set(tRef, {
      type: 'cc_payment', amount: amount, description: 'Pago Tarjeta de Crédito', date: todayStr(),
      walletId: wallet, instrumentId: payingInstId, destinationWalletId: null,
      categoryId: null, entityId: null,
      status: "completed", origin: "ccPayment",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: DEV_USER_ID
  });
  
  var wRef = wsRef.collection("wallets").doc(wallet);
  batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(-amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  
  syncStatus('saving');
  batch.commit().then(() => {
    syncStatus('ok'); toast('✓ Pago registrado');
    closeInstPayModal();
  }).catch(err => {
    syncStatus('err'); toast('⚠️ '+err.message);
  });
}

// ── RENDER COMPATIBILITY ──

function txnHTML(t,showEdit) {
  var isIng=t.type==='ingreso',isTr=t.type==='transferencia',isCc=t.type==='cc_payment';
  var cls=isIng?'ing':(isTr||isCc)?'tr':'eg';
  var icon=isIng?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14"/><path d="M5 12l7 7 7-7"/></svg>':(isTr||isCc)?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 16l-4-4 4-4"/><path d="M17 8l4 4-4 4"/><line x1="3" y1="12" x2="21" y2="12"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
  
  var wObj = state.wallets ? state.wallets.find(x => x.id === t.cuenta) : null;
  var accStr = t.cuenta ? (wObj ? wObj.name : t.cuenta) : 'N/A';
  if(t.instrumentId && t.type !== 'cc_payment') {
     var instObj = state.instruments ? state.instruments.find(x => x.id == t.instrumentId) : null;
     accStr = instObj ? instObj.name : 'Tarjeta';
  }
  var accB='<span class="badge badge-milo">'+accStr+'</span>';
  
  var dstB='';
  if(isTr&&t.destino) { var dObj = state.wallets ? state.wallets.find(x => x.id === t.destino) : null; dstB=' → <span class="badge badge-'+t.destino+'">'+(dObj?dObj.name:t.destino)+'</span>'; }
  if(isCc&&t.instrumentId) {
     var destObj = state.instruments ? state.instruments.find(x => x.id == t.instrumentId) : null;
     dstB=' → <span class="badge badge-milo">'+(destObj ? destObj.name : 'Tarjeta')+'</span>';
  }
  
  var entObj = t.entityId ? state.entities.find(e => e.id === t.entityId) : null;
  var entName = entObj ? entObj.name : '';
  var catL = !isTr && !isCc && t.cat ? ' · '+(CAT_LABELS[t.cat]||t.cat) : '';
  if (entName && !isTr && !isCc) catL = ' · ' + entName + catL;

  var editBtn=(showEdit && t.type !== 'cc_payment')?'<button class="icon-btn edit" onclick="openEditModal('+t.id+')" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>':'';
  return '<div class="txn"><div class="txn-icon '+cls+'">'+icon+'</div><div class="txn-info"><div class="txn-desc">'+t.desc+'</div><div class="txn-sub">'+t.date+' '+accB+dstB+catL+'</div></div><div class="txn-amount '+cls+'">'+(isIng?'+':(isTr||isCc)?'↔':'-')+fmt(t.amount)+'</div><div class="txn-actions">'+editBtn+'</div></div>';
}

function renderAll() {
  var total=Object.values(state.accounts).reduce(function(a,b){return a+(b||0);},0);
  var month=getActivePeriodTransactions();
  updatePeriodUI();
  var ing=month.filter(function(t){return t.type==='ingreso';}).reduce(function(a,t){return a+t.amount;},0);
  var eg=month.filter(function(t){return t.type==='egreso';}).reduce(function(a,t){return a+t.amount;},0);
  var bal=ing-eg;
  document.getElementById('header-total').textContent=fmt(total);
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
  var txns=getActivePeriodTransactions();
  if(ft) txns=txns.filter(function(t){return t.type===ft;});
  if(fa) {
    var isInst = fa.startsWith('i_');
    var id = isInst ? fa.substring(2) : (fa.startsWith('w_') ? fa.substring(2) : fa);
    if(isInst) txns = txns.filter(t => String(t.instrumentId) === id);
    else txns = txns.filter(t => String(t.cuenta) === id || String(t.destino) === id);
  }
  document.getElementById('mov-list').innerHTML=txns.length?txns.map(function(t){return txnHTML(t,true);}).join(''):'<div class="empty" style="padding:20px 0">Sin movimientos</div>';
}

function renderGoals() {
  var el=document.getElementById('goals-list');
  if(!state.goals||!state.goals.length){el.innerHTML='<div class="empty">Aún no hay metas</div>';return;}
  var endStr = getPeriodEndStr();
  el.innerHTML=state.goals.map(function(g){
    var saved = g.saved; // Should this be computed dynamically? Assuming yes for v2, but for now we leave it since goals haven't been migrated yet to dynamic txns in our context. Or actually, the prompt says "metas acumuladas" depend on period active. But there are no transactions with origin="goal" yet. Let's leave g.saved for now.
    var pct=Math.min(Math.round(saved/g.target*100),100),done=pct>=100;
    return '<div class="goal-card"><div style="display:flex;justify-content:space-between;align-items:start"><div><div class="goal-name">'+(done?'✓ ':'')+g.name+'</div><div class="goal-sub">'+(done?'¡Meta alcanzada!':'Faltan '+fmt(g.target-g.saved))+'</div></div><button class="icon-btn del" onclick="deleteGoal('+g.id+')" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button></div><div class="goal-bar-bg"><div class="goal-bar-fill" style="width:'+pct+'%;background:'+(done?'var(--green)':'var(--blue)')+'"></div></div><div class="goal-footer"><span>Ahorrado: <strong>'+fmt(g.saved)+'</strong></span><strong>'+pct+'%</strong><span>Meta: <strong>'+fmt(g.target)+'</strong></span></div>'+(done?'':'<div style="margin-top:10px"><button class="btn-outline" style="width:100%;font-size:13px" onclick="addToGoal('+g.id+')">+ Abonar a esta meta</button></div>')+'</div>';
  }).join('');
}

function renderFijos() {
  var fijos=state.fixedExpenses||[];
  var month=getActivePeriodTransactions();
  var ing=month.filter(function(t){return t.type==='ingreso';}).reduce(function(a,t){return a+t.amount;},0);
  
  var totalFijos=0;
  var totalPagado=0;
  var now = new Date();
  var todayDay = now.getDate();

  var enriched = fijos.map(f => {
    var paidTxn = month.find(t => t.origin === 'fixedExpense' && String(t.commitmentId) === String(f.id));
    var isPaid = !!paidTxn;
    var day = parseInt(f.dueDay) || 28;
    var stateStr = 'pending';
    
    if (f.status === 'archived') stateStr = 'archived';
    else if (isPaid) stateStr = 'paid';
    else {
       if (!isCurrentPeriod()) {
          var now = new Date();
          var act = new Date(state.activePeriod.year, state.activePeriod.month, day);
          if (act < now) stateStr = 'overdue';
          else stateStr = 'pending';
       } else {
          var todayDay = new Date().getDate();
          if (todayDay > day) stateStr = 'overdue';
          else if (day - todayDay <= 5) stateStr = 'upcoming';
       }
    }

    if(f.status !== 'archived') totalFijos += f.amount;
    if(isPaid) totalPagado += f.amount;

    return { id: f.id, name: f.name, amount: f.amount, cat: f.cat, entityId: f.entityId, isPaid: isPaid, stateStr: stateStr, day: day, status: f.status };
  });

  var totalPendiente = totalFijos - totalPagado;
  var coverage = totalFijos>0 ? Math.min(Math.round(ing/totalFijos*100),200) : 100;
  var coverageColor = ing>=totalFijos?'var(--green)':ing>=totalFijos*0.7?'var(--gold)':'var(--red)';

  var sumEl=document.getElementById('fijos-summary');
  sumEl.innerHTML='<div class="summary-row"><span>Total gastos fijos</span><span>'+fmt(totalFijos)+'</span></div>'+
    '<div class="summary-row"><span>✓ Pagado</span><span style="color:var(--green)">'+fmt(totalPagado)+'</span></div>'+
    '<div class="summary-row"><span>⏳ Pendiente</span><span style="color:var(--orange)">'+fmt(totalPendiente)+'</span></div>'+
    '<div class="coverage-bar-bg"><div class="coverage-fill" style="width:'+Math.min(coverage,100)+'%;background:'+coverageColor+'"></div></div>'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">Ingresos del mes cubren el '+coverage+'% de los gastos fijos</div>'+
    '<div class="summary-row"><span>Ingresos del mes</span><span style="color:'+(ing>=totalFijos?'var(--green)':'var(--red)')+'">'+fmt(ing)+'</span></div>'+
    (ing<totalFijos?'<div style="font-size:12px;color:var(--red);margin-top:4px">⚠️ Faltan '+fmt(totalFijos-ing)+' para cubrir todos los gastos fijos</div>':'<div style="font-size:12px;color:var(--green);margin-top:4px">✓ Los ingresos cubren todos los gastos fijos</div>');

  var listEl=document.getElementById('fijos-list');
  var activeEnriched = enriched.filter(f => f.status !== 'archived' || f.isPaid); 
  if(!activeEnriched.length){listEl.innerHTML='<div class="empty" style="padding:20px 0">Agrega tus gastos fijos mensuales</div>';return;}
  
  listEl.innerHTML=activeEnriched.map(function(f){
    var entObj = f.entityId ? state.entities.find(e => e.id === f.entityId) : null;
    var entStr = entObj ? entObj.name + ' · ' : '';
    
    var stateLabel = f.stateStr === 'paid' ? 'Pagado' : f.stateStr === 'overdue' ? 'Vencido' : f.stateStr === 'upcoming' ? 'Próximo' : f.stateStr === 'pending' ? 'Pendiente' : 'Archivado';
    var badgeHtml = '<div class="badge-status badge-'+f.stateStr+'">'+stateLabel+'</div>';
    
    var payBtn = (!f.isPaid && f.status !== 'archived') ? '<button class="btn-outline" style="font-size:11px;padding:5px 10px;border-radius:6px;margin-right:6px" onclick="payFixedExpense('+f.id+')">Pagar</button>' : '';

    return '<div class="fixed-item">'+
      '<div class="fixed-info" style="padding-left:4px">'+
        badgeHtml +
        '<div class="fixed-name'+(f.isPaid?' paid':'')+'" style="margin-top:3px">'+f.name+' <span style="font-size:11px;font-weight:400;color:var(--text3)">(Día '+f.day+')</span></div>'+
        '<div class="fixed-amount">'+entStr+(CAT_LABELS[f.cat]||f.cat)+' · '+fmt(f.amount)+'</div>'+
      '</div>'+
      '<div class="fixed-actions">'+
        payBtn +
        '<button class="icon-btn edit" onclick="openFixedModal('+f.id+')" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
        '<button class="icon-btn del" onclick="deleteFixedItem('+f.id+')" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>'+
      '</div>'+
    '</div>';
  }).join('');
}

window.addEventListener('load', function(){ init(); });