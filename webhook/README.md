# Webhook Setup

This Cloudflare Worker provides a public endpoint for AI-generated apps to publish themselves.

## Setup

### 1. Create a GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Create a token with:
   - Repository access: Select your portable-stateless-apps repo
   - Permissions: Contents (Read and write)
3. Copy the token

### 2. Deploy the Worker

**Option A: Cloudflare Dashboard**
1. Go to Cloudflare Dashboard → Workers & Pages
2. Create a new Worker
3. Paste the contents of `worker.js`
4. Go to Settings → Variables
5. Add environment variables:
   - `GITHUB_TOKEN`: Your GitHub token
   - `GITHUB_REPO`: `your-username/portable-stateless-apps`

**Option B: Wrangler CLI**
```bash
npm install -g wrangler
wrangler login
wrangler deploy worker.js --name portable-apps-webhook
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO
```

### 3. Get Your Webhook URL

Your webhook will be available at:
```
https://portable-apps-webhook.YOUR-SUBDOMAIN.workers.dev
```

## API

### POST /

Publishes a new app.

**Request Body:**
```json
{
  "name": "My App",
  "html": "<div id=\"app\">...</div>",
  "css": "body { ... }",
  "js": "const db = new Dexie('MyAppDB'); ...",
  "icon": "🎯",
  "description": "A short description"
}
```

**Response:**
```json
{
  "success": true,
  "message": "App publishing started",
  "url": "https://username.github.io/portable-stateless-apps/apps/my-app/"
}
```

## Testing

```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test App",
    "html": "<div id=\"app\"><h1>Hello</h1></div>",
    "css": "body { font-family: sans-serif; }",
    "js": "console.log(\"Hello\");"
  }'
```
