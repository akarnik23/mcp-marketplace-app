'use client';

import { useState, useEffect } from 'react';
import { Copy, CheckCircle, ExternalLink, Zap, Wrench, Github, Settings } from 'lucide-react';
import Link from 'next/link';

interface MCPTemplate {
  name: string;
  description: string;
  required_keys: string[];
  template: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string;
}

const mcpIcons: { [key: string]: string } = {
  'news': '/news.png',
  'weather': '/weather.png',
  'github': '/github.png',
  'reddit': '/reddit.png',
  'spotify': '/spotify.png',
  'hackernews': '/hackerNews.png'
};

const mcpCapabilities: { [key: string]: string[] } = {
  'news': ['get_headlines', 'search_news', 'get_category_news', 'get_rss_feed'],
  'weather': ['get_current_weather', 'get_forecast', 'get_weather_alerts'],
  'github': ['get_repos', 'get_issues', 'get_pull_requests', 'search_code'],
  'reddit': ['get_subreddit_posts', 'search_reddit', 'get_user_posts'],
  'spotify': ['search_tracks', 'search_artists', 'get_artist_top_tracks'],
  'hackernews': ['get_top_stories', 'get_story', 'get_new_stories', 'search_stories']
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [templates, setTemplates] = useState<MCPTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string>('');
  const [deployments, setDeployments] = useState<{[key: string]: {url: string, status: string}}>({});
  const [deploying, setDeploying] = useState<string | null>(null);
  const [userServices, setUserServices] = useState<{[key: string]: any}>({});
  const [renderApiKey, setRenderApiKey] = useState<string>('');
  const [detectingServices, setDetectingServices] = useState<boolean>(false);
  const [apiKeyError, setApiKeyError] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [showEnvVars, setShowEnvVars] = useState<{[key: string]: boolean}>({});
  const [envVars, setEnvVars] = useState<{[key: string]: {[key: string]: string}}>({});

  useEffect(() => {
    fetchTemplates();
    checkAuth();
    
    // Load API key from localStorage on page refresh
    const storedApiKey = localStorage.getItem('render_api_key');
    if (storedApiKey) {
      setRenderApiKey(storedApiKey);
    }
  }, []);

  const fetchTemplates = async () => {
    try {
      console.log('Fetching templates from backend...');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/mcps/templates`);
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Templates data:', data);
      setTemplates(Object.values(data.templates));
    } catch (error) {
      console.error('Error fetching templates:', error);
      setTemplates([]);
    }
  };

  const detectUserServices = async (apiKey: string) => {
    if (detectingServices) {
      return null;
    }
    
    setDetectingServices(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/mcps/detect-services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          render_api_key: apiKey
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 500 && errorData.detail?.includes('401')) {
          throw new Error('INVALID_API_KEY');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Return the detected data so we can use it immediately
      return data.detected_mcps;
      
    } catch (error) {
      console.error('Error detecting services:', error);
      if (error instanceof Error && error.message === 'INVALID_API_KEY') {
        throw new Error('INVALID_API_KEY');
      }
      return null;
    } finally {
      setDetectingServices(false);
    }
  };

  const checkAuth = async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        // Verify token with backend
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          // Token is invalid, clear it
          localStorage.removeItem('access_token');
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        localStorage.removeItem('access_token');
      }
    }
    setLoading(false);
  };

  const handleGitHubAuth = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/github`);
      const data = await response.json();
      
      // Always use real GitHub OAuth
      window.location.href = data.auth_url;
    } catch (error) {
      console.error('Error starting GitHub auth:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setUser(null);
  };

  const clearApiKeyError = () => {
    setApiKeyError('');
  };

  const updateApiKey = () => {
    if (newApiKey.trim()) {
      localStorage.setItem('render_api_key', newApiKey.trim());
      setRenderApiKey(newApiKey.trim());
      setNewApiKey('');
      setShowApiKeyInput(false);
      setApiKeyError('');
      // Clear any existing user services to force re-detection
      setUserServices({});
    }
  };

  const clearApiKey = () => {
    localStorage.removeItem('render_api_key');
    setRenderApiKey('');
    setUserServices({});
    setApiKeyError('');
  };

  const toggleEnvVars = (templateKey: string) => {
    setShowEnvVars(prev => ({
      ...prev,
      [templateKey]: !prev[templateKey]
    }));
  };

  const updateEnvVar = (templateKey: string, keyName: string, value: string) => {
    setEnvVars(prev => ({
      ...prev,
      [templateKey]: {
        ...prev[templateKey],
        [keyName]: value
      }
    }));
  };

  const getEnvVarValue = (templateKey: string, keyName: string): string => {
    return envVars[templateKey]?.[keyName] || '';
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(''), 2000);
  };

  const addToPoke = (url: string) => {
    copyToClipboard(url);
    window.open('https://poke.com/settings/connections', '_blank', 'noopener,noreferrer');
  };

  const deployMCP = async (templateKey: string, template: MCPTemplate) => {
    if (!user) return;
    
    // Validate required environment variables
    if (template.required_keys.length > 0) {
      const missingKeys = template.required_keys.filter((key: string) => !getEnvVarValue(templateKey, key));
      if (missingKeys.length > 0) {
        alert(`Please fill in the required API keys: ${missingKeys.join(', ')}`);
        return;
      }
    }
    
    setDeploying(templateKey); // Set deploying state immediately
    
    try {
      // Check if user has this MCP already set up
      let mcpData = userServices[templateKey];
      
      if (!mcpData) {
        // Need to detect services first
        let renderApiKey = localStorage.getItem('render_api_key');
        
        if (!renderApiKey) {
          renderApiKey = prompt('Please enter your Render API key to detect your services:');
          if (!renderApiKey) {
            alert('Render API key is required');
            setDeploying(null);
            return;
          }
          localStorage.setItem('render_api_key', renderApiKey);
        }
        
        setRenderApiKey(renderApiKey);
        
        // Detect services but only update state for the specific MCP clicked
        try {
          const detectedServices = await detectUserServices(renderApiKey);
          
          if (detectedServices) {
            // Only update the state for the specific MCP that was clicked
            setUserServices(prev => ({
              ...prev,
              [templateKey]: detectedServices[templateKey]
            }));
            
            // Now use the detected data directly for this function
            mcpData = detectedServices[templateKey];
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'INVALID_API_KEY') {
            setApiKeyError('Invalid Render API key. Please check your API key and try again.');
            setDeploying(null);
            return;
          }
          // For other errors, continue with the flow
        }
      }
      
      // If no MCP data was found or it's not available, update UI to show setup required
      if (!mcpData || !mcpData.available) {
        setUserServices(prev => ({
          ...prev,
          [templateKey]: {
            available: false,
            services: [],
            template: template,
            setup_url: `https://dashboard.render.com/new/web-service?repo=https://github.com/akarnik23/mcp-${templateKey}&branch=main&rootDir=&name=${templateKey}-mcp`
          }
        }));
        setDeploying(null);
        return;
      }
      
      // User has this MCP - proceed with deployment to resume the service
      if (!mcpData.available || !mcpData.services || mcpData.services.length === 0) {
        setDeploying(null);
        return;
      }
      
      const service = mcpData.services[0]; // Use the first available service
      const renderApiKey = localStorage.getItem('render_api_key');
      
      // Show loading state
      setDeployments(prev => ({
        ...prev,
        [templateKey]: {
          url: service.url,
          status: 'deploying'
        }
      }));
      
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/mcps/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          template_id: templateKey,
          env_vars: envVars[templateKey] || {},
          render_api_key: renderApiKey,
          service_id: service.id
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error('Backend error:', error);
        throw new Error(error.detail || error.message || 'Deployment failed');
      }
      
      const data = await response.json();
      
      // Update to show live status
      setDeployments(prev => ({
        ...prev,
        [templateKey]: {
          url: data.deployment_url || service.url,
          status: 'live'
        }
      }));
      
    } catch (error) {
      console.error(`Error deploying ${templateKey}:`, error);
      // Still show the URL even if deployment fails
      if (userServices[templateKey]?.services?.[0]?.url) {
        setDeployments(prev => ({
          ...prev,
          [templateKey]: {
            url: userServices[templateKey].services[0].url,
            status: 'live'
          }
        }));
      }
    } finally {
      setDeploying(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live':
        return 'bg-emerald-900/30 text-emerald-300 border border-emerald-700';
      case 'deploying':
        return 'bg-yellow-900/30 text-yellow-300 border border-yellow-700';
      case 'offline':
        return 'bg-red-900/30 text-red-300 border border-red-700';
      default:
        return 'bg-slate-800 text-slate-200 border border-slate-700';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'live':
        return 'Live';
      case 'deploying':
        return 'Deploying';
      case 'offline':
        return 'Offline';
      default:
        return 'Deploy';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom, #203a54, #000000)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-white">Loading MCP Marketplace...</h2>
          <p className="text-gray-400">Connecting to backend services</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ background: 'linear-gradient(to bottom, #203a54, #000000)' }}>
      {/* Header */}
      <header className="backdrop-blur border-b" style={{ background: 'rgba(32,58,84,0.7)', borderColor: '#718392' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl p-2" style={{ background: '#203a54', border: '1px solid #718392' }}>
                <Zap className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">MCP Marketplace</h1>
                <p className="mt-1" style={{ color: '#718392' }}>
                  {user ? `Welcome back, ${user.username}!` : 'Deploy MCPs to your Render account'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-white">@{user.username}</span>
                  <Link
                    href="/settings"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ background: '#203a54', color: '#ffffff', border: '1px solid #718392' }}
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ background: '#203a54', color: '#ffffff', border: '1px solid #718392' }}
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGitHubAuth}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all"
                  style={{ background: '#ffffff', color: '#203a54' }}
                >
                  <Github className="w-4 h-4" />
                  Sign in with GitHub
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* API Key Error */}
      {apiKeyError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-red-400 rounded-full"></div>
              <span className="text-red-300">{apiKeyError}</span>
            </div>
            <button
              onClick={clearApiKeyError}
              className="text-red-300 hover:text-red-200 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* API Key Management */}
      {user && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-white">Render API Key</h3>
              <div className="flex gap-2">
                {renderApiKey ? (
                  <>
                    <button
                      onClick={() => setShowApiKeyInput(true)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                    >
                      Change Key
                    </button>
                    <button
                      onClick={clearApiKey}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded"
                    >
                      Clear Key
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowApiKeyInput(true)}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
                  >
                    Add API Key
                  </button>
                )}
              </div>
            </div>
            
            {renderApiKey && (
              <div className="text-sm text-gray-300 mb-3">
                Current key: {renderApiKey.length > 12 
                  ? `${renderApiKey.substring(0, 8)}...${renderApiKey.substring(renderApiKey.length - 4)}`
                  : `${renderApiKey.substring(0, 4)}...${renderApiKey.substring(renderApiKey.length - 2)}`
                }
              </div>
            )}
            
            {showApiKeyInput && (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="Enter your Render API key"
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={updateApiKey}
                  disabled={!newApiKey.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded"
                >
                  Update
                </button>
                <button
                  onClick={() => {
                    setShowApiKeyInput(false);
                    setNewApiKey('');
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {!user ? (
          /* Landing Page */
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white mb-4">
              Deploy MCPs in Seconds
            </h2>
            <p className="text-xl mb-8" style={{ color: '#718392' }}>
              One-click deployment of Model Context Protocol servers to your Render account
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              <div className="rounded-2xl p-6" style={{ background: '#203a54', border: '1px solid #718392' }}>
                <Zap className="h-12 w-12 text-white mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-white">Easy Deployment</h3>
                <p className="text-gray-300">Deploy MCPs to your Render account with one click</p>
              </div>
              <div className="rounded-2xl p-6" style={{ background: '#203a54', border: '1px solid #718392' }}>
                <Wrench className="h-12 w-12 text-white mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-white">Secure</h3>
                <p className="text-gray-300">Your API keys are encrypted and isolated</p>
              </div>
              <div className="rounded-2xl p-6" style={{ background: '#203a54', border: '1px solid #718392' }}>
                <ExternalLink className="h-12 w-12 text-white mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-white">Multi-User</h3>
                <p className="text-gray-300">Each user gets their own MCP instances</p>
              </div>
            </div>
            <button
              onClick={handleGitHubAuth}
              className="px-8 py-3 rounded-lg text-lg font-semibold transition-all"
              style={{ background: '#ffffff', color: '#203a54' }}
            >
              Get Started with GitHub
            </button>
          </div>
        ) : (
          /* Dashboard */
          <div>
            {/* MCP Servers Grid */}
            <section className="mb-16">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Available MCP Servers</h2>
                <p style={{ color: '#718392' }}>Deploy MCPs to your Render account and connect to Poke</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((template, index) => {
                  // More precise matching to avoid "hackernews" matching "news"
                  const templateKey = Object.keys(mcpIcons).find(key => {
                    const templateName = template.name.toLowerCase();
                    const keyName = key.toLowerCase();
                    // Check for exact word match or specific patterns
                    return templateName === `${keyName} mcp` || 
                           templateName === `mcp ${keyName}` ||
                           templateName === keyName;
                  }) || 'news';
                  
                  return (
                    <div key={index} className="rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow flex flex-col" style={{ background: '#203a54', border: '1px solid #718392' }}>
                      <div className="p-6 flex flex-col flex-1">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <img src={mcpIcons[templateKey]} alt="icon" className="w-9 h-9 rounded-md" />
                            <div>
                              <h3 className="text-xl font-bold text-white">{template.name}</h3>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(deployments[templateKey]?.status || 'deploy')}`}>
                                {getStatusText(deployments[templateKey]?.status || 'deploy')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="mb-4 text-white" style={{ minHeight: '3rem' }}>{template.description}</p>

                        {/* Content Area - This will grow to fill available space */}
                        <div className="flex-1 flex flex-col">
                          {/* Capabilities */}
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Wrench className="w-4 h-4" style={{ color: '#718392' }} />
                              <span className="text-sm font-medium text-white">Available Tools:</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {mcpCapabilities[templateKey]?.map((capability) => (
                                <span
                                  key={capability}
                                  className="px-2 py-1 text-xs rounded-md font-mono"
                                  style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}
                                >
                                  {capability}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* API Keys Required */}
                          {template.required_keys.length > 0 && (
                            <div className="mb-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Github className="w-4 h-4" style={{ color: '#718392' }} />
                                <span className="text-sm font-medium text-white">Required API Keys:</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {template.required_keys.map((key) => (
                                  <span
                                    key={key}
                                    className="px-2 py-1 text-xs rounded-md font-mono"
                                    style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}
                                  >
                                    {key}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Environment Variables Section */}
                        {template.required_keys.length > 0 && (
                          <div className="mb-4">
                            <button
                              onClick={() => toggleEnvVars(templateKey)}
                              className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
                            >
                              <Github className="w-4 h-4" />
                              <span>Configure API Keys</span>
                              <span className={`transform transition-transform ${showEnvVars[templateKey] ? 'rotate-180' : ''}`}>
                                ▼
                              </span>
                            </button>
                            
                            {showEnvVars[templateKey] && (
                              <div className="mt-3 p-4 rounded-lg" style={{ background: '#000000', border: '1px solid #718392' }}>
                                <div className="space-y-3">
                                  {template.required_keys.map((keyName) => (
                                    <div key={keyName}>
                                      <label className="block text-sm font-medium text-white mb-1">
                                        {keyName}
                                      </label>
                                      <input
                                        type="password"
                                        value={getEnvVarValue(templateKey, keyName)}
                                        onChange={(e) => updateEnvVar(templateKey, keyName, e.target.value)}
                                        placeholder={`Enter your ${keyName}`}
                                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action Area - Always at bottom */}
                        <div className="mt-auto">
                        {/* Deployment Status and Actions */}
                        {deployments[templateKey] ? (
                            <div>
                              {/* URL Display */}
                              <div className="rounded-md p-3 mb-4" style={{ background: '#000000', border: '1px solid #718392', minHeight: '4rem' }}>
                                <div className="flex items-center justify-between gap-2">
                                  <code className="text-sm text-white font-mono flex-1 break-all">
                                    {deployments[templateKey].url}
                                  </code>
                                  <button
                                    onClick={() => copyToClipboard(deployments[templateKey].url)}
                                    className={`flex-shrink-0 p-2 rounded-md transition-all border ${
                                      copiedUrl === deployments[templateKey].url
                                        ? 'bg-[rgba(46,160,67,0.2)] text-[#a7f3d0] border-[rgba(46,160,67,0.5)]'
                                        : ''
                                    }`}
                                    style={copiedUrl === deployments[templateKey].url ? undefined : { background: '#203a54', color: '#ffffff', border: '1px solid #718392' }}
                                    title="Copy MCP URL"
                                  >
                                    {copiedUrl === deployments[templateKey].url ? (
                                      <CheckCircle className="w-5 h-5" />
                                    ) : (
                                      <Copy className="w-5 h-5" />
                                    )}
                                  </button>
                                </div>
                              </div>

                              {/* Add to Poke Button */}
                              <button
                                onClick={() => addToPoke(deployments[templateKey].url)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold active:scale-95 transition-all"
                                style={{ background: '#ffffff', color: '#203a54' }}
                              >
                                <ExternalLink className="w-5 h-5" />
                                Add to Poke
                              </button>
                            </div>
                          ) : userServices[templateKey] && !userServices[templateKey].available ? (
                            /* Setup Required */
                            <div>
                              <div className="rounded-md p-3 mb-4" style={{ background: '#000000', border: '1px solid #718392' }}>
                                <p className="text-sm text-yellow-300 mb-2">
                                  {template.name} not set up in your Render account
                                </p>
                                <p className="text-xs text-gray-400">
                                  Click below to set it up with pre-filled settings
                                </p>
                              </div>
                              <button
                                onClick={() => window.open(userServices[templateKey].setup_url, '_blank')}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold active:scale-95 transition-all"
                                style={{ background: '#f59e0b', color: '#ffffff' }}
                              >
                                <Wrench className="w-5 h-5" />
                                Set Up in Render
                              </button>
                            </div>
                          ) : (
                            /* Deploy Button */
                            <button
                              onClick={() => deployMCP(templateKey, template)}
                              disabled={deploying === templateKey}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold active:scale-95 transition-all disabled:opacity-50"
                              style={{ background: '#ffffff', color: '#203a54' }}
                            >
                              {deploying === templateKey ? (
                                <>
                                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                                  Deploying...
                                </>
                              ) : (
                                <>
                                  <Zap className="w-5 h-5" />
                                  {template.required_keys.length > 0 ? 'Deploy MCP (API Keys Required)' : 'Deploy MCP'}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Instructions */}
            <section className="rounded-2xl shadow-lg border p-8" style={{ background: '#203a54', borderColor: '#718392' }}>
              <h3 className="text-xl font-semibold text-white mb-4">How to Deploy and Connect</h3>
              <div className="space-y-4" style={{ color: '#718392' }}>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>1</span>
                  <p><strong className="text-white">Click "Deploy MCP"</strong> on any server card</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>2</span>
                  <p><strong className="text-white">Enter your API keys</strong> when prompted</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>3</span>
                  <p><strong className="text-white">Get your MCP URL</strong> and add it to Poke at <a href="https://poke.com/settings/connections" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline inline-flex items-center gap-1">
                    poke.com/settings/connections <ExternalLink className="w-4 h-4" />
                  </a></p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>4</span>
                  <p><strong className="text-white">Test</strong> by asking Poke to use your deployed MCP</p>
                </div>
              </div>
            </section>

            {/* Footer */}
            <footer className="mt-16 text-center" style={{ color: '#718392' }}>
              <p>MCP Marketplace • Deploy your own MCP servers</p>
      </footer>
          </div>
        )}
      </main>
    </div>
  );
}