"""
Smithery integration for MCP Marketplace
Simplified wrapper around the search_smithery.py functionality
"""
import json
import os
import time
from typing import Dict, List, Any
from smithery_client import get_all_servers, search_servers

# Cache configuration
CACHE_FILE = 'smithery_cache.json'
CACHE_HOURS = 24

# Curated list of high-quality MCPs to display
CURATED_MCP_SEARCHES = [
    "github", "notion", "linear", 
    "google calendar", "gmail", "slack", 
    "discord", "exa", "todoist", 
    "brave", "workflow", "google maps", 
    "whatsapp", "web", "memory", 
    "deepwiki", "united states weather", "crypto price", 
    "perplexity", "desktop commander", "supabase", 
    "paypal", "arxiv", "financial modeling prep mcp server"
]

def get_smithery_mcps_cached() -> Dict[str, Any]:
    """
    Get curated Smithery MCPs - top result for each search term
    Returns the best MCP for each curated search term
    """
    # Check for recent cache
    if os.path.exists(CACHE_FILE):
        try:
            cache_time = os.path.getmtime(CACHE_FILE)
            cache_age_hours = (time.time() - cache_time) / 3600
            
            if cache_age_hours < CACHE_HOURS:
                with open(CACHE_FILE, 'r') as f:
                    servers = json.load(f)
                    if servers and len(servers) > 0:
                        return _get_curated_mcps(servers)
                    else:
                        pass
        except Exception as e:
            pass
    
    # Fetch fresh data
    servers = get_all_servers(
        max_pages=10,
        force_refresh=False,
        max_workers=3,
        cache_file=CACHE_FILE,
        cache_hours=CACHE_HOURS
    )
    
    if not servers or len(servers) == 0:
        return {}
    
    return _get_curated_mcps(servers)

def _get_curated_mcps(servers: List[Dict]) -> Dict[str, Any]:
    """
    Get the top MCP for each curated search term
    """
    curated_mcps = {}
    
    for search_term in CURATED_MCP_SEARCHES:
        # Search for this term and get the top result
        results = search_servers(servers, search_term)
        if results:
            top_result = results[0]  # Get the #1 result
            qualified_name = top_result.get('qualifiedName', '')
            # Use the same key format as the old system (last part after /)
            mcp_id = qualified_name.split("/")[-1] if qualified_name else ''
            if mcp_id and mcp_id not in curated_mcps:  # Avoid duplicates
                # Truncate description to 200 characters
                description = top_result.get('description', '')
                if len(description) > 200:
                    description = description[:197] + "..."
                
                curated_mcps[mcp_id] = {
                    "name": top_result.get('displayName', ''),
                    "description": description,
                    "smithery_url": f"https://smithery.ai/server/{qualified_name}",
                    "homepage": top_result.get('homepage', ''),
                    "verified": top_result.get('verified', False),
                    "use_count": top_result.get('useCount', 0),
                    "icon_url": top_result.get('iconUrl', ''),
                    "tags": top_result.get('tags', []),
                    "search_term": search_term  # Track which search found this
                }
    
    return curated_mcps


def search_smithery_mcps(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Search Smithery MCPs with relevance scoring
    """
    # Get cached data
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            servers = json.load(f)
    else:
        servers = get_all_servers(cache_file=CACHE_FILE)
    
    # Search with relevance scoring
    results = search_servers(servers, query)
    
    # Format results
    formatted_results = []
    for server in results[:limit]:
        qualified_name = server.get('qualifiedName', '')
        # Use the same simple format as curated MCPs
        mcp_id = qualified_name.split("/")[-1] if qualified_name else ''
        
        # Truncate description to 200 characters
        description = server.get('description', '')
        if len(description) > 200:
            description = description[:197] + "..."
        
        formatted_results.append({
            "mcp_id": mcp_id,
            "name": server.get('displayName', ''),
            "description": description,
            "smithery_url": f"https://smithery.ai/server/{qualified_name}",
            "homepage": server.get('homepage', ''),
            "verified": server.get('verified', False),
            "use_count": server.get('useCount', 0),
            "icon_url": server.get('iconUrl', ''),
            "tags": server.get('tags', [])
        })
    
    return formatted_results

