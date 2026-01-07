# 📱 Complete Message Flow Documentation - Inbox.js

## Overview
This document explains the complete flow of how messages are sent from the website (Inbox.js) and where they are stored in the database.

---

## 🔄 **COMPLETE MESSAGE SENDING FLOW**

### **Step 1: User Types and Sends Message in Inbox.js**

**Location:** `frontend/aisensy/src/pages/Inbox.js`
**Function:** `handleSendMessage()` (line ~645)

**What happens:**
1. User types message in the input field
2. User clicks "Send" button
3. `handleSendMessage()` function is triggered

---

### **Step 2: Frontend Makes TWO API Calls**

**Location:** `frontend/aisensy/src/pages/Inbox.js` (lines 658-680)

#### **API Call #1: Send via WhatsApp (MetaMessage API)**
```javascript
await sendMetaMessage(phone, text);
```

**Service:** `frontend/aisensy/src/services/metaMessageService.js`
- **Endpoint:** `POST http://localhost:5000/messages/send`
- **Purpose:** Sends message to WhatsApp via AiSensy API
- **Backend Route:** `backend/routes/metaMessageRoutes.js` → `POST /messages/send`
- **Backend Controller:** `backend/controllers/metaMessageController.js` → `sendMessage()`

**What happens in backend:**
1. Validates phone and text/template
2. Calls `aisensyService.sendMessage()` to send to WhatsApp
3. **SAVES TO DATABASE:**
   - ✅ **`meta_messages` table** (line 76-82)
     - `phone`, `direction: 'outbound'`, `message_type`, `message_text`, `status: 'sent'`
   - ✅ **`messages` table** (line 110-116)
     - `contactId`, `content`, `type: 'outgoing'`, `status: 'sent'`, `sentAt`
   - ✅ **`contacts` table** (line 93-107)
     - Finds or creates contact
     - Updates `lastContacted` timestamp

#### **API Call #2: Send via Inbox API**
```javascript
await sendMessage(phone, text);
```

**Service:** `frontend/aisensy/src/services/inboxService.js`
- **Endpoint:** `POST http://localhost:5000/api/inbox/send`
- **Purpose:** Saves message to inbox database
- **Backend Route:** `backend/routes/inboxRoutes.js` → `POST /api/inbox/send`
- **Backend Controller:** `backend/controllers/inboxController.js` → `sendMessage()`

**What happens in backend:**
1. Validates phone and text
2. Finds or creates contact in `contacts` table
3. Sends message via AiSensy service (optional)
4. **SAVES TO DATABASE:**
   - ✅ **`messages` table** (line 263-270)
     - `contactId`, `content`, `type: 'outgoing'`, `status: 'sent'` or `'failed'`, `sentAt`
   - ✅ **`contacts` table** (line 273-275)
     - Updates `lastContacted` timestamp

---

## 📊 **DATABASE TABLES INVOLVED**

### **1. `meta_messages` Table**
**Purpose:** Stores all WhatsApp API messages (both inbound and outbound)

**When message is saved:**
- ✅ When sent via `metaMessageController.sendMessage()` (WhatsApp API)
- ✅ When received via webhook (inbound messages)

**Fields saved:**
- `id` - Auto increment
- `phone` - Recipient/sender phone number
- `direction` - 'inbound' or 'outbound'
- `message_type` - 'text', 'template', 'image', etc.
- `message_text` - Message content
- `status` - 'sent', 'delivered', 'read', 'failed'
- `created_at` - Timestamp

**Location in code:**
- Save: `backend/controllers/metaMessageController.js` line 76
- Fetch: `backend/controllers/metaMessageController.js` → `getAllMetaMessages()`

---

### **2. `messages` Table**
**Purpose:** Stores messages for the inbox feature (user-facing chat)

**When message is saved:**
- ✅ When sent via `metaMessageController.sendMessage()` (saves to inbox)
- ✅ When sent via `inboxController.sendMessage()` (inbox API)
- ✅ When received via webhook (inbound messages saved to inbox)

**Fields saved:**
- `id` - Auto increment
- `contactId` - Foreign key to `contacts` table
- `content` - Message text content
- `type` - 'incoming' or 'outgoing'
- `status` - 'sent', 'delivered', 'read', 'failed'
- `sentAt` - When message was sent
- `deliveredAt` - When message was delivered (from webhook)
- `readAt` - When message was read (from webhook)
- `createdAt` - Record creation timestamp
- `updatedAt` - Record update timestamp

**Location in code:**
- Save (MetaMessage): `backend/controllers/metaMessageController.js` line 110
- Save (Inbox): `backend/controllers/inboxController.js` line 263
- Fetch: `backend/controllers/inboxController.js` → `getContactMessages()`

---

### **3. `contacts` Table**
**Purpose:** Stores contact information for users

**When contact is created/updated:**
- ✅ When sending message via `metaMessageController.sendMessage()` (if contact doesn't exist)
- ✅ When sending message via `inboxController.sendMessage()` (if contact doesn't exist)
- ✅ When receiving inbound message via webhook (if contact doesn't exist)

**Fields saved:**
- `id` - Auto increment
- `userId` - Foreign key to `users` table
- `phone` - Contact phone number
- `name` - Contact name (defaults to phone if not provided)
- `email` - Contact email (optional)
- `status` - 'active', 'inactive', etc.
- `lastContacted` - Last message timestamp
- `createdAt` - Record creation timestamp
- `updatedAt` - Record update timestamp

**Location in code:**
- Create/Find: `backend/controllers/metaMessageController.js` line 93-107
- Create/Find: `backend/controllers/inboxController.js` line 236-251

---

### **4. `webhook_logs` Table**
**Purpose:** Stores all webhook events received from AiSensy

**When webhook is saved:**
- ✅ When AiSensy sends webhook (message_received, message_delivered, message_read, etc.)

**Fields saved:**
- `id` - Auto increment
- `event_type` - 'message_received', 'message_delivered', 'message_read', etc.
- `payload` - JSON payload from webhook
- `received_at` - When webhook was received
- `created_at` - Record creation timestamp

**Location in code:**
- Save: `backend/controllers/metaWebhookController.js` → `handleWebhook()`
- Fetch: `backend/controllers/metaWebhookController.js` → `getWebhookLogs()`

---

## 🔍 **HOW MESSAGES ARE DISPLAYED IN INBOX**

### **Step 1: Fetch Inbox List**
**Location:** `frontend/aisensy/src/pages/Inbox.js` → `fetchInboxList()`

**API Call:**
- **Endpoint:** `GET http://localhost:5000/api/inbox`
- **Backend:** `backend/controllers/inboxController.js` → `getInboxList()`

**What it does:**
1. Queries `contacts` table for all contacts with messages
2. Also queries `meta_messages` table for contacts without Contact records
3. Gets last message from either `messages` table or `meta_messages` table
4. Calculates unread count from `messages` table
5. Returns list of contacts with last message preview

**SQL Query:**
- Combines data from `contacts`, `messages`, and `meta_messages` tables
- Uses `COALESCE` to get last message from either table
- Orders by `lastMessageTime` DESC

---

### **Step 2: Fetch Messages for Selected Contact**
**Location:** `frontend/aisensy/src/pages/Inbox.js` → `fetchMessages()`

**API Calls (3 parallel calls):**

#### **Call #1: Get Messages from Messages Table**
- **Endpoint:** `GET http://localhost:5000/api/inbox/{phone}/messages`
- **Backend:** `backend/controllers/inboxController.js` → `getContactMessages()`
- **Returns:** Messages from `messages` table for the contact

#### **Call #2: Get All Meta Messages**
- **Endpoint:** `GET http://localhost:5000/messages/all?phone={phone}`
- **Backend:** `backend/controllers/metaMessageController.js` → `getAllMetaMessages()`
- **Returns:** All messages from `meta_messages` table for the phone number

#### **Call #3: Get Webhook Logs**
- **Endpoint:** `GET http://localhost:5000/webhooks/logs?phone={phone}`
- **Backend:** `backend/controllers/metaWebhookController.js` → `getWebhookLogs()`
- **Returns:** Webhook logs from `webhook_logs` table filtered by phone

**What happens:**
1. All three API calls are made in parallel
2. Messages are converted to a unified format
3. Messages are merged and deduplicated
4. Optimistic messages (sent but not yet confirmed) are preserved
5. Messages are sorted by timestamp
6. Final merged list is displayed in the chat window

---

## 📋 **SUMMARY: WHERE MESSAGES ARE SAVED**

### **When you send a message from Inbox.js:**

1. **`meta_messages` table** ✅
   - Saved by: `metaMessageController.sendMessage()`
   - Purpose: WhatsApp API message log
   - Direction: 'outbound'

2. **`messages` table** ✅ (saved TWICE)
   - Saved by: `metaMessageController.sendMessage()` (line 110)
   - Saved by: `inboxController.sendMessage()` (line 263)
   - Purpose: Inbox chat messages
   - Type: 'outgoing'

3. **`contacts` table** ✅ (created/updated)
   - Created/Updated by: Both controllers
   - Purpose: Contact information
   - Updates: `lastContacted` timestamp

---

## 🎯 **KEY POINTS**

1. **Messages are saved to BOTH `meta_messages` AND `messages` tables** when sent via MetaMessage API
2. **Messages are saved to `messages` table** when sent via Inbox API
3. **Contact is created automatically** if it doesn't exist
4. **Inbox displays messages from multiple sources:**
   - `messages` table (primary)
   - `meta_messages` table (fallback)
   - `webhook_logs` table (for debugging/display)
5. **Messages are merged and deduplicated** before display
6. **Optimistic updates** show messages immediately before server confirmation

---

## 🔗 **API ENDPOINTS SUMMARY**

| Endpoint | Method | Purpose | Saves To |
|----------|--------|---------|----------|
| `/messages/send` | POST | Send via WhatsApp API | `meta_messages`, `messages`, `contacts` |
| `/api/inbox/send` | POST | Send via Inbox API | `messages`, `contacts` |
| `/api/inbox` | GET | Get inbox list | Reads from `contacts`, `messages`, `meta_messages` |
| `/api/inbox/{phone}/messages` | GET | Get contact messages | Reads from `messages` table |
| `/messages/all` | GET | Get all meta messages | Reads from `meta_messages` table |
| `/webhooks/logs` | GET | Get webhook logs | Reads from `webhook_logs` table |

---

## 📝 **EXAMPLE FLOW**

```
User types "Hello" and clicks Send
    ↓
handleSendMessage() in Inbox.js
    ↓
1. sendMetaMessage(phone, "Hello")
   → POST /messages/send
   → metaMessageController.sendMessage()
   → aisensyService.sendMessage() (sends to WhatsApp)
   → SAVES TO: meta_messages, messages, contacts
    ↓
2. sendMessage(phone, "Hello")
   → POST /api/inbox/send
   → inboxController.sendMessage()
   → SAVES TO: messages, contacts
    ↓
3. Optimistic message added to UI
    ↓
4. fetchMessages() called after 1.5 seconds
   → Fetches from: messages, meta_messages, webhook_logs
   → Merges and displays in chat
```

---

**End of Documentation**

