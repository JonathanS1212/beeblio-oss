import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Application schema for beeblio's own data.
 *
 * Identity (users, accounts, sessions) is owned by Neon Auth. Its Better Auth
 * tables live in the neon_auth schema of the same Neon database (`neon_auth.user`
 * is the identity table). Here we keep only beeblio app data: projects and
 * agent sessions. projects.user_id references the Neon Auth user id (text),
 * with no hard FK since the users table is managed by Neon Auth, not Drizzle.
 */
export const appSchema = pgSchema("app");

export const projects = appSchema.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Neon Auth user id (Better Auth user.id is a string).
    userId: text("user_id").notNull(),
    slug: text("slug").notNull(), // unique per user, route key
    name: text("name").notNull(),
    description: text("description"), // optional project description
    // Per-project user preferences (lib/project-settings.ts parses the shape).
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
    // updated_at stamps on insert only; bump it explicitly on mutations.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("projects_user_id_slug_key").on(t.userId, t.slug),
    index("idx_projects_user_id").on(t.userId),
  ],
);

export const agentSessions = appSchema.table(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: the eve session is created lazily on the first message, not at
    // row creation. Unique where set so a given eve session maps to one row.
    eveSessionId: text("eve_session_id").unique(),
    // Serialized eve ClientSession.state ({sessionId, continuationToken,
    // streamIndex}); persisted after each turn to enable session resume.
    state: jsonb("state"),
    // Final authoritative Eve event log. Completed conversations render this
    // directly instead of replaying the durable stream over the network.
    events: jsonb("events"),
    modelSource: text("model_source").notNull().default("system"),
    modelId: text("model_id"),
    modelContextWindowTokens: integer("model_context_window_tokens"),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title"),
    status: text("status").notNull().default("active"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "agent_sessions_status_check",
      sql`${t.status} in ('active', 'archived', 'deleted')`,
    ),
    check("agent_sessions_model_source_check", sql`${t.modelSource} in ('system', 'byok')`),
    index("idx_agent_sessions_project_id").on(t.projectId),
  ],
);

export const knowledgeStores = appSchema.table("knowledge_stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" })
    .unique(),
  providerStoreName: text("provider_store_name").notNull().unique(),
  embeddingModel: text("embedding_model").notNull().default("models/gemini-embedding-2"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeDocuments = appSchema.table(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => knowledgeStores.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    displayName: text("display_name").notNull(),
    sourceEtag: text("source_etag"),
    sourceSizeBytes: bigint("source_size_bytes", { mode: "number" }).notNull(),
    providerDocumentName: text("provider_document_name").unique(),
    operationName: text("operation_name"),
    status: text("status").notNull().default("indexing"),
    lastError: text("last_error"),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("knowledge_documents_project_path_key").on(t.projectId, t.filePath),
    index("knowledge_documents_project_status_idx").on(t.projectId, t.status),
    check("knowledge_documents_status_check", sql`${t.status} in ('indexing', 'ready', 'failed', 'removing')`),
  ],
);

export const userOpenRouterCredentials = appSchema.table("user_openrouter_credentials", {
  userId: text("user_id").primaryKey(),
  encryptedKey: text("encrypted_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  maskedKey: text("masked_key").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Credits and usage. The unit is integer credits, held in a per-user balance
 * row (userCredits) backed by an append-only ledger (creditLedger). The balance
 * is a denormalized cache: it equals the sum of ledger deltas.
 *
 * Identity is the Neon Auth user id (text), keyed the same way as
 * projects.userId. See docs/credits-usage-plan.md for the gate/meter design.
 */
export const userCredits = appSchema.table("user_credits", {
  userId: text("user_id").primaryKey(), // Neon Auth user.id
  balance: integer("balance").notNull().default(0),
  // Two-bucket balance (docs/entitlements-plan.md §7.2): included credits are
  // re-floored monthly by plan allowance; top-up credits are purchased and
  // never expire. Spending draws included first. balance is the maintained
  // sum (included + topup) kept for existing queries/UI.
  includedBalance: integer("included_balance").notNull().default(0),
  topupBalance: integer("topup_balance").notNull().default(0),
  // Active reservations are held separately. Spendable = balance - reserved.
  reserved: integer("reserved").notNull().default(0),
  totalGranted: integer("total_granted").notNull().default(0),
  totalUsed: integer("total_used").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const creditReservations = appSchema.table(
  "credit_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    sessionId: text("session_id"),
    // Eve's backend session key. Lets Blaxel process completion recover the
    // active reservation after a Vercel Workflow step resumes in a new
    // function process where the in-memory meter routing map is empty.
    sandboxSessionId: text("sandbox_session_id"),
    turnId: text("turn_id"),
    amount: integer("amount").notNull(),
    settledAmount: integer("settled_amount").notNull().default(0),
    executionClass: text("execution_class").notNull(),
    status: text("status").notNull().default("active"),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("credit_reservations_idempotency_key").on(t.idempotencyKey),
    check(
      "credit_reservations_status_check",
      sql`${t.status} in ('active', 'settled', 'released', 'expired')`,
    ),
    check("credit_reservations_amount_check", sql`${t.amount} > 0`),
    check(
      "credit_reservations_settled_amount_check",
      sql`${t.settledAmount} >= 0`,
    ),
    index("idx_credit_reservations_user_status").on(t.userId, t.status),
    index("idx_credit_reservations_sandbox_status").on(
      t.sandboxSessionId,
      t.status,
    ),
  ],
);

/**
 * Raw Blaxel process durations collected during a credit reservation. Events
 * are kept separate from the ledger until the turn ends so several short
 * commands become one compute charge instead of each paying the one-credit
 * rounding minimum. The compound unique key makes process completion replay
 * safe; durable workspace files remain in GCS and are not represented here.
 */
export const sandboxComputeUsage = appSchema.table(
  "sandbox_compute_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => creditReservations.id, { onDelete: "cascade" }),
    operationId: text("operation_id").notNull(),
    activeMilliseconds: integer("active_milliseconds").notNull(),
    memoryMb: integer("memory_mb").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("sandbox_compute_usage_reservation_operation_key").on(
      t.reservationId,
      t.operationId,
    ),
    check(
      "sandbox_compute_usage_active_milliseconds_check",
      sql`${t.activeMilliseconds} > 0`,
    ),
    check("sandbox_compute_usage_memory_mb_check", sql`${t.memoryMb} > 0`),
    index("idx_sandbox_compute_usage_reservation").on(t.reservationId),
  ],
);

export const creditLedger = appSchema.table(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    delta: integer("delta").notNull(), // +grant / -usage / +refund / +adjustment
    type: text("type").notNull(), // 'grant' | 'usage' | 'refund' | 'adjustment' | 'expiration'
    reason: text("reason"), // 'turn' | 'tool:transcribe_audio' | 'payment' | 'signup_bonus' | 'admin'
    source: text("source"), // 'proxy' | 'agent' | 'payment' | 'admin'
    costDetails: jsonb("cost_details"), // { tokensIn, tokensOut, model, toolName, stepCount, ... }
    // Attribution: loose refs to agent_sessions.eve_session_id, no hard FK.
    sessionId: text("session_id"),
    turnId: text("turn_id"),
    callId: text("call_id"),
    reservationId: uuid("reservation_id").references(
      () => creditReservations.id,
      { onDelete: "set null" },
    ),
    // Makes metering replay-safe: a re-run hook hits the conflict and no-ops.
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("credit_ledger_idempotency_key").on(t.idempotencyKey),
    check(
      "credit_ledger_type_check",
      sql`${t.type} in ('grant', 'usage', 'refund', 'adjustment', 'expiration')`,
    ),
    index("idx_credit_ledger_user_created").on(t.userId, t.createdAt),
  ],
);

/**
 * Plan and role state (docs/entitlements-plan.md §9). Identity is owned by
 * Neon Auth, so these tables key on its user id like every other app table.
 * No user_plans row means the free plan. Paid checkout writes this row via
 * webhooks (`updated_by = 'billing'`); admins can still assign a plan.
 */
export const userPlans = appSchema.table(
  "user_plans",
  {
    userId: text("user_id").primaryKey(), // Neon Auth user.id
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("active"), // active | lapsed
    updatedBy: text("updated_by"), // admin user id, or 'billing'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("user_plans_plan_check", sql`${t.plan} in ('free', 'plus', 'pro')`),
    check("user_plans_status_check", sql`${t.status} in ('active', 'lapsed')`),
  ],
);

export const userRoles = appSchema.table(
  "user_roles",
  {
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    grantedBy: text("granted_by"),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("user_roles_role_check", sql`${t.role} in ('admin')`),
    primaryKey({ columns: [t.userId, t.role] }),
  ],
);

/**
 * Billing catalog and payment records. Lemon Squeezy covers the global USD
 * market; Mayar covers Indonesia (IDR, manual monthly renewal). Product
 * classification lives in metadata: productType, planKey, market, renewal,
 * storageBytes, testMode, hidden.
 */
export const creditProducts = appSchema.table(
  "credit_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerPriceId: text("provider_price_id").notNull(),
    name: text("name").notNull(),
    credits: integer("credits").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("credit_products_provider_price_id").on(t.provider, t.providerPriceId),
    check("credit_products_provider_check", sql`${t.provider} in ('lemonsqueezy', 'mayar')`),
    check("credit_products_credits_check", sql`${t.credits} >= 0`),
    check("credit_products_amount_check", sql`${t.amountMinor} >= 0`),
    index("credit_products_active_idx").on(t.active, t.createdAt),
  ],
);

export const payments = appSchema.table(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    productId: uuid("product_id").references(() => creditProducts.id),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    providerCheckoutId: text("provider_checkout_id"),
    providerInvoiceId: text("provider_invoice_id"),
    status: text("status").notNull().default("pending"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    creditsGranted: integer("credits_granted").notNull().default(0),
    providerEventId: text("provider_event_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("payments_provider_payment_id").on(t.provider, t.providerPaymentId),
    unique("payments_provider_checkout_id").on(t.provider, t.providerCheckoutId),
    unique("payments_provider_invoice_id").on(t.provider, t.providerInvoiceId),
    unique("payments_provider_event_id").on(t.provider, t.providerEventId),
    check("payments_provider_check", sql`${t.provider} in ('lemonsqueezy', 'mayar')`),
    check(
      "payments_status_check",
      sql`${t.status} in ('pending', 'paid', 'failed', 'refunded', 'disputed')`,
    ),
    check("payments_amount_check", sql`${t.amountMinor} >= 0`),
    check("payments_credits_granted_check", sql`${t.creditsGranted} >= 0`),
    index("payments_user_created_idx").on(t.userId, t.createdAt),
    index("payments_status_created_idx").on(t.status, t.createdAt),
  ],
);

export const billingSubscriptions = appSchema.table(
  "billing_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    providerCustomerId: text("provider_customer_id"),
    providerVariantId: text("provider_variant_id").notNull(),
    planKey: text("plan_key").notNull(),
    status: text("status").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("billing_subscriptions_provider_subscription_id").on(
      t.provider,
      t.providerSubscriptionId,
    ),
    check("billing_subscriptions_provider_check", sql`${t.provider} in ('lemonsqueezy', 'mayar')`),
    check("billing_subscriptions_plan_key_check", sql`${t.planKey} in ('plus', 'pro')`),
    check(
      "billing_subscriptions_status_check",
      sql`${t.status} in ('on_trial', 'active', 'past_due', 'unpaid', 'paused', 'cancelled', 'expired')`,
    ),
    index("billing_subscriptions_user_status_idx").on(
      t.userId,
      t.status,
      t.currentPeriodEnd,
    ),
  ],
);

export const billingAddons = appSchema.table(
  "billing_addons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    productId: uuid("product_id").references(() => creditProducts.id),
    provider: text("provider").notNull(),
    providerReferenceId: text("provider_reference_id").notNull(),
    storageBytes: bigint("storage_bytes", { mode: "number" }).notNull(),
    status: text("status").notNull().default("active"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("billing_addons_provider_reference_id").on(t.provider, t.providerReferenceId),
    check("billing_addons_provider_check", sql`${t.provider} in ('lemonsqueezy', 'mayar')`),
    check(
      "billing_addons_status_check",
      sql`${t.status} in ('on_trial', 'active', 'past_due', 'unpaid', 'paused', 'cancelled', 'expired')`,
    ),
    check("billing_addons_storage_bytes_check", sql`${t.storageBytes} > 0`),
    index("billing_addons_user_status_idx").on(t.userId, t.status, t.currentPeriodEnd),
  ],
);

export const billingCustomers = appSchema.table(
  "billing_customers",
  {
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.provider] }),
    unique("billing_customers_provider_customer_id").on(t.provider, t.providerCustomerId),
    check("billing_customers_provider_check", sql`${t.provider} in ('lemonsqueezy', 'mayar')`),
  ],
);

export const billingEvents = appSchema.table(
  "billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    userId: text("user_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("billing_events_provider_event_id").on(t.provider, t.providerEventId),
    check("billing_events_provider_check", sql`${t.provider} in ('lemonsqueezy', 'mayar')`),
    index("billing_events_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const billingSettings = appSchema.table("billing_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userBillingProfiles = appSchema.table("user_billing_profiles", {
  userId: text("user_id").primaryKey(),
  mobile: text("mobile"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const publicFiles = appSchema.table(
  "public_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("public_files_project_path_key").on(t.projectId, t.filePath),
  ],
);

/**
 * Binds an eve sandbox session key to the (userId, projectSlug) workspace it
 * was opened for. The Blaxel sandbox backend reads this at create() time to
 * know which user sandbox to attach (one microVM per userId) and which
 * project directory inside the user-level /workspace mount is this session's
 * root; it replaces the durable actor state agentOS used to carry
 * (`configureWorkspace`). Written by the sandbox onSession hook around the
 * first use(), durable across server restarts and sandbox TTL deletion.
 */
export const sandboxBindings = appSchema.table("sandbox_bindings", {
  // Eve's sandbox session key (sandbox.id), not the workflow session id.
  sessionKey: text("session_key").primaryKey(),
  userId: text("user_id").notNull(),
  projectSlug: text("project_slug").notNull(),
  sandboxName: text("sandbox_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Marketing blog posts rendered at /blog/[slug]. Body is markdown/MDX stored
 * as text and compiled at render time (next-mdx-remote), so posts publish
 * without a rebuild. author_* is denormalized display data (single-founder
 * blog: usually the creating admin) keyed to the Neon Auth user id.
 */
export const blogPosts = appSchema.table(
  "blog_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    // Listing card blurb + meta description fallback; keep under ~200 chars.
    excerpt: text("excerpt"),
    bodyMdx: text("body_mdx").notNull().default(""),
    status: text("status").notNull().default("draft"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    heroImageUrl: text("hero_image_url"),
    heroImageAlt: text("hero_image_alt"),
    // SEO overrides; fall back to title/excerpt when null.
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    // Overrides the generated OpenGraph card when set.
    ogImageUrl: text("og_image_url"),
    authorId: text("author_id").notNull(),
    authorName: text("author_name").notNull(),
    // Short byline under the author name ("Senior AI Engineer", …).
    authorTitle: text("author_title"),
    authorUrl: text("author_url"),
    // Set once on first publish and never changed afterwards, so search
    // engines and feeds see a stable datePublished across edits.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("blog_posts_status_check", sql`${t.status} in ('draft', 'published')`),
    unique("blog_posts_slug_key").on(t.slug),
    index("idx_blog_posts_status_published_at").on(t.status, t.publishedAt),
  ],
);
