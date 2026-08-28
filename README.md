# MoneyFlow

App de finanzas personales en HTML + JavaScript vanilla + Firebase (Firestore + Auth, SDK v8.10.1).

## Estructura
- index.html - interfaz
- js/app.js - logica y motor financiero
- css/styles.css - estilos (claro/oscuro)
- manifest.json + sw.js - PWA instalable
- vercel.json - despliegue estatico (Vercel)

## Logica financiera
- Patrimonio = cuentas + por cobrar - deudas - tarjetas
- Disponible real = cuentas - dinero reservado (metas)
- Prestamos (Yo debo) y cobros (Me deben) como doble movimiento (marcados isNeutral)
- Auto-categorizacion de comercios y analitica Mes/Ano/Todo

## Desarrollo
Abrir con Live Server (localhost). Google Auth requiere http:// (no file://).
