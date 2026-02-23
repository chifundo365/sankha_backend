const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../generated/prisma');

async function dump() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('Reading tables from live DB...');

  const users = await prisma.users.findMany();
  const categories = await prisma.categories.findMany();
  const products = await prisma.products.findMany();
  const shops = await prisma.shops.findMany();
  const shop_products = await prisma.shop_products.findMany();

  // Build seed file content
  const outLines = [];
  outLines.push("// GENERATED FROM LIVE DB - run scripts/generate-seed-from-db.js to refresh");
  outLines.push("// @ts-nocheck");
  outLines.push("import prisma from '../src/prismaClient';\n");
  outLines.push("async function main() {");
  outLines.push("  await prisma.$connect();");
  outLines.push("  console.log('Clearing existing data (safe order)');");
  outLines.push("  await prisma.order_items.deleteMany();");
  outLines.push("  await prisma.payments.deleteMany();");
  outLines.push("  await prisma.orders.deleteMany();");
  outLines.push("  await prisma.reviews.deleteMany();");
  outLines.push("  await prisma.shop_products_log.deleteMany();");
  outLines.push("  await prisma.shop_products.deleteMany();");
  outLines.push("  await prisma.products.deleteMany();");
  outLines.push("  await prisma.shops.deleteMany();");
  outLines.push("  await prisma.user_addresses.deleteMany();");
  outLines.push("  await prisma.categories.deleteMany();");
  outLines.push("  await prisma.users.deleteMany();\n");

  function lit(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return '`' + v.replace(/`/g, '\\`') + '`';
    if (Array.isArray(v)) return JSON.stringify(v);
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  outLines.push("  console.log('Seeding users...');");
  if (users.length) {
    outLines.push(`  await prisma.users.createMany({ data: ${JSON.stringify(users, null, 2)}, skipDuplicates: true });`);
  }

  outLines.push("  console.log('Seeding categories...');");
  if (categories.length) {
    outLines.push(`  await prisma.categories.createMany({ data: ${JSON.stringify(categories, null, 2)}, skipDuplicates: true });`);
  }

  outLines.push("  console.log('Seeding products...');");
  if (products.length) {
    outLines.push(`  await prisma.products.createMany({ data: ${JSON.stringify(products, null, 2)}, skipDuplicates: true });`);
  }

  outLines.push("  console.log('Seeding shops...');");
  if (shops.length) {
    outLines.push(`  await prisma.shops.createMany({ data: ${JSON.stringify(shops, null, 2)}, skipDuplicates: true });`);
  }

  outLines.push("  console.log('Seeding shop_products...');");
  if (shop_products.length) {
    outLines.push(`  await prisma.shop_products.createMany({ data: ${JSON.stringify(shop_products, null, 2)}, skipDuplicates: true });`);
  }

  outLines.push("  console.log('Done.');");
  outLines.push("}");
  outLines.push("main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>process.exit(0));");

  const out = outLines.join('\n');
  const target = path.join(__dirname, '..', 'prisma', 'seed.ts');
  fs.writeFileSync(target, out, 'utf8');
  console.log('Wrote', target);
  await prisma.$disconnect();
}

dump().catch(e=>{console.error(e); process.exit(1)});
