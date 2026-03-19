const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Unit name is required'],
    trim: true,
    maxlength: [100, 'Unit name cannot exceed 100 characters']
  },
  shortName: {
    type: String,
    required: [true, 'Short name is required'],
    trim: true,
    maxlength: [20, 'Short name cannot exceed 20 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Single compound index for efficient querying and uniqueness
unitSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
unitSchema.index({ isActive: 1 });

module.exports = mongoose.model('Unit', unitSchema);
