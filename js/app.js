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
var state = {transactions:[],goals:[],accounts:{milo:0,sari:0,cash:0},fixedExpenses:[],entities:[]};
var txnType = 'ingreso';
var editType = 'ingreso';
var editingId = null;
var editingFixedId = null;
var isSaving = false;

var pendingSelectId = null;
var editingEntityId = null;

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
    state.accounts = {milo:0, sari:0, cash:0};
    snap.forEach(doc => { state.accounts[doc.id] = doc.data().balance; });
    renderAll();
  });
  
  wsRef.collection("transactions").orderBy("date", "desc").onSnapshot(snap => {
    let txns = [];
    snap.forEach(doc => {
      const d = doc.data();
      txns.push({
        id: parseInt(doc.id), type: d.type, desc: d.description, amount: d.amount,
        cuenta: d.walletId, destino: d.destinationWalletId, cat: d.categoryId, date: d.date,
        entityId: d.entityId || null,
        origin: d.origin || null, commitmentId: d.commitmentId || null
      });
    });
    txns.sort((a,b) => b.id - a.id);
    state.transactions = txns;
    renderAll();
    if(document.querySelector('.section.active') && document.querySelector('.section.active').id==='tab-movimientos') renderMovimientos();
    if(document.querySelector('.section.active') && document.querySelector('.section.active').id==='tab-fijos') renderFijos();
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
  ['f-entidad', 'e-entidad', 'fx-entidad'].forEach(id => {
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
  ['resumen','nuevo','movimientos','metas','fijos'].forEach(function(t,i){
    if(t===id) document.querySelectorAll('.btab')[i].classList.add('active');
  });
  if(id==='movimientos') renderMovimientos();
  if(id==='metas') renderGoals();
  if(id==='fijos') renderFijos();
}

function setType(t) {
  txnType=t;
  ['ing','eg','tr'].forEach(function(x){document.getElementById('seg-'+x).classList.remove('active');});
  document.getElementById('seg-'+{ingreso:'ing',egreso:'eg',transferencia:'tr'}[t]).classList.add('active');
  document.getElementById('row-cat').style.display=t==='transferencia'?'none':'block';
  document.getElementById('row-destino').style.display=t==='transferencia'?'block':'none';
  document.getElementById('label-cuenta').textContent=t==='transferencia'?'Cuenta origen':'Cuenta';
}

// ── ATOMIC BATCH SAVES ──
function saveTransaction() {
  var desc=document.getElementById('f-desc').value.trim();
  var amount=getRawAmount('f-amount');
  var cuenta=document.getElementById('f-cuenta').value;
  var cat=document.getElementById('f-cat').value;
  var date=document.getElementById('f-date').value;
  var destino=document.getElementById('f-destino').value;
  var entidad=document.getElementById('f-entidad').value;
  if(!desc||!amount||amount<=0){alert('Completa descripción y monto');return;}
  
  var txnId = String(Date.now());
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  var tRef = wsRef.collection("transactions").doc(txnId);
  batch.set(tRef, {
      type: txnType, amount: amount, description: desc, date: date,
      walletId: cuenta, destinationWalletId: txnType === 'transferencia' ? destino : null,
      categoryId: txnType === 'transferencia' ? null : cat, 
      entityId: entidad || null,
      status: "completed", origin: "manual",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: DEV_USER_ID
  });
  
  var wRef = wsRef.collection("wallets").doc(cuenta);
  if (txnType === 'ingreso') {
    batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } else if (txnType === 'egreso') {
    batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(-amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } else if (txnType === 'transferencia') {
    batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(-amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    var destRef = wsRef.collection("wallets").doc(destino);
    batch.update(destRef, { balance: firebase.firestore.FieldValue.increment(amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }

  isSaving = true; syncStatus('saving');
  batch.commit().then(() => {
    isSaving = false; syncStatus('ok'); toast('✓ Guardado y sincronizado');
    document.getElementById('f-desc').value=''; document.getElementById('f-amount').value='';
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
  var wallet=document.getElementById('fx-wallet').value || 'milo';
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
  if(!confirm('¿Pagar ' + fx.name + ' desde ' + (ACC_LABELS[fx.walletId] || fx.walletId) + '?')) return;
  
  var txnId = String(Date.now());
  var batch = db.batch();
  var wsRef = db.collection("workspaces").doc(WORKSPACE_ID);
  
  // Create Transaction
  var tRef = wsRef.collection("transactions").doc(txnId);
  batch.set(tRef, {
      type: 'egreso', amount: fx.amount, description: fx.name, date: todayStr(),
      walletId: fx.walletId || 'milo', destinationWalletId: null,
      categoryId: fx.cat, entityId: fx.entityId || null,
      status: "completed", origin: "fixedExpense", commitmentId: String(id),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: DEV_USER_ID
  });
  
  // Update Wallet
  var wRef = wsRef.collection("wallets").doc(fx.walletId || 'milo');
  batch.update(wRef, { balance: firebase.firestore.FieldValue.increment(-fx.amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  
  syncStatus('saving');
  batch.commit().then(() => {
    syncStatus('ok'); toast('✓ Gasto pagado exitosamente');
  }).catch(err => {
    syncStatus('err'); toast('⚠️ '+err.message);
  });
}

// ── RENDER COMPATIBILITY ──
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
  
  var entObj = t.entityId ? state.entities.find(e => e.id === t.entityId) : null;
  var entName = entObj ? entObj.name : '';
  var catL = !isTr && t.cat ? ' · '+(CAT_LABELS[t.cat]||t.cat) : '';
  if (entName && !isTr) catL = ' · ' + entName + catL;

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
    else if (todayDay > day) stateStr = 'overdue';
    else if (day - todayDay <= 5) stateStr = 'upcoming';

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
  var activeEnriched = enriched.filter(f => f.status !== 'archived' || f.isPaid); // Mostrar archivados solo si se pagaron este mes antes de archivar
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