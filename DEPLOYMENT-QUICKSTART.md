# 🚀 DEPLOYMENT QUICKSTART - RURAL KING SMS AI

## 1️⃣ PREPARAR (1 minuto)

```bash
# Commit todo
git add .
git commit -m "Ready for production deployment"
git push origin main
```

## 2️⃣ RAILWAY SETUP (3 minutos)

1. **Ir a:** https://railway.app
2. **Sign up** con GitHub (gratis)
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Seleccionar tu repo
5. Click **"+ New"** → **"Database"** → **"PostgreSQL"**

## 3️⃣ VARIABLES DE ENTORNO (2 minutos)

Click en tu servicio web → **"Variables"** → Agregar:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
TWILIO_ACCOUNT_SID=tu_sid_aqui
TWILIO_AUTH_TOKEN=tu_token_aqui
TWILIO_PHONE=+18445581145
OPENAI_API_KEY=sk-...
VAPI_API_KEY=tu_key
VAPI_PHONE_NUMBER_ID=tu_id
VAPI_ASSISTANT_ID=tu_assistant_id
STORE_MANAGER_PHONE=+19362012989
PORT=3001
NODE_ENV=production
```

## 4️⃣ CREAR TABLAS (1 minuto)

Railway → PostgreSQL service → **"Data"** → **"Query"**

Copiar y pegar contenido de `database-schema.sql` → Run

## 5️⃣ GENERAR DOMAIN (30 segundos)

Settings → Networking → **"Generate Domain"**

Tu URL: `https://tu-app-production.up.railway.app`

## 6️⃣ CONFIGURAR WEBHOOKS (1 minuto)

### Twilio:
Console → Phone Numbers → tu número → Messaging:
```
https://tu-app-production.up.railway.app/webhook/sms
```

### VAPI:
Dashboard → Assistant → Server URL:
```
https://tu-app-production.up.railway.app/vapi/call-ended
```

## 7️⃣ ¡PROBAR! (30 segundos)

Dashboard: `https://tu-app-production.up.railway.app/demo-dashboard.html`

---

## ✅ LISTO EN ~8 MINUTOS

**Costo:** $5/month (con $5 de crédito gratis incluido = básicamente gratis)

**Documentación completa:** Ver `RAILWAY-DEPLOYMENT.md`

---

## 🆚 ¿POR QUÉ RAILWAY Y NO VERCEL?

| Necesidad | Railway | Vercel |
|-----------|---------|--------|
| WebSockets para dashboard | ✅ | ❌ |
| Servidor 24/7 corriendo | ✅ | ❌ |
| PostgreSQL incluido | ✅ | ❌ |
| Long-running processes | ✅ | ❌ |
| Background jobs | ✅ | ❌ |

**Vercel es serverless = se apaga entre requests = tu dashboard NO funciona**

**Railway mantiene el servidor corriendo = todo funciona perfecto**

---

## 🐛 TROUBLESHOOTING

### "Cannot find module"
```bash
# Verifica package.json tiene todas las dependencies
npm install
git add package-lock.json
git commit -m "Update dependencies"
git push
```

### "Database connection error"
```bash
# Verifica que DATABASE_URL tenga el valor:
# ${{Postgres.DATABASE_URL}}
# Railway lo reemplaza automáticamente
```

### "Port already in use"
```bash
# Railway asigna el puerto automáticamente
# Tu código ya lo maneja correctamente:
# const port = process.env.PORT || 3001;
```

---

## 📱 TESTING PRODUCTION

```bash
# Health check
curl https://tu-app.railway.app/health

# Create order
curl -X POST https://tu-app.railway.app/rural-king/new-order \
  -H "Content-Type: application/json" \
  -d '{
    "customer_phone": "+13323339453",
    "customer_name": "Test",
    "order_id": "TEST123",
    "store_name": "Rural King Mattoon"
  }'
```

---

## 🎉 ¡ESO ES TODO!

Tu sistema está LIVE 24/7 con:
- ✅ SMS automático con AI
- ✅ VAPI calls para managers
- ✅ Dashboard en tiempo real
- ✅ PostgreSQL database
- ✅ HTTPS automático
- ✅ Zero configuration
- ✅ Auto-deploys desde GitHub

**¡A rockear en producción!** 🚀

