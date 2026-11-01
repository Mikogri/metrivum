/**
 * System notifications for finished analyses, shown only while Metrivum is in a background tab (in the
 * foreground the in-app toast says the same). The permission is asked once, when videos are sent, never on load.
 */
export function askForNotifications() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
  } catch { /* unsupported (some in-app browsers) */ }
}

export function notifyInBackground(title: string, body: string, onClick?: () => void) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
    const notification = new Notification(title, { body, icon: '/brand/metrivum-mark.png', tag: `trainflow-analysis:${title}` });
    notification.onclick = () => { window.focus(); onClick?.(); notification.close(); };
  } catch { /* the browser may refuse; the toast still shows */ }
}
