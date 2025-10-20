'use client';

import { useState, useEffect } from 'react';
import { Zap, Wrench, ExternalLink, Github, Settings } from 'lucide-react';
import Link from 'next/link';
import { MCPTemplate, UserServiceData, DeploymentStatuses, EnvVars, ShowEnvVars } from './types';
import { API_BASE_URL, ERROR_MESSAGES, MCP_ICONS } from './constants';
import { useAuth } from './hooks/useAuth';
import { useRenderApiKey } from './hooks/useRenderApiKey';
import { apiRequest, handleApiError } from './utils/api';
import { MCPCard } from './components/MCPCard';

export default function Home() {
  const { user, loading: authLoading, logout, startGitHubAuth } = useAuth();
  const { apiKey: renderApiKey, updateApiKey, clearApiKey } = useRenderApiKey();
  
  const [templates, setTemplates] = useState<MCPTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState<DeploymentStatuses>({});
  const [deploying, setDeploying] = useState<string | null>(null);
  const [userServices, setUserServices] = useState<Record<string, UserServiceData>>({});
  const [detectingServices, setDetectingServices] = useState<boolean>(false);
  const [apiKeyError, setApiKeyError] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [showEnvVars, setShowEnvVars] = useState<ShowEnvVars>({});
  const [envVars, setEnvVars] = useState<EnvVars>({});
  const [copiedUrl, setCopiedUrl] = useState<string>('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await apiRequest('/mcps/templates');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setTemplates(Object.values(data.templates));
    } catch (error) {
      console.error('Error fetching templates:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const detectUserServices = async (apiKey: string) => {
    if (detectingServices) return null;
    
    setDetectingServices(true);
    try {
      const response = await apiRequest('/mcps/detect-services', {
        method: 'POST',
        body: JSON.stringify({ render_api_key: apiKey })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 500 && errorData.detail?.includes('401')) {
          throw new Error('INVALID_API_KEY');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
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

  const handleGitHubAuth = async () => {
    try {
      await startGitHubAuth();
    } catch (error) {
      console.error('Error starting GitHub auth:', error);
    }
  };

  const clearApiKeyError = () => {
    setApiKeyError('');
  };

  const handleUpdateApiKey = () => {
    if (newApiKey.trim()) {
      updateApiKey(newApiKey);
      setNewApiKey('');
      setShowApiKeyInput(false);
      setApiKeyError('');
      setUserServices({});
    }
  };

  const handleClearApiKey = () => {
    clearApiKey();
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

  const deployMCP = async (templateKey: string, template: MCPTemplate) => {
    if (!user) return;
    
    // Validate required environment variables
    if (template.required_keys.length > 0) {
      const missingKeys = template.required_keys.filter((key: string) => !getEnvVarValue(templateKey, key));
      if (missingKeys.length > 0) {
        alert(`${ERROR_MESSAGES.MISSING_API_KEYS} ${missingKeys.join(', ')}`);
        return;
      }
    }
    
    setDeploying(templateKey);
    
    try {
      let mcpData = userServices[templateKey];
      
      if (!mcpData) {
        if (!renderApiKey) {
          const userApiKey = prompt('Please enter your Render API key to detect your services:');
          if (!userApiKey) {
            alert(ERROR_MESSAGES.API_KEY_REQUIRED);
            setDeploying(null);
            return;
          }
          updateApiKey(userApiKey);
        }
        
        try {
          const detectedServices = await detectUserServices(renderApiKey);
          
          if (detectedServices) {
            setUserServices(prev => ({
              ...prev,
              [templateKey]: detectedServices[templateKey]
            }));
            mcpData = detectedServices[templateKey];
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'INVALID_API_KEY') {
            setApiKeyError(ERROR_MESSAGES.INVALID_API_KEY);
            setDeploying(null);
            return;
          }
        }
      }
      
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
      
      if (!mcpData.available || !mcpData.services || mcpData.services.length === 0) {
        setDeploying(null);
        return;
      }
      
      const service = mcpData.services[0];
      
      setDeployments(prev => ({
        ...prev,
        [templateKey]: {
          url: service.url,
          status: 'deploying'
        }
      }));
      
      const response = await apiRequest('/mcps/deploy', {
        method: 'POST',
        body: JSON.stringify({
          template_id: templateKey,
          env_vars: envVars[templateKey] || {},
          render_api_key: renderApiKey,
          service_id: service.id
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || error.message || 'Deployment failed');
      }
      
      const data = await response.json();
      
      setDeployments(prev => ({
        ...prev,
        [templateKey]: {
          url: data.deployment_url || service.url,
          status: 'live'
        }
      }));
      
    } catch (error) {
      console.error(`Error deploying ${templateKey}:`, error);
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

  if (authLoading || loading) {
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
                    onClick={logout}
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
                      onClick={handleClearApiKey}
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
                  onClick={handleUpdateApiKey}
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
                  const templateKey = Object.keys(MCP_ICONS).find(key => {
                    const templateName = template.name.toLowerCase();
                    const keyName = key.toLowerCase();
                    return templateName === `${keyName} mcp` || 
                           templateName === `mcp ${keyName}` ||
                           templateName === keyName;
                  }) || 'news';
                  
                  return (
                    <MCPCard
                      key={index}
                      template={template}
                      templateKey={templateKey}
                      deployment={deployments[templateKey]}
                      userService={userServices[templateKey]}
                      isDeploying={deploying === templateKey}
                      onDeploy={deployMCP}
                      onToggleEnvVars={toggleEnvVars}
                      showEnvVars={showEnvVars[templateKey] || false}
                      onUpdateEnvVar={updateEnvVar}
                      getEnvVarValue={getEnvVarValue}
                      copiedUrl={copiedUrl}
                    />
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
                  <p><strong className="text-white">Click &quot;Deploy MCP&quot;</strong> on any server card</p>
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
