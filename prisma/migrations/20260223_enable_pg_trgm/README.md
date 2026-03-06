Enable `pg_trgm` migration

This folder contains a small raw SQL migration that enables the PostgreSQL `pg_trgm` extension and creates a trigram GIN index on `products.normalized_name`.

Why
- The codebase uses `similarity()` from `pg_trgm` for production-grade fuzzy matching. Enabling the extension and adding a trigram index significantly speeds up similarity queries.

How to apply

1) If you have direct DB superuser access (psql):

```bash
psql "$DATABASE_URL" -f prisma/migrations/20260223_enable_pg_trgm/migration.sql
```

2) Using Prisma's `db execute` (Prisma >= 4.20):

```bash
npx prisma db execute --file=prisma/migrations/20260223_enable_pg_trgm/migration.sql --schema=prisma/schema.prisma
```

3) If you use `prisma migrate` pipelines, you can include this folder as a migration. Alternatively, run the SQL manually as a DB admin.

Notes
- Some managed DB providers (Neon, RDS, etc.) block creating extensions for non-superuser roles. Check your provider docs; you may need to ask your DB admin or use provider-specific controls.
- The migration will create the index only if `products.normalized_name` exists. If your schema differs, adapt the SQL accordingly.
