import 'dotenv/config';
import mongoose, { Model } from 'mongoose';
import { IssuesModel } from '@/core/infrastructure/adapters/repositories/mongoose/schema/issues.model';

async function run() {
  const uri = process.env.API_MG_DB_URI || `mongodb://${process.env.API_MG_DB_USERNAME}:${process.env.API_MG_DB_PASSWORD}@localhost:27017/${process.env.API_MG_DB_DATABASE}?authSource=admin`;
  await mongoose.connect(uri);
  const issuesModel= Model<IssuesModel>

  // 1) Add reporter default where missing
  const res1 = await issuesModel.updateMany(
    { reporter: { $exists: false } },
    {
      $set: {
        reporter: { id: 'kody', email: 'kody@kodus.io',name:'Kody' }, 
      },
    },
  );

  // 2) Ensure owner field exists (if missing, leave null or set minimal placeholder)
  const res2 = await issuesModel.updateMany(
    { owner: { $exists: false } },
    { $set: { owner: null } }, 
  );

  console.log('Reporter backfilled:', res1.modifiedCount);
  console.log('Owner initialized (nullable):', res2.modifiedCount);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});