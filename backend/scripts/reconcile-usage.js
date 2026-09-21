require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Tenant = require('../src/models/Tenant');
const User = require('../src/models/User');
const Item = require('../src/models/Item');
const Company = require('../src/models/Company');

async function reconcileUsage() {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const tenants = await Tenant.find({}).select('_id').lean();
    for (const tenant of tenants) {
      const [users, items, companies] = await Promise.all([
        User.countDocuments({ tenantId: tenant._id, isDeleted: { $ne: true } }),
        Item.countDocuments({ tenantId: tenant._id, isActive: { $ne: false } }),
        Company.countDocuments({ tenantId: tenant._id, isDeleted: { $ne: true } })
      ]);
      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { usage: { users, items, companies } } }
      );
      console.log(`Reconciled ${tenant._id}: users=${users}, items=${items}, companies=${companies}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  reconcileUsage().catch((error) => {
    console.error('Usage reconciliation failed:', error);
    process.exitCode = 1;
  });
}

module.exports = { reconcileUsage };
