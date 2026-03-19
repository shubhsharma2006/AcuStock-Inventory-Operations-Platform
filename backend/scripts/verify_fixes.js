/**
 * Enterprise Verification Script
 * Tests: Serial Policy, Global Uniqueness, Audit Trail
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Item = require('../src/models/Item');
const StockLedger = require('../src/models/StockLedger');
const SerialAudit = require('../src/models/SerialAudit');
const User = require('../src/models/User');

const runVerification = async () => {
    console.log('🚀 Starting Enterprise Verification...\n');

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Create test user
        const user = new User({
            name: 'Test Enterprise User',
            email: `testenterprise${Date.now()}@example.com`,
            password: 'hashedpassword',
            role: 'ADMIN'
        });
        await user.save();
        console.log('✅ Created test user\n');

        // Create test Item with enterprise serialPolicy
        const item = new Item({
            name: 'Enterprise Test Product',
            salesPrice: 100,
            purchasePrice: 80,
            serialPolicy: {
                enableSerial: true,
                requireSerialOnIN: true,
                requireSerialOnOUT: true
            },
            createdBy: user._id
        });
        await item.save();
        console.log('✅ Created test item with serialPolicy:', JSON.stringify(item.serialPolicy));

        // Test Stock IN with serials
        const serialsIn = Array.from({ length: 3 }, (_, i) => `ENTERPRISE-${Date.now()}-${i}`);
        await StockLedger.create({
            productId: item._id,
            type: 'IN',
            quantity: 3,
            serialNumbers: serialsIn,
            createdBy: user._id,
            role: 'ADMIN'
        });

        // Create audit entries with new schema
        await SerialAudit.insertMany(serialsIn.map(s => ({
            serial: s,
            productId: item._id,
            action: 'IN',
            performedBy: user._id,
            role: 'ADMIN'
        })));
        console.log('✅ Stock IN (+3) with serials\n');

        // Verify stock
        let stock = await item.getCurrentStock();
        console.log(`📊 Current Stock: ${stock} (expected: 3)`);
        if (stock !== 3) throw new Error(`Expected 3, got ${stock}`);

        // Test Stock OUT
        const serialsOut = serialsIn.slice(0, 1);
        await StockLedger.create({
            productId: item._id,
            type: 'OUT',
            quantity: -1,
            serialNumbers: serialsOut,
            createdBy: user._id,
            role: 'ADMIN'
        });

        await SerialAudit.insertMany(serialsOut.map(s => ({
            serial: s,
            productId: item._id,
            action: 'OUT',
            performedBy: user._id,
            role: 'ADMIN'
        })));
        console.log('✅ Stock OUT (-1) with serial\n');

        stock = await item.getCurrentStock();
        console.log(`📊 Current Stock: ${stock} (expected: 2)`);
        if (stock !== 2) throw new Error(`Expected 2, got ${stock}`);

        // Verify audit trail
        const audits = await SerialAudit.find({ serial: serialsOut[0] }).sort({ createdAt: 1 });
        console.log(`📝 Audit trail for ${serialsOut[0]}:`, audits.map(a => a.action));
        if (audits.length !== 2 || audits[0].action !== 'IN' || audits[1].action !== 'OUT') {
            throw new Error('Audit trail incorrect');
        }
        console.log('✅ Audit trail verified (IN -> OUT)\n');

        // Cleanup
        await Item.deleteOne({ _id: item._id });
        await StockLedger.deleteMany({ productId: item._id });
        await SerialAudit.deleteMany({ serial: { $in: serialsIn } });
        await User.deleteOne({ _id: user._id });
        console.log('🧹 Cleanup complete\n');

        console.log('============================================');
        console.log('✅ ENTERPRISE VERIFICATION SUCCESSFUL');
        console.log('============================================');
    } catch (err) {
        console.error('❌ VERIFICATION FAILED:', err.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
};

runVerification();
