// Constants for the MCP Marketplace
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const MCP_ICONS: Record<string, string> = {
  'news': '/news.png',
  'weather': '/weather.png',
  'github': '/github.png',
  'reddit': '/reddit.png',
  'spotify': '/spotify.png',
  'hackernews': '/hackerNews.png'
};

export const SMITHERY_ICONS: Record<string, string> = {
  'notion': '📝',
  'gmail': '📧',
  'slack': '💬',
  'google_drive': '📁',
  'calendar': '📅',
  'jira': '🎯'
};

export const SMITHERY_CATEGORIES: Record<string, string> = {
  'productivity': 'Productivity',
  'communication': 'Communication',
  'development': 'Development'
};

export const MCP_CAPABILITIES: Record<string, string[]> = {
  'news': ['get_headlines', 'search_news', 'get_category_news', 'get_rss_feed'],
  'weather': ['get_current_weather', 'get_forecast', 'get_weather_alerts'],
  'github': ['get_repos', 'get_issues', 'get_pull_requests', 'search_code'],
  'reddit': ['get_subreddit_posts', 'search_reddit', 'get_user_posts'],
  'spotify': ['search_tracks', 'search_artists', 'get_artist_top_tracks'],
  'hackernews': ['get_top_stories', 'get_story', 'get_new_stories', 'search_stories']
};

export const POKE_CONNECTIONS_URL = 'https://poke.com/settings/connections';
export const RENDER_API_KEYS_URL = 'https://dashboard.render.com/account/api-keys';

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  RENDER_API_KEY: 'render_api_key'
} as const;

export const ERROR_MESSAGES = {
  INVALID_API_KEY: 'Invalid Render API key. Please check your API key and try again.',
  API_KEY_REQUIRED: 'Render API key is required',
  MISSING_API_KEYS: 'Please fill in the required API keys:',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  AUTH_ERROR: 'Authentication failed. Please sign in again.'
} as const;
