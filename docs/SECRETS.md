# Secrets and provider configuration

Do not store API keys, passcodes, access tokens, private IP allowlists, or provider credentials in tracked repository files.

## Local development

- Copy `.env.example` to `.env.local` and replace the placeholder values.
- The `.gitignore` excludes `.env*` files (except `.env.example`) and local `.secrets/` / `secrets/` directories.
- Keep real credentials in your local ignored `.env.local` file or an ignored `.secrets/` directory. Do not upload either to GitHub.

## Vercel production

Set `ADMIN_PASSCODE` in Vercel → Project → Settings → Environment Variables, then redeploy. Keep any future server-side provider API keys in Vercel Environment Variables and access them only from server-side functions under `/api/`. Never place secrets in `app.js`, `index.html`, `styles.css`, public JSON, or client-side environment variables.

## YTDown fallback

The current YTDown integration is a normal external link to `https://app.ytdown.to/en38/`. No official public API contract has been verified, so no YTDown API key, endpoint, or secret is assumed. The browser checks the app's existing direct-file workflow first; when a YouTube page cannot be resolved, the user can open YTDown separately and paste the link.

A folder name such as `.secrets/` does not make files private if they are committed to a public GitHub repository. The folder is intentionally ignored by Git so its contents remain local.
