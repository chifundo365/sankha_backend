import prisma from "../src/prismaClient";

async function testConnection() {
  console.log("Testing database connection...");

  try {
    // Simple connection test
    await prisma.$connect();
    console.log("✅ Database connection successful");

    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log("✅ Database query test successful:", result);
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
