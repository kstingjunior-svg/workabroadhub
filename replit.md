# WorkAbroad Hub - Project Documentation

## Overview
WorkAbroad Hub is a mobile-first career consultation service that assists individuals with overseas employment and education. It provides 1-on-1 WhatsApp consultations, personalized country and job recommendations, professional application preparation, and a self-managed application tracker. The platform emphasizes professional service fees and explicitly states it does not guarantee employment, focusing on transparent and compliant overseas career support. The project aims to be the leading digital platform for international career mobility, offering comprehensive, AI-powered tools and personalized services to simplify the complex process of working or studying abroad, ultimately empowering users to achieve their global career aspirations.

## User Preferences
- Professional blue/teal color theme
- Mobile-first design
- Prominent legal disclaimers required
- WCAG 2.1 AA accessibility compliance

## System Architecture

### UI/UX Decisions
The platform features a mobile-first design with a professional blue/teal color scheme. Key UI elements include a landing page with legal disclaimers, a user dashboard displaying country cards, detailed country-specific pages, and dedicated sections for payments, additional services, NEA agency verification, student visas, and application tracking. An extensive admin panel, built with Shadcn UI, manages content, users, payments, agencies, and service orders. Multi-language support, including RTL for Arabic, is implemented.

### Technical Implementations
- **Authentication**: Replit Auth handles user authentication.
- **Payment Processing**: M-Pesa (shortcode 4153025, Paybill 4153025) + PayPal Live. M-Pesa uses Safaricom Daraja STK Push and Pull API reconciliation. PayPal uses `@paypal/checkout-server-sdk` with live environment (PAYPAL_ENV=live); credentials stored in secrets PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. Payment method selection is geo-intelligent (Kenya → M-Pesa recommended; international → PayPal recommended). Universal payment gateway service layer in `server/services/payments/`.
- **Content Management**: An admin panel provides CRUD operations for various data entities.
- **NEA Licensed Agencies**: A module for verifying employment agencies, including admin CRUD, bulk CSV upload, public search, expiry notifications, premium add-ons, a Global Agency Registry Map, Legitimacy Score Module, and Public Verification Portal. Features automated license expiry reminders and a manual government override workflow.
- **Agency Marketplace**: A public job marketplace where licensed agencies can post and manage overseas job openings.
- **Government Manual Override System**: A comprehensive workflow for handling NEA government API downtime, including circuit breaker activation, manual verification with evidence uploads, and a public license status endpoint.
- **Service Order Workflow**: Manages career services from intake to delivery, incorporating AI-powered processing (GPT-4o-mini), automated quality checks, and human review.
- **Assisted Apply Mode**: Offers professional application preparation with status tracking and notifications.
- **Notifications**: A push notification system sends updates via SMS/WhatsApp through Twilio.
- **Application Tracker**: Enables users to manage their job applications.
- **Analytics**: Comprehensive tracking of user events, conversions, and statistics via an admin dashboard.
- **AI Career Matching**: Utilizes GPT-4o-mini for personalized career recommendations.
- **Consultation Booking**: Facilitates 1-on-1 WhatsApp consultations.
- **Production Scalability Hardening**: Implements Gzip compression, unique request IDs for log correlation, structured JSON request logging, AI tools rate limiting, async background queues, optimized database queries, and caching for hot routes.
- **CSRF Protection**: Utilizes a double-submit session token pattern for enhanced security on sensitive requests.
- **DDoS Protection (7-Layer Stack)**: Comprehensive DDoS protection including IP banning, bot detection, per-IP spike detection, a global "Under-Attack Mode" circuit breaker, geo-restriction, Slowloris guard, and dynamic rate limiting.
- **Fraud Detection & Blacklist System**: Implements a scam detection engine, a Global Scam Intelligence Network, and an AI Compliance Monitor for risk scoring and anomaly detection.
- **Security Monitoring System**: Automated threat detection for suspicious logins, payment fraud, and API abuse, with AI anomaly detection.
- **Premium Access Control (3-layer)**: `requireAnyPaidPlan` and `requireProPlan` middleware in `server/middleware/requirePlan.ts` enforce paid plan access at the backend. Applied to: `/api/auto-apply/match`, `/api/bulk-apply/generate`, `/api/bulk-apply/submit`, `/api/career-profile/analyze`. Each violation is logged with user_id, endpoint, method, IP, reason, and timestamp. Admin can view recent violations at `GET /api/admin/access-violations`. Security chain: CSRF → isAuthenticated → requireAnyPaidPlan.
- **Payment Security Hardening**: Robust M-Pesa STK Push integration with measures like order-first processing, rate limiting, duplicate payment prevention, callback validation, and detailed audit logs.
- **Subscription Plan Tiers**: Simplified two-tier plan system (FREE / PRO). Pro plan costs KES 4,500 for 360 days. Basic plan is deactivated (existing Basic users retain access). All upgrade flows, modals, and pricing UI have been updated to reflect the FREE vs PRO model only.
- **Conversion Optimization Suite**: A 7-element CRO system including freemium gates, career readiness progress bars, pricing page optimizations, urgency countdown timers, social proof, upgrade prompts, and exit-intent popups.
- **WhatsApp Queue (Outbox)**: Durable `whatsapp_queue` table (`server/whatsapp-queue.ts`) for reliable WhatsApp delivery. `enqueue(phone, message, { source, delayMs })` inserts with 24h deduplication per (phone, source). 5-minute poller fires due rows via Twilio. 15-minute abandonment scanner auto-enqueues re-engagement messages for: (1) pending payments > 2h with no success follow-up, (2) job applications stuck in 'submitted' > 24h. Sources: `abandoned_payment`, `abandoned_application`, `manual`.
- **Flash Sale / Auto Discount System**: Admin-controlled per-service flash sales with server-side price engine (`server/price-engine.ts`). Services table has `flash_sale`, `discount_percent`, `sale_start`, `sale_end` columns. API (`/api/services`) computes and embeds `finalPrice`, `isFlashSale`, `savings` into every response row. `POST /api/admin/flash-sale` toggles sales with duration presets. `GET /api/urgency-stats?code=` returns live viewer estimate + recent purchase count. STK push validates against `finalPrice` (never base price). Payments store `original_price`, `paid_price`, `discount_applied` for audit. Client components: `FlashSaleBadge` (countdown), `PriceDisplay` (strikethrough + savings), `UrgencyStrip` (social proof). Client price engine at `client/src/lib/price-engine.ts` mirrors server logic.
- **Growth Tools Suite**: Provides free career tools such as ATS CV Checker, Job Scam Checker, Visa Sponsorship Jobs listings, CV Templates, and an AI Job Application Assistant, with premium features for paid users. Includes AI Job Matching.
- **Automatic Referral Payouts**: Automated M-Pesa B2C payout system for referral commissions.
- **Trust Pages**: Dedicated pages for "About Us," "Contact," and "FAQ," providing company information, support, and legal compliance details.
- **Visa & Immigration Guides**: Comprehensive public guides for various countries, covering visa types, eligibility, application steps, costs, and official links.
- **Bulk Job Application System**: An AI-powered bulk application engine allowing users to generate and submit applications for multiple jobs efficiently.
- **AI Visa Assistant**: A freemium AI chat (GPT-4o-mini) for visa and immigration questions, with usage limits based on subscription tiers.
- **Green Card Guide**: A comprehensive public guide to the USA Diversity Visa (DV) Lottery program, covering eligibility, application process, and scam warnings.

### System Design Choices
- **Database**: PostgreSQL with Drizzle ORM.
- **Frontend**: Vite with React, using TanStack Query.
- **Backend**: Express.js with a structured API.
- **Security**: Utilizes Helmet.js, rate limiting, secure session management, Zod for input validation, and Drizzle ORM for SQL injection protection.
- **Production Hardening**: Includes database pool optimization, in-memory caching, async processing, atomic payment processing, transaction retry logic, circuit breakers, health checks, and PostgreSQL-backed session storage.

## External Dependencies
- **Replit Auth**: User authentication.
- **M-Pesa/Card Payment Gateway**: Payment processing.
- **Twilio**: SMS and WhatsApp notifications.
- **GPT-4o-mini**: AI model for career recommendations, content generation, and quality checks.
- **i18next**: Multi-language support.
- **PostgreSQL**: Relational database.
- **Drizzle ORM**: TypeScript ORM.
- **ipapi.co**: IP-based geolocation.
- **pdf-parse/mammoth**: Document text extraction for CV analysis.