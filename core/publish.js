/**
 * GitHub Publisher
 * Call this from any app to publish it directly to GitHub
 * No middleware needed - uses GitHub API directly
 */

const GITHUB_REPO = 'jd-smeltser/portable-stateless-apps';
const STORAGE_KEY = 'github_publish_token';

async function publishApp(appData) {
  // Get or request token
  let token = localStorage.getItem(STORAGE_KEY);

  if (!token) {
    token = prompt(
      'Enter your GitHub Personal Access Token (with repo scope).\n\n' +
      'Create one at: github.com/settings/tokens\n\n' +
      'This is stored locally and never sent anywhere except GitHub.'
    );
    if (!token) return { success: false, error: 'No token provided' };
    localStorage.setItem(STORAGE_KEY, token);
  }

  // Validate app data
  if (!appData.name) return { success: false, error: 'App name required' };
  if (!appData.js) return { success: false, error: 'App JS required' };

  // Prepare payload
  const payload = {
    name: appData.name,
    html: btoa(unescape(encodeURIComponent(appData.html || ''))),
    css: btoa(unescape(encodeURIComponent(appData.css || ''))),
    js: btoa(unescape(encodeURIComponent(appData.js))),
    icon: appData.icon || '📱',
    description: appData.description || 'Custom app'
  };

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_type: 'publish-app',
          client_payload: payload
        })
      }
    );

    if (response.status === 204) {
      const appSlug = appData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const appUrl = `https://${GITHUB_REPO.split('/')[0]}.github.io/${GITHUB_REPO.split('/')[1]}/apps/${appSlug}/`;

      return {
        success: true,
        message: 'App publishing started! It will be live in ~1 minute.',
        url: appUrl
      };
    } else if (response.status === 401) {
      localStorage.removeItem(STORAGE_KEY);
      return { success: false, error: 'Invalid token. Please try again.' };
    } else {
      const error = await response.text();
      return { success: false, error: `GitHub API error: ${response.status}` };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Clear stored token
function clearPublishToken() {
  localStorage.removeItem(STORAGE_KEY);
}

export { publishApp, clearPublishToken };
