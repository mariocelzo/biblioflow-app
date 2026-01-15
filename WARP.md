# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

BiblioFlow is a Progressive Web App (PWA) for university library management, developed as an HCI (Human-Computer Interaction) project. The system focuses on **User-Centered Design** principles and addresses specific pain points through three core scenarios:

1. **Commuter Flexibility**: Dynamic tolerance margin for late check-ins (30-minute extension for commuter students)
2. **Physical Accessibility**: Interactive map with visual filters for accessibility features (wheelchair access, electrical outlets)
3. **Click & Collect**: "Preparamelo" service for book preparation with staff dashboard management

The architecture combines Next.js App Router, PostgreSQL with Prisma ORM, and NextAuth.js v5 for authentication.

## Development Commands

### Essential Commands
```bash
# Development server (runs on http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint
```

### Database Management
```bash
# Generate Prisma Client (auto-runs on npm install)
npm run db:generate

# Push schema changes to database (development)
npm run db:push

# Seed database with sample data
npm run db:seed

# Open Prisma Studio GUI for database inspection
npm run db:studio
```

### Utilities
```bash
# Generate secure secrets for NEXTAUTH_SECRET and CRON_SECRET
npm run generate:secrets
```

### Docker (Local Development)
```bash
# Start PostgreSQL and Redis containers
docker-compose up -d

# Stop containers
docker-compose down

# View logs
docker-compose logs -f

# Access Adminer (database GUI) at http://localhost:8080
```

## Architecture & Key Concepts

### Authentication & Authorization (NextAuth.js v5)
- **Configuration**: `src/lib/auth.ts`
- **Middleware**: `src/middleware.ts` - Edge-compatible authentication guard
- **Providers**: 
  - Credentials (email/password with bcrypt)
  - Google OAuth (for university login)
- **Session Management**: JWT-based sessions with custom user fields (`isPendolare`, `necessitaAccessibilita`)
- **Role-Based Access Control (RBAC)**: `STUDENTE`, `BIBLIOTECARIO`, `ADMIN`
- **Protected Routes**: All routes except `/`, `/login`, `/registrazione`, `/recupera-password` require authentication
- **API Protection**: Admin routes in `/api/admin/*` check user role via `auth()` helper

### Database Schema (Prisma)
- **Location**: `prisma/schema.prisma`
- **Provider**: PostgreSQL
- **Key Models**:
  - `User`: Extended with accessibility preferences (`necessitaAccessibilita`, `altoContrasto`, `riduzioneMovimento`, `darkMode`, `dimensioneTesto`) and commuter status (`isPendolare`)
  - `Sala`: Library rooms with opening hours and capacity
  - `Posto`: Individual seats with coordinates and accessibility features (`isAccessibile`, `haPresaElettrica`, `tavoloRegolabile`)
  - `Prenotazione`: Seat reservations with states (`CONFERMATA`, `CHECK_IN`, `COMPLETATA`, `CANCELLATA`, `NO_SHOW`, `SCADUTA`)
  - `Prestito`: Book loans with renewal tracking
  - `RichiestaPreparazione`: Click & Collect workflow states (`PENDENTE`, `IN_LAVORAZIONE`, `PRONTA_RITIRO`)
  - `Notifica`: User notifications with types and action URLs
  - `LogEvento`: System audit trail

### Real-Time Features
- **SSE (Server-Sent Events)**: Lightweight alternative to WebSockets
  - **Emitter**: `src/lib/sse-emitter.ts` - Singleton service for broadcasting events
  - **Events Service**: `src/lib/realtime-events.ts` - Helper functions for emitting domain events
  - **API Endpoint**: `/api/sse/posti` - Stream for seat availability updates
  - **Usage Pattern**: 
    - Server: `emitPostoUpdate(postoId, 'OCCUPATO', numero, salaId)` after DB changes
    - Client: Hook into SSE endpoint to receive live updates

### Automation System
- **Service**: `src/lib/automation-service.ts`
- **Automated Tasks**:
  1. **Check-in Reminders**: Sent 15 minutes before reservation start time
  2. **Loan Expiry Alerts**: Sent 3 days before and 1 day before due date
  3. **No-Show Release**: Automatically cancels reservations 15 minutes after start time without check-in
  4. **Seat Availability Notifications**: Notifies waiting users when seats become available
- **Cron Execution**:
  - **Endpoint**: `/api/cron/automations` (GET/POST)
  - **Protection**: Requires `Authorization: Bearer <CRON_SECRET>` header
  - **Schedule**: Configured in `vercel.json` to run daily at 9 AM UTC (`0 9 * * *`)
  - **Local Testing**: Call endpoint manually with cron secret from `.env`

### Accessibility System
- **Context Provider**: `src/contexts/accessibility-context.tsx`
- **User Preferences Stored in DB**: `necessitaAccessibilita` flag enables enhanced mode
- **Features**:
  - High contrast mode
  - Reduced motion
  - Large text (16-24px configurable)
  - Screen reader support
  - Keyboard navigation (always enabled)
  - Dark mode
- **Implementation**: Settings applied as CSS classes on `document.documentElement` (`.accessibility-mode`, `.high-contrast`, `.reduce-motion`, `.large-text`)
- **Synced with User Profile**: Loaded from `/api/profilo` endpoint on session start

### API Routes Structure
- **Pattern**: Next.js App Router convention (`/src/app/api/*/route.ts`)
- **Organization**:
  - `/api/auth/*` - NextAuth.js handlers (public)
  - `/api/admin/*` - Admin-only endpoints (role check required)
  - `/api/cron/*` - Automated job endpoints (secret token required)
  - `/api/sse/*` - Server-Sent Events streams
  - `/api/posti` - Seat management
  - `/api/prenotazioni` - Booking management
  - `/api/prestiti` - Loan management
  - `/api/richieste` - Click & Collect requests
  - `/api/profilo` - User profile and preferences
  - `/api/notifiche` - Notifications

### Frontend Structure
- **Pages**: `src/app/` - Next.js App Router pages
  - `/admin/*` - Protected admin dashboard (layout with role check)
  - `/libri/*` - Book catalog and Click & Collect flow
  - `/prenota/*` - Seat booking flow with interactive map
  - `/prenotazioni/*` - User's reservation history
  - `/prestiti/*` - Active loans
  - `/profilo/*` - User profile and accessibility settings
- **Components**: `src/components/`
  - `/ui/*` - Shadcn/UI base components (Radix UI + Tailwind)
  - `/admin/*` - Admin dashboard widgets
  - `/accessibility/*` - Accessibility-specific components
  - `/layout/*` - Header, navigation, layout wrappers
  - `mappa-biblioteca.tsx` - Interactive seat map with filters
  - `qrcode-checkin.tsx` - QR code check-in component
- **Contexts**: `src/contexts/`
  - `accessibility-context.tsx` - Global accessibility settings

### Styling & UI
- **Framework**: Tailwind CSS v4
- **Component Library**: Shadcn/UI (customizable, accessible components based on Radix UI)
- **Configuration**: `components.json` - Shadcn configuration
- **Theme**: Dark mode support via `next-themes`
- **Path Alias**: `@/*` maps to `./src/*` (configured in `tsconfig.json`)

## Important Patterns & Conventions

### Environment Variables
- **Required Variables**: See `.env.example` for complete list
- **Database**: `DATABASE_URL` - PostgreSQL connection string
- **Auth**: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Cron Jobs**: `CRON_SECRET` - Protect automation endpoints
- **Public Variables**: Must be prefixed with `NEXT_PUBLIC_*`
- **Local Development**: Copy `.env.example` to `.env` and populate values

### Prisma Workflow
1. **Modify Schema**: Edit `prisma/schema.prisma`
2. **Generate Client**: `npm run db:generate` (TypeScript types)
3. **Push Changes**: `npm run db:push` (development) or create migration
4. **Seed Data**: `npm run db:seed` (optional, for development)
5. **Prisma Client Import**: Always use `import { prisma } from '@/lib/prisma'` (singleton instance)

### Database State Machine
- **Reservation States**: `CONFERMATA` → `CHECK_IN` → `COMPLETATA` (or `CANCELLATA`, `NO_SHOW`, `SCADUTA`)
- **Loan States**: `ATTIVO` → `RESTITUITO` (or `SCADUTO`, `RINNOVATO`)
- **Click & Collect States**: `PENDENTE` → `IN_LAVORAZIONE` → `PRONTA_RITIRO` → `COMPLETATA` (or `RIFIUTATA`, `CANCELLATA`)
- **Seat States**: `DISPONIBILE` ↔ `OCCUPATO` / `MANUTENZIONE` / `RISERVATO`

### Real-Time Event Pattern
When updating database state that affects real-time clients:
```typescript
// 1. Update database
await prisma.posto.update({ where: { id }, data: { stato: 'OCCUPATO' } });

// 2. Emit real-time event
await emitPostoUpdate(id, 'OCCUPATO', posto.numero, posto.salaId);
await emitOccupazioneUpdate(posto.salaId);
```

### Commuter Student Handling
- **Flag**: `User.isPendolare` (boolean in DB)
- **UI Integration**: Booking flow detects flag and offers 30-minute check-in extension
- **Database Field**: `Prenotazione.margineToleranzaMinuti` (stores custom tolerance)
- **Check-in Logic**: Validation allows check-in up to `oraInizio + margineToleranzaMinuti`

### Accessibility-First Development
- **Always Check**: `session.user.necessitaAccessibilita` flag
- **UI Adaptation**: Components should respect `AccessibilityContext` settings
- **ARIA Labels**: All interactive elements must have proper ARIA attributes
- **Keyboard Navigation**: Tab order and focus management are critical
- **Color Contrast**: Must meet WCAG AA standards (enhanced for high-contrast mode)

### Admin Dashboard
- **Access**: `/admin/*` routes (RBAC check in layout)
- **Features**:
  - Real-time statistics and occupancy charts
  - Anomaly monitoring (no-shows, equipment issues, overdue loans)
  - Kanban-style workflow for Click & Collect requests
  - QR code scanner for check-ins at `/admin/scanner`
  - User management and override capabilities
- **API Endpoints**: Prefix all with `/api/admin/*` and check `auth().user.ruolo === 'ADMIN'`

## Testing & Validation

No test framework is currently configured. To validate changes:

1. **Local Development**:
   - Start dev server: `npm run dev`
   - Test in browser at `http://localhost:3000`
   - Use Prisma Studio for database inspection: `npm run db:studio`

2. **Database Validation**:
   - Check schema: `npx prisma validate`
   - View generated types: `node_modules/.prisma/client/index.d.ts`

3. **Type Checking**:
   - TypeScript compilation: `npx tsc --noEmit`
   - Next.js build includes type checking: `npm run build`

4. **Production Testing**:
   - Deployed at: https://biblioflow-app.vercel.app/
   - Environment variables managed in Vercel dashboard

## Common Workflows

### Adding a New API Route
1. Create `src/app/api/[endpoint]/route.ts`
2. Export `GET`, `POST`, `PUT`, `DELETE` as needed
3. Use `auth()` from `@/lib/auth` to get session
4. Access database via `prisma` from `@/lib/prisma`
5. Return `NextResponse.json({ ... })` with proper status codes
6. Add to middleware public routes if unauthenticated access needed

### Adding a New Database Table
1. Define model in `prisma/schema.prisma`
2. Add relations to existing models if needed
3. Run `npm run db:generate` to update Prisma Client
4. Run `npm run db:push` to update database schema
5. Update `prisma/seed.ts` if sample data needed
6. Create API routes for CRUD operations

### Deploying Changes
- **Platform**: Vercel (connected to Git repository)
- **Automatic Deployments**: Push to `main` branch triggers production build
- **Environment Variables**: Configure in Vercel dashboard
- **Database**: Hosted on Supabase (PostgreSQL)
- **Cron Jobs**: Configured in `vercel.json`, managed by Vercel Cron

### Debugging Real-Time Issues
1. Check SSE client connections: Console logs show connection/disconnection events
2. Verify event emission: Look for `📤 SSE Evento` logs in server console
3. Test SSE endpoint directly: `curl -N http://localhost:3000/api/sse/posti`
4. Confirm `emitPostoUpdate()` calls after database mutations

### Working with Accessibility Features
1. Test with accessibility mode enabled in user profile
2. Verify contrast ratios with browser DevTools
3. Navigate entire flow using only keyboard (Tab, Enter, Space, Escape)
4. Check `AccessibilityContext` state in React DevTools
5. Validate ARIA attributes with axe DevTools extension

## Project Context

- **Course**: Human-Computer Interaction, Master's in Software Engineering
- **Author**: Mario Celzo
- **University**: Università degli Studi di Salerno
- **Methodology**: User-Centered Design with three primary personas
- **Focus Areas**: 
  - Commuter student experience (transportation uncertainty)
  - Physical accessibility (mobility impairments)
  - Time optimization (between-class efficiency)
