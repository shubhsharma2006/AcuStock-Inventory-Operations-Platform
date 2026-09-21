const fs = require('fs');
const file = 'backend/src/routes/stock.js';
let content = fs.readFileSync(file, 'utf8');

const bad = `  try {
    const item = await Item.findById(productId);
    return res.status(400).json({ message: 'Serial numbers count cannot exceed quantity' });
  }

  try {
    const item = await Item.findById(productId);
    return res.status(400).json({ message: 'Serial numbers count cannot exceed quantity' });
  }

  try {
  const { productId, quantity, serialNumbers = [], supplier, condition, transaction, modelVariant } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ message: 'Product ID and quantity are required' });
  }

  try {
    const item = await Item.findById(productId);`;

const good = `  try {
    const item = await Item.findById(productId);`;

if (content.includes(bad)) {
  content = content.replace(bad, good);
  fs.writeFileSync(file, content);
  console.log('Fixed duplicate block in stock.js');
} else {
  console.log('Block not found, checking file...');
}
