BioSteg — Zero-Trust Steganography & WebAuthn PlatformAn integrated web security platform combining biometric authentication (WebAuthn/Passkeys), end-to-end encryption (ECDH P-256 + AES-256-GCM), and PNG LSB steganography for concealed communication.🚀 Quick Deployment GuideEnvironment VariablesEnsure the following variables are configured in Netlify Site Configuration -> Environment Variables:Variable NameDescriptionNEXT_PUBLIC_SUPABASE_URLYour Supabase project URLNEXT_PUBLIC_SUPABASE_ANON_KEYPublic anon key for client auth & realtimeSUPABASE_SERVICE_ROLE_KEYServer-only key for privileged user/email lookupRP_IDNetlify domain hostname without https:// (e.g. biostego.netlify.app)🛠️ Local Development# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev
Open http://localhost:3000 to view the application locally.


## Netlify environment and secret scanning

Configure environment variables in the Netlify site settings; do not commit credentials or local environment files. The browser needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time. Use only the Supabase anonymous/publishable key for the latter, with Row Level Security policies protecting application data. Never use a service-role or secret key in a `NEXT_PUBLIC_` variable.

`WEBAUTHN_RP_NAME`, `WEBAUTHN_RP_ID`, and `WEBAUTHN_ORIGIN` describe the public relying party. They are not authentication credentials. `CI` is a public build flag. The explicit `SECRETS_SCAN_OMIT_KEYS` list in `netlify.toml` exempts only these public settings and the two public Supabase variables, because their values legitimately appear in source, dependencies, or generated bundles. Next.js inlines `NEXT_PUBLIC_` variables even when the source uses `process.env`.

Keep `SUPABASE_SERVICE_ROLE_KEY`, `WEBSESSION_SECRET`, and `CRON_SECRET` in server-side environment variables. They remain subject to secret scanning. Do not disable scanning or exempt entire source/build directories to resolve this failure. If a private credential was exposed in a public repository or browser bundle, rotate it with its issuer and update Netlify before redeploying; removing it from current source does not invalidate previous copies.
