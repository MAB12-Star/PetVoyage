// audit.mjs
import { ObjectId } from "mongodb";

export async function writeAudit(db, { countryName, trace, draft, finalDoc, publishResult }) {
  const auditColl = db.collection("country_regulations_audit");
  const res = await auditColl.insertOne({
    countryName,
    ranAt: new Date(),
    trace: trace || {},
    draft: draft || null,
    finalDoc: finalDoc || null,
    publishResult: publishResult || null
  });
  return res.insertedId?.toString?.() || null;
}

export async function getAuditById(db, id) {
  const auditColl = db.collection("country_regulations_audit");
  return await auditColl.findOne({ _id: new ObjectId(String(id)) });
}

export async function getLatestAudit(db, countryName) {
  const auditColl = db.collection("country_regulations_audit");
  return await auditColl
    .find({ countryName: String(countryName) })
    .sort({ ranAt: -1 })
    .limit(1)
    .next();
}
