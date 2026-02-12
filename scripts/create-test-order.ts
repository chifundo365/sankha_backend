import prisma from '../src/prismaClient';

async function main() {
  console.log('Creating test order...');

  // Find buyer Mary
  const buyer = await prisma.users.findUnique({ where: { email: 'mary.tembo@customer.com' } });
  if (!buyer) throw new Error('Buyer not found');

  // Pick a shop with at least one shop_product
  const shopWithProduct = await prisma.shops.findFirst({
    where: {},
    include: { shop_products: { take: 1, include: { products: true } } }
  });
  if (!shopWithProduct) throw new Error('No shop found');
  if (!shopWithProduct.shop_products || shopWithProduct.shop_products.length === 0) throw new Error('No shop products found for shop');

  const shopProduct = shopWithProduct.shop_products[0];

  // Create an order (CONFIRMED) for the buyer and shop
  const orderNumber = `TEST-${Date.now().toString().slice(-6)}`;
  const quantity = 1;
  const unitPrice = Number(shopProduct.price || 0);
  const totalAmount = unitPrice * quantity;

  const order = await prisma.orders.create({
    data: {
      order_number: orderNumber,
      buyer_id: buyer.id,
      shop_id: shopWithProduct.id,
      total_amount: totalAmount,
      status: 'CONFIRMED',
      created_at: new Date(),
      updated_at: new Date(),
      order_items: {
        create: [{
          product_name: shopProduct.products.name || 'Test product',
          quantity,
          unit_price: unitPrice,
          base_price: shopProduct.base_price || undefined,
          total_price: unitPrice * quantity,
          shop_product_id: shopProduct.id
        }]
      }
    },
    include: { order_items: true }
  });

  console.log('Created order:', order.id, 'order_number:', order.order_number);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Failed to create test order:', err);
  process.exit(1);
});
