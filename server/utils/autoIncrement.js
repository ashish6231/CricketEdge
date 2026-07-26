const Counter = require('../models/Counter');

function autoIncrement(schema, modelName) {
  schema.pre('save', async function (next) {
    if (!this.isNew) return next();
    try {
      const counter = await Counter.findByIdAndUpdate(
        modelName,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this._id = counter.seq;
      next();
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { autoIncrement };
