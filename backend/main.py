from fastapi import FastAPI, HTTPException, status, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv
import concurrent.futures
import requests
from render_client import RenderClient
from database import get_db, User, Deployment, APIKey, encrypt_value, decrypt_value
from sqlalchemy.orm import Session
from auth import create_access_token, verify_token
from smithery_integration import get_smithery_mcps_cached, search_smithery_mcps

# Load environment variables from .env file
load_dotenv()

# Create FastAPI app
app = FastAPI(title="MCP Marketplace API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Development
        "https://mcp-marketplace-app-bay.vercel.app",  # Production frontend
        "https://mcp-marketplace-app-1wp6.onrender.com",  # Production backend (for testing)
        os.getenv("FRONTEND_URL", "https://mcp-marketplace-app-bay.vercel.app"),  # From env
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

# Cache disabled - was causing 500 errors


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
            status = "deploying"
        elif render_status in ["build_failed", "update_failed", "pre_deploy_failed"]:
            status = "error"
        elif render_status in ["deactivated", "canceled"]:
            status = "sleeping"
        elif render_status == "live":
            try:
                # Just check root endpoint with shorter timeout
                response = requests.get(service_url, timeout=0.3)  # Reduced to 0.3s
                if response.status_code in [200, 404, 405]:
                    status = "live"
                elif response.status_code in [502, 503]:
                    status = "error"
                else:
                    status = "sleeping"
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                status = "sleeping"  # Timed out = sleeping
        else:
            status = "sleeping"  # Unknown status, assume sleeping
            
    except Exception:
        status = "sleeping"  # If we can't get deployment status, assume sleeping
    
    
    return status

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




# Database initialization on startup
@app.on_event("startup")
async def startup_event():
    from database import create_tables
    create_tables()
    
    # Initialize Smithery MCPs using the new curated system
    global SMITHERY_MCPS
    SMITHERY_MCPS = get_smithery_mcps_cached()


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
    # Use the optimized Smithery integration
    smithery_mcps = get_smithery_mcps_cached()
    return {"smithery_mcps": smithery_mcps}

@app.get("/mcps/smithery/search")
async def search_smithery_mcps_endpoint(query: str, limit: int = 20):
    """Search Smithery MCP servers with relevance scoring"""
    results = search_smithery_mcps(query, limit)
    return {"results": results, "query": query, "count": len(results)}

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
        
        # First pass: Collect all services by template
        template_services = {}
        for template_id, template_info in MCP_TEMPLATES.items():
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
                        "status": "unknown",
                        "template_id": template_id  # Track which template this belongs to
                    })
            
            template_services[template_id] = mcp_services
        
        # Second pass: Check ALL services in parallel (not per-template)
        all_services = []
        for services_list in template_services.values():
            all_services.extend(services_list)
        
        if all_services:
            def check_service_status(service):
                status = get_service_status(service["id"], service["url"], render_client)
                # Convert status to more user-friendly terms
                if status == "error":
                    status = "sleeping"  # Most "errors" are actually sleeping services
                service["status"] = status
                return service
            
            # Check all services in parallel with 6 workers
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
                futures = [executor.submit(check_service_status, service) for service in all_services]
                completed_services = []
                for future in futures:
                    try:
                        result = future.result()
                        completed_services.append(result)
                    except Exception as e:
                        print(f"Service check failed: {e}")
                
                # Group services back by template_id
                services_by_template = {}
                for service in completed_services:
                    template_id = service.pop("template_id")  # Remove template_id before returning
                    if template_id not in services_by_template:
                        services_by_template[template_id] = []
                    services_by_template[template_id].append(service)
        else:
            services_by_template = {}
        
        # Third pass: Build detected_mcps with status-checked services
        for template_id, template_info in MCP_TEMPLATES.items():
            mcp_services = services_by_template.get(template_id, [])
            
            if mcp_services:
                detected_mcps[template_id] = {
                    "available": True,
                    "services": mcp_services,
                    "template": template_info
                }
            else:
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
    """Get the Smithery MCP URL for direct connection - works with any MCP ID"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify JWT token
    try:
        token = authorization.replace("Bearer ", "")
        user_id = verify_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # First try curated MCPs
    smithery_mcps = get_smithery_mcps_cached()
    if smithery_mcps and mcp_id in smithery_mcps:
        mcp_info = smithery_mcps[mcp_id]
        return {
            "mcp_id": mcp_id,
            "mcp_url": mcp_info["mcp_url"],  # MCP connection URL
            "smithery_url": mcp_info.get("smithery_url", f"https://smithery.ai/server/{mcp_id}"),  # Smithery info page
            "name": mcp_info["name"],
            "description": mcp_info["description"],
            "instructions": f"Add this URL to Poke at https://poke.com/settings/connections. You'll be redirected to Smithery to securely enter your API keys.",
            "poke_settings_url": "https://poke.com/settings/connections",
            "security_note": "Your API keys are handled securely by Smithery, not stored on our servers.",
            "verified": mcp_info.get("verified", False),
            "use_count": mcp_info.get("use_count", 0)
        }
    
    # If not in curated list, search for the MCP in the full cache
    try:
        from smithery_integration import search_smithery_mcps
        # Search for the exact MCP ID
        search_results = search_smithery_mcps(mcp_id, limit=1)
        if search_results and len(search_results) > 0:
            mcp_data = search_results[0]
            return {
                "mcp_id": mcp_id,
                "mcp_url": mcp_data["mcp_url"],  # MCP connection URL
                "smithery_url": mcp_data.get("smithery_url", f"https://smithery.ai/server/{mcp_id}"),  # Smithery info page
                "name": mcp_data["name"],
                "description": mcp_data["description"],
                "instructions": f"Add this URL to Poke at https://poke.com/settings/connections. You'll be redirected to Smithery to securely enter your API keys.",
                "poke_settings_url": "https://poke.com/settings/connections",
                "security_note": "Your API keys are handled securely by Smithery, not stored on our servers.",
                "verified": mcp_data.get("verified", False),
                "use_count": mcp_data.get("use_count", 0)
            }
    except Exception as e:
        # If search fails, fall back to generic URL
        pass
    
    # Final fallback: construct generic URL
    # Handle different formats like "espn-mcp" -> "espn" or keep as-is
    clean_mcp_id = mcp_id.replace("-mcp", "") if mcp_id.endswith("-mcp") else mcp_id
    
    return {
        "mcp_id": mcp_id,
        "mcp_url": f"https://server.smithery.ai/{clean_mcp_id}/mcp",  # MCP connection URL
        "smithery_url": f"https://smithery.ai/server/{clean_mcp_id}",  # Smithery info page
        "name": mcp_id.replace("-", " ").title(),
        "description": f"MCP server for {clean_mcp_id}",
        "instructions": f"Add this URL to Poke at https://poke.com/settings/connections. You'll be redirected to Smithery to securely enter your API keys.",
        "poke_settings_url": "https://poke.com/settings/connections",
        "security_note": "Your API keys are handled securely by Smithery, not stored on our servers.",
        "verified": False,
        "use_count": 0
    }

def mask_api_key(value: str) -> str:
    """Mask API key for display"""
    if not value or len(value) <= 4:
        return "••••"
    return "••••••••••••••••"

@app.get("/mcps/deployments/{deployment_id}/env-vars")
async def get_deployment_env_vars(
    deployment_id: str,
    authorization: str = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """Get masked environment variables for a deployment"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify JWT token
    try:
        token = authorization.replace("Bearer ", "")
        user_id = verify_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Get deployment
    deployment = db.query(Deployment).filter(
        Deployment.id == deployment_id,
        Deployment.user_id == user_id
    ).first()
    
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    # Get API keys for this deployment
    api_keys = db.query(APIKey).filter(
        APIKey.deployment_id == deployment_id,
        APIKey.key_type == "mcp_env_var"
    ).all()
    
    # Return masked values
    masked_vars = {}
    for api_key in api_keys:
        try:
            # Decrypt and mask the value
            decrypted_value = decrypt_value(api_key.encrypted_value)
            masked_vars[api_key.key_name] = mask_api_key(decrypted_value)
        except Exception:
            # If decryption fails, return empty string so user knows to re-enter
            # Don't return fake masked values that could be sent back to Render
            masked_vars[api_key.key_name] = ""
    
    return {"env_vars": masked_vars}

@app.post("/mcps/deployments/{deployment_id}/env-vars")
async def update_deployment_env_vars(
    deployment_id: str,
    request: dict,
    authorization: str = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """Update environment variables for a deployment (updates both Render and database)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify JWT token
    try:
        token = authorization.replace("Bearer ", "")
        user_id = verify_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Get deployment
    deployment = db.query(Deployment).filter(
        Deployment.id == deployment_id,
        Deployment.user_id == user_id
    ).first()
    
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    # Get env vars from request
    env_vars = request.get("env_vars", {})
    render_api_key = request.get("render_api_key")
    
    # Update Render if API key provided
    if render_api_key and deployment.render_service_id:
        try:
            render_client = RenderClient(render_api_key)
            render_client.update_service_env_vars(deployment.render_service_id, env_vars)
            render_client.restart_service(deployment.render_service_id)
        except Exception as e:
            # Continue to update database even if Render update fails
            pass
    
    # Update database
    for key_name, key_value in env_vars.items():
        if key_value:  # Only store non-empty values
            # Check if key already exists
            existing_key = db.query(APIKey).filter(
                APIKey.deployment_id == deployment_id,
                APIKey.key_name == key_name,
                APIKey.key_type == "mcp_env_var"
            ).first()
            
            if existing_key:
                existing_key.encrypted_value = encrypt_value(key_value)
            else:
                api_key = APIKey(
                    user_id=user_id,
                    deployment_id=deployment_id,
                    key_name=key_name,
                    key_type="mcp_env_var",
                    encrypted_value=encrypt_value(key_value)
                )
                db.add(api_key)
    
    db.commit()
    
    return {"message": "Environment variables updated successfully"}

class UpdateServiceEnvVarsRequest(BaseModel):
    env_vars: dict
    render_api_key: str

@app.post("/mcps/services/{service_id}/env-vars")
async def update_service_env_vars(
    service_id: str,
    request: UpdateServiceEnvVarsRequest,
    authorization: str = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """Update environment variables for a service using service_id directly (fallback when deployment_id not available)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify JWT token
    try:
        token = authorization.replace("Bearer ", "")
        user_id = verify_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    try:
        # Create Render client with user's API key
        render_client = RenderClient(request.render_api_key)
        
        # Update env vars via Render API
        render_client.update_service_env_vars(service_id, request.env_vars)
        
        # Restart service to apply changes
        render_client.restart_service(service_id)
        
        # Try to find or create a deployment record to store env vars
        deployment = db.query(Deployment).filter(
            Deployment.user_id == user_id,
            Deployment.render_service_id == service_id
        ).first()
        
        if not deployment:
            # Create a new deployment record for this service
            try:
                service_info = render_client.get_service(service_id)
                service_url = service_info.get("service", {}).get("serviceDetails", {}).get("url", "")
                
                # Determine template_id from service name
                service_name = service_info.get("service", {}).get("name", "").lower()
                template_id = "news"  # default
                for tid in ["news", "weather", "github", "reddit", "spotify", "hackernews"]:
                    if tid in service_name:
                        template_id = tid
                        break
                
                deployment = Deployment(
                    user_id=user_id,
                    template_id=template_id,
                    render_service_id=service_id,
                    status="live",
                    deployment_url=service_url
                )
                db.add(deployment)
                db.commit()
                db.refresh(deployment)
            except Exception:
                # Continue anyway - at least Render got updated
                pass
        
        if deployment:
            # Update env vars in database for this deployment
            for key_name, key_value in request.env_vars.items():
                if key_value:
                    # Check if key exists
                    existing_key = db.query(APIKey).filter(
                        APIKey.deployment_id == deployment.id,
                        APIKey.key_name == key_name,
                        APIKey.key_type == "mcp_env_var"
                    ).first()
                    
                    if existing_key:
                        existing_key.encrypted_value = encrypt_value(key_value)
                    else:
                        api_key = APIKey(
                            user_id=user_id,
                            deployment_id=deployment.id,
                            key_name=key_name,
                            key_type="mcp_env_var",
                            encrypted_value=encrypt_value(key_value)
                        )
                        db.add(api_key)
            
            db.commit()
        
        return {"message": "Environment variables updated successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update env vars: {str(e)}")

@app.get("/mcps/deployments")
async def get_user_deployments(
    authorization: str = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):
    """Get all deployments for the authenticated user"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify JWT token
    try:
        token = authorization.replace("Bearer ", "")
        user_id = verify_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Get all deployments for this user
    deployments = db.query(Deployment).filter(Deployment.user_id == user_id).all()
    
    # Return deployment info with service URLs for matching
    deployment_info = {}
    for deployment in deployments:
        deployment_info[deployment.render_service_id] = {
            "deployment_id": str(deployment.id),
            "template_id": deployment.template_id,
            "status": deployment.status,
            "url": deployment.deployment_url
        }
    
    return {"deployments": deployment_info}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
