# 🔐 ENVIRONMENT VARIABLES GUIDE

**For:** NexusBrain Platform Production Deployment
**Platform:** Vercel
**Last Updated:** 2024-02-15

---

## 📊 QUICK SETUP

After deploying to Vercel, add these environment variables:

**Where to add:**
Vercel Dashboard → Your Project → Settings → Environment Variables

**OR via CLI:**
```bash
vercel env add VARIABLE_NAME
```

---

## 🔑 REQUIRED VARIABLES

### Supabase Configuration (If using Supabase)

```bash
# Public key - safe to expose in browser
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Public anonymous key - safe to expose
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Service role key - MUST be secret, server-side only
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**How to get these:**
1. Visit: https://app.supabase.com/project/YOUR_PROJECT/settings/api
2. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## ⚙️ OPTIONAL VARIABLES

### AWS Configuration (If using AWS services)

```bash
# AWS credentials for S3, Lambda, etc.
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1

# Optional: specific bucket name
AWS_S3_BUCKET=your-bucket-name
```

**How to get these:**
1. Visit: https://console.aws.amazon.com/iam/home#/security_credentials
2. Click "Create access key"
3. Copy Access Key ID and Secret Access Key
4. Choose your preferred region

---

### Authentication (If using NextAuth/Auth.js)

```bash
# Secret for JWT signing (generate a random string)
NEXTAUTH_SECRET=your-random-secret-here-min-32-chars

# Base URL for callbacks
NEXTAUTH_URL=https://your-domain.vercel.app

# OAuth providers (if using)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

**Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

---

### Email Service (If sending emails)

```bash
# SendGrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx

# Mailgun
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com

# AWS SES
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
AWS_SES_REGION=us-east-1
```

---

### Analytics & Monitoring (Optional)

```bash
# Google Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Sentry (Error tracking)
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# Vercel Analytics (auto-enabled, no config needed)
```

---

## 🎯 PLATFORM-SPECIFIC VARIABLES

### Variables Already Set in Code

These are configured in the application and don't need environment variables:

```bash
# Security
✅ IDS_ENABLED=true (hardcoded)
✅ SECURE_ERROR_HANDLING=true (hardcoded)
✅ OWASP_HEADERS=true (hardcoded)

# Build
✅ NODE_ENV=production (auto-set by Vercel)
✅ NEXT_TELEMETRY_DISABLED=1 (optional, for privacy)
```

---

## 📋 ENVIRONMENT VARIABLE CHECKLIST

### Pre-Deployment

- [ ] Identify which services you're using
- [ ] Gather credentials for each service
- [ ] Generate secret keys where needed
- [ ] Test locally with `.env.local` first

### During Deployment

- [ ] Deploy to Vercel (without env vars is OK)
- [ ] Add environment variables in Vercel dashboard
- [ ] Set correct scope (Production, Preview, Development)
- [ ] Redeploy to apply changes

### Post-Deployment

- [ ] Test that services connect correctly
- [ ] Verify authentication works
- [ ] Check database connections
- [ ] Monitor error logs for missing vars

---

## 🔒 SECURITY BEST PRACTICES

### DO ✅

1. **Use `NEXT_PUBLIC_` prefix** for browser-safe variables only
2. **Keep secrets server-side** (no `NEXT_PUBLIC_` prefix)
3. **Rotate credentials regularly** (every 90 days)
4. **Use different credentials** for dev/staging/prod
5. **Enable audit logging** on credential access
6. **Use minimum required permissions** (principle of least privilege)

### DON'T ❌

1. **Never commit** `.env` files to git
2. **Never expose** service role keys in browser
3. **Never share** credentials in chat/email
4. **Never use** production keys in development
5. **Never hardcode** secrets in source code

---

## 📁 LOCAL DEVELOPMENT

### .env.local (Git-ignored)

Create this file in `/platform` directory:

```bash
# Copy this template and fill in your values

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AWS (if using)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# Auth (if using)
NEXTAUTH_SECRET=your-secret-min-32-chars
NEXTAUTH_URL=http://localhost:3000

# Add other variables as needed
```

**File should be:**
- ✅ Listed in `.gitignore` (already done)
- ✅ Never committed to git
- ✅ Used only for local development

---

## 🚀 ADDING VARIABLES TO VERCEL

### Method 1: Vercel Dashboard (Recommended)

1. Visit: https://vercel.com/dashboard
2. Select your project
3. Go to: Settings → Environment Variables
4. Click "Add New"
5. Enter:
   - **Name:** Variable name (e.g., `SUPABASE_SERVICE_ROLE_KEY`)
   - **Value:** Variable value (paste your key)
   - **Environment:** Select where to use (Production, Preview, Development)
6. Click "Save"
7. **Redeploy** for changes to take effect

---

### Method 2: Vercel CLI

```bash
cd platform

# Add a variable
vercel env add VARIABLE_NAME

# You'll be prompted for:
# - Value
# - Environment (production, preview, development)

# Pull environment variables locally
vercel env pull

# List all environment variables
vercel env ls
```

---

### Method 3: vercel.json (NOT RECOMMENDED for secrets)

Only use for non-sensitive configuration:

```json
{
  "env": {
    "NEXT_PUBLIC_API_VERSION": "v1",
    "NEXT_PUBLIC_APP_NAME": "NexusBrain"
  }
}
```

**⚠️ Warning:** Don't put secrets in `vercel.json` - it's committed to git!

---

## 🔍 VERIFYING VARIABLES

### After adding variables in Vercel:

1. **Trigger a redeploy:**
   - Vercel Dashboard → Deployments → Click "..." → Redeploy
   - Or push a new commit to trigger auto-deploy

2. **Check deployment logs:**
   - Look for errors about missing variables
   - Verify connection to services

3. **Test in production:**
   ```bash
   # Test API endpoint that uses env vars
   curl https://your-domain.vercel.app/api/health
   ```

4. **Check browser console:**
   - `NEXT_PUBLIC_*` variables should be accessible
   - Private variables should NOT be visible

---

## ⚠️ TROUBLESHOOTING

### Issue: "Environment variable not found"

**Solutions:**
1. Verify variable name matches exactly (case-sensitive)
2. Check it's added to correct environment (Production/Preview)
3. Redeploy after adding variables
4. Clear build cache: Settings → General → Clear Build Cache

---

### Issue: "Can't connect to database/service"

**Solutions:**
1. Verify credentials are correct (test in local first)
2. Check service is accessible from Vercel IPs
3. Verify firewall/security group rules
4. Check service status (is it running?)

---

### Issue: "Variable visible in browser but should be secret"

**Problem:** Used `NEXT_PUBLIC_` prefix on a secret variable

**Solution:**
1. Remove the `NEXT_PUBLIC_` prefix
2. Update code to use variable server-side only
3. Redeploy

---

## 📊 ENVIRONMENT VARIABLE INVENTORY

### Current Platform Requirements

| Variable | Required | Type | Where Used |
|----------|----------|------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Public | If using Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Public | If using Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Secret | If using Supabase |
| `AWS_ACCESS_KEY_ID` | Optional | Secret | If using AWS |
| `AWS_SECRET_ACCESS_KEY` | Optional | Secret | If using AWS |
| `AWS_REGION` | Optional | Config | If using AWS |
| `NEXTAUTH_SECRET` | Optional | Secret | If using Auth |
| `NEXTAUTH_URL` | Optional | Config | If using Auth |

**Note:** Platform works without any env vars for basic functionality. Add as needed based on features you use.

---

## 🎯 RECOMMENDED SETUP FOR NEW DEPLOYMENT

### Minimal (No external services)

No environment variables needed! Platform runs with built-in features only.

---

### Standard (Supabase + Auth)

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-domain.vercel.app
```

---

### Full (All services)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# AWS
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Auth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=...

# Email
SENDGRID_API_KEY=...

# Analytics
NEXT_PUBLIC_GA_ID=...
SENTRY_DSN=...
```

---

## 🎉 SUMMARY

**For basic deployment:**
- No env vars needed! Platform works standalone

**For production with services:**
1. Deploy first (works without vars)
2. Add env vars in Vercel dashboard
3. Redeploy to apply
4. Test connections
5. Monitor for errors

**Security reminder:**
- Never commit secrets to git
- Use different credentials for dev/prod
- Rotate credentials regularly
- Monitor access logs

---

**Need help?**
- Vercel docs: https://vercel.com/docs/environment-variables
- Supabase docs: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
- NextAuth docs: https://next-auth.js.org/configuration/options

**Ready to deploy without env vars?**
Platform has secure defaults and works great standalone! Add services when you need them.
