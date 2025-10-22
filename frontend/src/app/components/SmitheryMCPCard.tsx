'use client';

import { useState } from 'react';
import { ExternalLink, Copy, Check, Shield } from 'lucide-react';
import { SmitheryMCP } from '../types';
import { SMITHERY_ICONS, SMITHERY_CATEGORIES } from '../constants';

interface SmitheryMCPCardProps {
  mcp: SmitheryMCP;
  mcpId: string;
  onGetUrl: (mcpId: string) => Promise<void>;
  isGettingUrl: boolean;
}

export function SmitheryMCPCard({ mcp, mcpId, onGetUrl, isGettingUrl }: SmitheryMCPCardProps) {
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const handleGetUrl = async () => {
    try {
      await onGetUrl(mcpId);
      setGeneratedUrl(mcp.smithery_url);
    } catch (error) {
      console.error('Error getting URL:', error);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl || mcp.smithery_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

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

      {/* Security Notice */}
      <div className="mb-4 p-3 rounded-lg" style={{ background: '#000000', border: '1px solid #718392' }}>
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-green-400 mb-1">🔒 Secure Credential Handling</p>
            <p className="text-xs text-gray-300">
              Your API keys are handled securely by Smithery, not stored on our servers. 
              Required: {mcp.required_keys.map(key => key.replace(/_/g, ' ')).join(', ')}
            </p>
          </div>
        </div>
      </div>

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
            onClick={handleGetUrl}
            disabled={isGettingUrl}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              background: !isGettingUrl ? '#ffffff' : '#718392',
              color: !isGettingUrl ? '#203a54' : '#ffffff'
            }}
          >
            {isGettingUrl ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                Getting URL...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                Get Smithery URL
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
        
        {/* Optional: Pre-configure on Smithery */}
        <a
          href={`https://smithery.ai/configure/${mcpId}?client=poke`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: '#718392', color: '#ffffff', border: '1px solid #718392' }}
          title="Pre-configure on Smithery (optional)"
        >
          <Shield className="w-4 h-4" />
        </a>
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
            . You&apos;ll be redirected to Smithery to securely enter your API keys.
          </p>
        </div>
      )}
    </div>
  );
}
