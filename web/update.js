(function (root) {
  'use strict';
  const config = root.WORDMEMO_CONFIG;
  const version = config.versionName;
  const code = config.versionCode;

  function validate(data) {
    const base = config.updates.releaseBase;
    if (!base) throw new Error('此构建尚未配置更新下载地址');
    const url = new URL(data?.downloadUrl);
    const release = new URL(base);
    if (
      !Number.isSafeInteger(data.versionCode) ||
      data.versionCode < 1 ||
      !/^\d+(\.\d+){1,2}$/.test(data.versionName || '') ||
      url.protocol !== 'https:' ||
      url.origin !== release.origin ||
      !url.pathname.startsWith(release.pathname) ||
      !url.pathname.endsWith('.apk') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^[a-f0-9]{64}$/.test(data.sha256 || '')
    )
      throw new Error('版本信息格式不正确');
    return data;
  }

  async function check() {
    if (!config.updates.enabled) throw new Error('此构建未启用在线更新，请由维护者配置更新地址');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const url = new URL(config.updates.manifestUrl);
      url.searchParams.set('t', Date.now());
      const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        signal: abort.signal,
      });
      if (!response.ok) throw new Error('版本服务暂不可用（' + response.status + '）');
      const data = validate(await response.json());
      return { ...data, hasUpdate: data.versionCode > code };
    } finally {
      clearTimeout(timer);
    }
  }

  function download(info) {
    validate(info);
    if (root.AndroidStore?.downloadUpdate)
      root.AndroidStore.downloadUpdate(info.downloadUrl, info.sha256, info.versionCode);
    else if (root.AndroidStore?.openUpdateUrl) root.AndroidStore.openUpdateUrl(info.downloadUrl);
    else root.open(info.downloadUrl, '_blank', 'noopener,noreferrer');
  }
  root.WordMemoUpdate = { version, code, check, download, validate };
  if (typeof module !== 'undefined') module.exports = root.WordMemoUpdate;
})(typeof window === 'undefined' ? globalThis : window);
