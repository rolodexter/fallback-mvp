# New BigQuery Templates Documentation

## Profitability by Business Unit Template

### Template ID: `profitability_by_business_unit_v1`

This template provides detailed profitability metrics by business unit including revenue, COGS, gross margin and margin percentage.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `year` | integer | No | Current year - 1 | Year for which to retrieve profitability data |

### Sample Output

```json
[
  {
    "business_unit": "Navigation",
    "revenue_ars": 32000000,
    "cogs_ars": 21600000,
    "gross_margin_ars": 10400000,
    "gross_margin_pct": 32.5
  },
  {
    "business_unit": "Safety Equipment",
    "revenue_ars": 18000000,
    "cogs_ars": 12942000,
    "gross_margin_ars": 5058000,
    "gross_margin_pct": 28.1
  },
  {
    "business_unit": "Liferafts",
    "revenue_ars": 29000000,
    "cogs_ars": 21000000,
    "gross_margin_ars": 8000000,
    "gross_margin_pct": 27.6
  },
  {
    "business_unit": "Training",
    "revenue_ars": 15000000,
    "cogs_ars": 11000000,
    "gross_margin_ars": 4000000,
    "gross_margin_pct": 26.7
  }
]
```

### Example Queries

- "Show me profitability by business unit"
- "What's our margin by business unit?"
- "Which business unit has the highest gross margin?"
- "Compare profit margins across departments"
- "How profitable was each business line last year?"

---

## Regional Revenue Trend Template

### Template ID: `regional_revenue_trend_24m_v1`

This template provides monthly revenue trends by region for the past 24 months, allowing for regional comparisons and trend analysis.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `region` | string | No | null (all regions) | Filter results to a specific region |

### Sample Output

```json
[
  {
    "yyyymm": "202301",
    "region": "AMBA",
    "revenue_ars": 2850000
  },
  {
    "yyyymm": "202301",
    "region": "Patagonia",
    "revenue_ars": 1920000
  },
  {
    "yyyymm": "202301",
    "region": "Buenos Aires",
    "revenue_ars": 1480000
  },
  {
    "yyyymm": "202212",
    "region": "AMBA",
    "revenue_ars": 2780000
  },
  {
    "yyyymm": "202212",
    "region": "Patagonia",
    "revenue_ars": 1870000
  }
]
```

### Example Queries

- "Show me revenue trends by region"
- "How is AMBA performing compared to other regions?"
- "What's the 24-month revenue trend in Patagonia?"
- "Which region has shown the most growth?"
- "Compare regional performance over the past two years"

## Integration with Grounding

Both templates are integrated with the chat grounding system:

1. **Domain Detection**: Keywords in user queries map to the appropriate domain
   - Profitability domain: "profit", "margin", "gross margin", etc.
   - Regional domain: "region", "Patagonia", "Buenos Aires", etc.

2. **Grounding Narratives**:
   - Profitability intro: Shows business unit profitability with top performers and overall margin
   - Regional intro: Shows top regions by revenue with trend indicators

3. **Template Registry**:
   - Profitability schema: `profit_v1`
   - Regional schema: `region_v1`

## Performance Considerations

- Both templates include optimized SQL to minimize processed data
- Results are cached for 15 minutes by default
- Queries include guardrails to prevent excessive costs
