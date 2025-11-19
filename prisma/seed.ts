// @ts-nocheck
import prisma from "../src/prismaClient";

async function main() {
  console.log("🌱 Seeding database with comprehensive test data...");

  try {
    // Connect to database
    console.log("🔗 Connecting to database...");
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connection established");

    // Clear existing data in dependency order
    console.log("🧹 Clearing existing data...");
    await prisma.order_items.deleteMany();
    await prisma.payments.deleteMany();
    await prisma.orders.deleteMany();
    await prisma.reviews.deleteMany();
    await prisma.shop_products_log.deleteMany();
    await prisma.shop_products.deleteMany();
    await prisma.products.deleteMany();
    await prisma.shops.deleteMany();
    await prisma.user_addresses.deleteMany();
    await prisma.categories.deleteMany();
    await prisma.users.deleteMany();
    console.log("✅ Cleared all existing data");

    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.log("⚠️ Error during setup:", error.message);
    console.log("Continuing with seeding...");
  }

  // Test user passwords (for development/testing only):
  // Alice Banda (USER): password123
  // John Phiri (SELLER): secure456
  // Grace Mwale (SELLER): strong789
  // Peter Nyirenda (ADMIN): admin321
  // Mary Tembo (USER): user654
  const passwordHashes = [
    "$2b$10$Zl.AxL28qVQVpf5mG2atW.dhJqo7OIb7CoZw/SpSQz/H.CwdBL1BO", // password123
    "$2b$10$lUN7RS0Mq.a1.boVaqYS0OGWRWxFmnOzOP97PhAe1uqtWif76fNDO", // secure456
    "$2b$10$MOQOOfV.Mws4oKtAieFwBe2B6HbLp34RSznW/Qpw7MYmmXUCpzdMO", // strong789
    "$2b$10$UZxohMsXEXGLr4u19uIypuZbYrDLXg1tejI4miiLeKNYv/e0TgLBC", // admin321
    "$2b$10$d6Wk0QEMRUxxYM6ttaENNuPS7BAb.mOdlpLiYadIdZc6zTlxpvBPK" // user654
  ];

  // 1. Users
  console.log("👥 Creating users...");
  const users = [];

  users.push(
    await prisma.users.create({
      data: {
        first_name: "Alice",
        last_name: "Banda",
        email: "alice.banda@gmail.com",
        phone_number: "+265991234567",
        password_hash: passwordHashes[0],
        role: "USER",
        profile_image:
          "https://images.unsplash.com/photo-1494790108755-2616b612b1c5?w=200"
      }
    })
  );

  users.push(
    await prisma.users.create({
      data: {
        first_name: "John",
        last_name: "Phiri",
        email: "john.phiri@techstore.mw",
        phone_number: "+265998765432",
        password_hash: passwordHashes[1],
        role: "SELLER",
        profile_image:
          "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200"
      }
    })
  );

  users.push(
    await prisma.users.create({
      data: {
        first_name: "Grace",
        last_name: "Mwale",
        email: "grace.mwale@digitalmw.com",
        phone_number: "+265997654321",
        password_hash: passwordHashes[2],
        role: "SELLER",
        profile_image:
          "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200"
      }
    })
  );

  users.push(
    await prisma.users.create({
      data: {
        first_name: "Peter",
        last_name: "Nyirenda",
        email: "peter.nyirenda@admin.com",
        phone_number: "+265996543210",
        password_hash: passwordHashes[3],
        role: "ADMIN",
        profile_image:
          "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200"
      }
    })
  );

  users.push(
    await prisma.users.create({
      data: {
        first_name: "Mary",
        last_name: "Tembo",
        email: "mary.tembo@customer.com",
        phone_number: "+265995432109",
        password_hash: passwordHashes[4],
        role: "USER",
        profile_image:
          "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200"
      }
    })
  );

  console.log(`✅ Created ${users.length} users`);

  // 2. Categories
  console.log("📱 Creating categories...");
  const categories = [];

  categories.push(
    await prisma.categories.create({
      data: {
        name: "Smartphones & Tablets",
        description:
          "Latest mobile devices, smartphones, tablets and accessories"
      }
    })
  );
  categories.push(
    await prisma.categories.create({
      data: {
        name: "Laptops & Computers",
        description:
          "Desktop computers, laptops, monitors and computer accessories"
      }
    })
  );
  categories.push(
    await prisma.categories.create({
      data: {
        name: "Audio & Headphones",
        description: "Speakers, headphones, earbuds and audio equipment"
      }
    })
  );
  categories.push(
    await prisma.categories.create({
      data: {
        name: "Gaming & Consoles",
        description: "Gaming consoles, video games, and gaming accessories"
      }
    })
  );
  categories.push(
    await prisma.categories.create({
      data: {
        name: "Smart Home & IoT",
        description: "Smart home devices, IoT gadgets, and home automation"
      }
    })
  );

  console.log(`✅ Created ${categories.length} categories`);

  // 3. Products
  console.log("🛍️ Creating products...");
  const products = [];

  products.push(
    await prisma.products.create({
      data: {
        name: "iPhone 15 Pro Max",
        brand: "Apple",
        description:
          "The latest iPhone with A17 Pro chip, titanium design, and advanced camera system",
        category_id: categories[0].id,
        base_price: "850000.00",
        images: [
          "https://images.unsplash.com/photo-1592910147829-99f40bc3d004?w=500",
          "https://images.unsplash.com/photo-1601972602237-8c79241e468b?w=500"
        ]
      }
    })
  );
  products.push(
    await prisma.products.create({
      data: {
        name: "MacBook Air M3",
        brand: "Apple",
        description:
          "Lightweight laptop with M3 chip, 13-inch Retina display, and all-day battery life",
        category_id: categories[1].id,
        base_price: "750000.00",
        images: [
          "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500",
          "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=500"
        ]
      }
    })
  );
  products.push(
    await prisma.products.create({
      data: {
        name: "Sony WH-1000XM5",
        brand: "Sony",
        description:
          "Premium noise-canceling wireless headphones with exceptional sound quality",
        category_id: categories[2].id,
        base_price: "185000.00",
        images: [
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
          "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=500"
        ]
      }
    })
  );
  products.push(
    await prisma.products.create({
      data: {
        name: "PlayStation 5",
        brand: "Sony",
        description:
          "Next-generation gaming console with 4K gaming and ultra-high speed SSD",
        category_id: categories[3].id,
        base_price: "450000.00",
        images: [
          "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=500",
          "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=500"
        ]
      }
    })
  );
  products.push(
    await prisma.products.create({
      data: {
        name: "Amazon Echo Dot 5th Gen",
        brand: "Amazon",
        description:
          "Smart speaker with Alexa, improved audio, and smart home hub capabilities",
        category_id: categories[4].id,
        base_price: "45000.00",
        images: [
          "https://images.unsplash.com/photo-1543512214-318c7553f230?w=500",
          "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500"
        ]
      }
    })
  );

  console.log(`✅ Created ${products.length} products`);

  // 4. Shops
  console.log("🏪 Creating shops...");
  const shops = [];

  shops.push(
    await prisma.shops.create({
      data: {
        name: "TechHub Lilongwe",
        description: "Premier electronics store in the heart of Lilongwe",
        owner_id: users[1].id,
        business_registration_no: "BL-2023-001234",
        address_line1: "Capital City Mall, Shop 12A",
        city: "Lilongwe",
        latitude: "-13.962612",
        longitude: "33.774119",
        phone: "+265998765432",
        email: "info@techhub.mw",
        is_verified: true,
        delivery_enabled: true
      }
    })
  );
  shops.push(
    await prisma.shops.create({
      data: {
        name: "Digital World Blantyre",
        description:
          "Your trusted partner for all digital solutions in Blantyre",
        owner_id: users[2].id,
        business_registration_no: "BT-2023-005678",
        address_line1: "Chichiri Shopping Centre, Unit 45",
        city: "Blantyre",
        latitude: "-15.786415",
        longitude: "35.005410",
        phone: "+265997654321",
        email: "contact@digitalworld.mw",
        is_verified: true,
        delivery_enabled: true
      }
    })
  );
  shops.push(
    await prisma.shops.create({
      data: {
        name: "Gadget Palace Mzuzu",
        description: "Northern region's leading technology store",
        owner_id: users[1].id,
        business_registration_no: "MZ-2023-009012",
        address_line1: "Mzuzu Main Market, Block C",
        city: "Mzuzu",
        latitude: "-11.465277",
        longitude: "34.015625",
        phone: "+265995123456",
        email: "mzuzu@gadgetpalace.mw",
        is_verified: false,
        delivery_enabled: true
      }
    })
  );
  shops.push(
    await prisma.shops.create({
      data: {
        name: "SmartTech Zomba",
        description:
          "University town's favorite tech store with student-friendly prices",
        owner_id: users[2].id,
        business_registration_no: "ZB-2023-012345",
        address_line1: "Zomba Town Centre, Ground Floor",
        city: "Zomba",
        latitude: "-15.385208",
        longitude: "35.318749",
        phone: "+265994321098",
        email: "zomba@smarttech.mw",
        is_verified: true,
        delivery_enabled: false
      }
    })
  );
  shops.push(
    await prisma.shops.create({
      data: {
        name: "GameZone Karonga",
        description: "Gaming paradise in the northern lakeshore region",
        owner_id: users[1].id,
        business_registration_no: "KR-2023-067890",
        address_line1: "Karonga Market, Section A",
        city: "Karonga",
        latitude: "-9.934167",
        longitude: "33.935000",
        phone: "+265993210987",
        email: "karonga@gamezone.mw",
        is_verified: true,
        delivery_enabled: true
      }
    })
  );

  console.log(`✅ Created ${shops.length} shops`);

  // 5. User Addresses
  console.log("🏠 Creating user addresses...");
  const userAddresses = [];

  userAddresses.push(
    await prisma.user_addresses.create({
      data: {
        user_id: users[0].id,
        contact_name: "Alice Banda",
        address_line1: "Plot 123, Area 25",
        city: "Lilongwe",
        country: "Malawi",
        latitude: "-13.962612",
        longitude: "33.774119",
        is_default: true
      }
    })
  );
  userAddresses.push(
    await prisma.user_addresses.create({
      data: {
        user_id: users[1].id,
        contact_name: "John Phiri",
        address_line1: "Kamuzu Central Hospital Road, House 456",
        city: "Lilongwe",
        country: "Malawi",
        latitude: "-13.978833",
        longitude: "33.787778",
        is_default: true
      }
    })
  );
  userAddresses.push(
    await prisma.user_addresses.create({
      data: {
        user_id: users[2].id,
        contact_name: "Grace Mwale",
        address_line1: "Mandala Road, Flat 7B",
        city: "Blantyre",
        country: "Malawi",
        latitude: "-15.786415",
        longitude: "35.005410",
        is_default: true
      }
    })
  );
  userAddresses.push(
    await prisma.user_addresses.create({
      data: {
        user_id: users[3].id,
        contact_name: "Peter Nyirenda",
        address_line1: "Parliament Building, Office Complex",
        city: "Lilongwe",
        country: "Malawi",
        latitude: "-13.968111",
        longitude: "33.783611",
        is_default: true
      }
    })
  );
  userAddresses.push(
    await prisma.user_addresses.create({
      data: {
        user_id: users[4].id,
        contact_name: "Mary Tembo",
        address_line1: "University of Malawi, Chancellor College",
        city: "Zomba",
        country: "Malawi",
        latitude: "-15.385208",
        longitude: "35.318749",
        is_default: true
      }
    })
  );

  console.log(`✅ Created ${userAddresses.length} user addresses`);

  // 6. Shop Products
  console.log("📦 Creating shop products...");
  const shopProducts = [];

  shopProducts.push(
    await prisma.shop_products.create({
      data: {
        shop_id: shops[0].id,
        product_id: products[0].id,
        sku: "TECH-IP15PM-256-TI",
        price: "865000.00",
        stock_quantity: 8,
        condition: "NEW",
        shop_description:
          "Brand new iPhone 15 Pro Max in Natural Titanium! Includes FREE screen protector and premium case. Official Apple warranty valid in Malawi. Fast delivery available within Lilongwe.",
        specs: {
          storage: "256GB",
          color: "Natural Titanium",
          warranty: "1 year Apple warranty",
          network: "5G enabled"
        },
        images: [
          "https://images.unsplash.com/photo-1592910147829-99f40bc3d004?w=500"
        ]
      }
    })
  );
  shopProducts.push(
    await prisma.shop_products.create({
      data: {
        shop_id: shops[1].id,
        product_id: products[1].id,
        sku: "DW-MBA-M3-256-SG",
        price: "760000.00",
        stock_quantity: 5,
        condition: "NEW",
        shop_description:
          "Apple MacBook Air M3 - Perfect for students and professionals! Lightweight design, all-day battery life. Special offer: Buy now and get Microsoft Office installed FREE. Authorized Apple reseller.",
        specs: {
          processor: "Apple M3 8-core",
          memory: "8GB",
          storage: "256GB SSD",
          display: "13.6-inch Liquid Retina"
        },
        images: [
          "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500"
        ]
      }
    })
  );
  shopProducts.push(
    await prisma.shop_products.create({
      data: {
        shop_id: shops[2].id,
        product_id: products[2].id,
        sku: "GP-SONY-1000XM5-BLK",
        price: "190000.00",
        stock_quantity: 15,
        condition: "NEW",
        shop_description:
          "Sony WH-1000XM5 - Industry-leading noise cancellation! Perfect for commuters and audiophiles. In stock now with multiple color options. Extended 2-year warranty available at checkout.",
        specs: {
          type: "Over-ear headphones",
          connectivity: "Bluetooth 5.2, NFC",
          battery: "30 hours playback",
          features: "Active Noise Cancellation"
        },
        images: [
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500"
        ]
      }
    })
  );
  shopProducts.push(
    await prisma.shop_products.create({
      data: {
        shop_id: shops[4].id,
        product_id: products[3].id,
        sku: "GZ-PS5-STD-WHT",
        price: "465000.00",
        stock_quantity: 3,
        condition: "NEW",
        shop_description:
          "PlayStation 5 Standard Edition - LIMITED STOCK! Includes DualSense controller and latest firmware. Bundle deals available with top games. Secure yours today before stock runs out!",
        specs: {
          storage: "825GB SSD",
          controller: "DualSense included",
          features: "4K Gaming, Ray Tracing",
          warranty: "1 year Sony warranty"
        },
        images: [
          "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=500"
        ]
      }
    })
  );
  shopProducts.push(
    await prisma.shop_products.create({
      data: {
        shop_id: shops[3].id,
        product_id: products[4].id,
        sku: "ST-ECHO-DOT5-BLK",
        price: "48000.00",
        stock_quantity: 20,
        condition: "NEW",
        shop_description:
          "Amazon Echo Dot (5th Gen) - Transform your home into a smart home! Controls lights, thermostats, and more. Perfect sound quality for music streaming. Great gift idea! Multiple colors in stock.",
        specs: {
          connectivity: "Wi-Fi, Bluetooth",
          assistant: "Alexa built-in",
          features: "Smart home hub, Music streaming",
          compatibility: "Works with most smart devices"
        },
        images: [
          "https://images.unsplash.com/photo-1543512214-318c7553f230?w=500"
        ]
      }
    })
  );

  console.log(`✅ Created ${shopProducts.length} shop products`);

  // 7. Orders
  console.log("🛒 Creating orders...");
  const orders = [];

  orders.push(
    await prisma.orders.create({
      data: {
        order_number: "ORD-2024-001",
        buyer_id: users[0].id,
        shop_id: shops[0].id,
        total_amount: "865000.00",
        status: "DELIVERED",
        delivery_address_id: userAddresses[0].id
      }
    })
  );
  orders.push(
    await prisma.orders.create({
      data: {
        order_number: "ORD-2024-002",
        buyer_id: users[4].id,
        shop_id: shops[1].id,
        total_amount: "760000.00",
        status: "CONFIRMED",
        delivery_address_id: userAddresses[4].id
      }
    })
  );
  orders.push(
    await prisma.orders.create({
      data: {
        order_number: "ORD-2024-003",
        buyer_id: users[1].id,
        shop_id: shops[2].id,
        total_amount: "190000.00",
        status: "PREPARING",
        delivery_address_id: userAddresses[1].id
      }
    })
  );
  orders.push(
    await prisma.orders.create({
      data: {
        order_number: "ORD-2024-004",
        buyer_id: users[0].id,
        shop_id: shops[4].id,
        total_amount: "465000.00",
        status: "OUT_FOR_DELIVERY",
        delivery_address_id: userAddresses[0].id
      }
    })
  );
  orders.push(
    await prisma.orders.create({
      data: {
        order_number: "ORD-2024-005",
        buyer_id: users[4].id,
        shop_id: shops[3].id,
        total_amount: "48000.00",
        status: "DELIVERED",
        delivery_address_id: userAddresses[4].id
      }
    })
  );

  console.log(`✅ Created ${orders.length} orders`);

  // 7b. Cart Orders (status: CART)
  console.log("🛒 Creating cart orders...");
  const cartOrders = [];

  // Alice's cart at TechHub Lilongwe (has 2 items)
  cartOrders.push(
    await prisma.orders.create({
      data: {
        order_number: `CART-${users[0].id.substring(0, 8)}`, // Unique cart identifier
        buyer_id: users[0].id, // Alice
        shop_id: shops[0].id, // TechHub Lilongwe
        total_amount: "0.00", // Will be calculated from items
        status: "CART"
      }
    })
  );

  // Mary's cart at Digital World Blantyre (has 1 item)
  cartOrders.push(
    await prisma.orders.create({
      data: {
        order_number: `CART-${users[4].id.substring(0, 8)}`, // Unique cart identifier
        buyer_id: users[4].id, // Mary
        shop_id: shops[1].id, // Digital World Blantyre
        total_amount: "0.00",
        status: "CART"
      }
    })
  );

  console.log(`✅ Created ${cartOrders.length} cart orders`);

  // 8. Order Items
  console.log("📋 Creating order items...");
  const orderItems = [];

  orderItems.push(
    await prisma.order_items.create({
      data: {
        order_id: orders[0].id,
        shop_product_id: shopProducts[0].id,
        product_name: "iPhone 15 Pro Max",
        quantity: 1,
        unit_price: "865000.00"
      }
    })
  );
  orderItems.push(
    await prisma.order_items.create({
      data: {
        order_id: orders[1].id,
        shop_product_id: shopProducts[1].id,
        product_name: "MacBook Air M3",
        quantity: 1,
        unit_price: "760000.00"
      }
    })
  );
  orderItems.push(
    await prisma.order_items.create({
      data: {
        order_id: orders[2].id,
        shop_product_id: shopProducts[2].id,
        product_name: "Sony WH-1000XM5",
        quantity: 1,
        unit_price: "190000.00"
      }
    })
  );
  orderItems.push(
    await prisma.order_items.create({
      data: {
        order_id: orders[3].id,
        shop_product_id: shopProducts[3].id,
        product_name: "PlayStation 5",
        quantity: 1,
        unit_price: "465000.00"
      }
    })
  );
  orderItems.push(
    await prisma.order_items.create({
      data: {
        order_id: orders[4].id,
        shop_product_id: shopProducts[4].id,
        product_name: "Amazon Echo Dot 5th Gen",
        quantity: 1,
        unit_price: "48000.00"
      }
    })
  );

  console.log(`✅ Created ${orderItems.length} order items`);

  // 8b. Cart Items
  console.log("🛒 Creating cart items...");
  const cartItems = [];

  // Alice's cart - 2 items from TechHub Lilongwe
  cartItems.push(
    await prisma.order_items.create({
      data: {
        order_id: cartOrders[0].id,
        shop_product_id: shopProducts[0].id, // iPhone 15 Pro Max
        product_name: "iPhone 15 Pro Max",
        quantity: 1,
        unit_price: "865000.00"
      }
    })
  );
  cartItems.push(
    await prisma.order_items.create({
      data: {
        order_id: cartOrders[0].id,
        shop_product_id: shopProducts[2].id, // Sony WH-1000XM5 (if from same shop)
        product_name: "Sony WH-1000XM5",
        quantity: 2,
        unit_price: "190000.00"
      }
    })
  );

  // Mary's cart - 1 item from Digital World Blantyre
  cartItems.push(
    await prisma.order_items.create({
      data: {
        order_id: cartOrders[1].id,
        shop_product_id: shopProducts[1].id, // MacBook Air M3
        product_name: "MacBook Air M3",
        quantity: 1,
        unit_price: "760000.00"
      }
    })
  );

  // Update cart totals
  await prisma.orders.update({
    where: { id: cartOrders[0].id },
    data: { total_amount: "1245000.00" } // 865000 + (190000 * 2)
  });

  await prisma.orders.update({
    where: { id: cartOrders[1].id },
    data: { total_amount: "760000.00" }
  });

  console.log(`✅ Created ${cartItems.length} cart items`);

  // 9. Payments
  console.log("💳 Creating payments...");
  const payments = [];

  payments.push(
    await prisma.payments.create({
      data: {
        order_id: orders[0].id,
        amount: "865000.00",
        payment_method: "MOBILE_MONEY",
        status: "PAID"
      }
    })
  );
  payments.push(
    await prisma.payments.create({
      data: {
        order_id: orders[1].id,
        amount: "760000.00",
        payment_method: "CARD",
        status: "PENDING"
      }
    })
  );
  payments.push(
    await prisma.payments.create({
      data: {
        order_id: orders[2].id,
        amount: "190000.00",
        payment_method: "MOBILE_MONEY",
        status: "PAID"
      }
    })
  );
  payments.push(
    await prisma.payments.create({
      data: {
        order_id: orders[3].id,
        amount: "465000.00",
        payment_method: "CARD",
        status: "PAID"
      }
    })
  );
  payments.push(
    await prisma.payments.create({
      data: {
        order_id: orders[4].id,
        amount: "48000.00",
        payment_method: "MOBILE_MONEY",
        status: "PAID"
      }
    })
  );

  console.log(`✅ Created ${payments.length} payments`);

  // 10. Shop Products Logs
  console.log("📊 Creating shop products logs...");
  const shopProductLogs = [];

  shopProductLogs.push(
    await prisma.shop_products_log.create({
      data: {
        shop_product_id: shopProducts[0].id,
        change_type: "DECREASE",
        change_qty: 1,
        reason: "Customer purchase - Order ORD-2024-001"
      }
    })
  );
  shopProductLogs.push(
    await prisma.shop_products_log.create({
      data: {
        shop_product_id: shopProducts[1].id,
        change_type: "INCREASE",
        change_qty: 5,
        reason: "Inventory restock from supplier"
      }
    })
  );
  shopProductLogs.push(
    await prisma.shop_products_log.create({
      data: {
        shop_product_id: shopProducts[2].id,
        change_type: "DECREASE",
        change_qty: 2,
        reason: "Customer purchase - Bulk order"
      }
    })
  );
  shopProductLogs.push(
    await prisma.shop_products_log.create({
      data: {
        shop_product_id: shopProducts[3].id,
        change_type: "DECREASE",
        change_qty: 1,
        reason: "Customer purchase - Order ORD-2024-004"
      }
    })
  );
  shopProductLogs.push(
    await prisma.shop_products_log.create({
      data: {
        shop_product_id: shopProducts[4].id,
        change_type: "INCREASE",
        change_qty: 10,
        reason: "New stock arrival from Amazon"
      }
    })
  );

  console.log(`✅ Created ${shopProductLogs.length} shop products logs`);

  // 11. Reviews
  console.log("⭐ Creating reviews...");
  const reviews = [];

  reviews.push(
    await prisma.reviews.create({
      data: {
        order_id: orders[0].id,
        reviewer_id: users[0].id,
        shop_id: shops[0].id,
        product_id: products[0].id,
        rating: 5,
        comment:
          "Excellent phone! Fast delivery and genuine product. Highly recommend TechHub Lilongwe!"
      }
    })
  );
  reviews.push(
    await prisma.reviews.create({
      data: {
        order_id: orders[2].id,
        reviewer_id: users[1].id,
        shop_id: shops[2].id,
        product_id: products[2].id,
        rating: 4,
        comment:
          "Great headphones with amazing noise cancellation. Good service from the team at Gadget Palace."
      }
    })
  );
  reviews.push(
    await prisma.reviews.create({
      data: {
        order_id: orders[1].id,
        reviewer_id: users[4].id,
        shop_id: shops[1].id,
        product_id: products[1].id,
        rating: 5,
        comment:
          "Perfect laptop for my studies! Fast processing and great battery life. Digital World has excellent customer service."
      }
    })
  );
  reviews.push(
    await prisma.reviews.create({
      data: {
        order_id: orders[3].id,
        reviewer_id: users[0].id,
        shop_id: shops[4].id,
        product_id: products[3].id,
        rating: 5,
        comment:
          "Amazing gaming experience! Fast shipping to Lilongwe. GameZone really knows their gaming products."
      }
    })
  );
  reviews.push(
    await prisma.reviews.create({
      data: {
        order_id: orders[4].id,
        reviewer_id: users[4].id,
        shop_id: shops[3].id,
        product_id: products[4].id,
        rating: 4,
        comment:
          "Great smart speaker for my dorm room. Easy setup and Alexa works perfectly. Good price for students!"
      }
    })
  );

  console.log(`✅ Created ${reviews.length} reviews`);

  // 12. Order Messages
  console.log("📧 Creating order messages...");
  const orderMessages = [];

  orderMessages.push(
    await prisma.order_messages.create({
      data: {
        order_id: orders[0].id,
        recipient_type: "CUSTOMER",
        channel: "EMAIL",
        message_type: "ORDER_CONFIRMATION",
        subject: "Order Confirmed - ORD-2024-001",
        body:
          "Your order for iPhone 15 Pro Max has been confirmed and is being prepared for shipment.",
        is_sent: true,
        sent_at: new Date()
      }
    })
  );
  orderMessages.push(
    await prisma.order_messages.create({
      data: {
        order_id: orders[1].id,
        recipient_type: "SHOP",
        channel: "EMAIL",
        message_type: "NEW_ORDER",
        subject: "New Order Received - ORD-2024-002",
        body:
          "You have received a new order for MacBook Air M3. Please prepare the item for shipment.",
        is_sent: true,
        sent_at: new Date()
      }
    })
  );
  orderMessages.push(
    await prisma.order_messages.create({
      data: {
        order_id: orders[2].id,
        recipient_type: "CUSTOMER",
        channel: "SMS",
        message_type: "ORDER_PREPARING",
        subject: "Order Being Prepared - ORD-2024-003",
        body:
          "Your order for Sony WH-1000XM5 headphones is currently being prepared by Gadget Palace Mzuzu.",
        is_sent: true,
        sent_at: new Date()
      }
    })
  );
  orderMessages.push(
    await prisma.order_messages.create({
      data: {
        order_id: orders[3].id,
        recipient_type: "CUSTOMER",
        channel: "PUSH",
        message_type: "ORDER_SHIPPED",
        subject: "Order Shipped - ORD-2024-004",
        body:
          "Your PlayStation 5 order is out for delivery and should arrive within 2-3 business days.",
        is_sent: true,
        sent_at: new Date()
      }
    })
  );
  orderMessages.push(
    await prisma.order_messages.create({
      data: {
        order_id: orders[4].id,
        recipient_type: "CUSTOMER",
        channel: "EMAIL",
        message_type: "ORDER_DELIVERED",
        subject: "Order Delivered - ORD-2024-005",
        body:
          "Your Amazon Echo Dot has been successfully delivered. Thank you for choosing SmartTech Zomba!",
        is_sent: true,
        sent_at: new Date()
      }
    })
  );

  console.log(`✅ Created ${orderMessages.length} order messages`);

  console.log("✅ Seeding completed successfully!");
  console.log("📊 Database Summary:");
  console.log(`- 👥 Users: ${users.length} (1 Admin, 2 Sellers, 2 Users)`);
  console.log(`- 📱 Categories: ${categories.length}`);
  console.log(`- 🛍️ Products: ${products.length}`);
  console.log(`- 🏪 Shops: ${shops.length}`);
  console.log(`- 🏠 User Addresses: ${userAddresses.length}`);
  console.log(`- 📦 Shop Products: ${shopProducts.length}`);
  console.log(`- 🛒 Orders: ${orders.length}`);
  console.log(`- � Cart Orders: ${cartOrders.length}`);
  console.log(`- �📋 Order Items: ${orderItems.length}`);
  console.log(`- � Cart Items: ${cartItems.length}`);
  console.log(`- �💳 Payments: ${payments.length}`);
  console.log(`- ⭐ Reviews: ${reviews.length}`);
  console.log(`- 📧 Order Messages: ${orderMessages.length}`);
  console.log(`- 📊 Shop Products Log: ${shopProductLogs.length}`);
  console.log("🎉 Database is ready for comprehensive testing!");
  console.log("🔐 User passwords represented by different hashes:");
  console.log("  - Alice: password123 (has cart with 2 items)");
  console.log("  - John: secure456");
  console.log("  - Grace: strong789");
  console.log("  - Peter: admin321");
  console.log("  - Mary: user654 (has cart with 1 item)");
}

main()
  .catch(e => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
