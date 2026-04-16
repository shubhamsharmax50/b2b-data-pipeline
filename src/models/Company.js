const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    ycId:        { type: String, unique: true, sparse: true },
    name:        { type: String, required: true },
    slug:        { type: String },
    website:     { type: String },
    oneLiner:    { type: String },
    description: { type: String },
    batch:       { type: String, index: true },
    tags:        [{ type: String }],
    status:      { type: String, default: 'Unknown' },
    teamSize:    { type: Number },
    location:    { type: String },
    country:     { type: String },
    logoUrl:     { type: String },
    ycUrl:       { type: String },
    leadScore:   { type: Number, default: 0, index: true },
    leadTier:    { type: String, enum: ['Hot', 'Warm', 'Cold'], default: 'Cold' },
    isB2B:       { type: Boolean, default: false },
  },
  { timestamps: true }
);

companySchema.index({ leadScore: -1 });
companySchema.index({ tags: 1 });
companySchema.index({ name: 'text', oneLiner: 'text' });

module.exports = mongoose.model('Company', companySchema);
