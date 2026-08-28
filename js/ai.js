// ============================================================
//  AI_MODULE — Asistente financiero (punto de conexión único)
//  Para conectar una IA gratis (Groq, OpenRouter, Gemini tier-free…):
//    1. Llena AI_CONFIG.provider / apiKey / endpoint / model.
//    2. Ajusta el parseo en askAIFinancial() si tu proveedor lo requiere.
//  Mientras no haya API key, responde con análisis local (sin red).
// ============================================================
var AI_CONFIG = {
  provider: null,   // 'groq' | 'openrouter' | 'gemini' | null
  apiKey: null,
  endpoint: null,
  model: null
};

function aiIsConfigured() {
  return !!(AI_CONFIG.provider && AI_CONFIG.apiKey && AI_CONFIG.endpoint);
}

function aiSystemPrompt() {
  return 'Eres un asesor financiero personal. Responde en español, breve, claro y accionable. Usa los datos reales del usuario cuando estén disponibles.';
}

async function askAIFinancial(question) {
  if (!aiIsConfigured()) {
    return localFinancialAdvice();
  }
  try {
    var resp = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_CONFIG.apiKey
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: [
          { role: 'system', content: aiSystemPrompt() },
          { role: 'user', content: question }
        ]
      })
    });
    var data = await resp.json();
    return (data.choices && data.choices[0] && data.choices[0].message)
      ? data.choices[0].message.content
      : 'No pude interpretar la respuesta de la IA.';
  } catch (e) {
    return 'Error conectando con la IA: ' + e.message;
  }
}

// Fallback local (sin IA): análisis simple desde los datos reales.
function localFinancialAdvice() {
  var liquid = (typeof totalLiquid === 'function') ? totalLiquid() : 0;
  var disponible = (typeof disponibleReal === 'function') ? disponibleReal() : 0;
  var deudas = (typeof totalDebt === 'function') ? totalDebt() : 0;
  var ing = 0, eg = 0;
  if (typeof getActivePeriodTransactions === 'function') {
    var month = getActivePeriodTransactions();
    ing = month.filter(function(t){ return t.type === 'ingreso' && !t.isNeutral; }).reduce(function(a,t){ return a + t.amount; }, 0);
    eg = month.filter(function(t){ return t.type === 'egreso' && !t.isNeutral; }).reduce(function(a,t){ return a + t.amount; }, 0);
  }
  var f = (typeof fmt === 'function') ? fmt : function(n){ return '$' + Math.round(n||0); };
  var consejos = [];
  if (ing > 0 && eg > ing) consejos.push('⚠️ Este mes gastas más de lo que ingresas (' + f(eg) + ' vs ' + f(ing) + '). Revisa tus egresos.');
  else if (ing > 0) consejos.push('✅ Tus ingresos cubren tus egresos este mes.');
  if (deudas > 0) consejos.push('Tienes deudas por ' + f(deudas) + '. Prioriza pagarlas antes de nuevos gastos.');
  if (disponible < 0) consejos.push('⚠️ Tu disponible real es negativo (' + f(disponible) + ').');
  if (consejos.length === 0) consejos.push('Registra ingresos y gastos para recibir recomendaciones personalizadas.');
  return consejos.join(' ');
}

function askAssistant() {
  var inp = document.getElementById('ai-input');
  var out = document.getElementById('ai-response');
  var q = inp ? inp.value.trim() : '';
  if (!q) { if (out) out.textContent = 'Escribe una pregunta o toca Preguntar para un resumen automático.'; return; }
  if (out) out.textContent = 'Analizando…';
  askAIFinancial(q).then(function(r){ if (out) out.textContent = r; });
}
