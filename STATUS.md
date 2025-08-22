# Fallback MVP Status Report

## Implementation Status - Stage 3 Grounded Chat with Domain Router & Templates

### Components Implemented

1. **Domain Router with Grounding Type Detection**
   - Enhanced `src/data/router/router.ts` with `detectTopic()` function
   - Added topic classification with confidence score and grounding type
   - Supports three domains: performance, counterparties, risk
   - Grounding types include: intro, drilldown, no_data
   - Low confidence handling for off-topic questions

2. **Template System for Contextual KPIs**
   - Implemented `runTemplate()` in `src/data/templates/index.ts`
   - Added domain-specific KPI summaries and detailed template outputs
   - Created mock data summaries for each domain with realistic metrics
   - Templates return structured data suitable for LLM context injection

3. **Grounded Chat Client**
   - Updated `src/services/chatClient.ts` with `buildGroundedRequest` function
   - Enhanced chat API payloads with domain, confidence, and template data
   - Added support for conversation history in API requests
   - Maintained backward compatibility with existing chat interfaces

4. **Improved LLM Provider with Context Block**
   - Enhanced `src/services/llmProvider.ts` to support system prompts and history
   - Updated Netlify function to inject context blocks with grounding data
   - Created strict system prompts that instruct LLM to use grounding data
   - Added metadata to responses for UI display of grounding details

### Verification Results

#### Router & Template Testing

- [x] Performance domain detection works correctly
  - Intro: "How has our performance been recently?"
  - Drilldown: "Can you give me details about the Navigation business unit performance?"
  - Templates return appropriate KPI summaries and data tables

- [x] Counterparties domain detection works correctly
  - Intro: "Who are our top counterparties?"
  - Drilldown: "What percentage of our business comes from ACME Corp?"
  - Templates return appropriate counterparty revenue data

- [x] Risk domain detection works correctly
  - Intro: "What are our main risk factors?"
  - Drilldown: "Tell me more about our supply chain risks"
  - Templates provide risk assessment and impact data

- [x] Low confidence handling for off-topic questions
  - Example: "What is the weather like today?"
  - System correctly identifies as off-topic with low confidence

#### Grounded Chat Integration

- [x] Chat client builds grounded requests with appropriate metadata
- [x] Serverless functions properly inject context blocks into prompts
- [x] System prompts enforce strict usage of provided context data
- [x] Response includes metadata for UI display of grounding domain/confidence

### Implementation Example

#### Domain Detection & Template Output

```typescript
// Example 1: Performance domain question
const question = "How has our performance been recently?";
const detection = detectTopic(question);
// Result: { domain: "performance", confidence: 0.65, groundingType: "intro" }

const template = runTemplate(detection.domain, {});
// Returns: 
// {
//   kpiSummary: "Business Units: Navigation +2.7% YoY, Liferafts -1.5% YoY, Overall +0.4% YoY",
//   templateOutput: "## Business Unit Performance (YoY)\n* Navigation: €4.5M (+2.7% YoY)\n..." 
// }
```

#### Grounded Chat Request

```typescript
const request = await chatClient.buildGroundedRequest("How has our performance been?");
// Returns a structured request with grounding payload:
// {
//   message: "How has our performance been?",
//   history: [],
//   grounding: {
//     domain: "performance",
//     confidence: 0.65,
//     groundingType: "intro",
//     kpiSummary: "Business Units: Navigation +2.7% YoY...",
//     templateOutput: "## Business Unit Performance..." 
//   }
// }
```

### Known Issues and Limitations

- Keyword-based domain detection has limitations - could benefit from embedding-based matching
- Store snapshot functionality for real-time data needs to be implemented
- Currently using mock data for templates; needs to be connected to real data sources
- Grounding badge display in UI not yet implemented

### Next Steps

1. Implement grounding badge UI component to display domain and confidence
2. Connect template system to real data sources instead of mock data
3. Enhance low confidence handling with follow-up clarification questions
4. Add embedding-based topic detection to improve accuracy
5. Deploy to production and test with real users
