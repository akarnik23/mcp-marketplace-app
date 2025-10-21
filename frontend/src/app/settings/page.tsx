'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Key, Eye, EyeOff, Trash2, ExternalLink, Copy, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string;
}

interface Deployment {
  id: string;
  template_id: string;
  status: string;
  deployment_url: string;
  render_service_id: string;
  created_at: string;
  updated_at: string;
}

export default function Settings() {
  const [user, setUser] = useState<User | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [renderApiKey, setRenderApiKey] = useState<string>('');
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<string>('');

  useEffect(() => {
    checkAuth();
    loadDeployments();
    
    // Load API key from localStorage (client-side only)
    if (typeof window !== 'undefined') {
      const storedApiKey = localStorage.getItem('render_api_key');
      if (storedApiKey) {
        setRenderApiKey(storedApiKey);
      }
    }
  }, []);

  const checkAuth = async () => {
    if (typeof window === 'undefined') return;
    
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          localStorage.removeItem('access_token');
          window.location.href = '/';
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        localStorage.removeItem('access_token');
        window.location.href = '/';
      }
    } else {
      window.location.href = '/';
    }
    setLoading(false);
  };

  const loadDeployments = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/mcps/deployed`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDeployments(data.deployments);
      }
    } catch (error) {
      console.error('Error loading deployments:', error);
    }
  };

  const updateApiKey = () => {
    if (newApiKey.trim()) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('render_api_key', newApiKey.trim());
      }
      setRenderApiKey(newApiKey.trim());
      setNewApiKey('');
      setShowApiKeyInput(false);
    }
  };

  const clearApiKey = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('render_api_key');
    }
    setRenderApiKey('');
  };

  const copyToClipboard = (url: string) => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(''), 2000);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live':
        return 'bg-emerald-900/30 text-emerald-300 border border-emerald-700';
      case 'deploying':
        return 'bg-yellow-900/30 text-yellow-300 border border-yellow-700';
      case 'sleeping':
        return 'bg-blue-900/30 text-blue-300 border border-blue-700';
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
      case 'sleeping':
        return 'Sleeping';
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
          <h2 className="text-xl font-semibold text-white">Loading Settings...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen text-white" style={{ background: 'linear-gradient(to bottom, #203a54, #000000)' }}>
      {/* Header */}
      <header className="backdrop-blur border-b" style={{ background: 'rgba(32,58,84,0.7)', borderColor: '#718392' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/"
                className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Marketplace
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-white">@{user.username}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8">
          {/* Page Title */}
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
            <p className="text-gray-300">Manage your Render API key and view your deployments</p>
          </div>

          {/* Render API Key Section */}
          <div className="rounded-2xl shadow-lg border p-6" style={{ background: '#203a54', borderColor: '#718392' }}>
            <div className="flex items-center gap-3 mb-4">
              <Key className="w-6 h-6 text-white" />
              <h2 className="text-xl font-semibold text-white">Render API Key</h2>
            </div>
            
            <p className="text-gray-300 mb-6">
              Your Render API key is used to deploy and manage MCPs in your Render account. 
              It&apos;s stored locally in your browser and never sent to our servers.
            </p>

            {renderApiKey ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 px-4 py-3 rounded-lg" style={{ background: '#000000', border: '1px solid #718392' }}>
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-white font-mono">
                        {showApiKey ? renderApiKey : `${renderApiKey.substring(0, 8)}...${renderApiKey.substring(renderApiKey.length - 4)}`}
                      </code>
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowApiKeyInput(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                  >
                    Change Key
                  </button>
                  <button
                    onClick={clearApiKey}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-300 mb-4">No Render API key configured</p>
                <button
                  onClick={() => setShowApiKeyInput(true)}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Add API Key
                </button>
              </div>
            )}

            {showApiKeyInput && (
              <div className="mt-6 p-4 rounded-lg" style={{ background: '#000000', border: '1px solid #718392' }}>
                <h3 className="text-lg font-medium text-white mb-3">
                  {renderApiKey ? 'Update' : 'Add'} Render API Key
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder="Enter your Render API key"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={updateApiKey}
                      disabled={!newApiKey.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
                    >
                      {renderApiKey ? 'Update Key' : 'Add Key'}
                    </button>
                    <button
                      onClick={() => {
                        setShowApiKeyInput(false);
                        setNewApiKey('');
                      }}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Deployments Section */}
          <div className="rounded-2xl shadow-lg border p-6" style={{ background: '#203a54', borderColor: '#718392' }}>
            <div className="flex items-center gap-3 mb-4">
              <ExternalLink className="w-6 h-6 text-white" />
              <h2 className="text-xl font-semibold text-white">Your Deployments</h2>
            </div>
            
            <p className="text-gray-300 mb-6">
              View and manage your deployed MCPs. Click on a deployment URL to copy it.
            </p>

            {deployments.length > 0 ? (
              <div className="space-y-4">
                {deployments.map((deployment) => (
                  <div key={deployment.id} className="p-4 rounded-lg" style={{ background: '#000000', border: '1px solid #718392' }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-medium text-white capitalize">
                          {deployment.template_id} MCP
                        </h3>
                        <p className="text-sm text-gray-400">
                          Deployed {new Date(deployment.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(deployment.status)}`}>
                        {getStatusText(deployment.status)}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Service ID:</span>
                        <code className="text-sm text-white font-mono bg-gray-800 px-2 py-1 rounded">
                          {deployment.render_service_id}
                        </code>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">URL:</span>
                        <div className="flex-1 flex items-center gap-2">
                          <code className="text-sm text-white font-mono bg-gray-800 px-2 py-1 rounded flex-1 break-all">
                            {deployment.deployment_url}
                          </code>
                          <button
                            onClick={() => copyToClipboard(deployment.deployment_url)}
                            className={`p-2 rounded transition-all border ${
                              copiedUrl === deployment.deployment_url
                                ? 'bg-[rgba(46,160,67,0.2)] text-[#a7f3d0] border-[rgba(46,160,67,0.5)]'
                                : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                            }`}
                            title="Copy MCP URL"
                          >
                            {copiedUrl === deployment.deployment_url ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <ExternalLink className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-300 mb-4">No deployments yet</p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Deploy Your First MCP
                </Link>
              </div>
            )}
          </div>

          {/* Help Section */}
          <div className="rounded-2xl shadow-lg border p-6" style={{ background: '#203a54', borderColor: '#718392' }}>
            <h2 className="text-xl font-semibold text-white mb-4">Need Help?</h2>
            <div className="space-y-3 text-gray-300">
              <p>
                <strong className="text-white">Getting a Render API Key:</strong> Go to{' '}
                <a href="https://dashboard.render.com/account/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  Render Dashboard → Account → API Keys
                </a>
              </p>
              <p>
                <strong className="text-white">Adding MCPs to Poke:</strong> Copy the MCP URL and add it at{' '}
                <a href="https://poke.com/settings/connections" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                  poke.com/settings/connections
                </a>
              </p>
              <p>
                <strong className="text-white">Troubleshooting:</strong> Make sure your Render service is running and the URL is accessible.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

