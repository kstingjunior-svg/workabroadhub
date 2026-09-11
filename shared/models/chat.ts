import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// NOTE: the omit masks are cast because drizzle-zod@0.7.1 mis-infers the
// omit() param type under tsconfig.server.json's CommonJS resolution
// ("boolean is not assignable to never") — the same documented bug that
// forced @ts-nocheck in shared/schema.ts. Runtime behavior is unchanged.
export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
} as any);

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
} as any);

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

