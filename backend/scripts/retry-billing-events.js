require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { retryFailedBillingEvents } = require('../src/routes/billing');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    console.log(`Processed ${await retryFailedBillingEvents()} failed billing event(s)`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch((error) => {
  console.error('Billing event retry failed:', error);
  process.exitCode = 1;
});
