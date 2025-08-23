# Mock Data Mode Implementation Reboot Prompt

## Project Context
You are working on the fallback-mvp project, implementing a mock data mode for the chat system. This feature allows the system to produce deterministic, high-quality responses without relying on live BigQuery data, making demos and testing more stable and predictable.

## Current Project State

### Implemented Features
1. Added mock data mode controlled by `DATA_MODE` environment variable (`'mock'` or `'live'`)
2. Implemented template-based responses in mock mode that:
   - Skip BigQuery client initialization and querying
   - Use local templates to generate KPI summaries and narrative text
   - Return structured JSON responses with text, widgets, mode, and provenance
3. Added optional narrative polishing with LLM (controlled by `POLISH_NARRATIVE` env var)
4. Updated endpoint selection verification at runtime
5. Made client use serverless endpoints only (preventing browser-side raw LLM calls)
6. Added routing context sending from client to server
7. Implemented client fallback for non-domain messages
8. Updated both Vercel and Netlify serverless functions to accept routing context

### Modified Files
1. `api/chat.ts` (Vercel serverless function)
   - Added DATA_MODE environment variable support
   - Implemented mock data mode logic
   - Added template-based KPI and narrative generation
   - Added provenance metadata in responses
   - Added abstain mode for out-of-coverage queries

2. `netlify/functions/chat.ts` (Netlify serverless function)
   - Updated to include DATA_MODE environment variable support
   - Started implementing mock data mode to match Vercel function
   - Work-in-progress: needs to be finished for feature parity

3. `src/services/chatClient.ts`
   - Enhanced initialization with detailed runtime verification
   - Added verifyChatClientConfig function
   - Improved sendChat method with routing context
   - Added TypeScript interfaces and types

### Project Structure
The project follows a serverless architecture with two deployment platforms:
- Vercel (api/chat.ts)
- Netlify (netlify/functions/chat.ts)

Templates and mock data are stored in:
- src/data/templates/
- data/ (various JSON files)
- public/data/ (same JSON files accessible from client)

## Current Todo List
1. ✅ Lock client to serverless only (prevent browser-side raw LLM calls)
2. ✅ Send routing context to server from ChatPanel
3. ✅ Add strict client fallback for non-domain messages
4. ✅ Update endpoint selection verification at runtime
5. ✅ Update Netlify serverless function to accept routing context
6. ✅ Update Vercel serverless function to accept routing context
7. 🔄 Add mock data mode with DATA_MODE env flag (partially complete)
8. 🔄 Wire templates directly to generate KPIs and narrative text (partially complete)
9. 🔄 Add optional narrative polishing using LLM (partially complete)
10. 🔄 Include provenance in responses (partially complete)
11. ❌ Implement smoke tests for mock data mode
12. ❌ Prepare deliverables for incident report

## Immediate Next Steps
1. Complete the implementation of mock data mode in the Netlify serverless function (netlify/functions/chat.ts)
2. Ensure full feature parity between Vercel and Netlify implementations
3. Implement smoke tests to verify mock mode works correctly
4. Prepare deliverables for the incident report

## Technical Requirements
1. DATA_MODE environment variable must control mode ('mock' or 'live')
2. In mock mode:
   - Skip BigQuery querying completely
   - Use templates to generate deterministic responses
   - Return structured responses with provenance
3. Optional narrative polishing with LLM (POLISH_NARRATIVE env var)
4. Abstain mode for queries outside coverage
5. Smoke tests to validate functionality

## Environment Variables
- `DATA_MODE`: Controls mock vs live mode ('mock'/'live')
- `POLISH_NARRATIVE`: Enables optional narrative polishing ('true'/'false')
- `PROVIDER`: LLM provider (e.g., 'perplexity')
- `PERPLEXITY_API_KEY`: API key for Perplexity
- `GOOGLE_APPLICATION_CREDENTIALS`: Only needed in live mode

## Open Issues
1. Need to complete the Netlify serverless function implementation
2. Need to implement and run smoke tests
3. Need to prepare documentation for incident report deliverables

## Project Goals
The primary goal is to enhance the chat system with a mock data mode that provides deterministic, high-quality responses for demos and testing, without relying on potentially unstable or changing BigQuery data. This should improve reliability and consistency of the application for demo purposes and incident reporting.
