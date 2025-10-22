'use client';

import { useState } from 'react';
import { ExternalLink, Key, Copy, Check } from 'lucide-react';
import { SmitheryMCP } from '../types';
import { SMITHERY_ICONS, SMITHERY_CATEGORIES } from '../constants';

interface SmitheryMCPCardProps {
  mcp: SmitheryMCP;
  mcpId: string;
  onGenerateUrl: (mcpId: string, credentials: Record<string, string>) => Promise<void>;
  isGenerating: boolean;
}

export function SmitheryMCPCard({ mcp, mcpId, onGenerateUrl, isGenerating }: SmitheryMCPCardProps) {
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const handleCredentialChange = (key: string, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleGenerateUrl = async () => {
    try {
      await onGenerateUrl(mcpId, credentials);
      setGeneratedUrl(mcp.smithery_url);
    } catch (error) {
      console.error('Error generating URL:', error);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(mcp.smithery_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const hasRequiredCredentials = mcp.required_keys.every(key => credentials[key]?.trim());

  return (
    <div className="rounded-2xl p-6 transition-all duration-200" style={{ background: '#203a54', border: '1px solid #718392' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl">{SMITHERY_ICONS[mcpId] || '🔧'}</div>
          <div>
            <h3 className="text-lg font-semibold text-white">{mcp.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>
                {SMITHERY_CATEGORIES[mcp.category] || mcp.category}
              </span>
              <span className="text-xs" style={{ color: '#718392' }}>Smithery</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-gray-300 text-sm mb-4">{mcp.description}</p>

      {/* Credentials Section */}
      {mcp.required_keys.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowCredentials(!showCredentials)}
            className="flex items-center gap-2 text-sm font-medium text-white hover:text-gray-300 transition-colors"
          >
            <Key className="w-4 h-4" />
            {showCredentials ? 'Hide' : 'Show'} Credentials
          </button>
          
          {showCredentials && (
            <div className="mt-3 space-y-3">
              {mcp.required_keys.map((key) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </label>
                  <input
                    type="password"
                    value={credentials[key] || ''}
                    onChange={(e) => handleCredentialChange(key, e.target.value)}
                    placeholder={`Enter your ${key.replace(/_/g, ' ')}`}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generated URL Display */}
      {generatedUrl && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: '#000000', border: '1px solid #718392' }}>
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-300 mb-1">Smithery URL:</p>
              <p className="text-sm text-white font-mono break-all">{generatedUrl}</p>
            </div>
            <button
              onClick={copyToClipboard}
              className="ml-2 p-2 rounded hover:bg-gray-700 transition-colors"
              title="Copy URL"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {!generatedUrl ? (
          <button
            onClick={handleGenerateUrl}
            disabled={!hasRequiredCredentials || isGenerating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              background: hasRequiredCredentials && !isGenerating ? '#ffffff' : '#718392',
              color: hasRequiredCredentials && !isGenerating ? '#203a54' : '#ffffff'
            }}
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                Generating...
              </>
            ) : (
              <>
                <Key className="w-4 h-4" />
                Generate URL
              </>
            )}
          </button>
        ) : (
          <a
            href="https://poke.com/settings/connections"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: '#ffffff', color: '#203a54' }}
          >
            <ExternalLink className="w-4 h-4" />
            Add to Poke
          </a>
        )}
      </div>

      {/* Instructions */}
      {generatedUrl && (
        <div className="mt-3 p-3 rounded-lg" style={{ background: '#000000', border: '1px solid #718392' }}>
          <p className="text-xs text-gray-300">
            <strong className="text-white">Instructions:</strong> Copy the URL above and add it to Poke at{' '}
            <a 
              href="https://poke.com/settings/connections" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 underline"
            >
              poke.com/settings/connections
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
