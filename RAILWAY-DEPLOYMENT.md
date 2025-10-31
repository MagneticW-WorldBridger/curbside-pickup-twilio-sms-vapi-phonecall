# 🚂 RAILWAY DEPLOYMENT GUIDE - RURAL KING SMS AI

## 🎯 ¿Por qué Railway?

**Railway > Vercel** para este proyecto porque:

| Feature | Railway ✅ | Vercel ❌ |
|---------|-----------|----------|
| Long-running server | ✅ 24/7 corriendo | ❌ Serverless (se apaga) |
| WebSockets | ✅ Full support | ❌ Limitado/complicado |
| PostgreSQL | ✅ Click to add | ❌ Necesitas external |
| Real-time dashboard | ✅ Funciona perfecto | ❌ No funciona |
| Background jobs | ✅ Sin problema | ❌ Timeouts |

**Costo:** $5/month de Railway vs FREE de Vercel, pero Vercel NO funciona para tu caso.

---

## 📋 PRE-REQUISITOS

1. ✅ Cuenta GitHub (para conectar el repo)
2. ✅ Cuenta Railway (https://railway.app - sign up con GitHub)
3. ✅ Twilio account con número y credenciales
4. ✅ OpenAI API key
5. ✅ VAPI account (para los webhooks)

---

## 🚀 DEPLOYMENT EN 5 MINUTOS

### **PASO 1: Preparar el Repo**

```bash
# 1. Asegúrate de tener todo commiteado
git add .
git commit -m "Prepare for Railway deployment"

# 2. Push a GitHub (si no lo has hecho)
git remote add origin https://github.com/TU_USUARIO/rural-king-sms-ai.git
git branch -M main
git push -u origin main
```

### **PASO 2: Crear Proyecto en Railway**

1. Ve a https://railway.app
2. Click **"New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Busca y selecciona tu repo: `rural-king-sms-ai` (o como lo hayas llamado)
5. Railway detectará automáticamente que es Node.js ✅

### **PASO 3: Agregar PostgreSQL**

1. En tu proyecto Railway, click **"+ New"**
2. Selecciona **"Database"** → **"PostgreSQL"**
3. Railway creará una DB automáticamente
4. Click en la DB → pestaña **"Connect"**
5. Copia la **"Postgres Connection URL"** (la necesitarás)

### **PASO 4: Configurar Variables de Entorno**

1. Click en tu servicio web (smart-webhook-server)
2. Ve a pestaña **"Variables"**
3. Agrega estas variables (una por una):

```bash
# Database (Railway auto-conecta, pero verifica)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Twilio
TWILIO_ACCOUNT_SID=tu_twilio_account_sid
TWILIO_AUTH_TOKEN=tu_twilio_auth_token
TWILIO_PHONE=+18445581145

# OpenAI
OPENAI_API_KEY=tu_openai_api_key

# VAPI
VAPI_API_KEY=tu_vapi_api_key
VAPI_PHONE_NUMBER_ID=tu_vapi_phone_id
VAPI_ASSISTANT_ID=tu_vapi_assistant_id

# Store Manager (para las llamadas)
STORE_MANAGER_PHONE=+19362012989

# Server Config
PORT=3001
NODE_ENV=production
```

**💡 TIP:** Railway tiene "Reference Variables" - la DATABASE_URL se auto-llena con `${{Postgres.DATABASE_URL}}`

### **PASO 5: Crear las Tablas**

Railway te da acceso a la DB. Hay 2 formas:

#### **Opción A: Desde Railway Dashboard**
1. Click en tu PostgreSQL service
2. Pestaña **"Data"**
3. Click **"Query"**
4. Copia y pega el contenido de `database-schema.sql`
5. Run query

#### **Opción B: Desde tu computadora**
```bash
# Copia la DATABASE_URL de Railway
psql "postgresql://postgres:XXX@XXX.railway.app:5432/railway"

# Pega el schema
\i database-schema.sql
```

### **PASO 6: Deploy!**

Railway deploya automáticamente cuando haces push. Pero si quieres forzar:

1. En Railway dashboard, click **"Deploy"**
2. Espera ~2-3 minutos
3. Ve a pestaña **"Deployments"** para ver el progreso

### **PASO 7: Obtener tu URL**

1. Click en tu servicio
2. Pestaña **"Settings"**
3. Sección **"Networking"**
4. Click **"Generate Domain"**
5. Railway te da algo como: `rural-king-sms-ai-production.up.railway.app`

**¡ESA ES TU URL PÚBLICA!** 🎉

---

## 🔧 CONFIGURAR WEBHOOKS

### **1. Twilio Webhooks**

1. Ve a Twilio Console → Phone Numbers
2. Encuentra tu número: +18445581145
3. En **"Messaging"** → **"A MESSAGE COMES IN"**:
   ```
   https://rural-king-sms-ai-production.up.railway.app/webhook/sms
   ```
4. Método: **HTTP POST**
5. Save

### **2. VAPI Webhooks**

1. Ve a VAPI Dashboard → tu Assistant
2. En **"Server URL"**:
   ```
   https://rural-king-sms-ai-production.up.railway.app/vapi/call-ended
   ```
3. Save

---

## 🎯 ACCEDER AL DASHBOARD

Tu dashboard estará en:
```
https://rural-king-sms-ai-production.up.railway.app/demo-dashboard.html
```

**IMPORTANTE:** El dashboard usa WebSockets, por eso necesitamos Railway (no Vercel).

---

## 📊 MONITOREO Y LOGS

### **Ver Logs en Tiempo Real:**
1. Railway Dashboard → tu servicio
2. Pestaña **"Logs"**
3. Ver todos los console.log() en tiempo real

### **Métricas:**
1. Railway Dashboard → pestaña **"Metrics"**
2. Ver CPU, RAM, Network usage

### **Health Check:**
Railway hace health check automático a:
```
https://tu-app.railway.app/health
```

---

## 💰 COSTOS

### **Railway Pricing:**
- **Hobby Plan:** $5/month
  - $5 de crédito incluido cada mes
  - PostgreSQL incluido
  - 500 horas de ejecución (más que suficiente)
  - Custom domains gratis

### **Uso Estimado:**
```
Server (24/7):     ~730 horas/mes
PostgreSQL:        Incluido
Bandwidth:         Incluido hasta 100GB
```

**Total:** ~$5/month (básicamente gratis con el crédito incluido)

---

## 🐛 TROUBLESHOOTING

### **Error: "Cannot connect to database"**
```bash
# Verifica que DATABASE_URL esté configurada
# En Railway → Variables → debe estar: DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### **Error: "Port already in use"**
```javascript
// Railway asigna el puerto automáticamente
// Tu código ya lo maneja:
const port = process.env.PORT || 3001;
```

### **WebSocket no funciona:**
```bash
# Railway soporta WebSockets por default
# Asegúrate que tu URL no tenga /ws al final
# Debe ser: https://tu-app.railway.app (Railway maneja el upgrade automático)
```

### **Dashboard no carga:**
```bash
# Verifica que demo-dashboard.html esté en el root del proyecto
# Verifica en Railway logs que el servidor inició correctamente
# Busca: "🚀 RURAL KING SMART WEBHOOK SERVER STARTED"
```

---

## 🔄 CI/CD AUTOMÁTICO

Railway re-deploya automáticamente cuando haces push a main:

```bash
git add .
git commit -m "Update webhook logic"
git push origin main

# Railway detecta el push
# Hace build automático
# Deploya nueva versión
# Zero downtime! 🎉
```

---

## 🌐 CUSTOM DOMAIN (Opcional)

Si quieres tu propio dominio (ej: `sms.ruralking.com`):

1. Railway Dashboard → Settings → Networking
2. Click **"Custom Domain"**
3. Ingresa tu dominio
4. Railway te da un CNAME record
5. Agrega el CNAME en tu DNS provider
6. Espera propagación (~10 min)

---

## 📈 SCALING (Si crece mucho)

Si necesitas más poder:

1. Railway Dashboard → Settings
2. Sección **"Resources"**
3. Ajusta:
   - CPU: hasta 8 vCPUs
   - RAM: hasta 32GB
   - Replicas: hasta 10 instancias

**Para Rural King, 1 instancia es más que suficiente.**

---

## 🔐 SEGURIDAD

### **Variables de Entorno:**
✅ Railway encripta todas las env vars
✅ Nunca expuestas en logs
✅ Solo accesibles dentro del contenedor

### **SSL/HTTPS:**
✅ Railway provee SSL gratis automáticamente
✅ Todas las URLs son HTTPS por default

### **Database:**
✅ PostgreSQL en red privada
✅ Solo accesible desde tu app
✅ Backups automáticos

---

## 🎁 ALTERNATIVAS (Si Railway no te gusta)

### **Render.com** (Similar a Railway)
- ✅ También soporta WebSockets
- ✅ PostgreSQL gratis (con limitaciones)
- ✅ Auto-deploy desde GitHub
- 💵 Free tier disponible

### **Fly.io** (Más técnico)
- ✅ Excelente para WebSockets
- ✅ PostgreSQL incluido
- ✅ Deploy rápido
- 💵 $5-10/month

### **Heroku** (Clásico pero más caro)
- ✅ Similar a Railway
- ✅ Add-ons disponibles
- 💵 ~$7/month mínimo

**Mi recomendación: Railway es el balance perfecto de precio/facilidad/features.**

---

## ✅ CHECKLIST FINAL

Antes de hacer tu primer deploy, verifica:

- [ ] Repo en GitHub con todo commiteado
- [ ] `package.json` tiene `"start": "node smart-webhook-server.js"`
- [ ] `railway.json`, `Procfile`, `.railwayignore` en el root
- [ ] Todas las env vars listadas arriba
- [ ] `database-schema.sql` listo para ejecutar
- [ ] Twilio número configurado
- [ ] VAPI assistant creado
- [ ] OpenAI API key válida

---

## 🚀 QUICK START COMMANDS

```bash
# 1. Commit todo
git add .
git commit -m "Ready for Railway deployment"
git push origin main

# 2. Ve a Railway y conecta el repo

# 3. Agrega PostgreSQL

# 4. Configura env vars

# 5. Ejecuta schema SQL

# 6. Genera domain

# 7. Configura webhooks en Twilio y VAPI

# 8. ¡Abre tu dashboard!
# https://tu-app.railway.app/demo-dashboard.html
```

---

## 📞 TESTING PRODUCTION

Una vez deployado, prueba:

```bash
# 1. Health check
curl https://tu-app.railway.app/health

# 2. Create test order
curl -X POST https://tu-app.railway.app/rural-king/new-order \
  -H "Content-Type: application/json" \
  -d '{
    "customer_phone": "+13323339453",
    "customer_name": "Test Customer",
    "order_id": "TEST123",
    "store_name": "Rural King Mattoon"
  }'

# 3. Customer responde "YES" por SMS

# 4. Ver logs en Railway dashboard
```

---

¡ESO ES TODO! Railway es MUCHO más fácil que Vercel para tu caso. 🚂

