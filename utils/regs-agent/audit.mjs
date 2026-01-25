// audit.mjs
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
