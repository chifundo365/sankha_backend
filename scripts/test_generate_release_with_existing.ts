


import 'dotenv/config';
import prisma from '../src/prismaClient';
import { orderConfirmationService } from '../src/services/orderConfirmation.service';
import fs from 'fs';
import path from 'path';

async function main() {
  try {
    await prisma.$connect();

    // 1. Find an available shop_product
    const sp = await prisma.shop_products.findFirst({
      where: { is_available: true, stock_quantity: { gt: 0 } },
      include: { shops: true },
    });

    if (!sp) {
      console.error('No available shop_products found in DB. Seed data required.');
      return process.exit(1);
    }

    console.log('Using shop_product:', sp.id, 'shop:', sp.shop_id, 'price:', sp.price.toString());

    // 2. Ensure buyer exists
    const buyerEmail = 'chifundo365@gmail.com';
    let buyer = await prisma.users.findUnique({ where: { email: buyerEmail } });
    if (!buyer) {
      buyer = await prisma.users.create({
        data: {
          first_name: 'Chifundo',
          last_name: 'Test',
          email: buyerEmail,
          phone_number: '+26510000000',
          password_hash: 'dev-placeholder',
          role: 'USER',
        },
      });
      console.log('Created buyer user:', buyer.id);
    } else {
      console.log('Found buyer user:', buyer.id);
    }

    // 3. Create a CONFIRMED order for this buyer and the shop owning the shop_product
    const orderNumber = `TEST-${Date.now()}`;
    const order = await prisma.orders.create({
      data: {
        order_number: orderNumber,
        buyer_id: buyer.id,
        shop_id: sp.shop_id,
        total_amount: sp.price,
        status: 'CONFIRMED',
        order_items: {
          create: [
            {
              shop_product_id: sp.id,
              product_name: sp.id,
              quantity: 1,
              unit_price: sp.price,
              base_price: sp.base_price ?? sp.price,
            },
          ],
        },
      },
      include: { order_items: true },
    });

    console.log('Created order:', order.id, order.order_number);

    // 4. Call generateReleaseCode
    console.log('Generating release code...');
    const result = await orderConfirmationService.generateReleaseCode(order.id);
    console.log('generateReleaseCode result:', result);

    // 5. List generated debug emails if present
    const debugDir = path.join(process.cwd(), 'generated', 'email-debug');
    if (fs.existsSync(debugDir)) {
      const files = fs.readdirSync(debugDir).slice(-10);
      console.log('Recent debug email files:', files);
    } else {
      console.log('No generated/email-debug directory found. If emails are configured, they were sent via provider.');
    }

  } catch (err) {
    console.error('Error during test flow:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
