require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Tenant = require('../src/models/Tenant');
const QuotaReservation = require('../src/models/QuotaReservation');

async function cleanupQuotaReservations(now = new Date()) {
  const expired = await QuotaReservation.find({ status: 'ACTIVE', expiresAt: { $lte: now } }).lean();
  let released = 0;
  for (const reservation of expired) {
    const claimed = await QuotaReservation.findOneAndUpdate(
      { _id: reservation._id, status: 'ACTIVE' },
      { $set: { status: 'RELEASED', releasedAt: now } },
      { new: true }
    );
    if (!claimed) continue;
    await Tenant.updateOne(
      { _id: reservation.tenantId, [`usage.${reservation.usageKey}`]: { $gt: 0 } },
      { $inc: { [`usage.${reservation.usageKey}`]: -1 } }
    );
    released += 1;
  }
  return released;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    console.log(`Released ${await cleanupQuotaReservations()} expired quota reservation(s)`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch((error) => {
  console.error('Quota reservation cleanup failed:', error);
  process.exitCode = 1;
});

module.exports = { cleanupQuotaReservations };
