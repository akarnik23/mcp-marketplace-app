from fastapi import FastAPI, HTTPException, status, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import httpx
import os
from datetime import datetime, timedelta
import json
from dotenv import load_dotenv
from render_client import RenderClient, MCP_SERVICE_IDS
from database import get_db, User, Deployment, APIKey, MCPTemplate, encrypt_value, decrypt_value
from sqlalchemy.orm import Session
from auth import create_access_token, verify_token

# Load environment variables from .env file
load_dotenv()

# Create FastAPI app
app = FastAPI(title="MCP Marketplace API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Development
        os.getenv("FRONTEND_URL", "https://your-app.vercel.app"),  # Production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GitHub OAuth settings
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "your_github_client_id")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "your_github_client_secret")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/auth/github/callback")

# Render API settings - now using user-provided keys only
# RENDER_API_KEY = os.getenv("RENDER_API_KEY", "your_render_api_key")  # Removed - using user-provided keys

def get_service_status(service_id: str, service_url: str, render_client: RenderClient) -> str:
    """
    Get the status of a service using hybrid approach (Render API + HTTP check)
    Returns: 'live', 'sleeping', 'deploying', or 'error'
    """
    try:
        # First check deployment status from Render API
        deploy_status = render_client.get_latest_deployment_status(service_id)
        render_status = deploy_status.get("status", "unknown")
        
        # If deployment is in progress or failed, use that status
        if render_status in ["created", "queued", "build_in_progress", "update_in_progress"]:
            return "deploying"
        elif render_status in ["build_failed", "update_failed", "pre_deploy_failed"]:
            return "error"
        elif render_status in ["deactivated", "canceled"]:
            return "sleeping"
        elif render_status == "live":
            # Deployment is live, but check if service is actually responding
            try:
                import requests
                # Try health check endpoint first, then root
                health_urls = [f"{service_url}/health", f"{service_url}/", service_url]
                
                for url in health_urls:
                    try:
                        response = requests.get(url, timeout=3)
                        if response.status_code in [200, 404, 405]:
                            return "live"  # Service is awake and responding
                        elif response.status_code in [502, 503]:
                            return "error"  # Service awake but having issues
                    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                        continue  # Try next URL
                
                # If all URLs failed, service is sleeping
                return "sleeping"
            except Exception:
                return "sleeping"  # Service is sleeping
        else:
            return "sleeping"  # Unknown status, assume sleeping
            
    except Exception:
        return "sleeping"  # If we can't get deployment status, assume sleeping

# MCP Templates
MCP_TEMPLATES = {
    "news": {
        "name": "News MCP",
        "description": "RSS news feeds and headlines",
        "required_keys": [],
        "template": "news_template"
    },
    "weather": {
        "name": "Weather MCP", 
        "description": "Weather data and forecasts",
        "required_keys": [],
        "template": "weather_template"
    },
    "github": {
        "name": "GitHub MCP",
        "description": "GitHub repositories and issues",
        "required_keys": ["github_token"],
        "template": "github_template"
    },
    "reddit": {
        "name": "Reddit MCP",
        "description": "Reddit posts and search",
        "required_keys": ["reddit_client_id", "reddit_client_secret"],
        "template": "reddit_template"
    },
    "spotify": {
        "name": "Spotify MCP",
        "description": "Music search and artist data",
        "required_keys": ["spotify_client_id", "spotify_client_secret"],
        "template": "spotify_template"
    },
    "hackernews": {
        "name": "HackerNews MCP",
        "description": "Hacker News stories and search",
        "required_keys": [],
        "template": "hackernews_template"
    }
}

# Smithery MCP Servers - Fetched from Smithery Registry API
# This will be populated dynamically from the Smithery API
SMITHERY_MCPS = {}

async def fetch_smithery_servers():
    """Fetch MCP servers from Smithery Registry API"""
    try:
        # Try to get all servers first, then filter
        all_servers = []
        
        try:
            # Get Smithery API key from environment
            smithery_api_key = os.getenv("SMITHERY_API_KEY")
            
            if not smithery_api_key:
                print("No SMITHERY_API_KEY found in environment variables")
                raise Exception("Smithery API key not configured")
            
            async with httpx.AsyncClient() as client:
                # First try to get all servers without specific search
                response = await client.get(
                    "https://registry.smithery.ai/servers",
                    params={
                        "pageSize": 20
                    },
                    headers={
                        "Authorization": f"Bearer {smithery_api_key}"
                    },
                    timeout=5.0
                )
                
                print(f"Smithery API response status: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    servers = data.get("servers", [])
                    print(f"Found {len(servers)} servers from Smithery API")
                    all_servers.extend(servers)
                else:
                    print(f"Smithery API error: {response.status_code} - {response.text}")
                    
        except Exception as e:
            print(f"Failed to fetch from Smithery API: {e}")
        
        # If we didn't get many results, try some specific searches
        if len(all_servers) < 5:
            search_queries = ["notion", "gmail", "slack", "github", "calendar"]
            
            for query in search_queries:
                try:
                    async with httpx.AsyncClient() as client:
                        response = await client.get(
                            "https://registry.smithery.ai/servers",
                            params={
                                "q": query,
                                "pageSize": 5
                            },
                            headers={
                                "Authorization": f"Bearer {smithery_api_key}"
                            },
                            timeout=3.0
                        )
                        
                        if response.status_code == 200:
                            data = response.json()
                            servers = data.get("servers", [])
                            print(f"Found {len(servers)} servers for query '{query}'")
                            all_servers.extend(servers)
                except Exception as e:
                    print(f"Failed to fetch Smithery servers for query '{query}': {e}")
                    continue
        
        # Convert to our format
        smithery_mcps = {}
        for server in all_servers:
            # Extract key name from qualified name (e.g., "smithery/notion" -> "notion")
            key = server["qualifiedName"].split("/")[-1]
            
            # Determine required keys based on server name
            required_keys = []
            if "notion" in key.lower():
                required_keys = ["notion_token"]
            elif "gmail" in key.lower():
                required_keys = ["gmail_credentials"]
            elif "slack" in key.lower():
                required_keys = ["slack_token"]
            elif "google" in key.lower() or "drive" in key.lower() or "calendar" in key.lower():
                required_keys = ["google_credentials"]
            elif "jira" in key.lower():
                required_keys = ["jira_token", "jira_domain"]
            elif "github" in key.lower():
                required_keys = ["github_token"]
            elif "twitter" in key.lower():
                required_keys = ["twitter_credentials"]
            elif "discord" in key.lower():
                required_keys = ["discord_token"]
            
            # Determine category
            category = "productivity"
            if any(comm in key.lower() for comm in ["gmail", "slack", "discord", "twitter"]):
                category = "communication"
            elif any(dev in key.lower() for dev in ["github", "jira", "git"]):
                category = "development"
            
            smithery_mcps[key] = {
                "name": server["displayName"],
                "description": server["description"],
                "smithery_url": server["homepage"],
                "required_keys": required_keys,
                "category": category,
                "verified": server.get("verified", False),
                "use_count": server.get("useCount", 0)
            }
        
        return smithery_mcps
        
    except Exception as e:
        print(f"Error fetching Smithery servers: {e}")
        # Return some fallback servers if API fails
        return {
            "notion": {
                "name": "Notion MCP",
                "description": "Access and manage Notion pages, databases, and content",
                "smithery_url": "https://smithery.ai/server/smithery/notion",
                "required_keys": ["notion_token"],
                "category": "productivity",
                "verified": True,
                "use_count": 0
            },
            "gmail": {
                "name": "Gmail MCP",
                "description": "Read and manage Gmail messages and labels", 
                "smithery_url": "https://smithery.ai/server/smithery/gmail",
                "required_keys": ["gmail_credentials"],
                "category": "communication",
                "verified": True,
                "use_count": 0
            },
            "slack": {
                "name": "Slack MCP",
                "description": "Send messages and interact with Slack workspaces",
                "smithery_url": "https://smithery.ai/server/smithery/slack",
                "required_keys": ["slack_token"],
                "category": "communication",
                "verified": True,
                "use_count": 0
            },
            "github": {
                "name": "GitHub MCP",
                "description": "Access and manage GitHub repositories and issues",
                "smithery_url": "https://smithery.ai/server/smithery/github",
                "required_keys": ["github_token"],
                "category": "development",
                "verified": True,
                "use_count": 0
            }
        }

# Database initialization on startup
@app.on_event("startup")
async def startup_event():
    from database import create_tables
    create_tables()
    
    # Fetch Smithery servers on startup
    global SMITHERY_MCPS
    SMITHERY_MCPS = await fetch_smithery_servers()
    print(f"Loaded {len(SMITHERY_MCPS)} Smithery MCP servers")  # Creates tables if they don't exist

# Manual CORS handler
@app.middleware("http")
async def add_cors_header(request, call_next):
    # Handle preflight OPTIONS requests
    if request.method == "OPTIONS":
        response = JSONResponse(content={}, status_code=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
    
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

# Routes
@app.get("/")
async def root():
    return {"message": "MCP Marketplace API", "status": "running"}

@app.get("/auth/github")
async def github_auth():
    """Redirect to GitHub OAuth"""
    if GITHUB_CLIENT_ID == "your_github_client_id":
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.")
    
    github_auth_url = f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&redirect_uri={GITHUB_REDIRECT_URI}&scope=user:email"
    return {"auth_url": github_auth_url}

@app.get("/auth/github/callback")
async def github_callback(code: str, db: Session = Depends(get_db)):
    """Handle GitHub OAuth callback"""
    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code
            },
            headers={"Accept": "application/json"}
        )
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="Could not get access token")
        
        # Get user info from GitHub
        user_response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        user_data = user_response.json()
        
        # Check if user exists in database
        existing_user = db.query(User).filter(User.github_id == str(user_data["id"])).first()
        
        if existing_user:
            # Update existing user
            existing_user.username = user_data["login"]
            existing_user.email = user_data.get("email", existing_user.email)
            existing_user.avatar_url = user_data.get("avatar_url", existing_user.avatar_url)
            db.commit()
            db.refresh(existing_user)
            user = existing_user
        else:
            # Create new user
            user = User(
                github_id=str(user_data["id"]),
                username=user_data["login"],
                email=user_data.get("email", ""),
                avatar_url=user_data.get("avatar_url", "")
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        
        # Create JWT token
        token_data = {"sub": str(user.id), "username": user.username}
        access_token = create_access_token(data=token_data)
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "github_id": user.github_id,
                "username": user.username,
                "email": user.email,
                "avatar_url": user.avatar_url
            }
        }

@app.get("/mcps/templates")
async def get_mcp_templates():
    """Get available MCP templates"""
    return {"templates": MCP_TEMPLATES}

@app.get("/mcps/smithery")
async def get_smithery_mcps():
    """Get available Smithery MCP servers"""
    # Refresh servers if empty (in case startup failed)
    global SMITHERY_MCPS
    if not SMITHERY_MCPS:
        SMITHERY_MCPS = await fetch_smithery_servers()
    
    return {"smithery_mcps": SMITHERY_MCPS}

class DetectServicesRequest(BaseModel):
    render_api_key: str

@app.post("/mcps/detect-services")
async def detect_user_services(
    request: DetectServicesRequest,
    authorization: str = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """Detect which MCP services the user has set up in their Render account"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify JWT token
    try:
        token = authorization.replace("Bearer ", "")
        user_id = verify_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    render_api_key = request.render_api_key
    
    if not render_api_key or render_api_key in ["your_render_api_key", "test"]:
        raise HTTPException(status_code=400, detail="Please provide a valid Render API key")
    
    try:
        # Store the Render API key in the database for future use
        existing_key = db.query(APIKey).filter(
            APIKey.user_id == user.id,
            APIKey.key_name == "render_api_key"
        ).first()
        
        if not existing_key:
            # Store the API key encrypted
            encrypted_key = encrypt_value(render_api_key)
            api_key = APIKey(
                user_id=user.id,
                key_name="render_api_key",
                key_type="render_api",
                encrypted_value=encrypted_key
            )
            db.add(api_key)
            db.commit()
        else:
            # Update existing key
            existing_key.encrypted_value = encrypt_value(render_api_key)
            db.commit()
        
        # Create Render client with user's API key
        render_client = RenderClient(render_api_key)
        
        # Get all services from user's Render account
        services_response = render_client.list_services()
        # The API returns an array of objects with 'service' property
        user_services = [item.get("service", {}) for item in services_response if isinstance(services_response, list)]
        
        
        # Detect which MCPs are available
        detected_mcps = {}
        
        # Explicit mapping for the 6 MCPs to avoid confusion
        mcp_service_mappings = {
            "news": ["news-mcp", "mcp-news"],
            "weather": ["weather-mcp", "mcp-weather"], 
            "github": ["github-mcp", "mcp-github"],
            "reddit": ["reddit-mcp", "mcp-reddit"],
            "spotify": ["spotify-mcp", "mcp-spotify"],
            "hackernews": ["hackernews-mcp", "mcp-hackernews"]
        }
        
        for template_id, template_info in MCP_TEMPLATES.items():
            # Look for services that match our MCP naming pattern
            mcp_services = []
            expected_names = mcp_service_mappings.get(template_id, [])
            
            for service in user_services:
                service_name = service.get("name", "").lower()
                service_url = service.get("serviceDetails", {}).get("url", "")
                
                # Check if service name matches any of the expected patterns for this MCP
                matches = any(service_name == expected_name for expected_name in expected_names)
                
                if matches:
                    mcp_services.append({
                        "id": service.get("id"),
                        "name": service.get("name"),
                        "url": service_url,
                        "status": "unknown"
                    })
            
            if mcp_services:
                # Check actual service status using shared function
                for service in mcp_services:
                    status = get_service_status(service["id"], service["url"], render_client)
                    # Convert status to more user-friendly terms
                    if status == "error":
                        status = "sleeping"  # Most "errors" are actually sleeping services
                    service["status"] = status
                
                # User has this MCP set up
                detected_mcps[template_id] = {
                    "available": True,
                    "services": mcp_services,
                    "template": template_info
                }
            else:
                # User doesn't have this MCP set up
                detected_mcps[template_id] = {
                    "available": False,
                    "services": [],
                    "template": template_info,
                    "setup_url": f"https://render.com/deploy?repo=https://github.com/akarnik23/mcp-{template_id}"
                }
        
        return {
            "user_id": str(user.id),
            "detected_mcps": detected_mcps,
            "total_services": len(user_services)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to detect services: {str(e)}")

class DeployRequest(BaseModel):
    template_id: str
    env_vars: dict  # Changed from api_keys to env_vars
    render_api_key: str
    service_id: str

@app.post("/mcps/deploy")
async def deploy_mcp(
    request: DeployRequest,
    authorization: str = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """Deploy MCP to Render using user's API key"""
    if request.template_id not in MCP_TEMPLATES:
        raise HTTPException(status_code=400, detail="Invalid template ID")
    
    template = MCP_TEMPLATES[request.template_id]
    
    # Verify JWT token
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        token = authorization.replace("Bearer ", "")
        user_id = verify_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        # Use provided API key (no fallback - user must provide their own)
        api_key_to_use = request.render_api_key
        
        
        if not api_key_to_use or api_key_to_use in ["your_render_api_key", "test"]:
            raise HTTPException(status_code=400, detail="Please provide a valid Render API key")
        
        # Create Render client with API key
        render_client = RenderClient(api_key_to_use)
        
        # Use the service ID provided by the user
        service_id = request.service_id
        if not service_id:
            raise HTTPException(status_code=400, detail="Service ID is required")
        
        # Deploy to the existing service
        service_data = render_client.deploy_to_existing_service(service_id)
        
        # Update environment variables if provided
        if request.env_vars:
            try:
                render_client.update_service_env_vars(service_id, request.env_vars)
                
                # Restart the service to pick up new environment variables
                render_client.restart_service(service_id)
                
            except Exception as e:
                # Don't fail the deployment if env var update fails
                # The deployment will still work, just without the custom env vars
                pass
        
        # Get the actual service URL from Render
        try:
            service_info = render_client.get_service(service_id)
            service_url = service_info.get("service", {}).get("url", f"https://{request.template_id}-mcp.onrender.com")
        except Exception as e:
            # Fallback to template-based URL if we can't get the actual URL
            service_url = f"https://{request.template_id}-mcp.onrender.com"
        
        # Store deployment info in database
        deployment = Deployment(
            user_id=user.id,
            template_id=request.template_id,  # This should be a UUID, but we're using string for now
            render_service_id=service_id,
            status="deploying",
            deployment_url=service_url
        )
        db.add(deployment)
        db.commit()
        db.refresh(deployment)
        
        # Store environment variables if provided
        if request.env_vars:
            for key_name, key_value in request.env_vars.items():
                if key_value:  # Only store non-empty values
                    encrypted_value = encrypt_value(key_value)
                    api_key = APIKey(
                        user_id=user.id,
                        deployment_id=deployment.id,
                        key_name=key_name,
                        key_type="mcp_env_var",
                        encrypted_value=encrypted_value
                    )
                    db.add(api_key)
            db.commit()
        
        return {
            "deployment_id": str(deployment.id),
            "status": "deploying",
            "deployment_url": service_url,
            "message": "Deployment started successfully"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deployment failed: {str(e)}")


@app.options("/auth/me")
async def options_auth_me():
    """Handle CORS preflight for /auth/me"""
    return JSONResponse(content={}, status_code=200)

@app.get("/auth/me")
async def get_current_user(
    authorization: str = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """Get current user info"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify JWT token
    try:
        token = authorization.replace("Bearer ", "")
        user_id = verify_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": str(user.id),
        "github_id": user.github_id,
        "username": user.username,
        "email": user.email,
        "avatar_url": user.avatar_url
    }

class ValidateRenderKeyRequest(BaseModel):
    render_api_key: str

@app.post("/render/validate-key")
async def validate_render_key(request: ValidateRenderKeyRequest):
    """Test if Render API key is valid"""
    try:
        client = RenderClient(request.render_api_key)
        services = client.list_services()
        return {"valid": True, "service_count": len(services)}
    except Exception as e:
        return {"valid": False, "error": str(e)}

class SmitheryMCPRequest(BaseModel):
    mcp_id: str
    credentials: dict

@app.get("/mcps/smithery/{mcp_id}/url")
async def get_smithery_mcp_url(
    mcp_id: str,
    authorization: str = Header(None, alias="Authorization")
):
    """Get the Smithery MCP URL for direct connection - credentials handled by Smithery"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify JWT token
    try:
        token = authorization.replace("Bearer ", "")
        user_id = verify_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Refresh servers if empty
    global SMITHERY_MCPS
    if not SMITHERY_MCPS:
        SMITHERY_MCPS = await fetch_smithery_servers()
    
    # Check if MCP exists
    if mcp_id not in SMITHERY_MCPS:
        raise HTTPException(status_code=400, detail="Invalid MCP ID")
    
    mcp_info = SMITHERY_MCPS[mcp_id]
    
    # Return the actual Smithery URL from the registry
    return {
        "mcp_id": mcp_id,
        "smithery_url": mcp_info["smithery_url"],
        "name": mcp_info["name"],
        "description": mcp_info["description"],
        "instructions": f"Add this URL to Poke at https://poke.com/settings/connections. You'll be redirected to Smithery to securely enter your API keys.",
        "poke_settings_url": "https://poke.com/settings/connections",
        "smithery_configure_url": f"https://smithery.ai/configure/{mcp_id}?client=poke",
        "security_note": "Your API keys are handled securely by Smithery, not stored on our servers.",
        "verified": mcp_info.get("verified", False),
        "use_count": mcp_info.get("use_count", 0)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
