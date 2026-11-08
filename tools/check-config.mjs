/** CI guard for accidentally publishing a fork with the upstream update channel. */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const upstreamRepository = 'wang189327-wq/memorize-words';

function usesUpstreamChannel(value) {
  try {
    const url = new URL(value);
    return (
      (url.hostname === 'wang189327-wq.github.io' && url.pathname.startsWith('/memorize-words/')) ||
      (url.hostname === 'github.com' && url.pathname.startsWith('/wang189327-wq/memorize-words/'))
    );
  } catch {
    return false;
  }
}

/** Return actionable errors. An absent repository means local configuration validation only. */
export function checkConfig(config, repository = '') {
  const errors = [];
  if (!Number.isSafeInteger(config.versionCode) || config.versionCode < 1)
    errors.push('versionCode must be a positive integer.');
  if (!/^\d+(\.\d+){1,2}$/.test(config.versionName || ''))
    errors.push('versionName must use numeric major.minor[.patch].');
  if (!/^[a-zA-Z]\w*(\.[a-zA-Z]\w*){1,}$/.test(config.applicationId || ''))
    errors.push('applicationId must be an Android package name.');
  if (config.updates?.enabled) {
    for (const key of ['manifestUrl', 'releaseBase']) {
      try {
        const url = new URL(config.updates[key]);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
          throw Error();
      } catch {
        errors.push(`updates.${key} must be an absolute HTTPS URL without credentials or query.`);
      }
    }
    if (!config.updates.releaseBase?.endsWith('/'))
      errors.push('updates.releaseBase must end with /.');
    if (
      repository &&
      repository.toLowerCase() !== upstreamRepository &&
      ['manifestUrl', 'releaseBase'].some((key) => usesUpstreamChannel(config.updates[key]))
    )
      errors.push(
        'Fork detected: disable updates or configure your own manifestUrl AND releaseBase. ' +
          'Use your own applicationId and signing key for a separate app.',
      );
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(fs.readFileSync('app.config.json', 'utf8'));
  const errors = checkConfig(config, process.env.GITHUB_REPOSITORY || '');
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Configuration check passed (CI repository identity comes from GitHub).');
}
