import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {
 id: text('id').primaryKey(), host: text('host').notNull(), invite: text('invite').notNull(),
 guest: text('guest'), offer: text('offer').notNull(), answer: text('answer'), approved: integer('approved').notNull().default(0),
 expires: integer('expires').notNull()
});
