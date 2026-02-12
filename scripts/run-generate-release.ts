import { orderConfirmationService } from '../src/services/orderConfirmation.service';

async function main() {
  const orderId = process.argv[2] || '1f34ce98-9c35-4a83-a2f3-cbb91aac6158';
  console.log('Generating release code for order:', orderId);

  try {
    const res = await orderConfirmationService.generateReleaseCode(orderId as string);
    console.log('Result:', res);
  } catch (err) {
    console.error('Error generating release code:', err);
  } finally {
    // allow process to exit
    process.exit(0);
  }
}

main();
