"""
Render API Client for deploying MCPs to user's Render account
"""
import requests
import os
import time
from typing import Dict, Any, Optional

class RenderClient:
    def __init__(self, api_key: str):
        """
        Initialize Render API client
        
        Args:
            api_key: User's Render API key (they provide this)
        """
        self.api_key = api_key
        self.base_url = "https://api.render.com/v1"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def list_services(self) -> Dict[str, Any]:
        """Get all services for this account"""
        try:
            response = requests.get(
                f"{self.base_url}/services?includePreviews=true&limit=20",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"Failed to list Render services: {e}")

    def deploy_to_existing_service(self, 
                                  service_id: str, 
                                  clear_cache: str = "do_not_clear") -> Dict[str, Any]:
        """
        Deploy to an existing Render service
        
        Args:
            service_id: ID of the existing service to deploy to
            clear_cache: Whether to clear cache ("clear" or "do_not_clear")
            
        Returns:
            Deployment response with status
        """
        payload = {
            "clearCache": clear_cache
        }
        
        
        try:
            response = requests.post(
                f"{self.base_url}/services/{service_id}/deploys",
                headers=self.headers,
                json=payload
            )
            
            if response.status_code not in [200, 201, 202]:
                raise Exception(f"Render Deploy API error {response.status_code}: {response.text}")
            
            # Don't call raise_for_status() since we already checked the status codes
            # Handle empty response body (common with 202 status)
            if response.text.strip():
                return response.json()
            else:
                # Return a minimal success response for 202 with empty body
                return {
                    "id": f"deploy_{service_id}_{int(time.time())}",
                    "status": "accepted",
                    "message": "Deployment request accepted"
                }
        except requests.exceptions.RequestException as e:
            raise Exception(f"Failed to deploy to Render service: {e}")
    
    def get_service(self, service_id: str) -> Dict[str, Any]:
        """Get service details and status"""
        try:
            response = requests.get(
                f"{self.base_url}/services/{service_id}",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"Failed to get Render service: {e}")
    

    def get_latest_deployment_status(self, service_id: str) -> Dict[str, Any]:
        """Get the status of the latest deployment for a service"""
        try:
            response = requests.get(
                f"{self.base_url}/services/{service_id}/deploys",
                headers=self.headers
            )
            
            if response.status_code == 404:
                return {"status": "unknown"}
            
            response.raise_for_status()
            deployments = response.json()
            
            if deployments and len(deployments) > 0:
                latest_deployment = deployments[0]  # Most recent deployment
                
                # The status is nested inside a 'deploy' object
                if 'deploy' in latest_deployment:
                    deploy_status = latest_deployment['deploy'].get("status", "unknown")
                else:
                    deploy_status = latest_deployment.get("status", "unknown")
                    
                return {"status": deploy_status}
            else:
                return {"status": "unknown"}
                
        except requests.exceptions.RequestException as e:
            return None
        except Exception as e:
            return None
    
    
    def update_service_env_vars(self, service_id: str, env_vars: Dict[str, str]) -> Dict[str, Any]:
        """
        Update environment variables for a service using the dedicated env vars endpoint
        
        Args:
            service_id: ID of the service to update
            env_vars: Dictionary of environment variable key-value pairs
            
        Returns:
            Update response
        """
        try:
            # Get current service details first to preserve existing env vars
            service_data = self.get_service(service_id)
            service = service_data.get('service', {})
            
            # Prepare the environment variables list
            env_vars_list = []
            
            # Build a map of keys being updated
            keys_being_updated = set(env_vars.keys())
            
            # Add existing environment variables (preserve non-MCP ones and MCP ones not being updated)
            existing_env_vars = service.get('envVars', [])
            for env_var in existing_env_vars:
                key = env_var.get('key', '')
                
                # Check if this is an MCP variable
                is_mcp_var = any([
                    key.lower().startswith('github_'),
                    key.lower().startswith('reddit_'),
                    key.lower().startswith('spotify_'),
                    key.upper() == 'GITHUB_TOKEN',
                    key.upper().startswith('REDDIT_'),
                    key.upper().startswith('SPOTIFY_')
                ])
                
                # Keep if: (1) not an MCP var, OR (2) MCP var but NOT being updated now
                if not is_mcp_var or key not in keys_being_updated:
                    # Ensure existing env vars have proper structure
                    if isinstance(env_var, dict) and 'key' in env_var and 'value' in env_var:
                        env_vars_list.append({
                            "key": str(env_var['key']),
                            "value": str(env_var['value'])
                        })
            
            # Add new/updated MCP environment variables
            for key, value in env_vars.items():
                # Ensure values are strings and handle special characters
                if value is not None:
                    env_vars_list.append({
                        "key": str(key),
                        "value": str(value)
                    })
            
            print(f"Final env_vars_list being sent to Render: {[(item['key'], item['value'][:4] if item['value'] else None) for item in env_vars_list]}")
            
            # Prepare the JSON payload - try different formats
            # Format 1: With envVars wrapper
            payload1 = {"envVars": env_vars_list}
            # Format 2: Direct array
            payload2 = env_vars_list
            # Format 3: Object with env vars as key-value pairs
            payload3 = {item["key"]: item["value"] for item in env_vars_list}
            
            
            # Validate JSON before sending
            import json
            for i, payload in enumerate([payload1, payload2, payload3], 1):
                try:
                    json.dumps(payload)
                except (TypeError, ValueError) as e:
                    pass
            
            # Use format 2 (direct array) - we know this works!
            response = requests.put(
                f"{self.base_url}/services/{service_id}/env-vars",
                headers=self.headers,
                json=payload2
            )
            
            # Fallback to other formats if needed (shouldn't be necessary now)
            if response.status_code not in [200, 201, 202]:
                response = requests.put(
                    f"{self.base_url}/services/{service_id}/env-vars",
                    headers=self.headers,
                    json=payload3
                )
            
            if response.status_code not in [200, 201, 202]:
                raise Exception(f"Render Update Env Vars API error {response.status_code}: {response.text}")
            
            return response.json() if response.text.strip() else {"status": "updated"}
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Failed to update service environment variables: {e}")
    
    def restart_service(self, service_id: str) -> Dict[str, Any]:
        """
        Restart a service to pick up new environment variables
        
        Args:
            service_id: ID of the service to restart
            
        Returns:
            Restart response
        """
        try:
            
            response = requests.post(
                f"{self.base_url}/services/{service_id}/restart",
                headers=self.headers
            )
            
            
            if response.status_code not in [200, 201, 202]:
                raise Exception(f"Render Restart API error {response.status_code}: {response.text}")
            
            return response.json() if response.text.strip() else {"status": "restarted"}
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Failed to restart service: {e}")

# Map MCP types to their existing Render service IDs
MCP_SERVICE_IDS = {
    "news": "srv-d3njk863jp1c73bve450",
    "weather": "srv-d3mrhp2dbo4c73appon0", 
    "github": "srv-d3mrhfvdiees739s5t0g",
    "reddit": "srv-d3nea3ndiees73eh3kgg",
    "spotify": "srv-d3nhblpgv73c73carhbg",
    "hackernews": "srv-d3mrgn7diees739s5d9g",
}

