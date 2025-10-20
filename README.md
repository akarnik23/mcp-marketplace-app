# MCP Marketplace

A production-ready marketplace for deploying Model Context Protocol (MCP) servers to Render with one-click deployment and environment variable management.

## Features

- 🔐 **GitHub OAuth Authentication** - Secure user authentication
- 🚀 **One-Click Deployment** - Deploy MCPs to your Render account
- 🔑 **API Key Management** - Secure encrypted storage of user API keys
- 🌐 **Environment Variables** - Easy configuration of MCP environment variables
- 📊 **User Dashboard** - View and manage your deployments
- 🔒 **Production Ready** - PostgreSQL database, encrypted storage, JWT tokens

## Architecture

### Backend (`/backend`)
- **FastAPI** - Modern Python web framework
- **PostgreSQL** - Production database with UUID primary keys
- **SQLAlchemy** - ORM with proper relationships
- **JWT Authentication** - Secure token-based auth
- **Encryption** - Fernet encryption for sensitive data
- **Render API Integration** - Deploy and manage MCP services

### Frontend (`/frontend`)
- **Next.js** - React framework with TypeScript
- **Tailwind CSS** - Modern styling
- **GitHub OAuth** - User authentication flow
- **Environment Variables UI** - Collapsible API key configuration
- **Settings Page** - User management and deployment viewing

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

### Frontend
- `NEXT_PUBLIC_API_URL` - Backend API URL

## API Endpoints

- `GET /` - Health check
- `GET /auth/github` - Start GitHub OAuth
- `GET /auth/github/callback` - OAuth callback
- `GET /auth/me` - Get current user
- `GET /mcps/templates` - List available MCP templates
- `POST /mcps/detect-services` - Detect user's Render services
- `POST /mcps/deploy` - Deploy MCP with environment variables
- `GET /mcps/deployed` - Get user's deployments
- `POST /render/validate-key` - Validate Render API key

## MCP Templates

- **News MCP** - RSS feeds and headlines
- **Weather MCP** - Weather data and forecasts
- **GitHub MCP** - Repository and issue management
- **Reddit MCP** - Posts and search functionality
- **Spotify MCP** - Music search and artist data
- **HackerNews MCP** - Stories and search

## Security

- All user API keys are encrypted before database storage
- JWT tokens for secure authentication
- CORS protection
- Input validation and sanitization
- No sensitive data in logs

## License

MIT License - see LICENSE file for details