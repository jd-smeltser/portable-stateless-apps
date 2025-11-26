/**
 * Cloudflare Worker - App Publishing Webhook
 *
 * Receives app code from AI-generated apps and triggers GitHub Action
 * to commit the app to the repository.
 *
 * Environment variables needed:
 * - GITHUB_TOKEN: Personal access token with repo scope
 * - GITHUB_REPO: Repository in format "owner/repo"
 * - ALLOWED_ORIGIN: Optional CORS origin (default: *)
 */

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(env.ALLOWED_ORIGIN)
      });
    }

    // Only accept POST
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, env.ALLOWED_ORIGIN);
    }

    try {
      const body = await request.json();

      // Validate required fields
      if (!body.name) {
        return jsonResponse({ error: 'App name is required' }, 400, env.ALLOWED_ORIGIN);
      }
      if (!body.js) {
        return jsonResponse({ error: 'App JS is required' }, 400, env.ALLOWED_ORIGIN);
      }

      // Base64 encode the code payloads
      const payload = {
        name: body.name,
        html: btoa(body.html || ''),
        css: btoa(body.css || ''),
        js: btoa(body.js),
        icon: body.icon || '📱',
        description: body.description || 'Custom app'
      };

      // Trigger GitHub repository_dispatch
      const githubResponse = await fetch(
        `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Portable-Apps-Webhook'
          },
          body: JSON.stringify({
            event_type: 'publish-app',
            client_payload: payload
          })
        }
      );

      if (!githubResponse.ok) {
        const error = await githubResponse.text();
        console.error('GitHub API error:', error);
        return jsonResponse({ error: 'Failed to publish app' }, 500, env.ALLOWED_ORIGIN);
      }

      // Success - GitHub returns 204 No Content
      const appSlug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      return jsonResponse({
        success: true,
        message: 'App publishing started',
        url: `https://${env.GITHUB_REPO.split('/')[0]}.github.io/${env.GITHUB_REPO.split('/')[1]}/apps/${appSlug}/`
      }, 200, env.ALLOWED_ORIGIN);

    } catch (e) {
      console.error('Webhook error:', e);
      return jsonResponse({ error: 'Invalid request' }, 400, env.ALLOWED_ORIGIN);
    }
  }
};

function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin)
    }
  });
}
