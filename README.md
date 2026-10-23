BioSteg — Zero-Trust Steganography & WebAuthn PlatformAn integrated web security platform combining biometric authentication (WebAuthn/Passkeys), end-to-end encryption (ECDH P-256 + AES-256-GCM), and PNG LSB steganography for concealed communication.🚀 Quick Deployment GuideEnvironment VariablesEnsure the following variables are configured in Netlify Site Configuration -> Environment Variables:Variable NameDescriptionNEXT_PUBLIC_SUPABASE_URLYour Supabase project URLNEXT_PUBLIC_SUPABASE_ANON_KEYPublic anon key for client auth & realtimeSUPABASE_SERVICE_ROLE_KEYServer-only key for privileged user/email lookupRP_IDNetlify domain hostname without https:// (e.g. biostego.netlify.app)🛠️ Local Development# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev
Open http://localhost:3000 to view the application locally.
