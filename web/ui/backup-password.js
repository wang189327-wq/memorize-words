/** Ephemeral password dialog. Fields are cleared on every exit and never enter application state. */
import { append, btn, el } from './dom.js';

export function requestBackupPassword({ confirmPassword = false } = {}) {
  if (document.getElementById('backup-password-dialog')) throw Error('请先完成当前备份密码输入。');
  return new Promise((resolve) => {
    const dialog = el('dialog'),
      title = el('h2', '', confirmPassword ? '设置备份密码' : '输入备份密码');
    dialog.id = 'backup-password-dialog';
    title.id = 'backup-password-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const note = el(
      'p',
      'muted',
      confirmPassword
        ? '密码至少8个字符。密码不会保存；忘记密码后无法恢复此备份。'
        : '请输入导出此备份时设置的密码。',
    );
    const fields = [];
    for (const label of confirmPassword ? ['备份密码', '再次输入备份密码'] : ['备份密码']) {
      const input = el('input', 'answer-input');
      input.type = 'password';
      input.setAttribute('aria-label', label);
      input.autocomplete = confirmPassword ? 'new-password' : 'current-password';
      fields.push(input);
    }
    const error = el('p', 'backup-password-error');
    error.setAttribute('role', 'alert');
    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      fields.forEach((input) => {
        input.value = '';
      });
      dialog.close();
      dialog.remove();
      resolve(value);
    }
    const accept = btn(
      confirmPassword ? '加密并导出' : '解密备份',
      () => {
        const password = fields[0].value;
        if (!password || (confirmPassword && Array.from(password).length < 8)) {
          error.textContent = confirmPassword ? '备份密码至少8个字符。' : '请输入备份密码。';
          return;
        }
        if (confirmPassword && password !== fields[1].value) {
          error.textContent = '两次输入的密码不一致。';
          return;
        }
        finish(password);
      },
      'primary',
    );
    fields.forEach((input) => {
      input.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          accept.click();
        }
      };
    });
    append(
      dialog,
      title,
      note,
      ...fields,
      error,
      append(
        el('div', 'actions'),
        accept,
        btn('取消', () => finish(null)),
      ),
    );
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.addEventListener('close', () => finish(null));
    document.body.append(dialog);
    dialog.showModal();
    fields[0].focus();
  });
}
