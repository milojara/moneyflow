// Service worker de Firebase Cloud Messaging (notificaciones push en segundo plano)
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
  apiKey: "AIzaSyBnBBkFup_-MGCNMGkPx1h1TxwfpObjrtU",
  authDomain: "moneyfam-7d950.firebaseapp.com",
  projectId: "moneyfam-7d950",
  storageBucket: "moneyfam-7d950.firebasestorage.app",
  messagingSenderId: "738074612940",
  appId: "1:738074612940:web:6bcfaa3419ce5cdb7ede69"
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var n = payload.notification || {};
  var title = n.title || 'MoneyFlow';
  var options = {
    body: n.body || '',
    icon: 'icon-192.png'
  };
  self.registration.showNotification(title, options);
});
