# MCP Marketplace

A production-ready marketplace for Model Context Protocol (MCP) servers with both self-hosted deployment and pre-hosted Smithery integrations. Built for The Interaction Company.

## Features

- 🔐 **GitHub OAuth Authentication** - Secure user authentication
- 🚀 **One-Click Deployment** - Deploy MCPs to your Render account
- 🛠️ **Custom MCP Support** - Add your own Render-hosted MCPs with dynamic tool detection
- 🌐 **Smithery Integration** - Pre-hosted MCPs ready to connect to Poke
- 🔑 **API Key Management** - Secure encrypted storage of user API keys with validation
- 🌐 **Environment Variables** - Easy configuration of MCP environment variables
- ⚡ **Performance Optimized** - Parallel processing and caching for fast loading
- 🔒 **Production Ready** - PostgreSQL database, encrypted storage, JWT tokens (24hr expiry)
- 📊 **Error Tracking** - Sentry integration for production monitoring and debugging
- 📱 **Mobile Optimized** - Progressive Web App (PWA) with iOS home screen support
- 🎨 **Responsive Design** - Beautiful UI on desktop, tablet, and mobile

## Architecture

### Backend (`/backend`)
- **FastAPI** - Modern Python web framework
- **PostgreSQL (Neon)** - Production database with UUID primary keys
- **SQLAlchemy** - ORM with proper relationships and connection pooling
- **JWT Authentication** - Secure token-based auth
- **Encryption** - Fernet encryption for sensitive data
- **Render API Integration** - Deploy and manage MCP services
- **Smithery API Integration** - Dynamic MCP discovery and curation
- **FastMCP Integration** - Dynamic tool detection from MCP servers
- **Performance Caching** - In-memory caching for API calls and service status
- **Parallel Processing** - Concurrent service status checks
- **Sentry Error Tracking** - Production error monitoring with 10% performance sampling
- **Structured Logging** - Python logging module for better observability

### Frontend (`/frontend`)
- **Next.js 15** - React framework with TypeScript and App Router
- **Tailwind CSS** - Modern styling with dramatic gradients and responsive design
- **Progressive Web App (PWA)** - Add to home screen on iOS with full-screen support
- **GitHub OAuth** - User authentication flow
- **Environment Variables UI** - Professional API key management with validation
- **Smithery MCP Cards** - Pre-hosted MCP integration with search
- **Custom MCP Management** - Add, configure, and manage your own MCPs
- **Performance Optimized** - Sequential loading to prevent connection bottlenecks
- **Mobile First** - Responsive breakpoints and iOS safe area handling
- **Sentry Error Tracking** - Client-side error monitoring with session replay

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
- `DATABASE_URL` - PostgreSQL connection string (Neon: https://neon.tech - free tier available)
- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app client secret
- `GITHUB_REDIRECT_URI` - OAuth callback URL (points to backend: `/auth/github/callback`)
- `JWT_SECRET_KEY` - Secret for JWT token signing (generate random 32+ char string)
- `ENCRYPTION_KEY` - Fernet key for encrypting user data (generate with: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
- `FRONTEND_URL` - Frontend URL for CORS configuration
- `SMITHERY_API_KEY` - Smithery Registry API key for MCP discovery
- `SENTRY_DSN` - Sentry DSN for backend error tracking (optional but recommended)
- `ENVIRONMENT` - Environment name for Sentry (defaults to "production")

See `backend/env.example` for detailed configuration examples.

### Frontend
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for frontend error tracking (optional but recommended)

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

### Custom MCP Management
- `POST /mcps/custom` - Add custom MCP from existing Render service
- `GET /mcps/custom` - Get user's custom MCPs
- `DELETE /mcps/custom/{custom_mcp_id}` - Delete custom MCP from markeplace and suspend service on Render
- `POST /mcps/custom/{custom_mcp_id}/refresh-tools` - Refresh tools list for custom MCP

### Environment Variables
- `GET /mcps/deployments/{deployment_id}/env-vars` - Get masked env vars for a deployment
- `POST /mcps/deployments/{deployment_id}/env-vars` - Update deployment env vars (requires deployment_id)
- `POST /mcps/services/{service_id}/env-vars` - Update service env vars directly (primary method)

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
- **Wake Up Service** - Wake sleeping services with one click
- **Resume Suspended Services** - Automatically resumes suspended services when redeploying

### Custom MCPs (Your Own Services)
- **Add Any MCP** - Connect your existing Render-hosted MCP servers
- **Dynamic Tool Detection** - Automatically discovers available tools using FastMCP
- **Environment Variable Management** - Configure your MCP's environment variables
- **Real-time Status** - Live status monitoring (live, sleeping, deploying, suspended)
- **Wake Up Service** - Wake sleeping services with one click
- **Resume Suspended Services** - Automatically resumes suspended services when re-adding
- **Custom Icons** - Choose from 30+ icons to represent your MCP
- **Delete & Suspend** - Remove MCPs and suspend services on Render

**Naming Requirements:** For automatic detection, your Render service name should contain `mcp`, `fastmcp`, or `server` (e.g., "weather-mcp", "my-server", "fastmcp-tool"). Services without these keywords in their name or repository URL won't appear in the service selection list.

### Smithery MCPs (Pre-hosted)
- **Dynamic Discovery** - Curated from Smithery Registry
- **Popular MCPs** - Notion, Gmail, Slack, Google Drive, Calendar
- **Development Tools** - GitHub, Linear, Figma, Jira
- **Search & Research** - Exa, DeepWiki, Semantic Scholar
- **Database & Memory** - Supabase, Mem0, SuperMemory
- **Communication** - Discord, Twitter, Slack integrations

## Security

- All user API keys are encrypted before database storage using Fernet encryption
- JWT tokens for secure authentication (24-hour expiry)
- CORS protection with explicit allowed origins
- Input validation and sanitization
- No sensitive data in logs
- Environment variables for all secrets (no hardcoded credentials)
- Secure password input fields with autofill prevention
- Encrypted database connections for production (PostgreSQL SSL)

## Browser Compatibility

- **Chrome/Edge**: Full support with PWA features
- **Safari (iOS/macOS)**: Full support with home screen add support
- **Firefox**: Full support
- **Mobile**: Optimized for iOS and Android

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details