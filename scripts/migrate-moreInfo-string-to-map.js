// scripts/migrate-moreInfo-string-to-map.js
require('dotenv').config();
const mongoose = require('mongoose');

const CountryPetRegulation = require('../models/countryPetRegulationList');

const DEFAULT_NOT_SPECIFIED = "<p>Not specified.</p>";

function makeNewMoreInfo(oldVal) {
  const s = (oldVal || '').toString().trim();
  if (!s || s === DEFAULT_NOT_SPECIFIED) return {};
  return { General: { description: s, requirements: [] } };
}

function isMongooseMap(v) {
  return v && typeof v === 'object' && typeof v.get === 'function' && typeof v.set === 'function';
}

async function run() {
  const uri = process.env.mongoKey;
  if (!uri) {
    console.error('Missing mongoKey in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected.');

  const docs = await CountryPetRegulation.find({});
  let scanned = 0;
  let updatedDocs = 0;
  let migratedPetTypes = 0;

  for (const doc of docs) {
    scanned++;

    const regs = doc.regulationsByPetType;
    if (!regs) continue;

    let changed = false;

    if (isMongooseMap(regs)) {
      // ✅ Map case
      regs.forEach((detail, petKey) => {
        const oldVal = detail?.moreInfo;
        if (typeof oldVal === 'string') {
          const newVal = makeNewMoreInfo(oldVal);

          // 🔥 Set the nested path explicitly (this reliably persists)
          doc.set(`regulationsByPetType.${petKey}.moreInfo`, newVal);
          doc.markModified(`regulationsByPetType.${petKey}.moreInfo`);

          migratedPetTypes++;
          changed = true;
        }
      });
    } else {
      // ✅ Plain object case
      for (const petKey of Object.keys(regs)) {
        const detail = regs[petKey];
        const oldVal = detail?.moreInfo;
        if (typeof oldVal === 'string') {
          const newVal = makeNewMoreInfo(oldVal);

          doc.set(`regulationsByPetType.${petKey}.moreInfo`, newVal);
          doc.markModified(`regulationsByPetType.${petKey}.moreInfo`);

          migratedPetTypes++;
          changed = true;
        }
      }
    }

    if (changed) {
      await doc.save();
      updatedDocs++;
      console.log(`Updated: ${doc.destinationCountry}`);
    }
  }

  console.log('--- Migration complete ---');
  console.log(`Scanned docs: ${scanned}`);
  console.log(`Docs updated: ${updatedDocs}`);
  console.log(`Pet-types migrated: ${migratedPetTypes}`);

  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
