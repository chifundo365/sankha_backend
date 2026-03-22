import prisma from './src/prismaClient';

async function main() {
  const count = await prisma.shop_products.count({
    where: { stock_quantity: { lte: 0 } }
  });
  console.log(`Out of stock items: ${count}`);

  const items = await prisma.shop_products.findMany({
    where: { stock_quantity: { lte: 0 } },
    include: { products: true, shops: true }
  });
  console.log(JSON.stringify(items, null, 2));
}

main().then(() => process.exit(0));
