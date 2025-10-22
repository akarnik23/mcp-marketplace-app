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

# Database initialization on startup
@app.on_event("startup")
async def startup_event():
    from database import create_tables
    create_tables()  # Creates tables if they don't exist

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
                # Check actual service status for each service by testing HTTP endpoints
                for service in mcp_services:
                    try:
                        import requests
                        # Use shorter timeout to avoid waking sleeping services
                        response = requests.get(service["url"], timeout=2)
                        
                        # Check response content for sleeping indicators
                        response_text = response.text.lower()
                        if "sleeping" in response_text:
                            service["status"] = "sleeping"
                        elif "waking up" in response_text:
                            service["status"] = "sleeping"  # Actually waking up
                        elif response.status_code in [200, 404, 405]:
                            # 200 = working, 404/405 = awake but wrong endpoint
                            service["status"] = "live"
                        elif response.status_code in [502, 503]:
                            # 502/503 could mean sleeping OR service awake but external API down
                            # If we get a response (even error), service is likely awake
                            service["status"] = "live"  # Service is awake but may have external API issues
                        else:
                            service["status"] = "sleeping"
                            
                    except requests.exceptions.Timeout:
                        service["status"] = "sleeping"  # Timeout means sleeping
                    except requests.exceptions.ConnectionError:
                        service["status"] = "sleeping"  # Connection error means sleeping
                    except Exception:
                        service["status"] = "sleeping"  # Any other error means sleeping
                
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

@app.options("/mcps/deployed")
async def options_get_deployed_mcps():
    """Handle CORS preflight for /mcps/deployed"""
    return JSONResponse(content={}, status_code=200)

@app.get("/mcps/deployed")
async def get_deployed_mcps(
    authorization: str = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """Get user's deployed MCPs"""
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
    
    # Get user's deployments from database
    deployments = db.query(Deployment).filter(Deployment.user_id == user.id).all()
    
    deployment_list = []
    for deployment in deployments:
        # Always check the actual service status by testing the URL
        if deployment.status in ["deploying", "build_in_progress", "live", "sleeping"]:
            try:
                # Test the actual service URL to see if it's responding
                import requests
                response = requests.get(deployment.deployment_url, timeout=5)
                
                # Any response means the service is awake and running
                if response.status_code in [200, 404, 405, 500, 502, 503]:
                    if deployment.status != "live":
                        deployment.status = "live"
                        db.commit()
                else:
                    # Unexpected status code - still consider it live if we got a response
                    if deployment.status != "live":
                        deployment.status = "live"
                        db.commit()
                        
            except Exception as e:
                if deployment.status != "sleeping":
                    deployment.status = "sleeping"
                    db.commit()
        
        deployment_list.append({
            "id": str(deployment.id),
            "template_id": deployment.template_id,
            "status": deployment.status,
            "deployment_url": deployment.deployment_url,
            "render_service_id": deployment.render_service_id,
            "created_at": deployment.created_at.isoformat(),
            "updated_at": deployment.updated_at.isoformat()
        })
    
    return {"deployments": deployment_list}

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
