import 'dotenv/config';
import prisma from '../src/prismaClient';
import { orderConfirmationService } from '../src/services/orderConfirmation.service';
import fs from 'fs';
import path from 'path';

async function ensureUser(email: string) {
  let user = await prisma.users.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.users.create({
      data: {
        first_name: 'Chifundo',
        last_name: 'Test',
        email,
        phone_number: '+26510000000',
        password_hash: 'test-password-hash',
        role: 'USER'
      }
    });
    console.log('Created user:', user.id);
  } else {
    console.log('Found existing user:', user.id);
  }
  return user;
}

async function createShopAndProduct() {
  // Create a seller user for the shop
  const sellerEmail = 'seller@example.test';
  let seller = await prisma.users.findUnique({ where: { email: sellerEmail } });
  if (!seller) {
    seller = await prisma.users.create({
      data: {
        first_name: 'Seller',
        last_name: 'Test',
        email: sellerEmail,
        phone_number: '+26520000000',
        password_hash: 'seller-pass',
        role: 'SELLER'
      }
    });
  }

  // Create shop
  const shop = await prisma.shops.create({
    data: {
      name: 'Test Shop',
      owner_id: seller.id,
      city: 'Lilongwe',
      is_active: true,
      delivery_enabled: true,
    }
  });

  // Create product and shop_product
  const product = await prisma.products.create({ data: { name: 'Test Product' } });
  const shopProduct = await prisma.shop_products.create({
    data: {
      shop_id: shop.id,
      product_id: product.id,
      price: 1000,
      base_price: 800,
      stock_quantity: 10,
      is_available: true,
    }
  });

  return { shop, product, shopProduct, seller };
}

async function createOrderForBuyer(buyerId: string, shopId: string, shopProductId: string) {
  // Create a cart/order with status CONFIRMED so generateReleaseCode will work
  const order = await prisma.orders.create({
    data: {
      buyer_id: buyerId,
      shop_id: shopId,
      status: 'CONFIRMED',
      total_amount: 1000,
      order_number: `TEST-${Date.now()}`,
      order_items: {
        create: [
          {
            shop_product_id: shopProductId,
            product_name: 'Test Product',
            quantity: 1,
            unit_price: 1000,
            base_price: 800,
          }
        ]
      }
    },
    include: { order_items: true }
  });

  console.log('Created order', order.id, 'number', order.order_number);
  return order;
}

async function main() {
  try {
    const customerEmail = 'chifundo365@gmail.com';
    const user = await ensureUser(customerEmail);

    const { shop, shopProduct } = await createShopAndProduct();

    const order = await createOrderForBuyer(user.id, shop.id, shopProduct.id);

    console.log('Generating release code for order', order.id);
    const res = await orderConfirmationService.generateReleaseCode(order.id);
    console.log('generateReleaseCode result:', res);

    // Look for debug email file (development mode)
    const debugDir = path.join(process.cwd(), 'generated', 'email-debug');
    if (fs.existsSync(debugDir)) {
      const files = fs.readdirSync(debugDir).filter(f => f.includes('Release'));
      console.log('Recent debug email files (matching "Release"):', files.slice(-5));
    } else {
      console.log('No generated/email-debug directory found. If RESEND_API_KEY is set, emails are sent via Resend.');
    }
  } catch (err) {
    console.error('Test flow error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
