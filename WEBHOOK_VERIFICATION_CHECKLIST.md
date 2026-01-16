# 🔍 Webhook Verification Checklist

## ✅ Check All 5 Issues

### 1️⃣ **Node Server Running**

**Check:**
```bash
netstat -ano | findstr :5000
```

**Should see:**
```
TCP    0.0.0.0:5000           0.0.0.0:0              LISTENING       [PID]
```

**If NOT running:**
```bash
cd backend
npm start
```

---

### 2️⃣ **GET /webhook Route**

**Your route structure:**
- `app.use('/webhook', metaWebhookRoutes)` in `app.js`
- `router.get('/', webhookController.verifyWebhook)` in `metaWebhookRoutes.js`
- **Result:** `GET /webhook` ✅

**Test locally:**
```bash
# Open browser or use curl:
http://localhost:5000/webhook?hub.mode=subscribe&hub.verify_token=mysecretverifytoken123&hub.challenge=test
```

**Should return:** The challenge string (e.g., "test")

---

### 3️⃣ **VERIFY TOKEN**

**Check your .env file:**
```bash
# In backend/.env file, you should have:
Verify_Token = mysecretverifytoken123
```

**OR:**
```
VERIFY_TOKEN = mysecretverifytoken123
```

**Code checks both:** ✅ (already fixed)

**Make sure:**
- No extra spaces
- No quotes around the value
- Exact match: `mysecretverifytoken123`

---

### 4️⃣ **Ngrok Port**

**Check ngrok is forwarding to port 5000:**
```bash
# Check if ngrok is running
netstat -ano | findstr :4040
```

**Start ngrok (if not running):**
```bash
ngrok http 5000
```

**Verify ngrok URL:**
- Open: `http://127.0.0.1:4040` in browser
- Check "Forwarding" shows: `https://xxx.ngrok-free.app -> http://localhost:5000`

**Your ngrok URL should be:**
```
https://dorris-hemintropic-immanuel.ngrok-free.dev
```

---

### 5️⃣ **Route Path**

**Correct webhook URL:**
```
https://dorris-hemintropic-immanuel.ngrok-free.dev/webhook
```

**NOT:**
- ❌ `/webhook/webhook`
- ❌ `/webhooks/webhook`
- ❌ `/webhooks`

**Just:** ✅ `/webhook`

---

## 🧪 **Test Your Webhook**

### **Step 1: Test Locally First**
```bash
# Test on localhost
http://localhost:5000/webhook?hub.mode=subscribe&hub.verify_token=mysecretverifytoken123&hub.challenge=test123
```

**Expected:** Returns `test123` (the challenge)

### **Step 2: Test via Ngrok**
```bash
# Test via ngrok
https://dorris-hemintropic-immanuel.ngrok-free.dev/webhook?hub.mode=subscribe&hub.verify_token=mysecretverifytoken123&hub.challenge=test123
```

**Expected:** Returns `test123` (the challenge)

### **Step 3: Check Server Logs**
When you test, you should see in your server console:
```
=== WEBHOOK VERIFICATION REQUEST ===
Request URL: /webhook?hub.mode=subscribe&hub.verify_token=mysecretverifytoken123&hub.challenge=test123
Request Method: GET
Query Params: { 'hub.mode': 'subscribe', 'hub.verify_token': 'mysecretverifytoken123', 'hub.challenge': 'test123' }
Received mode: subscribe
Received token: mysecretverifytoken123
Expected token: mysecretverifytoken123
Challenge: test123
✅ Webhook Verified Successfully
```

---

## 🔧 **Common Issues & Fixes**

### **Issue: "Cannot GET /webhook"**
**Fix:** Make sure server is running and route is registered

### **Issue: "403 Forbidden"**
**Fix:** Check verify token matches exactly (no spaces, case-sensitive)

### **Issue: "Connection refused"**
**Fix:** 
1. Check server is running on port 5000
2. Check ngrok is running and forwarding to port 5000
3. Restart both server and ngrok

### **Issue: "Token mismatch"**
**Fix:**
1. Check `.env` file has `Verify_Token = mysecretverifytoken123`
2. Restart server after changing .env
3. Make sure no extra spaces or quotes

---

## 📋 **Final Checklist**

- [ ] Server running on port 5000
- [ ] Ngrok running and forwarding to port 5000
- [ ] `.env` file has `Verify_Token = mysecretverifytoken123`
- [ ] Server restarted after .env changes
- [ ] Local test works: `http://localhost:5000/webhook?...`
- [ ] Ngrok test works: `https://dorris-hemintropic-immanuel.ngrok-free.dev/webhook?...`
- [ ] Webhook URL in settings: `https://dorris-hemintropic-immanuel.ngrok-free.dev/webhook`
- [ ] Verify token in settings: `mysecretverifytoken123`

---

## 🚀 **Quick Test Command**

**PowerShell:**
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/webhook?hub.mode=subscribe&hub.verify_token=mysecretverifytoken123&hub.challenge=test123" | Select-Object StatusCode, Content
```

**Expected Output:**
```
StatusCode Content
---------- -------
       200 test123
```

