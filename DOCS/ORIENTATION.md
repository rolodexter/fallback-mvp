# Fallback MVP - Project Orientation

## Purpose
This project serves as a fallback MVP (Minimum Viable Product) that demonstrates a dashboard application with widget displays and an AI-powered chat interface. The application is built with React, TypeScript, and Vite, and is designed to be deployable to both Netlify and Vercel.

## High-Level Architecture

### Frontend
- **React + TypeScript**: Core UI framework
- **Vite**: Build tool for fast development
- **Component Structure**:
  - `layouts/Dashboard.tsx`: Main layout containing widgets and chat
  - `components/widgets/`: Contains the three data visualization widgets
  - `components/chat/`: Chat interface components

### Backend
- **Serverless Functions**:
  - Netlify Functions (`functions/chat.ts`)
  - Vercel API Routes (`api/chat.ts`)
- **Integration Points**:
  - Perplexity API for AI chat responses (Stage 3)

### Data Flow
1. User interface displays widgets with data from mock files
2. User can interact with the chat interface
3. Chat messages are routed to serverless functions
4. Responses are processed and displayed in the chat panel

## Development Stages

### Stage 0: Bootstrap
- Set up basic project structure and scaffolding
- Configure deployment options for Netlify and Vercel
- Create empty component files

### Stage 1: Layout + Mock Widgets
- Implement widget components with mock data
- Design basic dashboard layout
- Create chat panel UI (non-functional)

### Stage 2: Chat Endpoint + Frontend Wire
- Implement basic serverless function for chat
- Connect frontend to backend endpoint
- Enable chat UI interactions

### Stage 3: Perplexity Integration
- Integrate Perplexity API into serverless function
- Pass messages to AI service
- Display AI responses in chat UI

### Stage 4: Minimal Router Grounding
- Add domain routing based on keywords
- Provide context information to AI responses
- Enhance the chat experience with domain-specific information
