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

  const passwordHashes = [
    "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewHiHhqcD6nXuBk6",
    "$2b$12$9Hk8DzP2nVxQ4fG7RjL3VeKm6wT8sN9bC5xY1uE3rA7oI4dF6hS8g",
    "$2b$12$X3vM8Qw6PtN5jK2sL9fH4eR7uY9bC1xV5gT8nM4pQ6wE2rT7yU1o",
    "$2b$12$B5nK7Qs4WtM8jP9sF3gH2eR6yU4bX1vC8gN5pL7wE9rT2yI6oQ3m",
    "$2b$12$F9mK3Qw7RtN6jL2sP8gH5eY4uB1xV9gT6nM2pQ5wE8rT1yI3oC7s"
  ];

  // 1. Users
  console.log("👥 Creating users...");
  const users = [];

  users.push(await prisma.users.create({
    data: {
      full_name: "Alice Banda",
      email: "alice.banda@gmail.com",
      phone_number: "+265991234567",
      password_hash: passwordHashes[0],
      role: "USER", // was CUSTOMER
      profile_image: "https://images.unsplash.com/photo-1494790108755-2616b612b1c5?w=200"
    }
  }));

  users.push(await prisma.users.create({
    data: {
      full_name: "John Phiri",
      email: "john.phiri@techstore.mw",
      phone_number: "+265998765432",
      password_hash: passwordHashes[1],
      role: "SELLER",
      profile_image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200"
    }
  }));

  users.push(await prisma.users.create({
    data: {
      full_name: "Grace Mwale",
      email: "grace.mwale@digitalmw.com",
      phone_number: "+265997654321",
      password_hash: passwordHashes[2],
      role: "SELLER",
      profile_image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200"
    }
  }));

  users.push(await prisma.users.create({
    data: {
      full_name: "Peter Nyirenda",
      email: "peter.nyirenda@admin.com",
      phone_number: "+265996543210",
      password_hash: passwordHashes[3],
      role: "ADMIN",
      profile_image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200"
    }
  }));

  users.push(await prisma.users.create({
    data: {
      full_name: "Mary Tembo",
      email: "mary.tembo@customer.com",
      phone_number: "+265995432109",
      password_hash: passwordHashes[4],
      role: "USER", // was CUSTOMER
      profile_image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200"
    }
  }));

  console.log(`✅ Created ${users.length} users`);

  // 2. Categories
  console.log("📱 Creating categories...");
  const categories = [];

  categories.push(await prisma.categories.create({data: {name: "Smartphones & Tablets", description: "Latest mobile devices, smartphones, tablets and accessories"}}));
  categories.push(await prisma.categories.create({data: {name: "Laptops & Computers", description: "Desktop computers, laptops, monitors and computer accessories"}}));
  categories.push(await prisma.categories.create({data: {name: "Audio & Headphones", description: "Speakers, headphones, earbuds and audio equipment"}}));
  categories.push(await prisma.categories.create({data: {name: "Gaming & Consoles", description: "Gaming consoles, video games, and gaming accessories"}}));
  categories.push(await prisma.categories.create({data: {name: "Smart Home & IoT", description: "Smart home devices, IoT gadgets, and home automation"}}));

  console.log(`✅ Created ${categories.length} categories`);

  // 3. Products
  console.log("🛍️ Creating products...");
  const products = [];

  products.push(await prisma.products.create({data: {name: "iPhone 15 Pro Max", brand: "Apple", description: "The latest iPhone with A17 Pro chip, titanium design, and advanced camera system", category_id: categories[0].id, base_price: "850000.00", images: ["https://images.unsplash.com/photo-1592910147829-99f40bc3d004?w=500","https://images.unsplash.com/photo-1601972602237-8c79241e468b?w=500"]}}));
  products.push(await prisma.products.create({data: {name: "MacBook Air M3", brand: "Apple", description: "Lightweight laptop with M3 chip, 13-inch Retina display, and all-day battery life", category_id: categories[1].id, base_price: "750000.00", images: ["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500","https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=500"]}}));
  products.push(await prisma.products.create({data: {name: "Sony WH-1000XM5", brand: "Sony", description: "Premium noise-canceling wireless headphones with exceptional sound quality", category_id: categories[2].id, base_price: "185000.00", images: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500","https://images.unsplash.com/photo-1484704849700-f032a568e944?w=500"]}}));
  products.push(await prisma.products.create({data: {name: "PlayStation 5", brand: "Sony", description: "Next-generation gaming console with 4K gaming and ultra-high speed SSD", category_id: categories[3].id, base_price: "450000.00", images: ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=500","https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=500"]}}));
  products.push(await prisma.products.create({data: {name: "Amazon Echo Dot 5th Gen", brand: "Amazon", description: "Smart speaker with Alexa, improved audio, and smart home hub capabilities", category_id: categories[4].id, base_price: "45000.00", images: ["https://images.unsplash.com/photo-1543512214-318c7553f230?w=500","https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500"]}}));

  console.log(`✅ Created ${products.length} products`);

  // 4. Shops
  console.log("🏪 Creating shops...");
  const shops = [];

  shops.push(await prisma.shops.create({data:{name:"TechHub Lilongwe", description:"Premier electronics store in the heart of Lilongwe", owner_id:users[1].id, business_registration_no:"BL-2023-001234", address_line1:"Capital City Mall, Shop 12A", city:"Lilongwe", latitude:"-13.962612", longitude:"33.774119", phone:"+265998765432", email:"info@techhub.mw", is_verified:true, delivery_enabled:true}}));
  shops.push(await prisma.shops.create({data:{name:"Digital World Blantyre", description:"Your trusted partner for all digital solutions in Blantyre", owner_id:users[2].id, business_registration_no:"BT-2023-005678", address_line1:"Chichiri Shopping Centre, Unit 45", city:"Blantyre", latitude:"-15.786415", longitude:"35.005410", phone:"+265997654321", email:"contact@digitalworld.mw", is_verified:true, delivery_enabled:true}}));
  shops.push(await prisma.shops.create({data:{name:"Gadget Palace Mzuzu", description:"Northern region's leading technology store", owner_id:users[1].id, business_registration_no:"MZ-2023-009012", address_line1:"Mzuzu Main Market, Block C", city:"Mzuzu", latitude:"-11.465277", longitude:"34.015625", phone:"+265995123456", email:"mzuzu@gadgetpalace.mw", is_verified:false, delivery_enabled:true}}));
  shops.push(await prisma.shops.create({data:{name:"SmartTech Zomba", description:"University town's favorite tech store with student-friendly prices", owner_id:users[2].id, business_registration_no:"ZB-2023-012345", address_line1:"Zomba Town Centre, Ground Floor", city:"Zomba", latitude:"-15.385208", longitude:"35.318749", phone:"+265994321098", email:"zomba@smarttech.mw", is_verified:true, delivery_enabled:false}}));
  shops.push(await prisma.shops.create({data:{name:"GameZone Karonga", description:"Gaming paradise in the northern lakeshore region", owner_id:users[1].id, business_registration_no:"KR-2023-067890", address_line1:"Karonga Market, Section A", city:"Karonga", latitude:"-9.934167", longitude:"33.935000", phone:"+265993210987", email:"karonga@gamezone.mw", is_verified:true, delivery_enabled:true}}));

  console.log(`✅ Created ${shops.length} shops`);

  // 5. User Addresses
  console.log("🏠 Creating user addresses...");
  const userAddresses = [];

  userAddresses.push(await prisma.user_addresses.create({data:{user_id:users[0].id, contact_name:"Alice Banda", address_line1:"Plot 123, Area 25", city:"Lilongwe", country:"Malawi", latitude:"-13.962612", longitude:"33.774119", is_default:true}}));
  userAddresses.push(await prisma.user_addresses.create({data:{user_id:users[1].id, contact_name:"John Phiri", address_line1:"Kamuzu Central Hospital Road, House 456", city:"Lilongwe", country:"Malawi", latitude:"-13.978833", longitude:"33.787778", is_default:true}}));
  userAddresses.push(await prisma.user_addresses.create({data:{user_id:users[2].id, contact_name:"Grace Mwale", address_line1:"Mandala Road, Flat 7B", city:"Blantyre", country:"Malawi", latitude:"-15.786415", longitude:"35.005410", is_default:true}}));
  userAddresses.push(await prisma.user_addresses.create({data:{user_id:users[3].id, contact_name:"Peter Nyirenda", address_line1:"Parliament Building, Office Complex", city:"Lilongwe", country:"Malawi", latitude:"-13.968111", longitude:"33.783611", is_default:true}}));
  userAddresses.push(await prisma.user_addresses.create({data:{user_id:users[4].id, contact_name:"Mary Tembo", address_line1:"University of Malawi, Chancellor College", city:"Zomba", country:"Malawi", latitude:"-15.385208", longitude:"35.318749", is_default:true}}));

  console.log(`✅ Created ${userAddresses.length} user addresses`);

  // 6. Shop Products
  console.log("📦 Creating shop products...");
  const shopProducts = [];

  shopProducts.push(await prisma.shop_products.create({data:{shop_id:shops[0].id, product_id:products[0].id, price:"865000.00", stock_quantity:8, condition:"NEW", specs:{storage:"256GB", color:"Natural Titanium", warranty:"1 year Apple warranty", network:"5G enabled"}, images:["https://images.unsplash.com/photo-1592910147829-99f40bc3d004?w=500"]}}));
  shopProducts.push(await prisma.shop_products.create({data:{shop_id:shops[1].id, product_id:products[1].id, price:"760000.00", stock_quantity:5, condition:"NEW", specs:{processor:"Apple M3 8-core", memory:"8GB", storage:"256GB SSD", display:"13.6-inch Liquid Retina"}, images:["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500"]}}));
  shopProducts.push(await prisma.shop_products.create({data:{shop_id:shops[2].id, product_id:products[2].id, price:"190000.00", stock_quantity:15, condition:"NEW", specs:{type:"Over-ear headphones", connectivity:"Bluetooth 5.2, NFC", battery:"30 hours playback", features:"Active Noise Cancellation"}, images:["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500"]}}));
  shopProducts.push(await prisma.shop_products.create({data:{shop_id:shops[4].id, product_id:products[3].id, price:"465000.00", stock_quantity:3, condition:"NEW", specs:{storage:"825GB SSD", controller:"DualSense included", features:"4K Gaming, Ray Tracing", warranty:"1 year Sony warranty"}, images:["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=500"]}}));
  shopProducts.push(await prisma.shop_products.create({data:{shop_id:shops[3].id, product_id:products[4].id, price:"48000.00", stock_quantity:20, condition:"NEW", specs:{connectivity:"Wi-Fi, Bluetooth", assistant:"Alexa built-in", features:"Smart home hub, Music streaming", compatibility:"Works with most smart devices"}, images:["https://images.unsplash.com/photo-1543512214-318c7553f230?w=500"]}}));

  console.log(`✅ Created ${shopProducts.length} shop products`);

  // 7. Orders
  console.log("🛒 Creating orders...");
  const orders = [];

  orders.push(await prisma.orders.create({data:{order_number:"ORD-2024-001", buyer_id:users[0].id, shop_id:shops[0].id, total_amount:"865000.00", status:"DELIVERED", delivery_address_id:userAddresses[0].id}}));
  orders.push(await prisma.orders.create({data:{order_number:"ORD-2024-002", buyer_id:users[4].id, shop_id:shops[1].id, total_amount:"760000.00", status:"CONFIRMED", delivery_address_id:userAddresses[4].id}}));
  orders.push(await prisma.orders.create({data:{order_number:"ORD-2024-003", buyer_id:users[1].id, shop_id:shops[2].id, total_amount:"190000.00", status:"PREPARING", delivery_address_id:userAddresses[1].id}}));
  orders.push(await prisma.orders.create({data:{order_number:"ORD-2024-004", buyer_id:users[0].id, shop_id:shops[4].id, total_amount:"465000.00", status:"OUT_FOR_DELIVERY", delivery_address_id:userAddresses[0].id}}));
  orders.push(await prisma.orders.create({data:{order_number:"ORD-2024-005", buyer_id:users[4].id, shop_id:shops[3].id, total_amount:"48000.00", status:"DELIVERED", delivery_address_id:userAddresses[4].id}}));

  console.log(`✅ Created ${orders.length} orders`);

  // 8. Order Items
  console.log("📋 Creating order items...");
  const orderItems = [];

  orderItems.push(await prisma.order_items.create({data:{order_id:orders[0].id, shop_product_id:shopProducts[0].id, product_name:"iPhone 15 Pro Max", quantity:1, unit_price:"865000.00"}}));
  orderItems.push(await prisma.order_items.create({data:{order_id:orders[1].id, shop_product_id:shopProducts[1].id, product_name:"MacBook Air M3", quantity:1, unit_price:"760000.00"}}));
  orderItems.push(await prisma.order_items.create({data:{order_id:orders[2].id, shop_product_id:shopProducts[2].id, product_name:"Sony WH-1000XM5", quantity:1, unit_price:"190000.00"}}));
  orderItems.push(await prisma.order_items.create({data:{order_id:orders[3].id, shop_product_id:shopProducts[3].id, product_name:"PlayStation 5", quantity:1, unit_price:"465000.00"}}));
  orderItems.push(await prisma.order_items.create({data:{order_id:orders[4].id, shop_product_id:shopProducts[4].id, product_name:"Amazon Echo Dot 5th Gen", quantity:1, unit_price:"48000.00"}}));

  console.log(`✅ Created ${orderItems.length} order items`);

  // 9. Payments
  console.log("💳 Creating payments...");
  const payments = [];

  payments.push(await prisma.payments.create({data:{order_id:orders[0].id, amount:"865000.00", payment_method:"MOBILE_MONEY", status:"PAID"}}));
  payments.push(await prisma.payments.create({data:{order_id:orders[1].id, amount:"760000.00", payment_method:"CARD", status:"PENDING"}}));
  payments.push(await prisma.payments.create({data:{order_id:orders[2].id, amount:"190000.00", payment_method:"MOBILE_MONEY", status:"PAID"}}));
  payments.push(await prisma.payments.create({data:{order_id:orders[3].id, amount:"465000.00", payment_method:"CARD", status:"PAID"}}));
  payments.push(await prisma.payments.create({data:{order_id:orders[4].id, amount:"48000.00", payment_method:"MOBILE_MONEY", status:"PAID"}}));

  console.log(`✅ Created ${payments.length} payments`);

  // 10. Shop Products Logs
  console.log("📊 Creating shop products logs...");
  const shopProductLogs = [];

  shopProductLogs.push(await prisma.shop_products_log.create({data:{shop_product_id:shopProducts[0].id, change_type:"DECREASE", change_qty:1}})); // SALE -> DECREASE
  shopProductLogs.push(await prisma.shop_products_log.create({data:{shop_product_id:shopProducts[1].id, change_type:"INCREASE", change_qty:5}})); // RESTOCK -> INCREASE

  console.log(`✅ Created ${shopProductLogs.length} shop products logs`);

    console.log("✅ Seeding completed successfully!");
    console.log("📊 Database Summary:");
    console.log(
      `- 👥 Users: ${users.length} (1 Admin, 2 Sellers, 2 Customers)`
    );
    console.log(`- 📱 Categories: ${categories.length}`);
    console.log(`- 🛍️ Products: ${products.length}`);
    console.log(`- 🏪 Shops: ${shops.length}`);
    console.log(`- 🏠 User Addresses: ${userAddresses.length}`);
    console.log(`- 📦 Shop Products: ${shopProducts.length}`);
    console.log(`- 🛒 Orders: ${orders.length}`);
    console.log(`- 📋 Order Items: ${orderItems.length}`);
    console.log(`- 💳 Payments: ${payments.length}`);
    console.log(`- ⭐ Reviews: ${reviews.length}`);
    console.log(`- 📧 Order Messages: ${orderMessages.length}`);
    console.log(`- 📊 Shop Products Log: ${shopProductsLog.length}`);
    console.log("🎉 Database is ready for comprehensive testing!");
    console.log("🔐 User passwords represented by different hashes:");
    console.log("  - Alice: password123");
    console.log("  - John: secure456");
    console.log("  - Grace: strong789");
    console.log("  - Peter: admin321");
    console.log("  - Mary: user654");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    throw error;
  }
}

main()
  .catch(e => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
