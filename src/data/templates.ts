// Barrel to provide a stable compile output at src/data/templates.js
// Re-export the Stage-A template runner and helpers used by serverless functions

export { runTemplate, getTemplateRegistry, getBigQueryTemplateId } from './templates/index.js';
// Optional: expose runners as a REGISTRY-like map if needed by callers
export { templateRunners as REGISTRY } from './templates/template_registry.js';
