import { API_BASE_URL } from './api';

// Lives at src/ (not src/admin/) since both the admin app and the
// consultant-facing ChatCvScreen need it, and only the former is under
// src/admin/.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

// kind: 'admin' | 'consultant' - selects which of the two /api/push/subscribe/*
// endpoints (and which req.admin/req.consultant identity) this subscription
// is filed under.
export async function subscribeToPush(kind, authHeader) {
  if (!pushSupported()) {
    throw new Error("Les notifications push ne sont pas prises en charge par ce navigateur.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permission de notification refusée.');
  }
  const registration = await navigator.serviceWorker.register('/sw.js');
  const keyRes = await fetch(`${API_BASE_URL}/api/push/vapid-public-key`);
  const { publicKey } = await keyRes.json();
  if (!publicKey) {
    throw new Error('Notifications push non configurées côté serveur.');
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const res = await fetch(`${API_BASE_URL}/api/push/subscribe/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error("Échec de l'enregistrement de l'abonnement.");
}

export async function getPushSubscriptionStatus() {
  if (!pushSupported()) return 'unsupported';
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return 'not-subscribed';
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'subscribed' : 'not-subscribed';
}
