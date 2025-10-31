# 🚀 Rural King SMS AI - Curbside Pickup System

**Smart SMS automation + VAPI voice calls for Rural King curbside pickup**

## ⚡ Quick Deploy to Railway

1. **Click:** [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

2. **Connect this repo:** `https://github.com/MagneticW-WorldBridger/curbside-pickup-twilio-sms-vapi-phonecall`

3. **Add these environment variables:**

```bash
# Database (Use your Neon/Railway PostgreSQL URL)
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# Twilio (Get from twilio.com/console)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE=+1234567890

# OpenAI (Get from platform.openai.com/api-keys)
OPENAI_API_KEY=sk-proj-your-openai-key-here

# VAPI (Get from vapi.ai dashboard)
VAPI_API_KEY=your-vapi-private-key
VAPI_PHONE_NUMBER_ID=your-vapi-phone-number-id
VAPI_ASSISTANT_ID=your-vapi-assistant-id

# Store Manager (Phone number to call on complaints)
STORE_MANAGER_PHONE=+1234567890

# Config
PORT=3001
NODE_ENV=production
```

**💡 Get your actual values from your `.env` file**

4. **Deploy** - That's it! 🎉

---

## 📱 What This Does

### **For Customers:**
- ✅ Automated SMS notifications (order ready, etc)
- ✅ AI-powered responses to questions
- ✅ Opt-in/opt-out management
- ✅ Parking spot detection ("I'm in spot 5")

### **For Store Managers:**
- ✅ VAPI voice calls when customer complains
- ✅ SMS alerts for arrivals
- ✅ Real-time dashboard
- ✅ Complete conversation history

### **Tech Stack:**
- 🤖 **OpenAI GPT-4.1** - Function calling for SMS intent detection
- 📱 **Twilio** - SMS sending/receiving
- 📞 **VAPI** - AI voice calls to store managers
- 🗄️ **PostgreSQL (Neon)** - Customer/order data
- 🌐 **Express + WebSockets** - Real-time dashboard
- 🚂 **Railway** - Production hosting

---

## 🎯 After Deploy

### **1. Get your URL:**
Railway dashboard → Settings → Networking → Generate Domain

Your URL: `https://your-app-production.up.railway.app`

### **2. Configure Webhooks:**

**Twilio:**
- Go to: Twilio Console → Phone Numbers → +18445581145
- Messaging webhook: `https://your-app.railway.app/webhook/sms`
- Method: POST

**VAPI:**
- Go to: VAPI Dashboard → Assistant → Server URL
- Set to: `https://your-app.railway.app/vapi/call-ended`

### **3. Access Dashboard:**
```
https://your-app.railway.app/demo-dashboard.html
```

---

## 🔥 Key Features

### **Smart SMS AI:**
- Detects customer intent (arrival, complaint, question, thanks)
- Calls appropriate function (notify_team, escalate_to_vapi, send_response)
- Generates contextual responses using GPT-4.1
- Tracks opt-in status per customer

### **VAPI Integration:**
- Automatically calls store manager on complaints
- Provides order context in the call
- Processes call transcript after completion
- Sends follow-up SMS to customer

### **Real-time Dashboard:**
- See all customers and opt-in status
- Send custom SMS to any customer
- Reset opt-in for demo purposes
- Live notifications via WebSockets
- Customer management (click to select)

---

## 📊 API Endpoints

```bash
# Health check
GET /health

# Create new order (triggers opt-in SMS)
POST /rural-king/new-order

# Mark order ready (triggers pickup SMS)
POST /rural-king/ready-for-pickup

# SMS webhook (Twilio)
POST /webhook/sms

# VAPI call ended webhook
POST /vapi/call-ended

# Get all customers
GET /api/customers

# Send custom SMS
POST /api/send-sms

# Reset opt-in (for demos)
POST /api/reset-optin/:phone
```

---

## 💰 Cost

**~$5-10/month total:**
- Railway: $5/month (includes $5 credit)
- Twilio: ~$1/month (pay per SMS)
- VAPI: Pay per call minute
- OpenAI: Pay per token
- Neon DB: FREE tier (plenty for this)

---

## 📚 Documentation

- **Quick Start:** See `DEPLOYMENT-QUICKSTART.md`
- **Full Guide:** See `RAILWAY-DEPLOYMENT.md`
- **Database Schema:** See `database-schema.sql`

---

## 🎬 Demo Flow

1. Customer places order → Gets opt-in SMS
2. Customer replies "YES" → Opted in ✅
3. Order ready → Customer gets pickup SMS
4. Customer replies "I'm in spot 5" → Store notified
5. Customer complains → VAPI calls manager
6. Manager responds → Customer gets follow-up SMS
7. Customer picks up → Gets review request

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Set up .env with your credentials
cp .env.example .env

# Database already created (Neon)
# Just make sure DATABASE_URL is set

# Start server
npm start

# Or with nodemon
npm run dev

# Dashboard at:
http://localhost:3001/demo-dashboard.html
```

---

## 🤝 Support

Questions? Issues? Check the docs or create an issue.

Built with ❤️ for Rural King curbside pickup automation.

---

## 🔐 Security Notes

- ✅ All credentials in environment variables
- ✅ HTTPS enforced by Railway
- ✅ Database in private network
- ✅ No sensitive data in code
- ✅ SSL for Neon database

---

**Ready to deploy? Click the Railway button above!** 🚂

