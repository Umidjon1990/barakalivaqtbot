# Overview

Barakali Vaqt is a productivity and time management application designed for Uzbek-speaking users. The application provides task planning, expense tracking, focus timer (Pomodoro-style), and analytics capabilities. It features both a web interface and a Telegram bot for flexible user interaction.

The application is built as a full-stack TypeScript solution with a React frontend, Express backend, PostgreSQL database, and Telegram bot integration. The name "Barakali Vaqt" translates to "Blessed Time" in Uzbek, reflecting the app's purpose of helping users make the most of their time.

# Recent Changes (December 2025)

## New Features Added
- **Task Reminders**: Users can set reminder times when creating tasks (1 hour, 3 hours, evening, tomorrow, or custom time)
- **Budget Limits**: Set spending limits per expense category (weekly/monthly) with automatic warnings when approaching or exceeding limits
- **Goals System**: Create weekly/monthly goals for tasks with progress tracking and visual progress bars
- **Automated Reports**: Daily and weekly reports sent automatically to users based on their settings
- **Settings Menu**: Users can toggle daily/weekly report notifications on/off

## Database Updates
- Added `reminder_time` and `reminder_sent` fields to tasks table
- Created `budget_limits` table for category spending limits
- Created `goals` table for user goals tracking
- Created `user_settings` table for notification preferences

## Scheduler System
- Background scheduler runs every minute to check for pending reminders
- Daily reports sent at user's configured time (default 20:00)
- Weekly reports sent on configured day (default Sunday at 10:00)

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript for the user interface
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- React Query (@tanstack/react-query) for server state management and caching

**UI Component System**
- Shadcn UI component library (New York style) with Radix UI primitives
- Tailwind CSS v4 for styling with custom design tokens
- Custom theme using warm cream and deep green color palette for a serene productivity aesthetic
- DM Sans and Playfair Display fonts for modern typography
- Framer Motion for animations and transitions

**State Management**
- React Query for asynchronous server state
- React hooks for local component state
- No global state management library required

## Backend Architecture

**Server Framework**
- Express.js as the HTTP server
- Node.js runtime with ESM modules
- HTTP server created separately to support potential WebSocket upgrades

**API Design**
- RESTful API endpoints under `/api` prefix
- JSON request/response format
- Zod schema validation for request payloads
- Error responses with descriptive messages

**Key API Routes**
- `/api/tasks` - CRUD operations for tasks with optional telegram user filtering
- `/api/expenses` - Expense management with category support
- `/api/expense-categories` - Custom expense category management

**Middleware & Features**
- Express JSON body parsing with raw body preservation (for webhook verification)
- Request logging with duration tracking
- CORS handling for development
- Static file serving for production builds

**Scheduler System**
- Background scheduler for automated tasks (server/scheduler.ts)
- Reminder checking every 60 seconds
- Daily/weekly report checking every 5 minutes
- Integrated with Telegram bot for sending notifications

## Database Architecture

**Database System**
- PostgreSQL via Neon serverless (with WebSocket support)
- Drizzle ORM for type-safe database queries
- Connection pooling via @neondatabase/serverless

**Schema Design**
```
users
- id (UUID primary key)
- username (unique)
- password (hashed)

tasks
- id (serial primary key)
- text (task description)
- completed (boolean, default false)
- priority (text: high/medium/low)
- time (optional time association)
- category (optional categorization)
- telegramUserId (optional, for Telegram bot users)
- reminderTime (timestamp, optional)
- reminderSent (boolean, default false)
- createdAt (timestamp)

expenses
- id (serial primary key)
- amount (integer, in smallest currency unit)
- description (text)
- category (text reference)
- telegramUserId (optional, for Telegram bot users)
- createdAt (timestamp)

expense_categories
- id (serial primary key)
- name (category name)
- icon (lucide icon name)
- color (HSL color string)
- telegramUserId (optional, for Telegram bot users)

budget_limits
- id (serial primary key)
- category (text)
- limitAmount (integer)
- period (text: weekly/monthly)
- telegramUserId (required)
- createdAt (timestamp)

goals
- id (serial primary key)
- title (text)
- targetCount (integer)
- currentCount (integer, default 0)
- type (text: tasks/expenses)
- period (text: weekly/monthly)
- telegramUserId (required)
- startDate (timestamp)
- endDate (timestamp)
- createdAt (timestamp)

user_settings
- id (serial primary key)
- telegramUserId (unique, required)
- dailyReportEnabled (boolean, default true)
- dailyReportTime (text, default "20:00")
- weeklyReportEnabled (boolean, default true)
- weeklyReportDay (text, default "sunday")
- timezone (text, default "Asia/Tashkent")
- createdAt (timestamp)
```

**Data Access Pattern**
- Repository pattern implemented via DatabaseStorage class
- Methods support optional telegramUserId filtering for multi-tenant data isolation
- All database operations return typed entities based on Drizzle schema
- Security: All mutations verify ownership via telegramUserId in WHERE clauses

**Migration Strategy**
- Drizzle Kit for schema migrations
- Migrations stored in `/migrations` directory
- Push-based deployment via `db:push` script

## Authentication & Authorization

**Current State**
- User schema exists but authentication is not fully implemented
- Telegram bot users identified by telegramUserId field
- No session management or JWT tokens in current implementation

**Design Considerations**
- User credentials stored with hashed passwords
- Prepared for future authentication implementation
- Telegram users operate independently from web users

## External Dependencies

**Telegram Bot Integration**
- Telegraf framework for bot development
- Bot token via TELEGRAM_BOT_TOKEN environment variable
- Conversational state management using in-memory Map
- Interactive inline keyboards for user navigation
- Supports task management, expense tracking, and statistics via chat interface
- Per-user data isolation using telegramUserId for security
- Bot commands:
  - /start - Welcome message and main menu
  - /menu - Show main menu with inline keyboard buttons
- Main menu features:
  - 📋 Rejalar (Tasks) - Add, view, complete, delete tasks with priority levels and reminders
  - 💰 Xarajatlar (Expenses) - Add, view, delete expenses with categories and budget warnings
  - 🎯 Maqsadlar (Goals) - Create and track weekly/monthly goals with progress bars
  - 💳 Byudjet (Budget) - Set spending limits per category with status tracking
  - 📊 Statistika (Statistics) - View task, expense, and goal summaries
  - ⚙️ Sozlamalar (Settings) - Toggle daily/weekly report notifications

**Cloud Services**
- Neon Database (PostgreSQL-compatible serverless database)
- WebSocket connection for Neon serverless
- Environment variable DATABASE_URL for connection string

**Development Tools**
- Replit-specific plugins for development experience:
  - vite-plugin-runtime-error-modal for error overlays
  - vite-plugin-cartographer for code navigation
  - vite-plugin-dev-banner for environment awareness
- Custom vite-plugin-meta-images for OpenGraph image URL updates

**UI & Styling Libraries**
- Extensive Radix UI components (@radix-ui/react-*)
- Tailwind CSS with autoprefixer
- Class variance authority for variant-based styling
- Lucide React for icons
- Recharts for data visualization

**Validation & Utilities**
- Zod for runtime schema validation
- drizzle-zod for generating schemas from database models
- date-fns for date manipulation
- nanoid for unique ID generation

**Build & Bundle Strategy**
- Vite for client bundling with React plugin
- ESBuild for server bundling with selective dependency bundling
- Allowlist of dependencies bundled with server to reduce cold start times
- Two-stage build: client (Vite) then server (ESBuild)
- Production output: dist/public (client), dist/index.cjs (server)

**Environment Configuration**
- NODE_ENV for environment detection
- DATABASE_URL for database connection (required)
- TELEGRAM_BOT_TOKEN for Telegram bot (required)
- REPL_ID for Replit-specific features
