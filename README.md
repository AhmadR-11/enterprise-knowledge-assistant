# Enterprise Knowledge Assistant

An AI-powered, RAG-based (Retrieval-Augmented Generation) internal document Q&A system secured with Role-Based Access Control (RBAC). The project is divided into a robust Node.js/Express backend and a modern Next.js 15 frontend dashboard.

---

## 🏗️ Architecture & Technology Stack

The project follows a modular, layered architecture:

```
                            ┌─────────────────────────────────┐
                            │      Next.js 15 Frontend        │
                            │      (Zustand, Tailwind)        │
                            └────────────────┬────────────────┘
                                             │ HTTP / REST API
                                             ▼
                            ┌─────────────────────────────────┐
                            │     Express.js API Gateway      │
                            │  (JWT, Role & Space Middleware) │
                            └───────┬─────────────────┬───────┘
                                    │                 │
            ┌───────────────────────┘                 └───────────────────────┐
            ▼                                                                 ▼
┌───────────────────────┐                                             ┌───────────────────────┐
│     Neon PostgreSQL   │                                             │     MongoDB Atlas     │
│ (Users, Spaces, RAG   │                                             │    (Audit Logs,       │
│ Vector Chunks Index)  │                                             │  Document Metadata)   │
└───────────────────────┘                                             └───────────────────────┘
```

### Backend (Layered Controller-Service-Model Pattern)
* **Core:** Node.js, Express.js
* **Relational DB:** PostgreSQL (Neon DB) for access control, users, spaces, and mappings
* **Vector DB:** `pgvector` extension in PostgreSQL for storing text chunks and 1536-dimensional document embeddings (`text-embedding-3-small`)
* **NoSQL DB:** MongoDB Atlas for system-wide structured audit logs and document ingestion status metadata
* **AI Ingestion:** OpenAI SDK for generating text embeddings

### Frontend (Modern App Router Dashboard)
* **Core:** Next.js 15, React 18, TypeScript
* **State Management:** Zustand (lightweight, client-side store)
* **Styling:** Tailwind CSS (Custom Dark Navy/Indigo UI design system)
* **API Client:** Axios (configured with automated request interceptors for JWT Bearer headers and automatic 401 redirect handling)

---

## 📂 Project Directory Structure

```
enterprise-knowledge-assistant/
├── backend/
│   ├── src/
│   │   ├── config/             # Database & Client Initializations
│   │   │   ├── db.mongo.js     # MongoDB Mongoose connection
│   │   │   ├── db.postgres.js  # PostgreSQL pg pool pooler
│   │   │   └── openai.js       # OpenAI API client configuration
│   │   ├── models/             # Database Access Layer
│   │   │   ├── mongo/          # MongoDB Models (Document, AuditLog, ChatSession)
│   │   │   └── postgres/       # PostgreSQL Models (User, Space, UserSpaces, Chunks)
│   │   ├── controllers/        # Request Handlers
│   │   ├── middleware/         # Auth, RBAC, Space membership & Error filters
│   │   ├── routes/             # Express Route declarations
│   │   ├── services/           # Ingestion pipeline & Vector operations
│   │   ├── utils/              # Text extractors & Chunking algorithms
│   │   └── app.js              # Express app initialization
│   ├── seed.js                 # Admin account database seeder
│   ├── verify_fr0.js           # FR-0 core integration tests
│   └── verify_fr1.js           # FR-1 admin requirements integration tests
│
├── frontend/
│   ├── app/                    # Next.js App Router Structure
│   │   ├── (auth)/             # Login & register authentication routes
│   │   ├── (dashboard)/        # Layout-wrapped authenticated dashboard routes
│   │   │   ├── dashboard/      # Main admin overview page
│   │   │   ├── admin/          # Admin CRUD (Users, Spaces, Audit Logs)
│   │   │   ├── documents/      # Document uploading & reprocessing table
│   │   │   └── chat/           # Chat window stub
│   │   └── globals.css         # Styling, tokens, animations, and transitions
│   ├── components/             # Reusable UI component modules
│   ├── lib/                    # Authentication helpers & API Axios interceptors
│   └── types/                  # Shared TypeScript interface definitions
```

---

## ⚙️ Setup & Configuration

### Prerequisites
* [Node.js](https://nodejs.org/) (v18.x or higher)
* [PostgreSQL](https://www.postgresql.org/) database with the `pgvector` extension enabled
* [MongoDB](https://www.mongodb.com/) instance (Atlas recommended)
* [OpenAI API Key](https://platform.openai.com/)

### 1. Backend Configuration
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
PG_CONNECTION_STRING=postgresql://user:pass@host/dbname?sslmode=verify-full
JWT_SECRET=your_secure_jwt_random_string
OPENAI_API_KEY=sk-proj-your_openai_api_key_here
```

### 2. Frontend Configuration
Create a `.env.local` file in the `frontend/` directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

---

## 🚀 Running the Application

### 1. Install Dependencies
```bash
# Install backend packages
cd backend
npm install

# Install frontend packages
cd ../frontend
npm install
```

### 2. Seed Admin User Account
Before starting the backend for the first time, run the seed script to create a secure root admin user:
```bash
cd backend
node seed.js
```
* **Default Credentials:**
  * 📧 **Email:** `admin@company.com`
  * 🔑 **Password:** `Admin@1234`

### 3. Start Development Servers

Run the backend server:
```bash
cd backend
npm run dev
```

In a separate terminal window, start the Next.js development server:
```bash
cd frontend
npm run dev
```

Visit the application at **[http://localhost:3000](http://localhost:3000)**.

---

## 🧪 Running Integration Tests

Two automated test suites are provided to verify the implementation against functional requirements:

```bash
cd backend

# Test core authentication, registration, RBAC, and Audit Logging (FR-0)
node verify_fr0.js

# Test Admin actions: Space CRUD, User management, Document processing, Ingestion & Stats (FR-1)
node verify_fr1.js
```

---

## 🛠️ API Documentation

### Authentication (`/api/auth`)
* `POST /register` - Register a new account
* `POST /login` - Log in and obtain a JWT session token

### Spaces (`/api/spaces`)
* `GET /my` - List spaces accessible to the user
* `POST /` - Create a space (Admin only)
* `PATCH /:id` - Rename a space (Admin only)
* `DELETE /:id` - Delete a space (Admin only)
* `POST /assign` - Assign a user to a space (Admin only)
* `DELETE /assign` - Remove a user from a space (Admin only)
* `GET /:spaceId/users` - Get all users assigned to a space (Member/Admin)

### Users (`/api/users`)
* `GET /` - List all users in the system (Admin only)
* `POST /` - Direct account creation (Admin only)
* `PATCH /:id/role` - Update a user's role (Admin only)
* `DELETE /:id` - Delete a user (Admin only)

### Documents (`/api/documents`)
* `POST /` - Upload file (Admin / Editor; expects `multipart/form-data`)
* `GET /` - List documents in a space
* `DELETE /:id` - Delete a document
* `POST /:id/reprocess` - Force re-chunking and re-embedding (Admin only)

### Audit & Statistics (`/api/audit`)
* `GET /` - Fetch filterable audit trails (Admin only)
* `GET /stats` - Retrieve usage analytics (Admin only)