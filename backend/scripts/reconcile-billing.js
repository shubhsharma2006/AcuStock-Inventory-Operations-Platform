require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { reconcileBillingSubscriptions } = require('../src/routes/billing');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    console.log(`Reconciled ${await reconcileBillingSubscriptions()} Stripe subscription(s)`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch((error) => {
  console.error('Billing reconciliation failed:', error);
  process.exitCode = 1;
});
