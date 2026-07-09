export const CONVERSION_GUIDE = `
# DATABASE ORM CONVERSION GUIDE

This guide provides guidelines for converting a Drizzle ORM PostgreSQL schema to other popular ORMs and database dialects.

---

## 1. Drizzle PG to Prisma (PostgreSQL / MySQL / SQLite)

### Mapping Concepts
- \`pgTable("table_name", { ... })\` maps to \`model TableName { ... }\` in Prisma.
- Column chaining matches Prisma decorators:
  - \`serial("id").primaryKey()\` -> \`id Int @id @default(autoincrement())\`
  - \`uuid("id").primaryKey()\` -> \`id String @id @default(uuid())\`
  - \`varchar("name", { length: 255 })\` -> \`name String @db.VarChar(255)\`
  - \`text("bio")\` -> \`bio String\` (optional: \`@db.Text\`)
  - \`integer("count")\` -> \`count Int\`
  - \`boolean("active")\` -> \`active Boolean\`
  - \`timestamp("created_at")\` -> \`createdAt DateTime @default(now())\` (for defaultNow)
  - \`notNull()\` -> Non-optional field (no \`?\` in type)
  - \`unique()\` -> \`@unique\` decorator
  - Indexes: \`pgIndex("name").on(table.column)\` -> \`@@index([column])\` in the model body.

### Relations
- Prisma uses declarative relation fields on both sides of a relationship.
- Example Drizzle:
\`\`\`typescript
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull(),
});
export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
\`\`\`
- Example Prisma equivalent:
\`\`\`prisma
model Post {
  id       Int    @id @default(autoincrement())
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
}
\`\`\`

---

## 2. Drizzle PG to Mongoose (MongoDB)

### Mapping Concepts
- MongoDB is schema-less, but Mongoose enforces validation.
- All primary keys (e.g. \`id\`) generally translate to Mongoose \`_id\` of type \`Schema.Types.ObjectId\` or an auto-incrementing integer plugin.
- Types:
  - \`varchar\`, \`text\`, \`uuid\` -> \`String\`
  - \`integer\`, \`serial\` -> \`Number\`
  - \`boolean\` -> \`Boolean\`
  - \`timestamp\` -> \`Date\`
  - \`jsonb\` -> \`Schema.Types.Mixed\`
- Constraints:
  - \`notNull()\` -> \`required: true\`
  - \`unique()\` -> \`unique: true\`
  - \`isIndex: true\` -> \`index: true\`

### Relations
- References use Mongoose \`ref\` keyword pointing to the referenced collection model name:
\`\`\`javascript
const PostSchema = new Schema({
  title: { type: String, required: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true }
});
\`\`\`

---

## 3. Drizzle PG to TypeORM (TypeScript)

### Mapping Concepts
- Classes decorated with \`@Entity()\`
- Columns decorated with \`@Column()\`, \`@PrimaryGeneratedColumn()\`, \`@CreateDateColumn()\`, etc.
- Constraints match decorators:
  - \`serial("id").primaryKey()\` -> \`@PrimaryGeneratedColumn() id: number;\`
  - \`uuid("id").primaryKey()\` -> \`@PrimaryGeneratedColumn("uuid") id: string;\`
  - \`varchar("name")\` -> \`@Column({ type: "varchar", length: 255 }) name: string;\`
  - \`notNull()\` -> \`nullable: false\` (default)
  - \`unique()\` -> \`unique: true\`
  - Indexes -> \`@Index()\` decorator on class or field.

### Relations
- Uses \`@ManyToOne\`, \`@OneToMany\`, \`@OneToOne\`, \`@JoinColumn\` decorators:
\`\`\`typescript
@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.posts)
  @JoinColumn({ name: "author_id" })
  author: User;
}
\`\`\`

---

## 4. Drizzle PG to Kysely (TypeScript SQL Builder)

### Mapping Concepts
- Kysely uses plain TypeScript interfaces representing database tables.
- Columns map directly to TypeScript types:
  - \`serial\` -> \`Generated<number>\`
  - \`integer\` -> \`number\`
  - \`varchar\`, \`text\`, \`uuid\` -> \`string\`
  - \`boolean\` -> \`boolean\`
  - \`timestamp\` -> \`Date\` or \`string\`
  - Optional/Nullable columns (no \`notNull()\`) -> \`string | null\`, \`number | null\`

### Example Kysely Database Interface:
\`\`\`typescript
import { Generated } from 'kysely'

export interface UserTable {
  id: Generated<number>
  name: string
  email: string
  created_at: Generated<Date>
}

export interface Database {
  users: UserTable
}
\`\`\`
`;
