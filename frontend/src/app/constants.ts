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
  'jira': '🎯',
  'github': '🐙',
  'exa': '🔍',
  'supabase': '🗄️',
  'brave': '🦁',
  'deepwiki': '📚',
  'memory': '🧠',
  'linear': '📊',
  'figma': '🎨',
  'discord': '💬',
  'twitter': '🐦',
  'gmail-mcp': '📧',
  'mem0-memory-mcp': '🧠',
  'mem0-mcp': '🧠',
  'supermemory': '🧠',
  'naver-search-mcp': '🔍',
  'paper-search-mcp-openai': '📄',
  'mcpsemanticscholar': '🔬',
  'supabase-mcp-lite': '🗄️'
};

export const CUSTOM_MCP_ICONS = [
  { name: 'box', icon: '📦', label: 'Box' },
  { name: 'database', icon: '🗄️', label: 'Database' },
  { name: 'server', icon: '🖥️', label: 'Server' },
  { name: 'code', icon: '💻', label: 'Code' },
  { name: 'cloud', icon: '☁️', label: 'Cloud' },
  { name: 'api', icon: '🔌', label: 'API' },
  { name: 'tools', icon: '🔧', label: 'Tools' },
  { name: 'cog', icon: '⚙️', label: 'Settings' },
  { name: 'rocket', icon: '🚀', label: 'Rocket' },
  { name: 'lightning', icon: '⚡', label: 'Lightning' },
  { name: 'chart', icon: '📊', label: 'Chart' },
  { name: 'globe', icon: '🌐', label: 'Globe' },
  { name: 'brain', icon: '🧠', label: 'AI/Brain' },
  { name: 'robot', icon: '🤖', label: 'Bot' },
  { name: 'fitness', icon: '💪', label: 'Fitness' },
  { name: 'health', icon: '❤️', label: 'Health' },
  { name: 'sports', icon: '⚽', label: 'Sports' },
  { name: 'music', icon: '🎵', label: 'Music' },
  { name: 'video', icon: '🎬', label: 'Video' },
  { name: 'camera', icon: '📷', label: 'Camera' },
  { name: 'shopping', icon: '🛒', label: 'Shopping' },
  { name: 'money', icon: '💰', label: 'Finance' },
  { name: 'calendar', icon: '📅', label: 'Calendar' },
  { name: 'email', icon: '📧', label: 'Email' },
  { name: 'chat', icon: '💬', label: 'Chat' },
  { name: 'file', icon: '📄', label: 'File' },
  { name: 'book', icon: '📚', label: 'Book' },
  { name: 'education', icon: '🎓', label: 'Education' },
  { name: 'travel', icon: '✈️', label: 'Travel' },
  { name: 'food', icon: '🍔', label: 'Food' }
];

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
