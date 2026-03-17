'use strict';

function buildPicturesMap(picturesRecords) {
  const map = new Map();
  for (const rec of picturesRecords) {
    const elements = Array.isArray(rec?.elements) ? rec.elements : [];
    for (const el of elements) {
      const estateId = String(el?.estateid ?? el?.estateMainId ?? '');
      const url = el?.url;
      if (!estateId || !url) continue;

      if (!map.has(estateId)) map.set(estateId, []);
      map.get(estateId).push({
        url,
        type: el?.type ?? null,
        title: el?.title ?? null,
        originalname: el?.originalname ?? null,
        modified: el?.modified ?? null,
      });
    }
  }
  return map;
}

function sortPhotos(a, b) {
  const order = { Titelbild: 0, Foto: 1, Grundriss: 2 };
  const oa = order[a.type] ?? 99;
  const ob = order[b.type] ?? 99;
  if (oa !== ob) return oa - ob;
  const ma = Number(a.modified ?? 0);
  const mb = Number(b.modified ?? 0);
  return mb - ma;
}

module.exports = {
  buildPicturesMap,
  sortPhotos,
};
