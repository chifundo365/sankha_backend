Baseline migration

This folder contains a baseline migration placeholder to align Prisma's migration history with the current database state. It intentionally contains no schema changes. After creating this folder, run:

```bash
npx prisma migrate resolve --applied 20260223_init_baseline --schema=prisma/schema.prisma
```

This will mark the migration as applied in the database without altering data.