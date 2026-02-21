# Run the SQL from AWS (Not Local)

You mentioned your platform is on AWS. Here are the best ways to run the SQL command from AWS:

---

## ✅ **Option 1: Use AWS EC2 or ECS (Recommended)**

If you have an EC2 instance or ECS task running:

### Install psql on EC2:
```bash
# SSH into your EC2 instance
ssh your-ec2-instance

# Install PostgreSQL client
sudo yum install postgresql15  # Amazon Linux
# OR
sudo apt-get install postgresql-client  # Ubuntu

# Run the SQL
psql "postgresql://postgres:[YOUR-PASSWORD]@db.zmlqvuzoodcgmkgkivfw.supabase.co:5432/postgres" \
  -c "ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';"
```

---

## ✅ **Option 2: AWS Lambda Function (Quick & Easy)**

Create a Lambda function to run the SQL:

### Step 1: Create Lambda Function
Go to AWS Lambda Console and create a new function with this code:

```javascript
// Lambda function to set Supabase database config
const { Client } = require('pg');

exports.handler = async (event) => {
  const client = new Client({
    host: 'db.zmlqvuzoodcgmkgkivfw.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD, // Set in Lambda env vars
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const result = await client.query(`
      ALTER DATABASE postgres SET app.supabase_service_role_key =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';
    `);

    await client.end();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Service key configured!' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
```

### Step 2: Configure Lambda
1. Runtime: Node.js 18.x
2. Add layer: `arn:aws:lambda:us-east-1:xxx:layer:pg:1` (or add pg module)
3. Set env var: `SUPABASE_DB_PASSWORD` = your database password
4. Timeout: 30 seconds
5. Invoke once

---

## ✅ **Option 3: AWS CloudShell (Easiest!)**

Use AWS CloudShell (built-in terminal in AWS Console):

### Step 1: Open CloudShell
1. Go to AWS Console
2. Click the CloudShell icon (top right, looks like `>_`)
3. Wait for shell to load

### Step 2: Install psql
```bash
# In CloudShell
sudo yum install postgresql15 -y
```

### Step 3: Run SQL
```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@db.zmlqvuzoodcgmkgkivfw.supabase.co:5432/postgres" \
  -c "ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';"
```

---

## ✅ **Option 4: AWS Systems Manager (SSM)**

If you have EC2 instances with SSM agent:

```bash
# From your local machine
aws ssm start-session --target i-YOUR-INSTANCE-ID

# Once connected, install psql and run the SQL
sudo yum install postgresql15 -y
psql "postgresql://postgres:[YOUR-PASSWORD]@db.zmlqvuzoodcgmkgkivfw.supabase.co:5432/postgres" \
  -c "ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';"
```

---

## 🎯 **Recommended: AWS CloudShell (Fastest)**

**Why CloudShell:**
- ✅ Already available in your AWS account
- ✅ No EC2 needed
- ✅ No Lambda setup needed
- ✅ Just 3 commands
- ✅ Takes 2 minutes total

**Steps:**
1. Open AWS Console
2. Click CloudShell icon (>_)
3. Run:
   ```bash
   sudo yum install postgresql15 -y
   ```
4. Get your Supabase database password from:
   https://supabase.com/dashboard/project/zmlqvuzoodcgmkgkivfw/settings/database
5. Run:
   ```bash
   psql "postgresql://postgres:[PASSWORD]@db.zmlqvuzoodcgmkgkivfw.supabase.co:5432/postgres" \
     -c "ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';"
   ```

---

## 📋 **Get Your Database Password**

1. Go to: https://supabase.com/dashboard/project/zmlqvuzoodcgmkgkivfw/settings/database
2. Find "Database password" section
3. Either view existing password or reset it
4. Copy the password
5. Use it in the commands above (replace `[PASSWORD]`)

---

## ✅ **After Running the SQL**

Verify it worked:
```bash
npm run check:production
```

Expected output:
```
3️⃣  Service Role Key Configuration
   ✅ Service role key is CONFIGURED
   Automatic cron triggers will work

📊 PRODUCTION DEPLOYMENT SCORE: 5/5
✅ EVERYTHING IS DEPLOYED AND WORKING!
```

---

## 🎉 **Summary**

**Best option:** AWS CloudShell (2 minutes, no setup)
**Alternative:** AWS Lambda function (reusable)
**If you have EC2:** SSH and run directly

All options work from AWS - no need to install anything locally!
