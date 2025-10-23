import json
import os
import time
import urllib.request
import urllib.error
import urllib.parse
import argparse
import concurrent.futures
import os
from datetime import datetime

# Get API key from environment variable
api_key = os.getenv('SMITHERY_API_KEY')
if not api_key:
    raise ValueError("SMITHERY_API_KEY environment variable is required")

def fetch_page(page, page_size=100):
    """Fetch a single page of servers"""
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Accept': 'application/json'
    }
    
    try:
        url = f'https://registry.smithery.ai/servers?page={page}&pageSize={page_size}'
        
        req = urllib.request.Request(url)
        for key, value in headers.items():
            req.add_header(key, value)
        
        with urllib.request.urlopen(req) as response:
            response_data = response.read().decode('utf-8')
            data = json.loads(response_data)
            return page, data.get('servers', []), data.get('pagination', {})
    
    except Exception as e:
        print(f"Error on page {page}: {str(e)}")
        return page, None, None

def get_all_servers(max_pages=10, page_size=100, force_refresh=False, max_workers=3, 
                   cache_file='smithery_cache.json', cache_hours=24):
    """Get all servers using parallel requests for speed"""
    # Check for recent cache
    if os.path.exists(cache_file) and not force_refresh:
        try:
            cache_time = os.path.getmtime(cache_file)
            cache_age_hours = (time.time() - cache_time) / 3600
            
            # Use cache if it's not expired
            if cache_age_hours < cache_hours:
                with open(cache_file, 'r') as f:
                    cached_data = json.load(f)
                    print(f"Using cached data ({len(cached_data)} servers, {cache_age_hours:.1f} hours old)")
                    return cached_data
                    
            print(f"Cache is {cache_age_hours:.1f} hours old (expiration: {cache_hours}h), refreshing...")
        except Exception as e:
            print(f"Cache error: {e}, fetching fresh data")
    
    # Fetch first page to get pagination info
    print("Fetching initial page to determine total pages...")
    _, servers, pagination = fetch_page(1, page_size)
    
    if servers is None:
        print("Failed to fetch initial page")
        return []
    
    all_servers = servers
    
    total_pages = pagination.get('totalPages', 1)
    total_count = pagination.get('totalCount', 0)
    
    print(f"Found {total_count} total servers across {total_pages} pages")
    pages_to_fetch = min(total_pages, max_pages)
    
    if pages_to_fetch > 1:
        print(f"Fetching {pages_to_fetch-1} more pages in sequence...")
        
        # Fetch pages in sequence to preserve order
        for page in range(2, pages_to_fetch + 1):
            _, page_servers, _ = fetch_page(page, page_size)
            if page_servers:
                all_servers.extend(page_servers)
                print(f"Received page {page} ({len(page_servers)} servers, total: {len(all_servers)}/{total_count})")
            time.sleep(0.2)  # Small delay between requests
    
    # Save to cache
    with open(cache_file, 'w') as f:
        json.dump(all_servers, f)
    
    print(f"Successfully retrieved {len(all_servers)} servers")
    return all_servers

def calculate_relevance_score(server, query, case_sensitive=False):
    """Calculate a relevance score for a server based on where the query appears"""
    if not case_sensitive:
        query = query.lower()
    
    name = server.get('displayName', '')
    qualified_name = server.get('qualifiedName', '')
    description = server.get('description', '')
    verified = server.get('verified', False)
    use_count = server.get('useCount', 0)
    
    if not case_sensitive:
        name = name.lower()
        qualified_name = qualified_name.lower()
        description = description.lower()
    
    score = 0
    
    # Exact matches in names are weighted highest
    if name == query:
        score += 100
    elif name.startswith(query):
        score += 80
    elif query in name:
        score += 60
    
    # Qualified name matches
    if qualified_name == query:
        score += 90
    elif qualified_name.endswith('/' + query):
        score += 70
    elif query in qualified_name:
        score += 50
    
    # Description matches are weighted lower
    if query in description:
        score += 30
    
    # Boost verified servers
    if verified:
        score += 20
    
    # Boost popular servers (based on useCount)
    if use_count > 10000:
        score += 15
    elif use_count > 1000:
        score += 10
    elif use_count > 100:
        score += 5
    
    # Boost servers with 'gmail' in both name and qualified_name
    if query in name and query in qualified_name:
        score += 25
    
    return score

def search_servers(servers, query, case_sensitive=False):
    """Search for servers matching the query and rank by relevance"""
    results = []
    
    for server in servers:
        name = server.get('displayName', '')
        qualified_name = server.get('qualifiedName', '')
        description = server.get('description', '')
        
        compare_name = name if case_sensitive else name.lower()
        compare_qualified = qualified_name if case_sensitive else qualified_name.lower()
        compare_description = description if case_sensitive else description.lower()
        compare_query = query if case_sensitive else query.lower()
        
        if (compare_query in compare_name or 
            compare_query in compare_qualified or 
            compare_query in compare_description):
            
            # Calculate relevance score for ranking
            relevance = calculate_relevance_score(server, query, case_sensitive)
            # Make sure to append a tuple of (score, server)
            results.append((relevance, server))
    
    # Sort by relevance score (highest first) and extract just the servers
    # This ensures we're sorting by the numeric scores, not the server dictionaries
    sorted_results = sorted(results, key=lambda x: x[0], reverse=True)
    return [server for score, server in sorted_results]

def get_cache_info(cache_file='smithery_cache.json'):
    """Get information about the cache file"""
    if not os.path.exists(cache_file):
        print(f"No cache file found at '{cache_file}'")
        return
        
    # Get file stats
    stats = os.stat(cache_file)
    size_bytes = stats.st_size
    mod_time = stats.st_mtime
    
    # Calculate age
    age_seconds = time.time() - mod_time
    age_hours = age_seconds / 3600
    age_days = age_hours / 24
    
    # Get server count
    try:
        with open(cache_file, 'r') as f:
            data = json.load(f)
            server_count = len(data)
    except:
        server_count = "Error reading file"
    
    # Print info
    print(f"Cache File: {cache_file}")
    print(f"Size: {size_bytes / 1024:.1f} KB")
    print(f"Age: {age_hours:.1f} hours ({age_days:.1f} days)")
    print(f"Last Modified: {datetime.fromtimestamp(mod_time).strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Server Count: {server_count}")

def format_server_info(server):
    """Format server info for display"""
    description = server.get('description', 'No description')
    if len(description) > 150:
        description = description[:150] + "..."
    
    return (
        f"Name: {server.get('displayName', 'Unknown')}\n"
        f"ID: {server.get('qualifiedName', 'Unknown')}\n"
        f"Verified: {server.get('verified', False)}\n"
        f"URL: {server.get('homepage', 'No homepage')}\n"
        f"Description: {description}\n"
    )

def main():
    """Main function to test the Smithery search"""
    # Set up argument parsing
    parser = argparse.ArgumentParser(description='Search Smithery MCP registry')
    parser.add_argument('--term', help='Search term')
    parser.add_argument('--check', help='Check if a specific server ID exists')
    parser.add_argument('--pages', type=int, default=10, help='Max pages to fetch (default: 10)')
    parser.add_argument('--refresh', action='store_true', help='Force refresh cache')
    parser.add_argument('--sequential', action='store_true', 
                        help='Use sequential fetching to preserve order (slower)')
    
    # Cache management options
    parser.add_argument('--clear-cache', action='store_true', help='Delete the cache file and exit')
    parser.add_argument('--cache-file', default='smithery_cache.json', help='Specify cache file location')
    parser.add_argument('--cache-hours', type=float, default=24, help='Cache expiration time in hours')
    parser.add_argument('--cache-info', action='store_true', help='Display cache information and exit')
    
    args = parser.parse_args()
    cache_file = args.cache_file
    
    # Cache management operations
    if args.clear_cache:
        if os.path.exists(cache_file):
            os.remove(cache_file)
            print(f"Cache file '{cache_file}' has been deleted.")
        else:
            print(f"No cache file found at '{cache_file}'.")
        return
        
    if args.cache_info:
        get_cache_info(cache_file)
        return
    
    print("=== Smithery MCP Server Search ===")
    start_time = time.time()
    
    # Get all servers
    all_servers = get_all_servers(
        max_pages=args.pages, 
        force_refresh=args.refresh, 
        max_workers=1 if args.sequential else 5,
        cache_file=cache_file,
        cache_hours=args.cache_hours
    )
    
    fetch_time = time.time() - start_time
    print(f"Fetched data in {fetch_time:.2f} seconds")
    
    # If specific server check requested
    if args.check:
        print(f"Checking for server: {args.check}")
        matches = search_servers(all_servers, args.check, case_sensitive=True)
        exact_matches = [s for s in matches if s.get('qualifiedName') == args.check]
        
        if exact_matches:
            print(f"Found server with exact ID: {args.check}")
            print(format_server_info(exact_matches[0]))
        elif matches:
            print(f"Found {len(matches)} similar servers but none with exact ID: {args.check}")
            for i, server in enumerate(matches[:3], 1):
                print(f"\n--- Similar Result #{i} ---")
                print(format_server_info(server))
        else:
            print(f"No server found with ID: {args.check}")
        return
    
    # If term provided via command line, search and exit
    if args.term:
        search_start = time.time()
        results = search_servers(all_servers, args.term)
        search_time = time.time() - search_start
        
        print(f"\nFound {len(results)} matching servers for '{args.term}' in {search_time:.2f} seconds:")
        for i, server in enumerate(results, 1):
            print(f"\n--- Result #{i} ---")
            print(format_server_info(server))
        return
    
    # Interactive mode if no command line args provided
    while True:
        # Get search query from user
        query = input("\nEnter search term (or 'quit' to exit): ").strip()
        if query.lower() in ('quit', 'exit', 'q'):
            break
            
        # Perform search
        search_start = time.time()
        results = search_servers(all_servers, query)
        search_time = time.time() - search_start
        
        # Display results
        print(f"\nFound {len(results)} matching servers for '{query}' in {search_time:.2f} seconds:")
        for i, server in enumerate(results, 1):
            print(f"\n--- Result #{i} ---")
            print(format_server_info(server))
            
        # Option to force refresh cache
        if not results and input("No results found. Refresh cache? (y/n): ").lower() == 'y':
            # Fetch all pages with refresh
            all_servers = get_all_servers(
                max_pages=args.pages, 
                force_refresh=True, 
                max_workers=1 if args.sequential else 3,
                cache_file=cache_file,
                cache_hours=args.cache_hours
            )

if __name__ == "__main__":
    main()