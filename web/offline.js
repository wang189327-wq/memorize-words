/** Browser-only offline lifecycle. It is deliberately separate from Android APK updates. */
import { runtime } from './ui/runtime.js';
import { toast } from './ui/dom.js';
let registration,
  acceptedUpdate = false;
export let offlineStatus = '离线缓存尚未准备';
export async function startOffline() {
  if (window.AndroidStore || !('serviceWorker' in navigator)) return;
  try {
    registration = await navigator.serviceWorker.register(new URL('sw.js', import.meta.url), {
      scope: new URL('./', import.meta.url).href,
      updateViaCache: 'none',
    });
    await navigator.serviceWorker.ready;
    offlineStatus = '已可离线使用';
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (acceptedUpdate) location.reload();
    });
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'UPDATE_BLOCKED') {
        acceptedUpdate = false;
        toast('请先关闭其他词记标签页，再应用网页更新。');
      }
    });
  } catch {
    offlineStatus = '需联网完成离线缓存';
  }
}
export async function checkOfflineUpdate() {
  if (!registration) throw Error(offlineStatus + '，请联网重新打开网页。');
  await registration.update();
  if (registration.installing)
    await new Promise((resolve, reject) => {
      const worker = registration.installing;
      const timeout = setTimeout(() => reject(Error('离线更新仍在准备，请稍后再检查。')), 30000);
      const check = () => {
        if (worker.state === 'redundant') {
          clearTimeout(timeout);
          reject(Error('离线更新未完成，继续使用原版本。'));
          return;
        }
        if (['installed', 'redundant'].includes(worker.state)) {
          clearTimeout(timeout);
          resolve();
        }
      };
      worker.addEventListener('statechange', check);
      check();
    });
  if (!registration.waiting) return false;
  if (
    runtime.saving ||
    (runtime.session && runtime.session.index < runtime.session.questions.length)
  )
    throw Error('请先完成或结束本轮学习，再应用网页更新。');
  if (!confirm('离线网页已准备好。确认刷新应用更新？学习记录会保留，请先关闭其他词记标签页。'))
    return false;
  acceptedUpdate = true;
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  return true;
}
