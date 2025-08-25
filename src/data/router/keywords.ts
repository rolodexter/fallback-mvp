// Converted from keywords.json to TypeScript module to avoid JSON import issues in serverless functions
const keywords = {
  performance: [
    "performance",
    "yoy",
    "growth",
    "business units",
    "snapshot",
    "overview",
    "summary",
    "monthly gross",
    "monthly trend",
    "revenue trend"
  ],
  counterparties: [
    "counterparties",
    "clients",
    "partners",
    "buyers",
    "top counterparties",
    "top clients",
    "ytd",
    "year to date"
  ],
  risk: ["risk", "exposure", "vulnerabilities", "loss"],
  profitability: [
    "profit",
    "margin",
    "gross margin",
    "profitability",
    "costs",
    "cogs",
    "earnings",
    "business units list",
    "list business units",
    "bu list"
  ],
  regional: [
    "region",
    "by region",
    "regional",
    "geography",
    "amba",
    "patagonia",
    "buenos aires",
    "córdoba",
    "cordoba",
    "mendoza"
  ],
} as const;

export default keywords;
