# Fallback MVP Status Report

## Grounded Chat Implementation Status

### Overview

The grounded chat system now processes user queries through three main components:

1. **Domain Router** - Analyzes user messages to detect which business domain they relate to (performance, counterparties, or risk) and assigns a confidence score. The router also determines the type of grounding needed (intro overview or specific drilldown).

2. **Template Engine** - Once a domain is detected, the system generates appropriate KPI summaries and detailed template outputs using domain-specific formatting. Currently, these templates use mock data rather than live data sources.

3. **Perplexity Integration** - The user query, along with the grounding data from the template, is sent to Perplexity AI. A strict system prompt instructs the AI to use only the provided context data or ask clarifying questions when confidence is low.

When confidence in domain detection is below the threshold (0.3), the system falls back to ungrounded responses.

### Test Cases

#### Test Case 1: Performance Domain
**Query:** "How has our business unit performance changed over the last year?"

**Response:**
```
Based on the data provided, your business unit performance over the last year shows mixed results:

- Navigation has performed well with a 2.7% year-over-year growth, reaching €4.5M
- Liferafts has seen a decline of 1.5% year-over-year, with current revenue at €3.2M
- Overall, your business has maintained slight growth at 0.4% year-over-year

The Navigation unit has been your strongest performer, while the Liferafts division needs attention to reverse its declining trend. Would you like more specific information about either of these business units?
```
*Response Type: Grounded (performance domain, intro type)*

#### Test Case 2: Counterparties Domain
**Query:** "Who are our top counterparties?"

**Response:**
```
Your top counterparties based on the data are:

1. ACME Corp - 22% of total revenue (€2.1M)
2. Globex Industries - 18% of total revenue (€1.7M)
3. Oceanic Partners - 15% of total revenue (€1.4M)
4. Wayne Enterprises - 12% of total revenue (€1.1M)
5. Stark Solutions - 9% of total revenue (€0.85M)

These top 5 counterparties represent 76% of your total revenue. Would you like more specific information about any of these counterparties or details about concentration risk?
```
*Response Type: Grounded (counterparties domain, intro type)*

#### Test Case 3: Risk Domain
**Query:** "What risks exist in the Liferafts business unit?"

**Response:**
```
The Liferafts business unit faces several significant risks:

1. Supply Chain Vulnerability - High Impact (4.2/5)
   - Current supplier concentration at 68% with a single vendor
   - Recent materials shortage has caused a 12% production delay

2. Market Competition - Medium-High Impact (3.8/5)
   - New competitor entry has reduced market share by 3.2% YoY
   - Price pressure has compressed margins from 24% to 21%

3. Regulatory Changes - Medium Impact (3.5/5)
   - New safety regulations expected in Q3 2025
   - Compliance costs estimated at €175K

The most urgent concern is addressing the supply chain vulnerability through supplier diversification. Would you like specific mitigation strategies for any of these risk areas?
```
*Response Type: Grounded (risk domain, drilldown type)*

#### Test Case 4: Low Confidence
**Query:** "What's the weather like today?"

**Response:**
```
I don't have access to real-time weather information. As a financial assistant, I'm primarily designed to help with business performance, counterparty relationships, and risk management questions related to your company data. Would you like me to help you with any questions in those areas instead?
```
*Response Type: Ungrounded (low confidence fallback)*

### UI Behavior

- **Grounding Detection**: The system correctly identifies domains and grounding types internally, but this information is not yet visible in the UI.

- **Debug Information**: Domain, confidence score, and grounding type are stored in the window object for debugging but not displayed to users.

- **Template Content**: Templates generate appropriate content based on domain, but there is no visual indication to users that responses are template-driven.

- **Widget Focus**: Currently no widget focus or visualization is triggered when discussing specific business units or metrics.

### Current Limitations

1. **Mock Data Only** - All template responses use pre-defined mock data rather than live data from BigQuery or other sources.

2. **Binary Confidence Threshold** - Uses a simple 0.3 threshold rather than graduated confidence levels.

3. **Keyword-Based Matching** - Domain detection uses keyword matching rather than more sophisticated semantic matching.

4. **Limited Domains** - Only three domains are currently supported: performance, counterparties, and risk.

5. **No UI Indicators** - No visual indication of grounding domain or confidence is shown to users.

6. **No Cross-Domain Detection** - Cannot handle queries that span multiple domains simultaneously.

7. **Limited Conversation Memory** - Only stores the last 6 turns of conversation history.

### Next Steps Before Stage 5 (BigQuery Integration)

1. **Add UI Indicators** - Implement badge or visual indicator showing domain and confidence level.

2. **Implement Widget Focus** - Add ability to focus relevant dashboard widgets based on detected domain.

3. **Enhance Testing Framework** - Create comprehensive test suite for router accuracy and template quality.

4. **Prepare Data Schema** - Define BigQuery schema that will support template requirements.

5. **Create Data Connectors** - Develop abstract interfaces for template system to consume real data.

6. **Improve Low Confidence Handling** - Implement more nuanced responses for borderline confidence cases.

7. **Document API** - Finalize and document the grounding API contract for frontend-backend integration.
