# MCP Marketplace

A production-ready marketplace for Model Context Protocol (MCP) servers with both self-hosted deployment and pre-hosted Smithery integrations. Built for The Interaction Company.

## Features

- 🔐 **GitHub OAuth Authentication** - Secure user authentication
- 🚀 **One-Click Deployment** - Deploy MCPs to your Render account
- 🌐 **Smithery Integration** - Pre-hosted MCPs ready to connect to Poke
- 🔑 **API Key Management** - Secure encrypted storage of user API keys
- 🌐 **Environment Variables** - Easy configuration of MCP environment variables
- ⚡ **Performance Optimized** - Parallel processing and caching for fast loading
- 🔒 **Production Ready** - PostgreSQL database, encrypted storage, JWT tokens

## Architecture

### Backend (`/backend`)
- **FastAPI** - Modern Python web framework
- **PostgreSQL** - Production database with UUID primary keys
- **SQLAlchemy** - ORM with proper relationships and connection pooling
- **JWT Authentication** - Secure token-based auth
- **Encryption** - Fernet encryption for sensitive data
- **Render API Integration** - Deploy and manage MCP services
- **Smithery API Integration** - Dynamic MCP discovery and curation
- **Performance Caching** - In-memory caching for API calls and service status
- **Parallel Processing** - Concurrent service status checks

### Frontend (`/frontend`)
- **Next.js** - React framework with TypeScript
- **Tailwind CSS** - Modern styling with dramatic gradients
- **GitHub OAuth** - User authentication flow
- **Environment Variables UI** - Professional API key management
- **Smithery MCP Cards** - Pre-hosted MCP integration
- **Performance Optimized** - Sequential loading to prevent connection bottlenecks

## Quick Start

### Prerequisites
- Python 3.8+
- Node.js 18+
- Render account
- GitHub account

### Development Setup

1. **Backend Setup**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cp env.example .env
   # Edit .env with your values
   python init_db.py
   uvicorn main:app --reload
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   cp .env.example .env.local
   # Edit .env.local with your API URL
   npm run dev
   ```

### Production Deployment

#### Backend (Render)
1. Push code to GitHub
2. Create new Web Service on Render
3. Connect to your GitHub repo
4. Use the `render.yaml` configuration
5. Set environment variables in Render dashboard

#### Frontend (Vercel)
1. Connect GitHub repo to Vercel
2. Set `NEXT_PUBLIC_API_URL` environment variable
3. Deploy

## Environment Variables

### Backend
- `DATABASE_URL` - PostgreSQL connection string
- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app client secret
- `GITHUB_REDIRECT_URI` - OAuth callback URL
- `JWT_SECRET_KEY` - Secret for JWT token signing
- `ENCRYPTION_KEY` - Fernet key for encrypting user data
- `FRONTEND_URL` - Frontend URL for CORS
- `SMITHERY_API_KEY` - Smithery Registry API key for MCP discovery

### Frontend
- `NEXT_PUBLIC_API_URL` - Backend API URL

## API Endpoints

### Authentication
- `GET /` - Health check
- `GET /auth/github` - Start GitHub OAuth
- `GET /auth/github/callback` - OAuth callback
- `GET /auth/me` - Get current user

### MCP Management
- `GET /mcps/templates` - List available MCP templates
- `POST /mcps/detect-services` - Detect user's Render services
- `POST /mcps/deploy` - Deploy MCP with environment variables
- `GET /mcps/deployments` - Get user's deployments
- `POST /render/validate-key` - Validate Render API key

### Environment Variables
- `GET /mcps/deployments/{deployment_id}/env-vars` - Get masked env vars
- `POST /mcps/services/{service_id}/env-vars` - Update service env vars

### Smithery Integration
- `GET /mcps/smithery` - Get curated Smithery MCPs
- `GET /mcps/smithery/search` - Search Smithery MCPs with relevance scoring
- `GET /mcps/smithery/{mcp_id}/url` - Get Smithery MCP URL

## MCP Types

### Self-Hosted MCPs (Deploy to Render)
- **News MCP** - RSS feeds and headlines
- **Weather MCP** - Weather data and forecasts
- **GitHub MCP** - Repository and issue management
- **Reddit MCP** - Posts and search functionality
- **Spotify MCP** - Music search and artist data
- **HackerNews MCP** - Stories and search

### Smithery MCPs (Pre-hosted)
- **Dynamic Discovery** - Curated from Smithery Registry
- **Popular MCPs** - Notion, Gmail, Slack, Google Drive, Calendar
- **Development Tools** - GitHub, Linear, Figma, Jira
- **Search & Research** - Exa, DeepWiki, Semantic Scholar
- **Database & Memory** - Supabase, Mem0, SuperMemory
- **Communication** - Discord, Twitter, Slack integrations

## Security

- All user API keys are encrypted before database storage
- JWT tokens for secure authentication
- CORS protection
- Input validation and sanitization
- No sensitive data in logs

## License

MIT License - see LICENSE file for details