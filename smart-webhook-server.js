const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const OpenAI = require('openai');
const { Pool } = require('pg');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 🎯 Serve demo dashboard
app.use(express.static(__dirname));

// 🌐 CORS for demo dashboard
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// 🤖 OpenAI Client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 🗄️ PostgreSQL Client
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 📱 Twilio Client
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID, 
    process.env.TWILIO_AUTH_TOKEN
);

// 🔔 WebSocket Notification System
const connectedClients = new Set();

wss.on('connection', (ws, req) => {
    console.log('🔗 Demo dashboard connected');
    connectedClients.add(ws);
    
    ws.on('close', () => {
        console.log('❌ Demo dashboard disconnected');
        connectedClients.delete(ws);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectedClients.delete(ws);
    });
});

// Broadcast notification to all connected dashboards
function broadcastNotification(type, title, message) {
    const notification = {
        type: type,
        title: title,
        message: message,
        timestamp: new Date().toISOString()
    };
    
    const messageStr = JSON.stringify(notification);
    
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageStr);
            } catch (error) {
                console.error('Error sending notification:', error);
                connectedClients.delete(client);
            }
        } else {
            connectedClients.delete(client);
        }
    });
    
    console.log(`📢 Broadcasted notification: ${title}`);
}

// 🧠 AI FUNCTION CALLING - JD REQUIREMENTS (GPT-4.1 RESPONSES API)
async function processMessageWithAI(message, customerPhone, customerData, orderData) {
    try {
        // Get recent conversation history for context
        const conversationHistory = await pool.query(
            `SELECT message_content, ai_response, created_at 
             FROM conversations 
             WHERE phone = $1 
             ORDER BY created_at DESC 
             LIMIT 5`,
            [customerPhone]
        );
        
        const historyContext = conversationHistory.rows.length > 0 
            ? conversationHistory.rows.reverse().map(conv => 
                `Customer: "${conv.message_content}" → AI: "${conv.ai_response}"`
              ).join('\n')
            : 'No previous conversation history';

        const response = await openai.responses.create({
            model: 'gpt-4.1',
            input: [
                {
                    role: 'system',
                    content: `You are Rural King's SMS assistant. Based on customer messages, you MUST call the appropriate function:

                    CUSTOMER: ${customerData.name}
                    ORDER: #${orderData.order_number}
                    STORE: ${orderData.store_name}
                    
                    RECENT CONVERSATION HISTORY:
                    ${historyContext}
                    
                    🚨 PRIORITY 1 - COMPLAINT DETECTION (CHECK THIS FIRST!):
                    ============================================================
                    CALL call_store_manager IF customer shows ANY of these signs:
                    - Mentions WAITING TOO LONG, DELAYS, SLOW SERVICE
                    - Expresses FRUSTRATION, ANGER, IMPATIENCE
                    - Says "WHERE IS MY ORDER", "TAKING TOO LONG", "STILL WAITING"
                    - Complains about TIME: "15 minutes", "20 minutes", "half hour"
                    - Uses words: FRUSTRATED, UPSET, ANNOYED, RIDICULOUS, UNACCEPTABLE
                    - Asks "WHAT'S GOING ON", "WHERE'S MY STUFF", "WHEN WILL IT COME"
                    - ANY NEGATIVE EMOTION about service speed
                    
                    ⚠️ IMPORTANT: Even if they mention a parking spot number, if the message contains 
                    complaint language, prioritize call_store_manager over notify_team_arrival!
                    ============================================================
                    
                    PRIORITY 2 - CUSTOMER ARRIVAL (Only if NO complaint detected):
                    - Customer FIRST mentions arriving/parking spot WITHOUT complaints
                    - Simple messages like "I'm here in spot X", "In spot 7"
                    - Call notify_team_arrival - notifies IBM Sterling team
                    
                    PRIORITY 3 - ORDER COMPLETION:
                    - Customer says THANKS/GOT ORDER/RECEIVED IT
                    - Call request_review - sends review URL http://bit.ly/3VE1Nx0
                    
                    ALWAYS call a function. NO text responses without function calls.
                    
                    🔥 REMEMBER: COMPLAINTS = call_store_manager (triggers VAPI call to manager)`
                },
                {
                    role: 'user',
                    content: `Customer message: "${message}"`
                }
            ],
            tools: [
                {
                    "type": "function",
                    "name": "notify_team_arrival",
                    "description": "Customer arrived at store - notify IBM Sterling team",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "parking_spot": { "type": "string", "description": "Parking spot number" },
                            "customer_phone": { "type": "string", "description": "Customer phone number" },
                            "order_number": { "type": "string", "description": "Order number" },
                            "response_message": { "type": "string", "description": "SMS response to customer" }
                        },
                        "required": ["parking_spot", "customer_phone", "order_number", "response_message"],
                        "additionalProperties": false
                    },
                    "strict": true
                },
                {
                    "type": "function", 
                    "name": "call_store_manager",
                    "description": "Customer complaining - trigger VAPI call to store manager",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "complaint_reason": { "type": "string", "description": "Why customer is complaining" },
                            "customer_phone": { "type": "string", "description": "Customer phone number" },
                            "order_number": { "type": "string", "description": "Order number" },
                            "parking_spot": { "type": ["string", "null"], "description": "Parking spot if known" },
                            "response_message": { "type": "string", "description": "SMS response before calling" }
                        },
                        "required": ["complaint_reason", "customer_phone", "order_number", "parking_spot", "response_message"],
                        "additionalProperties": false
                    },
                    "strict": true
                },
                {
                    "type": "function",
                    "name": "request_review", 
                    "description": "Customer received order - request review",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "order_number": { "type": "string", "description": "Order number" },
                            "response_message": { "type": "string", "description": "Review request message with URL" }
                        },
                        "required": ["order_number", "response_message"],
                        "additionalProperties": false
                    },
                    "strict": true
                },
                {
                    "type": "function",
                    "name": "handle_general",
                    "description": "General customer inquiry or unclear message", 
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "response_message": { "type": "string", "description": "Helpful response" }
                        },
                        "required": ["response_message"],
                        "additionalProperties": false
                    },
                    "strict": true
                }
            ],
            tool_choice: 'required'
        });

        // Handle GPT-4.1 response.output format
        for (const item of response.output) {
            if (item.type === 'function_call') {
                const functionName = item.name;
                const functionArgs = JSON.parse(item.arguments);
                
                return {
                    function: functionName,
                    args: functionArgs
                };
            }
        }
        
    } catch (error) {
        console.error('❌ AI Function Call Error:', error);
        return {
            function: 'handle_general',
            args: { 
                response_message: "Hi! I'm Rural King's assistant. How can I help with your pickup today?" 
            }
        };
    }
}

// 🧠 AI RESPONSE GENERATION (GPT-4.1 RESPONSES API)
async function generateResponse(analysis, customerData, orderData) {
    try {
        const response = await openai.responses.create({
            model: 'gpt-4.1',
            input: [
                {
                    role: 'system',
                    content: `You are Rural King's pickup SMS assistant. You MUST respond based on the customer's intent:

                    CUSTOMER: ${customerData.name || 'Customer'}
                    ORDER: #${orderData.order_number}
                    STORE: ${orderData.store_name}
                    
                    RESPONSE RULES:
                    
                    IF INTENT = "ARRIVAL":
                    - Customer arrived at store with parking spot
                    - ALWAYS respond: "✅ Perfect! I've notified the Rural King team that you're in spot [NUMBER].\n\n Your order #[ORDER] will be brought out shortly. If you have any issues, just text back!"
                    - Replace [NUMBER] with parking spot, [ORDER] with order number
                    
                    IF INTENT = "COMPLAINT":
                    - Customer is complaining about waiting/delays
                    - ALWAYS respond: "I'm sorry for the delay.\n\n Let me call the store and check on your order #[ORDER] now."
                    
                    IF INTENT = "ORDER RECEIVED WITH THANKS":
                    - Customer received order or saying thanks
                    - ALWAYS respond: "⭐ Thanks for choosing Rural King! Your order #[ORDER] has been completed. Please leave us a review: http://bit.ly/3VE1Nx0"
                    
                    IF INTENT = "OPT_IN":
                    - Customer said YES to notifications
                    - ALREADY HANDLED - don't generate response
                    
                    IF INTENT = "OTHER":
                    - General questions or unclear messages
                    - Respond helpfully about their order
                    
                    KEEP UNDER 160 CHARACTERS. BE SPECIFIC TO THE INTENT.`
                },
                {
                    role: 'user',
                    content: `INTENT: ${analysis.intent}
SENTIMENT: ${analysis.sentiment}
PARKING_SPOT: ${analysis.parking_spot || 'none'}

Generate the appropriate response based on the rules above.`
                }
            ]
        });

        return response.output_text || response.output[0]?.content || "Hi! How can I help?";
    } catch (error) {
        console.error('❌ Response Generation Error:', error);
        return "Hi! I'm Rural King's assistant. How can I help with your pickup today?";
    }
}

// 🗄️ DATABASE FUNCTIONS
async function getCustomer(phone) {
    const result = await pool.query('SELECT * FROM customers WHERE phone = $1', [phone]);
    return result.rows[0];
}

async function getActiveOrder(customerPhone) {
    const result = await pool.query(
        'SELECT * FROM orders WHERE customer_phone = $1 AND status != $2 ORDER BY created_at DESC LIMIT 1',
        [customerPhone, 'COMPLETED']
    );
    return result.rows[0];
}

async function logConversation(customerId, orderId, phone, messageContent, aiResponse, analysis) {
    await pool.query(
        `INSERT INTO conversations 
         (customer_id, order_id, phone, message_type, message_content, ai_response, sentiment, parking_spot) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [customerId, orderId, phone, 'INBOUND', messageContent, aiResponse, analysis.sentiment, analysis.parking_spot]
    );
}

async function updateOrderStatus(orderId, status) {
    await pool.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, orderId]);
}

// 🚀 RURAL KING ENDPOINTS

// 📦 NEW ORDER ENDPOINT
app.post('/rural-king/new-order', async (req, res) => {
    try {
        const { customer_phone, customer_name, order_id, store_name, store_address } = req.body;
        
        console.log('\n🆕 NEW ORDER RECEIVED:');
        console.log('===================');
        console.log(`Customer: ${customer_name} (${customer_phone})`);
        console.log(`Order: #${order_id}`);
        console.log(`Store: ${store_name}`);
        console.log('===================\n');

        // 📢 Broadcast to demo dashboard
        broadcastNotification(
            'new_order',
            `Order #${order_id} Created`,
            `New order for ${customer_name} at ${store_name}. IBM Sterling has been notified to begin order processing.`
        );

        // Insert/Update customer
        await pool.query(
            `INSERT INTO customers (phone, name, opted_in) 
             VALUES ($1, $2, FALSE) 
             ON CONFLICT (phone) DO UPDATE SET name = $2`,
            [customer_phone, customer_name]
        );

        // Insert order
        await pool.query(
            `INSERT INTO orders (order_number, customer_phone, customer_name, store_name, store_address, status) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [order_id, customer_phone, customer_name, store_name, store_address, 'NEW']
        );

        // Send opt-in SMS
        const optInMessage = `Rural King: Thank you for order #${order_id}!\n\n Reply YES to receive pickup notifications and support for this order. Standard msg rates may apply.`;
        
        const message = await client.messages.create({
            body: optInMessage,
            from: process.env.TWILIO_PHONE, // Rural King SMS number
            to: customer_phone
        });

        console.log(`📱 Opt-in SMS sent: ${message.sid}`);
        
        // Get customer ID for logging
        const customerResult = await pool.query('SELECT id FROM customers WHERE phone = $1', [customer_phone]);
        const customerId = customerResult.rows[0]?.id;
        
        // Log the opt-in request to conversations - THIS IS CRITICAL!
        if (customerId) {
            await pool.query(
                `INSERT INTO conversations (customer_id, order_id, phone, message_content, ai_response, created_at)
                 VALUES ($1, NULL, $2, 'NEW_ORDER_CREATED', $3, NOW())`,
                [customerId, customer_phone, optInMessage]
            );
            console.log('✅ Opt-in request logged to conversations');
        }

        res.json({
            success: true,
            message: 'Order created and opt-in SMS sent',
            order_id: order_id,
            sms_sid: message.sid
        });

    } catch (error) {
        console.error('❌ New Order Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📋 READY FOR PICKUP ENDPOINT
app.post('/rural-king/ready-for-pickup', async (req, res) => {
    try {
        const { customer_phone, customer_name, order_id, store_name } = req.body;
        
        console.log('\n📦 ORDER READY:');
        console.log('===============');
        console.log(`Customer: ${customer_name} (${customer_phone})`);
        console.log(`Order: #${order_id}`);
        console.log('===============\n');

        // 📢 Broadcast to demo dashboard
        broadcastNotification(
            'ready_for_pickup',
            `Order #${order_id} Ready`,
            `Order for ${customer_name} is ready for pickup at ${store_name}. Customer has been notified via SMS.`
        );

        // Check if customer opted in
        const customer = await getCustomer(customer_phone);
        if (!customer || !customer.opted_in) {
            console.log('❌ Customer not opted in, skipping SMS');
            return res.json({ success: false, message: 'Customer not opted in' });
        }

        // Update order status
        await pool.query(
            'UPDATE orders SET status = $1, updated_at = NOW() WHERE order_number = $2',
            ['READY_FOR_PICKUP', order_id]
        );

        // Send ready SMS
        const readyMessage = `Hi ${customer_name}! Your Rural King order #${order_id} is ready.\n\nPark in a Pickup spot & reply: "I'm in spot X". We'll bring it out. ${store_name}`;
        
        const message = await client.messages.create({
            body: readyMessage,
            from: process.env.TWILIO_PHONE,
            to: customer_phone
        });

        console.log(`📱 Ready SMS sent: ${message.sid}`);

        res.json({
            success: true,
            message: 'Ready SMS sent',
            order_id: order_id,
            sms_sid: message.sid
        });

    } catch (error) {
        console.error('❌ Ready SMS Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📱 INTELLIGENT SMS WEBHOOK
app.post('/webhook/sms', async (req, res) => {
    try {
        const { From, To, Body } = req.body;
        
        console.log('\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📱 INCOMING SMS RECEIVED');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📞 From: ${From}`);
        console.log(`📞 To: ${To}`);
        console.log(`💬 Message: ${Body}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Get customer data
        let customer = await getCustomer(From);
        console.log('🔍 Database Lookup Result:');
        console.log('   Customer Found:', customer ? '✅ YES' : '❌ NO');
        if (customer) {
            console.log('   Name:', customer.name);
            console.log('   Phone:', customer.phone);
            console.log('   Opted In (BEFORE):', customer.opted_in ? '✅ YES' : '❌ NO');
            console.log('   Opted In At:', customer.opted_in_at);
        }
        
        // Handle opt-in with conversation context
        if (Body.toLowerCase().trim() === 'yes' && customer && !customer.opted_in) {
            // Check if last message was opt-in request (within last 24 hours)
            const lastOptInCheck = await pool.query(
                `SELECT * FROM conversations 
                 WHERE phone = $1 AND ai_response LIKE '%Reply YES%' 
                 AND created_at > NOW() - INTERVAL '24 hours' 
                 ORDER BY created_at DESC LIMIT 1`,
                [From]
            );
            
            if (lastOptInCheck.rows.length > 0) {
                // UPDATE DATABASE
                await pool.query('UPDATE customers SET opted_in = TRUE, opted_in_at = NOW() WHERE phone = $1', [From]);
                
                // REFRESH customer data after update
                customer = await getCustomer(From);
                
                console.log('\n✅ OPT-IN SUCCESSFUL!');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('   Customer:', customer.name);
                console.log('   Phone:', customer.phone);
                console.log('   Opted In (AFTER):', customer.opted_in ? '✅ YES' : '❌ NO');
                console.log('   Opted In At:', customer.opted_in_at);
                console.log('   ➡️  Customer will now receive all order notifications');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                
                const confirmMessage = `✅ You're now opted in for order notifications. Thank you!`;
                
                const message = await client.messages.create({
                    body: confirmMessage,
                    from: process.env.TWILIO_PHONE, // Rural King SMS number  
                    to: From
                });

                console.log(`📱 Opt-in confirmation sent: ${message.sid}`);
                console.log(`📱 SMS Details: FROM ${process.env.TWILIO_PHONE} TO ${From}\n`);
                
                // Log the opt-in conversation
                await logConversation(customer.id, null, From, Body, confirmMessage, {
                    intent: 'OPT_IN_CONFIRMED',
                    parking_spot: null,
                    sentiment: 'POSITIVE'
                });
                
                // 📢 Broadcast to demo dashboard
                broadcastNotification(
                    'opt_in_confirmed',
                    `${customer.name} Opted In`,
                    `Customer ${customer.name} (${customer.phone}) is now opted in for notifications`
                );
                
                return res.status(200).send('<Response/>');
            } else {
                console.log('❌ YES received but no recent opt-in request found in last 24 hours');
                console.log('   Customer may have said YES to a different question\n');
            }
        }

        // Only respond to opted-in customers
        if (!customer || !customer.opted_in) {
            console.log('\n🚫 IGNORING SMS:');
            console.log('   Reason: Customer not opted in');
            console.log('   Phone:', From);
            console.log('   Customer in DB:', customer ? 'YES' : 'NO');
            console.log('   Opted In:', customer ? (customer.opted_in ? 'YES' : 'NO') : 'N/A');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            return res.status(200).send('<Response/>');
        }

        // Get active order
        const order = await getActiveOrder(From);
        if (!order) {
            console.log('❌ No active order found');
            return res.status(200).send('<Response/>');
        }

        // 🧠 AI FUNCTION CALLING
        console.log('🧠 Processing message with AI Function Calling...');
        const aiResult = await processMessageWithAI(Body, From, customer, order);
        console.log('🤖 AI Function Called:', aiResult.function);
        console.log('📊 Function Args:', aiResult.args);

        let responseMessage = aiResult.args.response_message;
        let shouldTriggerVapi = false;

        // Handle different functions per JD's requirements
        switch (aiResult.function) {
            case 'notify_team_arrival':
                // STEP 4 - Customer arrived - notify store team
                await updateOrderStatus(order.id, 'CUSTOMER_ARRIVED');
                console.log(`🏪 Customer arrived in spot ${aiResult.args.parking_spot}`);
                
                // 📢 Broadcast to demo dashboard
                broadcastNotification(
                    'customer_arrival',
                    `Customer Arrived - Spot ${aiResult.args.parking_spot}`,
                    `${customer.name} has arrived at ${order.store_name} in parking spot ${aiResult.args.parking_spot}. IBM Sterling team has been notified to prepare order #${order.order_number}.`
                );
                
                // Send notification to IBM Sterling (simulated via SMS to store)
                console.log('\n🏪 NOTIFYING IBM STERLING TEAM:');
                console.log('===================================');
                console.log(`Customer: ${From}`);
                console.log(`Order: #${order.order_number}`);
                console.log(`Parking Spot: #${aiResult.args.parking_spot}`);
                console.log(`Status: CUSTOMER_ARRIVED`);
                console.log(`Timestamp: ${new Date().toISOString()}`);
                console.log('===================================\n');
                
                // Send SMS to store team (simulated)
                await client.messages.create({
                    body: `RURAL KING PICKUP ALERT: Customer arrived!\n\nOrder #${order.order_number},\nSpot ${aiResult.args.parking_spot},\nCustomer: ${customer.name}`,
                    from: process.env.TWILIO_PHONE,
                    to: process.env.STORE_MANAGER_PHONE // Store manager
                });
                console.log('📱 Store team notified via SMS');
                break;

            case 'call_store_manager':
                // STEP 5 - Customer complaining - trigger VAPI call
                // 🚨 CRITICAL: Verify customer HAS parking spot before escalating
                console.log('📞 COMPLAINT DETECTED - Checking if customer has arrived...');
                
                // Check if customer already provided parking spot (from conversation history)
                const parkingSpotCheck = await pool.query(
                    `SELECT parking_spot FROM conversations 
                     WHERE phone = $1 AND parking_spot IS NOT NULL 
                     ORDER BY created_at DESC LIMIT 1`,
                    [From]
                );
                
                const hasParkingSpot = parkingSpotCheck.rows.length > 0 && parkingSpotCheck.rows[0].parking_spot;
                
                if (!hasParkingSpot) {
                    // Customer is complaining but hasn't told us their parking spot yet
                    console.log('⚠️ COMPLAINT WITHOUT PARKING SPOT - Asking customer to provide spot first');
                    responseMessage = `I understand you're frustrated. To help you as quickly as possible, please let me know your parking spot number so I can escalate this to the store manager.`;
                    
                    broadcastNotification(
                        'complaint_no_parking_spot',
                        `Complaint Detected - Waiting for Parking Spot`,
                        `Customer ${customer.name} complained about order #${order.order_number} but hasn't provided parking spot yet. Asking for location first.`
                    );
                } else {
                    // Customer has parking spot - escalate to manager
                    shouldTriggerVapi = true;
                    console.log(`✅ Customer in spot ${hasParkingSpot} - Triggering VAPI escalation`);
                    
                    // Update the aiResult with the parking spot from history
                    aiResult.args.parking_spot = hasParkingSpot;
                    
                    broadcastNotification(
                        'complaint_escalation',
                        `Complaint Escalated - VAPI Call Triggered`,
                        `Customer ${customer.name} has complained about wait time for order #${order.order_number}. Customer is in spot ${hasParkingSpot}. Store manager is being contacted via phone call.`
                    );
                }
                break;

            case 'request_review':
                // STEP 6 - Order completed - request review
                await updateOrderStatus(order.id, 'COMPLETED');
                console.log('✅ Order marked as completed');
                
                // 📢 Broadcast to demo dashboard
                broadcastNotification(
                    'order_completed',
                    `Order #${order.order_number} Completed`,
                    `Customer ${customer.name} has confirmed receipt of their order. Review request sent with URL for feedback.`
                );
                break;

            case 'handle_general':
                // General inquiry
                console.log('💬 General inquiry handled');
                
                // 📢 Broadcast to demo dashboard
                broadcastNotification(
                    'general_inquiry',
                    `General Customer Inquiry`,
                    `Customer ${customer.name} sent a general message about order #${order.order_number}. AI assistant provided helpful response.`
                );
                break;
        }

        // Log conversation
        await logConversation(customer.id, order.id, From, Body, responseMessage, {
            intent: aiResult.function,
            parking_spot: aiResult.args.parking_spot || null,
            sentiment: 'NEUTRAL'
        });

        // Send response (FIXED - Direct Twilio API method)
        const message = await client.messages.create({
            body: responseMessage,
            from: process.env.TWILIO_PHONE, // Rural King SMS number
            to: From
        });

        console.log(`📱 Response SMS sent: ${message.sid}`);
        console.log(`📱 SMS Details: FROM ${process.env.TWILIO_PHONE} TO ${From}`);

                // 📞 TRIGGER VAPI CALL IF NEEDED WITH DYNAMIC ORDER DATA
        if (shouldTriggerVapi) {
            console.log('📞 Triggering VAPI call to store manager with order details...');
            
            try {
                // Build dynamic VAPI call with embedded order data (FIXED)
                const vapiCallPayload = {
                    assistantId: process.env.VAPI_STORE_MANAGER_ASSISTANT_ID,
                    customer: { 
                        number: process.env.STORE_MANAGER_PHONE 
                    },
                    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID, // FIXED: Use correct phone number ID from env
                    assistantOverrides: {
                        // Override firstMessage with actual data embedded
                        firstMessage: `Hi, this is Rural King's automated system calling about order ${order.order_number} for customer ${customer.name}. They're currently waiting in parking spot ${aiResult.args.parking_spot || 'unknown'} and have reported an issue with their pickup. Can you help me check on their order status and provide an update?`,
                        
                        // Override system prompt with actual order data
                        model: {
                            provider: "openai",
                            model: "gpt-4",
                            temperature: 0.7,
                            messages: [
                                {
                                    role: "system",
                                    content: `You are Rural King's automated customer service assistant calling the store manager. You help coordinate order pickup issues at our 155 retail locations.

CONTEXT:
- Customer Name: ${customer.name}
- Order Number: ${order.order_number}
- Parking Spot: ${aiResult.args.parking_spot || 'unknown'}
- Store Location: ${order.store_name}
- Customer Complaint: ${Body}
- Timestamp: ${new Date().toLocaleString()}

Your responsibilities:
1. Greet the store manager professionally
2. Explain you're calling about a customer pickup issue
3. Provide the order details and customer complaint (DO NOT mention phone numbers)
4. Ask for status update and estimated resolution time
5. Confirm the customer's parking spot location
6. Before ending the call, provide a brief summary of what will happen next
7. Thank them for their assistance

IMPORTANT: Never read out or mention phone numbers. Focus on order number, customer name, ANY EXTRA ISSUES, and parking spot only.

Be concise, professional, and solution-focused. Always end with a summary of the resolution.

# Guidelines and limitations:
1. Stay focused on why you called, but be polite if manager wants to ask additional questions
2. Only when when directly asked, you may provide concise suggested behavior for the manager in regards to interaction with ${customer.name}
3. Assume the manager is busy and only repeat yourself or summarize statements if absolutely necessary when you're uncertain of their response or intent.
4. You may ask if they want you to recap the conversation (the important parts) if you feel the conversation has had multi-turns and discussed potentially random topics.
5. You're allowed to change your tone and style in family friendly inappropriate ways. Polite refocusing the conversation if the manager's request seems to violate this`
                                }
                            ]
                        },
                        serverUrl: 'https://roking-demo.loca.lt/vapi/call-ended' // FIXED: Use current tunnel URL (PORT 3001)
                    }
                };

                // ENHANCED ERROR HANDLING FOR VAPI CALL
                console.log('🔍 VAPI Payload:', JSON.stringify(vapiCallPayload, null, 2));
                
                const vapiResponse = await fetch('https://api.vapi.ai/call', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(vapiCallPayload)
                });

                const vapiData = await vapiResponse.json();
                
                console.log('📞 VAPI Response Status:', vapiResponse.status);
                console.log('📞 VAPI Response:', JSON.stringify(vapiData, null, 2));
                
                if (vapiResponse.ok && vapiData.id) {
                    console.log('✅ VAPI call initiated successfully:', vapiData.id);
                    
                    // 📢 Broadcast to demo dashboard
                    broadcastNotification(
                        'vapi_call_initiated',
                        `VAPI Call Started - ${vapiData.id}`,
                        `Store manager call initiated for customer ${customer.name}. Order #${order.order_number} complaint escalation in progress.`
                    );

                    // 🚨 SEND SMS ALERT TO MANAGER - CALL STARTED
                    console.log('📱 Sending CALL STARTED alert to manager...');
                    const callStartedMessage = `🚨 RURAL KING ESCALATION - AiPRL Calling Manager NOW!\nCustomer: ${customer.name}\nOrder: #${order.order_number}\nSpot: ${aiResult.args.parking_spot || 'Unknown'}\n\nIssue: ${Body}\nThis issue has been escalated and you are being contacted for resolution.`;
                    const managerStartAlert = await client.messages.create({
                        body: callStartedMessage,
                        from: process.env.TWILIO_PHONE,
                        to: process.env.STORE_MANAGER_PHONE
                    });

                    console.log(`📱 Manager CALL STARTED alert sent: ${managerStartAlert.sid}`);
                    
                    // 📢 Broadcast call started alert to dashboard
                    broadcastNotification(
                        'manager_call_started_alert',
                        `Manager Call Started Alert Sent`,
                        `SMS sent to manager: VAPI call initiated for customer ${customer.name} complaint about order #${order.order_number}`
                    );
                } else {
                    console.error('❌ VAPI call failed:', {
                        status: vapiResponse.status,
                        statusText: vapiResponse.statusText,
                        response: vapiData
                    });
                }

                // Log VAPI call (FIXED: Handle undefined vapiData.id)
                if (vapiData.id) {
                    await pool.query(
                        'INSERT INTO vapi_calls (conversation_id, order_id, call_id, call_status) VALUES ($1, $2, $3, $4)',
                        [null, order.id, vapiData.id, 'INITIATED']
                    );
                    console.log('📊 VAPI call logged to database');
                } else {
                    console.log('⚠️ VAPI call not logged - no call ID returned');
                }

            } catch (vapiError) {
                console.error('❌ VAPI Call Error Details:');
                console.error('Error Message:', vapiError.message);
                console.error('Error Stack:', vapiError.stack);
                console.error('Full Error:', vapiError);
            }
        }

        res.status(200).send('<Response/>');

    } catch (error) {
        console.error('❌ SMS Webhook Error:', error);
        res.status(500).send('<Response/>');
    }
});

// 📞 VAPI END-OF-CALL WEBHOOK
app.post('/vapi/call-ended', async (req, res) => {
    try {
        console.log('\n');
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║  📞 VAPI CALL ENDED WEBHOOK                            ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log('FULL PAYLOAD:', JSON.stringify(req.body, null, 2));
        
        const vapiData = req.body;
        const message = vapiData.message;
        const call = message?.call || vapiData.call;
        const transcript = message?.transcript || vapiData.transcript;
        const summary = message?.summary || vapiData.summary;
        const endedReason = message?.endedReason || vapiData.endedReason;
        const durationSeconds = message?.durationSeconds || vapiData.durationSeconds;
        
        console.log('Call ID:', call?.id);
        console.log('End Reason:', endedReason);
        console.log('Duration:', durationSeconds);
        console.log('Transcript:', transcript);
        console.log('Summary:', summary);
        console.log('=====================================\n');

        // Update VAPI call record
        if (call?.id) {
            await pool.query(
                `UPDATE vapi_calls 
                 SET call_status = $1, transcript = $2, summary = $3, duration_seconds = $4, ended_reason = $5, ended_at = NOW() 
                 WHERE call_id = $6`,
                ['COMPLETED', transcript, summary, Math.round(durationSeconds || 0), endedReason, call.id]
            );
            console.log(`✅ VAPI call record updated: ${call.id}`);
        }

        // Process the call result and send intelligent SMS
        if (transcript) {
            console.log('🔄 PROCESSING CALL RESULT WITH AI...');
            
            // 🧠 AI analysis of call transcript (GPT-4.1 RESPONSES API)
            const response = await openai.responses.create({
                model: 'gpt-4.1',
                input: [
                    {
                        role: 'system',
                        content: `You are Rural King's post-call SMS generator. Based on the store manager's response, create a helpful update message for the customer.
                        
                        Rules:
                        - Keep under 160 characters
                        - Be specific about what the manager said
                        - Include order number
                        - Sound professional but friendly`
                    },
                    {
                        role: 'user',
                        content: `Call transcript: "${transcript}"\nCall summary: "${summary}"\n\nGenerate a customer update SMS:`
                    }
                ]
            });

            const postCallMessage = response.output_text || response.output[0]?.content || "Update from store manager about your order.";
            console.log('🤖 AI Post-call message:', postCallMessage);

            // 📢 Broadcast to demo dashboard
            broadcastNotification(
                'vapi_call_ended',
                `VAPI Call Completed - ${call.id}`,
                `Call with store manager ended. Duration: ${Math.round(durationSeconds || 0)}s. Post-call SMS sent to customer with manager's response.`
            );

            // Send immediate post-call SMS to customer (STEP 7)
            const customerPhone = process.env.CUSTOMER_PHONE; // Customer phone from env
            
            const message = await client.messages.create({
                body: postCallMessage,
                from: process.env.TWILIO_PHONE, // Rural King SMS number
                to: customerPhone
            });

            console.log(`📱 Post-call SMS sent: ${message.sid}`);

            // STEP 7.1: Send delayed RURAL KING ALERT to manager (10 second delay)
            console.log('⏰ Scheduling manager alert in 10 seconds...');
            setTimeout(async () => {
                try {
                    // Get order info from most recent order for customer
                    const orderQuery = await pool.query(
                        'SELECT * FROM orders WHERE customer_phone = $1 ORDER BY created_at DESC LIMIT 1',
                        [customerPhone]
                    );
                    
                    const order = orderQuery.rows[0];
                    if (order) {
                        // Get parking spot from most recent conversation
                        const spotQuery = await pool.query(
                            'SELECT parking_spot FROM conversations WHERE phone = $1 AND parking_spot IS NOT NULL ORDER BY created_at DESC LIMIT 1',
                            [customerPhone]
                        );
                        
                        const parkingSpot = spotQuery.rows[0]?.parking_spot || 'Unknown';
                        
                        const managerAlertMessage = `🚨 RURAL KING ESCALATION - Manager Assigned/Call Ended!\nOrder: #${order.order_number}\nSpot: ${parkingSpot}\nCustomer: ${order.customer_name}\nCall completed at: ${new Date().toLocaleTimeString()}\nStatus: Resolved`;
                        
                        const managerMessage = await client.messages.create({
                            body: managerAlertMessage,
                            from: process.env.TWILIO_PHONE,
                            to: process.env.STORE_MANAGER_PHONE
                        });

                        console.log(`📱 Manager CALL ENDED alert sent: ${managerMessage.sid}`);
                        
                        // 📢 Broadcast to demo dashboard
                        broadcastNotification(
                            'manager_call_ended_alert',
                            `Manager Call Ended Alert Sent`,
                            `SMS sent to manager: VAPI call completed for order #${order.order_number}. Issue resolved.`
                        );
                    }
                } catch (error) {
                    console.error('❌ Error sending manager alert:', error);
                }
            }, 10000); // 10 second delay

            // STEP 8: Send review request SMS to customer (15 second delay total)
            console.log('⭐ Scheduling review request SMS in 15 seconds...');
            setTimeout(async () => {
                try {
                    // Get order info from most recent order for customer
                    const orderQuery = await pool.query(
                        'SELECT * FROM orders WHERE customer_phone = $1 ORDER BY created_at DESC LIMIT 1',
                        [customerPhone]
                    );
                    
                    const order = orderQuery.rows[0];
                    if (order) {
                        const reviewMessage = `⭐ Thanks for choosing Rural King! Your order #${order.order_number} has been completed. Please leave us a review: http://bit.ly/3VE1Nx0`;
                        
                        const reviewSms = await client.messages.create({
                            body: reviewMessage,
                            from: process.env.TWILIO_PHONE,
                            to: customerPhone
                        });

                        console.log(`📱 Review request SMS sent: ${reviewSms.sid}`);
                        
                        // 📢 Broadcast to demo dashboard
                        broadcastNotification(
                            'review_request_sent',
                            `Review Request Sent`,
                            `Customer ${order.customer_name} received review request for completed order #${order.order_number}`
                        );

                        // Update order status to completed
                        await pool.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', ['COMPLETED', order.id]);
                        console.log('✅ Order marked as completed');
                    }
                } catch (reviewError) {
                    console.error('❌ Error sending review request:', reviewError);
                }
            }, 15000); // 15 second delay (5 seconds after manager alert)
        }

        res.json({ 
            success: true, 
            message: 'Call ended webhook processed',
            callId: call?.id,
            processed: true
        });

    } catch (error) {
        console.error('❌ Error processing VAPI webhook:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 🔌 EXTERNAL API ENDPOINTS - COMPLETE CONVERSATION DATA

// 📊 GET ALL CONVERSATIONS FOR UNIFIED INBOX
app.get('/api/conversations', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        // Get all customer conversations with latest message
        const conversations = await pool.query(`
            SELECT DISTINCT ON (c.phone)
                c.phone,
                cust.id as customer_id,
                cust.name as customer_name,
                cust.opted_in,
                cust.opted_in_at,
                cust.created_at as customer_since,
                c.message_content as last_message_content,
                c.ai_response as last_ai_response,
                c.created_at as last_message_at,
                c.sentiment,
                c.parking_spot,
                o.order_number,
                o.store_name,
                o.store_address,
                o.status as order_status,
                COUNT(conv_all.id) as total_messages
            FROM customers cust
            LEFT JOIN conversations c ON cust.phone = c.phone
            LEFT JOIN orders o ON c.order_id = o.id
            LEFT JOIN conversations conv_all ON cust.phone = conv_all.phone
            WHERE cust.phone IS NOT NULL
            GROUP BY c.phone, cust.id, cust.name, cust.opted_in, cust.opted_in_at, 
                     cust.created_at, c.message_content, c.ai_response, c.created_at,
                     c.sentiment, c.parking_spot, o.order_number, o.store_name, 
                     o.store_address, o.status
            ORDER BY c.phone, c.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        // Format for unified inbox
        const unifiedConversations = conversations.rows.map(row => ({
            conversation_id: `vapi_rural_${row.phone}`,
            display_name: row.customer_name || 'Rural King Customer',
            username: row.customer_name || row.phone,
            user_identifier: row.phone,
            avatar_url: null,
            last_message_at: row.last_message_at,
            last_message_content: row.last_message_content || 'New customer',
            _platform: 'VAPI_RURAL',
            source: 'vapi_rural',
            message_count: parseInt(row.total_messages || 0),
            metadata: {
                customer_id: row.customer_id,
                opted_in: row.opted_in,
                opted_in_at: row.opted_in_at,
                customer_since: row.customer_since,
                order_number: row.order_number,
                store_name: row.store_name,
                store_address: row.store_address,
                order_status: row.order_status,
                last_sentiment: row.sentiment,
                last_parking_spot: row.parking_spot,
                platform_type: 'sms_vapi'
            }
        }));

        res.json({
            success: true,
            conversations: unifiedConversations,
            total_count: unifiedConversations.length,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('❌ API Conversations Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 💬 GET ALL MESSAGES FOR A SPECIFIC CUSTOMER
app.get('/api/conversations/:phone/messages', async (req, res) => {
    try {
        const { phone } = req.params;
        const { limit = 100, offset = 0 } = req.query;
        
        console.log(`📱 API Request: Messages for ${phone}`);

        // Get SMS conversations
        const smsMessages = await pool.query(`
            SELECT 
                conv.id,
                conv.phone,
                conv.message_type,
                conv.message_content,
                conv.ai_response,
                conv.sentiment,
                conv.parking_spot,
                conv.created_at,
                cust.name as customer_name,
                o.order_number,
                o.store_name,
                o.status as order_status
            FROM conversations conv
            LEFT JOIN customers cust ON conv.customer_id = cust.id
            LEFT JOIN orders o ON conv.order_id = o.id
            WHERE conv.phone = $1
            ORDER BY conv.created_at ASC
        `, [phone]);

        // Get VAPI calls
        const vapiCalls = await pool.query(`
            SELECT 
                v.id,
                v.call_id,
                v.call_status,
                v.transcript,
                v.summary,
                v.duration_seconds,
                v.ended_reason,
                v.created_at,
                v.ended_at,
                o.order_number,
                o.customer_phone,
                o.customer_name,
                o.store_name
            FROM vapi_calls v
            LEFT JOIN orders o ON v.order_id = o.id
            WHERE o.customer_phone = $1
            ORDER BY v.created_at ASC
        `, [phone]);

        // Format SMS messages for unified format
        const formattedSmsMessages = smsMessages.rows.map(msg => ({
            message_id: `sms_${msg.id}`,
            conversation_id: `vapi_rural_${msg.phone}`,
            message_content: msg.message_content || '',
            message_role: msg.message_type === 'INBOUND' ? 'user' : 'assistant',
            created_at: msg.created_at,
            source: 'vapi_rural',
            message_type: 'sms',
            function_data: {
                message_type: msg.message_type,
                ai_response: msg.ai_response,
                sentiment: msg.sentiment,
                parking_spot: msg.parking_spot,
                order_context: msg.order_number,
                store_context: msg.store_name,
                order_status: msg.order_status
            },
            metadata: {
                customer_name: msg.customer_name,
                phone: msg.phone
            }
        }));

        // Format VAPI calls for unified format
        const formattedVapiCalls = vapiCalls.rows.map(call => ({
            message_id: `vapi_call_${call.id}`,
            conversation_id: `vapi_rural_call_${call.call_id}`,
            message_content: call.transcript || 'VAPI Call - No transcript available',
            message_role: 'system',
            created_at: call.created_at,
            source: 'vapi_rural',
            message_type: 'vapi_call',
            function_data: {
                call_id: call.call_id,
                call_status: call.call_status,
                summary: call.summary,
                duration_seconds: call.duration_seconds,
                ended_reason: call.ended_reason,
                ended_at: call.ended_at,
                order_context: call.order_number,
                store_context: call.store_name
            },
            metadata: {
                customer_name: call.customer_name,
                phone: call.customer_phone,
                call_duration: call.duration_seconds ? `${call.duration_seconds}s` : null
            }
        }));

        // Combine and sort all messages by timestamp
        const allMessages = [...formattedSmsMessages, ...formattedVapiCalls]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        // Apply pagination
        const paginatedMessages = allMessages.slice(offset, offset + limit);

        res.json({
            success: true,
            phone: phone,
            messages: paginatedMessages,
            total_count: allMessages.length,
            sms_count: formattedSmsMessages.length,
            vapi_call_count: formattedVapiCalls.length,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: allMessages.length
            }
        });

    } catch (error) {
        console.error('❌ API Messages Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 👤 GET COMPLETE CUSTOMER PROFILE + HISTORY
app.get('/api/customers/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        
        console.log(`👤 API Request: Customer profile for ${phone}`);

        // Get customer data
        const customer = await pool.query('SELECT * FROM customers WHERE phone = $1', [phone]);
        if (customer.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        // Get all orders
        const orders = await pool.query(`
            SELECT * FROM orders 
            WHERE customer_phone = $1 
            ORDER BY created_at DESC
        `, [phone]);

        // Get conversation stats
        const conversationStats = await pool.query(`
            SELECT 
                COUNT(*) as total_messages,
                COUNT(CASE WHEN message_type = 'INBOUND' THEN 1 END) as inbound_messages,
                COUNT(CASE WHEN sentiment = 'POSITIVE' THEN 1 END) as positive_messages,
                COUNT(CASE WHEN sentiment = 'NEGATIVE' THEN 1 END) as negative_messages,
                MAX(created_at) as last_conversation_at,
                MIN(created_at) as first_conversation_at
            FROM conversations 
            WHERE phone = $1
        `, [phone]);

        // Get VAPI call stats  
        const vapiStats = await pool.query(`
            SELECT 
                COUNT(*) as total_calls,
                SUM(duration_seconds) as total_call_duration,
                MAX(v.created_at) as last_call_at
            FROM vapi_calls v
            LEFT JOIN orders o ON v.order_id = o.id
            WHERE o.customer_phone = $1
        `, [phone]);

        const customerData = customer.rows[0];
        const stats = conversationStats.rows[0];
        const callStats = vapiStats.rows[0];

        res.json({
            success: true,
            customer: {
                id: customerData.id,
                phone: customerData.phone,
                name: customerData.name,
                opted_in: customerData.opted_in,
                opted_in_at: customerData.opted_in_at,
                created_at: customerData.created_at,
                updated_at: customerData.updated_at
            },
            orders: orders.rows,
            conversation_stats: {
                total_messages: parseInt(stats.total_messages || 0),
                inbound_messages: parseInt(stats.inbound_messages || 0),
                positive_messages: parseInt(stats.positive_messages || 0),
                negative_messages: parseInt(stats.negative_messages || 0),
                last_conversation_at: stats.last_conversation_at,
                first_conversation_at: stats.first_conversation_at
            },
            vapi_stats: {
                total_calls: parseInt(callStats.total_calls || 0),
                total_call_duration: parseInt(callStats.total_call_duration || 0),
                last_call_at: callStats.last_call_at
            },
            platform_data: {
                source: 'vapi_rural',
                conversation_id: `vapi_rural_${phone}`,
                _platform: 'VAPI_RURAL'
            }
        });

    } catch (error) {
        console.error('❌ API Customer Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 📊 GET PLATFORM STATISTICS FOR DASHBOARD
app.get('/api/stats', async (req, res) => {
    try {
        console.log('📊 API Request: Platform statistics');

        // Get customer stats
        const customerStats = await pool.query(`
            SELECT 
                COUNT(*) as total_customers,
                COUNT(CASE WHEN opted_in = true THEN 1 END) as opted_in_customers,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as new_customers_24h,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_customers_7d
            FROM customers
        `);

        // Get order stats
        const orderStats = await pool.query(`
            SELECT 
                COUNT(*) as total_orders,
                COUNT(CASE WHEN status = 'NEW' THEN 1 END) as new_orders,
                COUNT(CASE WHEN status = 'READY_FOR_PICKUP' THEN 1 END) as ready_orders,
                COUNT(CASE WHEN status = 'CUSTOMER_ARRIVED' THEN 1 END) as arrived_customers,
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_orders,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as orders_24h
            FROM orders
        `);

        // Get conversation stats
        const conversationStats = await pool.query(`
            SELECT 
                COUNT(*) as total_conversations,
                COUNT(CASE WHEN message_type = 'INBOUND' THEN 1 END) as inbound_messages,
                COUNT(CASE WHEN sentiment = 'POSITIVE' THEN 1 END) as positive_sentiment,
                COUNT(CASE WHEN sentiment = 'NEGATIVE' THEN 1 END) as negative_sentiment,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as conversations_24h
            FROM conversations
        `);

        // Get VAPI call stats
        const vapiStats = await pool.query(`
            SELECT 
                COUNT(*) as total_calls,
                COUNT(CASE WHEN call_status = 'COMPLETED' THEN 1 END) as completed_calls,
                SUM(duration_seconds) as total_call_duration,
                AVG(duration_seconds) as avg_call_duration,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as calls_24h
            FROM vapi_calls
        `);

        const customers = customerStats.rows[0];
        const orders = orderStats.rows[0];
        const conversations = conversationStats.rows[0];
        const vapi = vapiStats.rows[0];

        res.json({
            success: true,
            platform: 'vapi_rural',
            timestamp: new Date().toISOString(),
            customers: {
                total: parseInt(customers.total_customers || 0),
                opted_in: parseInt(customers.opted_in_customers || 0),
                new_24h: parseInt(customers.new_customers_24h || 0),
                new_7d: parseInt(customers.new_customers_7d || 0)
            },
            orders: {
                total: parseInt(orders.total_orders || 0),
                new: parseInt(orders.new_orders || 0),
                ready: parseInt(orders.ready_orders || 0),
                arrived: parseInt(orders.arrived_customers || 0),
                completed: parseInt(orders.completed_orders || 0),
                orders_24h: parseInt(orders.orders_24h || 0)
            },
            conversations: {
                total: parseInt(conversations.total_conversations || 0),
                inbound: parseInt(conversations.inbound_messages || 0),
                positive_sentiment: parseInt(conversations.positive_sentiment || 0),
                negative_sentiment: parseInt(conversations.negative_sentiment || 0),
                conversations_24h: parseInt(conversations.conversations_24h || 0)
            },
            vapi_calls: {
                total: parseInt(vapi.total_calls || 0),
                completed: parseInt(vapi.completed_calls || 0),
                total_duration: parseInt(vapi.total_call_duration || 0),
                avg_duration: parseFloat(vapi.avg_call_duration || 0),
                calls_24h: parseInt(vapi.calls_24h || 0)
            }
        });

    } catch (error) {
        console.error('❌ API Stats Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🔍 SEARCH CONVERSATIONS BY CONTENT
app.get('/api/search', async (req, res) => {
    try {
        const { q, limit = 50, offset = 0 } = req.query;
        
        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
        }

        console.log(`🔍 API Search: "${q}"`);

        // Search SMS conversations
        const searchResults = await pool.query(`
            SELECT DISTINCT
                conv.phone,
                cust.name as customer_name,
                conv.message_content,
                conv.ai_response,
                conv.created_at,
                o.order_number,
                o.store_name,
                o.status as order_status,
                'sms' as result_type
            FROM conversations conv
            LEFT JOIN customers cust ON conv.customer_id = cust.id  
            LEFT JOIN orders o ON conv.order_id = o.id
            WHERE (
                LOWER(conv.message_content) LIKE LOWER($1) OR
                LOWER(conv.ai_response) LIKE LOWER($1) OR
                LOWER(cust.name) LIKE LOWER($1) OR
                LOWER(o.order_number) LIKE LOWER($1)
            )
            
            UNION ALL
            
            SELECT DISTINCT
                o.customer_phone as phone,
                o.customer_name,
                v.transcript as message_content,
                v.summary as ai_response,
                v.created_at,
                o.order_number,
                o.store_name,
                o.status as order_status,
                'vapi_call' as result_type
            FROM vapi_calls v
            LEFT JOIN orders o ON v.order_id = o.id
            WHERE (
                LOWER(v.transcript) LIKE LOWER($1) OR
                LOWER(v.summary) LIKE LOWER($1) OR
                LOWER(o.customer_name) LIKE LOWER($1) OR
                LOWER(o.order_number) LIKE LOWER($1)
            )
            
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [`%${q}%`, limit, offset]);

        // Format results
        const formattedResults = searchResults.rows.map(result => ({
            conversation_id: `vapi_rural_${result.phone}`,
            customer_name: result.customer_name,
            phone: result.phone,
            content: result.message_content,
            ai_response: result.ai_response,
            created_at: result.created_at,
            order_number: result.order_number,
            store_name: result.store_name,
            order_status: result.order_status,
            result_type: result.result_type,
            source: 'vapi_rural',
            _platform: 'VAPI_RURAL'
        }));

        res.json({
            success: true,
            query: q,
            results: formattedResults,
            total_results: formattedResults.length,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('❌ API Search Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 📋 GET ALL CUSTOMERS (for demo dashboard)
app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.id,
                c.name,
                c.phone,
                c.opted_in,
                c.opted_in_at,
                c.created_at,
                COUNT(o.id) as total_orders,
                MAX(o.created_at) as last_order_date
            FROM customers c
            LEFT JOIN orders o ON o.customer_phone = c.phone
            GROUP BY c.id, c.name, c.phone, c.opted_in, c.opted_in_at, c.created_at
            ORDER BY c.created_at DESC
        `);
        
        res.json({
            success: true,
            customers: result.rows
        });
    } catch (error) {
        console.error('❌ Get Customers Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 📤 SEND CUSTOM SMS (for demo dashboard)
app.post('/api/send-sms', async (req, res) => {
    try {
        const { to, message, from_name } = req.body;
        
        if (!to || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone number (to) and message are required'
            });
        }
        
        console.log('\n📤 SENDING CUSTOM SMS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📞 To: ${to}`);
        console.log(`💬 Message: ${message}`);
        console.log(`👤 From: ${from_name || 'Demo Dashboard'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const twilioMessage = await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE,
            to: to
        });
        
        console.log(`✅ Custom SMS sent: ${twilioMessage.sid}\n`);
        
        // Log to database if customer exists
        const customer = await getCustomer(to);
        if (customer) {
            await pool.query(
                `INSERT INTO conversations (customer_id, phone, message_content, ai_response, message_type)
                 VALUES ($1, $2, $3, $4, $5)`,
                [customer.id, to, `[MANUAL: ${from_name || 'Dashboard'}]`, message, 'OUTBOUND']
            );
        }
        
        // 📢 Broadcast to demo dashboard
        broadcastNotification(
            'custom_sms_sent',
            'Custom SMS Sent',
            `Message sent to ${to}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`
        );
        
        res.json({
            success: true,
            message: 'SMS sent successfully',
            sid: twilioMessage.sid,
            to: to
        });
    } catch (error) {
        console.error('❌ Send SMS Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🔄 RESET OPT-IN STATUS (for demo purposes)
app.post('/api/reset-optin/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        
        console.log('\n🔄 RESETTING OPT-IN STATUS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📞 Phone: ${phone}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const result = await pool.query(
            'UPDATE customers SET opted_in = FALSE, opted_in_at = NULL WHERE phone = $1 RETURNING *',
            [phone]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found'
            });
        }
        
        const customer = result.rows[0];
        console.log(`✅ Opt-in reset for: ${customer.name} (${phone})\n`);
        
        // 📢 Broadcast to demo dashboard
        broadcastNotification(
            'opt_in_reset',
            `${customer.name} Opt-In Reset`,
            `Customer ${customer.name} (${phone}) opt-in status has been reset for demo purposes`
        );
        
        res.json({
            success: true,
            message: 'Opt-in status reset successfully',
            customer: customer
        });
    } catch (error) {
        console.error('❌ Reset Opt-In Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🏥 Health Check
app.get('/health', async (req, res) => {
    try {
        // Test database connection
        await pool.query('SELECT NOW()');
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            database: 'Connected',
            ai: 'OpenAI Ready',
            sms: 'Twilio Ready'
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error.message
        });
    }
});

server.listen(port, () => {
    console.log('\n🚀 RURAL KING SMART WEBHOOK SERVER STARTED');
    console.log('==========================================');
    console.log(`🌐 Server running on port ${port}`);
    console.log(`🎯 Demo Dashboard: http://localhost:${port}/demo-dashboard.html`);
    console.log('');
    console.log('📱 WEBHOOK ENDPOINTS:');
    console.log(`   SMS Webhook: http://localhost:${port}/webhook/sms`);
    console.log(`   VAPI End-Call: http://localhost:${port}/vapi/call-ended`);
    console.log('');
    console.log('🏪 RURAL KING ENDPOINTS:');
    console.log(`   New Order: POST http://localhost:${port}/rural-king/new-order`);
    console.log(`   Ready Pickup: POST http://localhost:${port}/rural-king/ready-for-pickup`);
    console.log('');
    console.log('🔌 EXTERNAL API ENDPOINTS (Complete Data):');
    console.log(`   All Conversations: GET http://localhost:${port}/api/conversations`);
    console.log(`   Customer Messages: GET http://localhost:${port}/api/conversations/:phone/messages`);
    console.log(`   Customer Profile: GET http://localhost:${port}/api/customers/:phone`);
    console.log(`   All Customers: GET http://localhost:${port}/api/customers`);
    console.log(`   Send Custom SMS: POST http://localhost:${port}/api/send-sms`);
    console.log(`   Reset Opt-In: POST http://localhost:${port}/api/reset-optin/:phone`);
    console.log(`   Platform Stats: GET http://localhost:${port}/api/stats`);
    console.log(`   Search: GET http://localhost:${port}/api/search?q=query`);
    console.log('');
    console.log(`🏥 Health check: http://localhost:${port}/health`);
    console.log('==========================================');
    console.log('💡 FEATURES:');
    console.log('✅ AI-powered SMS analysis (GPT-4.1 Function Calling)');
    console.log('✅ Database-driven opt-in tracking');
    console.log('✅ Intelligent response generation');
    console.log('✅ VAPI call triggering on complaints');
    console.log('✅ Post-call SMS processing');
    console.log('✅ Complete API for external inbox platforms');
    console.log('✅ Interactive dashboard with customer management');
    console.log('✅ Manual SMS sending for demo purposes');
    console.log('✅ Real-time opt-in status tracking');
    console.log('✅ Unified conversation format (ChatRace/Woodstock compatible)');
    console.log('==========================================\n');
});
