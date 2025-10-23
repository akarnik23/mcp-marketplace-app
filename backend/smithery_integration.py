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
    "github", "notion", "linear", "calendar", "gmail", "slack", "discord", 
    "twitter", "reddit", "spotify", "youtube", "google", "drive", "docs", 
    "jira", "figma", "search", "web", "browser", "database", "sql", "memory",
    "news", "weather", "finance", "crypto", "stock", "trading", "perplexity",
    "exa", "brave", "supabase", "openai", "anthropic", "claude", "gpt"
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
                        print(f"Using cached Smithery data ({len(servers)} servers, {cache_age_hours:.1f}h old)")
                        return _get_curated_mcps(servers)
                    else:
                        print("Cache file exists but is empty, fetching fresh data")
        except Exception as e:
            print(f"Cache error: {e}, fetching fresh data")
    
    # Fetch fresh data
    print("Fetching fresh Smithery data...")
    servers = get_all_servers(
        max_pages=10,
        force_refresh=False,
        max_workers=3,
        cache_file=CACHE_FILE,
        cache_hours=CACHE_HOURS
    )
    
    if not servers or len(servers) == 0:
        print("Warning: No servers fetched, returning empty curated MCPs")
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
                curated_mcps[mcp_id] = {
                    "name": top_result.get('displayName', ''),
                    "description": top_result.get('description', ''),
                    "smithery_url": f"https://smithery.ai/server/{qualified_name}",
                    "homepage": top_result.get('homepage', ''),
                    "verified": top_result.get('verified', False),
                    "use_count": top_result.get('useCount', 0),
                    "image_url": top_result.get('imageUrl', ''),
                    "tags": top_result.get('tags', []),
                    "search_term": search_term  # Track which search found this
                }
    
    print(f"Found {len(curated_mcps)} curated MCPs from {len(CURATED_MCP_SEARCHES)} search terms")
    return curated_mcps

def _format_for_marketplace(servers: List[Dict]) -> Dict[str, Any]:
    """
    Format Smithery servers for marketplace compatibility
    Converts the search_smithery format to marketplace format
    """
    formatted_mcps = {}
    
    for server in servers:
        mcp_id = server.get('qualifiedName', '')
        if not mcp_id:
            continue
            
        formatted_mcps[mcp_id] = {
            "name": server.get('displayName', ''),
            "description": server.get('description', ''),
            "smithery_url": f"https://smithery.ai/server/{mcp_id}",
            "homepage": server.get('homepage', ''),
            "verified": server.get('verified', False),
            "use_count": server.get('useCount', 0),
            "image_url": server.get('imageUrl', ''),
            "tags": server.get('tags', [])
        }
    
    return formatted_mcps

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
        formatted_results.append({
            "mcp_id": mcp_id,
            "name": server.get('displayName', ''),
            "description": server.get('description', ''),
            "smithery_url": f"https://smithery.ai/server/{qualified_name}",
            "homepage": server.get('homepage', ''),
            "verified": server.get('verified', False),
            "use_count": server.get('useCount', 0),
            "image_url": server.get('imageUrl', ''),
            "tags": server.get('tags', [])
        })
    
    return formatted_results

def get_cache_info() -> Dict[str, Any]:
    """Get cache information"""
    if not os.path.exists(CACHE_FILE):
        return {"exists": False}
    
    stats = os.stat(CACHE_FILE)
    age_hours = (time.time() - stats.st_mtime) / 3600
    
    try:
        with open(CACHE_FILE, 'r') as f:
            data = json.load(f)
            server_count = len(data)
    except:
        server_count = 0
    
    return {
        "exists": True,
        "size_kb": stats.st_size / 1024,
        "age_hours": age_hours,
        "server_count": server_count,
        "last_modified": time.ctime(stats.st_mtime)
    }
