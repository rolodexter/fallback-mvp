// Converted from keywords.json to TypeScript module to avoid JSON import issues in serverless functions
const keywords = {
  performance: ["performance", "YoY", "growth", "business units"],
  counterparties: ["counterparties", "clients", "partners", "buyers"],
  risk: ["risk", "exposure", "vulnerabilities", "loss"],
  profitability: ["profit", "margin", "gross margin", "profitability", "costs", "cogs", "earnings"],
  regional: ["region", "by region", "Buenos Aires", "Patagonia", "AMBA", "regional", "geography"],
} as const;

export default keywords;
