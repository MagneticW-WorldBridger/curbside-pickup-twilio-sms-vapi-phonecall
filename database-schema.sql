-- 🚀 RURAL KING DATABASE SCHEMA
-- Diseñado para trackear todo el customer journey

-- 👥 CUSTOMERS TABLE
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    opted_in BOOLEAN DEFAULT FALSE,
    opted_in_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 📦 ORDERS TABLE  
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id),
    customer_phone VARCHAR(20) NOT NULL,
    customer_name VARCHAR(100),
    store_name VARCHAR(100),
    store_address TEXT,
    status VARCHAR(50) DEFAULT 'NEW', -- NEW, READY_FOR_PICKUP, CUSTOMER_ARRIVED, COMPLETED
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 💬 CONVERSATIONS TABLE
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    order_id INTEGER REFERENCES orders(id),
    phone VARCHAR(20) NOT NULL,
    message_type VARCHAR(50), -- INBOUND, OUTBOUND, VAPI_CALL
    message_content TEXT,
    ai_response TEXT,
    sentiment VARCHAR(20), -- POSITIVE, NEGATIVE, NEUTRAL, COMPLAINT
    parking_spot VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 📞 VAPI_CALLS TABLE
CREATE TABLE vapi_calls (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id),
    order_id INTEGER REFERENCES orders(id),
    call_id VARCHAR(100) UNIQUE,
    call_status VARCHAR(50), -- INITIATED, COMPLETED, FAILED
    transcript TEXT,
    summary TEXT,
    duration_seconds INTEGER,
    ended_reason VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP
);

-- 📊 INDEXES for performance
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_conversations_phone ON conversations(phone);
CREATE INDEX idx_conversations_created ON conversations(created_at);
CREATE INDEX idx_vapi_calls_call_id ON vapi_calls(call_id);

-- 🎯 SAMPLE DATA for testing
INSERT INTO customers (phone, name, opted_in, opted_in_at) VALUES 
('+13323339453', 'Jean', TRUE, NOW());

INSERT INTO orders (order_number, customer_phone, customer_name, store_name, store_address, status) VALUES 
('4871', '+13323339453', 'Jean', 'Rural King Matune', '123 Main St, Matune, IL', 'NEW');
