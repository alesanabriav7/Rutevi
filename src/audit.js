import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOpenCodeCatalog, loadPolicy } from './opencode.js';

/** @type {(keyof import("./types.js").CatalogModel)[]} */
const fields = ['name', 'status', 'releaseDate', 'toolcall', 'context', 'inputCost', 'outputCost', 'variants'];
/** @param {import("./types.js").CatalogModel} model @param {keyof import("./types.js").CatalogModel} field */
const comparable = (model, field) => JSON.stringify(field === 'variants' ? [...model.variants].sort() : model[field]);

/** @param {import("./types.js").CatalogModel[]} catalog @param {import("./types.js").Policy} policy @param {{catalog: import("./types.js").CatalogModel[]}|null} [previous] */
export function auditModels(catalog, policy, previous = null, now = new Date()) {
  const known = new Set(policy.candidates.flatMap(candidate => candidate.models));
  const before = new Map((previous?.catalog ?? []).map(model => [model.id, model]));
  const current = new Map(catalog.map(model => [model.id, model]));
  const unreviewed = catalog.filter(model => !known.has(model.id) && model.toolcall && model.status !== 'deprecated')
    .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.id.localeCompare(b.id));
  const issues = [];
  for (const candidate of policy.candidates.filter(item => item.enabled !== false)) {
    const model = candidate.models.map(id => current.get(id)).find(item => item?.toolcall && item.status !== 'deprecated');
    if (!model) issues.push(`${candidate.key}: ningún modelo utilizable en el catálogo`);
    else if (candidate.variant && !model.variants.includes(candidate.variant)) issues.push(`${candidate.key}: ${model.id} perdió la variante ${candidate.variant}`);
  }
  const reviewed = Date.parse(policy.reviewedAt);
  const reviewAgeDays = Number.isFinite(reviewed) ? Math.floor((now.getTime() - reviewed) / 86400000) : null;
  const added = previous ? catalog.filter(model => !before.has(model.id)) : [];
  const removed = [...before.keys()].filter(id => !current.has(id));
  const changed = catalog.filter(model => before.has(model.id)).flatMap(model => {
    const changes = fields.filter(field => comparable(model, field) !== comparable(before.get(model.id) ?? model, field));
    return changes.length ? [{ id: model.id, fields: changes }] : [];
  });
  const releasedSinceReview = unreviewed.filter(model => /^\d{4}-\d{2}-\d{2}$/.test(model.releaseDate ?? '') && (model.releaseDate ?? '') > policy.reviewedAt);
  return {
    checkedAt: now.toISOString(), firstRun: !previous, catalogCount: catalog.length,
    reviewedAt: policy.reviewedAt ?? null, reviewAgeDays,
    needsReview: reviewAgeDays === null || reviewAgeDays >= 14 || !!(added.length || removed.length || changed.length || issues.length || releasedSinceReview.length || unreviewed.length),
    added, removed, changed, issues, releasedSinceReview, unreviewed,
    disabled: policy.candidates.filter(item => item.enabled === false).map(item => ({ key: item.key, reason: item.disabledReason })),
  };
}

/** @param {import("./types.js").Options} options */
export async function runAudit({ cwd, policy: policyPath, output, cached = false }) {
  const directory = resolve(output ?? fileURLToPath(new URL('../artifacts/model-audit', import.meta.url)));
  const snapshotPath = resolve(directory, 'snapshot.json');
  let previous = null;
  try { previous = JSON.parse(await readFile(snapshotPath, 'utf8')); }
  catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  // Catalogs can depend on project configuration. Do not compare different projects.
  if (previous?.cwd !== cwd) previous = null;
  const catalog = await loadOpenCodeCatalog(cwd, { refresh: !cached });
  const policy = await loadPolicy(policyPath);
  const report = { ...auditModels(catalog, policy, previous), refreshed: !cached };
  await mkdir(directory, { recursive: true });
  const reportPath = resolve(directory, 'latest.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await writeFile(snapshotPath + '.tmp', JSON.stringify({ cwd, checkedAt: report.checkedAt, catalog }, null, 2) + '\n');
  await rename(snapshotPath + '.tmp', snapshotPath);
  return { ...report, reportPath };
}

/** @param {Awaited<ReturnType<typeof runAudit>>} report */
export function formatAudit(report) {
  return [
    `Auditoría OpenCode: ${report.catalogCount} modelos. ${report.needsReview ? 'Hay candidatos o cambios para revisar.' : 'Sin novedades detectadas.'}`,
    report.firstRun ? 'Primera observación: baseline creado; no se consideran todos modelos nuevos.' : `Desde la última ejecución: ${report.added.length} añadidos, ${report.removed.length} retirados, ${report.changed.length} modificados.`,
    `Fuera de la política: ${report.unreviewed.length}; lanzados después de su revisión: ${report.releasedSinceReview.length}.`,
    `Problemas de política: ${report.issues.length}. Última revisión: ${report.reviewedAt ?? 'sin fecha'}.`,
    ...report.issues,
    `Informe: ${report.reportPath}`,
    `Tarea guiada: ${fileURLToPath(new URL('../tasks/audit-models.md', import.meta.url))}`,
    'No ejecuta inferencia ni activa modelos. El catálogo no garantiza acceso ni calidad.',
  ].join('\n');
}
