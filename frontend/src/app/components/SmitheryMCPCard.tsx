'use client';

import { useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { SmitheryMCP } from '../types';
import { SMITHERY_ICONS } from '../constants';

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
      // Clear any existing URL first
      setGeneratedUrl('');
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
    <div className="rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow flex flex-col" 
         style={{ background: '#203a54', border: '1px solid #718392' }}>
      <div className="p-6 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Use real icon from Smithery API */}
            {mcp.icon_url ? (
              <img src={mcp.icon_url} alt="icon" className="w-9 h-9 rounded-md" />
            ) : (
              <div className="text-3xl">{SMITHERY_ICONS[mcpId] || '🔧'}</div>
            )}
            <div>
              <h3 className="text-xl font-bold text-white">{mcp.name}</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700">
                Smithery
              </span>
            </div>
          </div>
          
          {/* Info button to Smithery homepage */}
          <a
            href={mcp.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-sm font-medium transition-all cursor-pointer hover:opacity-90 flex-shrink-0"
            style={{ background: '#718392', color: '#ffffff', border: '1px solid #718392' }}
            title="View details on Smithery"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Description */}
        <p className="mb-4 text-white" style={{ minHeight: '3rem' }}>{mcp.description}</p>



        {/* Action Area */}
        <div className="mt-auto">
          {!generatedUrl ? (
            <button
              onClick={handleGetUrl}
              disabled={isGettingUrl}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold active:scale-95 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              style={{ 
                background: !isGettingUrl ? '#ffffff' : '#718392',
                color: !isGettingUrl ? '#203a54' : '#ffffff'
              }}
            >
              {isGettingUrl ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                  Getting URL...
                </>
              ) : (
                <>
                  <ExternalLink className="w-5 h-5" />
                  Get Smithery URL
                </>
              )}
            </button>
          ) : (
            <div>
              {/* URL Display */}
              <div className="rounded-md p-3 mb-4" style={{ background: '#000000', border: '1px solid #718392', minHeight: '4rem' }}>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm text-white font-mono flex-1 break-all">
                    {generatedUrl}
                  </code>
                  <button
                    onClick={copyToClipboard}
                    className={`flex-shrink-0 p-2 rounded-md transition-all border cursor-pointer ${
                      copied
                        ? 'bg-[rgba(46,160,67,0.2)] text-[#a7f3d0] border-[rgba(46,160,67,0.5)]'
                        : ''
                    }`}
                    style={copied ? undefined : { background: '#203a54', color: '#ffffff', border: '1px solid #718392' }}
                    title="Copy MCP URL"
                  >
                    {copied ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Add to Poke Button */}
              <button
                onClick={() => window.open('https://poke.com/settings/connections', '_blank')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold active:scale-95 transition-all cursor-pointer"
                style={{ background: '#ffffff', color: '#203a54' }}
              >
                <ExternalLink className="w-5 h-5" />
                Add to Poke
              </button>
            </div>
          )}
        </div>
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
