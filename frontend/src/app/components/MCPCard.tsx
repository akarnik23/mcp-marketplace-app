'use client';

import { useState } from 'react';
import { Copy, CheckCircle, ExternalLink, Zap, Wrench, Github } from 'lucide-react';
import { MCPTemplate, UserServiceData, DeploymentStatus } from '../types';
import { MCP_ICONS, MCP_CAPABILITIES, POKE_CONNECTIONS_URL } from '../constants';
import { copyToClipboard, openExternalLink } from '../utils/api';

interface MCPCardProps {
  template: MCPTemplate;
  templateKey: string;
  deployment?: DeploymentStatus;
  userService?: UserServiceData;
  isDeploying: boolean;
  onDeploy: (templateKey: string, template: MCPTemplate) => void;
  onToggleEnvVars: (templateKey: string) => void;
  showEnvVars: boolean;
  onUpdateEnvVar: (templateKey: string, keyName: string, value: string) => void;
  getEnvVarValue: (templateKey: string, keyName: string) => string;
  copiedUrl: string;
}

export const MCPCard = ({
  template,
  templateKey,
  deployment,
  userService,
  isDeploying,
  onDeploy,
  onToggleEnvVars,
  showEnvVars,
  onUpdateEnvVar,
  getEnvVarValue,
  copiedUrl
}: MCPCardProps) => {
  const [localCopiedUrl, setLocalCopiedUrl] = useState<string>('');

  const handleCopy = async (url: string) => {
    const success = await copyToClipboard(url);
    if (success) {
      setLocalCopiedUrl(url);
      setTimeout(() => setLocalCopiedUrl(''), 2000);
    }
  };

  const handleAddToPoke = (url: string) => {
    handleCopy(url);
    openExternalLink(POKE_CONNECTIONS_URL);
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

  const isCopied = localCopiedUrl === deployment?.url || copiedUrl === deployment?.url;

  return (
    <div className="rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow flex flex-col" 
         style={{ background: '#203a54', border: '1px solid #718392' }}>
      <div className="p-6 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MCP_ICONS[templateKey]} alt="icon" className="w-9 h-9 rounded-md" />
            <div>
              <h3 className="text-xl font-bold text-white">{template.name}</h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(deployment?.status || 'deploy')}`}>
                {getStatusText(deployment?.status || 'deploy')}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="mb-4 text-white" style={{ minHeight: '3rem' }}>{template.description}</p>

        {/* Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Capabilities */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4" style={{ color: '#718392' }} />
              <span className="text-sm font-medium text-white">Available Tools:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {MCP_CAPABILITIES[templateKey]?.map((capability) => (
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
              onClick={() => onToggleEnvVars(templateKey)}
              className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
            >
              <Github className="w-4 h-4" />
              <span>Configure API Keys</span>
              <span className={`transform transition-transform ${showEnvVars ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>
            
            {showEnvVars && (
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
                        onChange={(e) => onUpdateEnvVar(templateKey, keyName, e.target.value)}
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

        {/* Action Area */}
        <div className="mt-auto">
          {deployment ? (
            <div>
              {/* URL Display */}
              <div className="rounded-md p-3 mb-4" style={{ background: '#000000', border: '1px solid #718392', minHeight: '4rem' }}>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm text-white font-mono flex-1 break-all">
                    {deployment.url}
                  </code>
                  <button
                    onClick={() => handleCopy(deployment.url)}
                    className={`flex-shrink-0 p-2 rounded-md transition-all border ${
                      isCopied
                        ? 'bg-[rgba(46,160,67,0.2)] text-[#a7f3d0] border-[rgba(46,160,67,0.5)]'
                        : ''
                    }`}
                    style={isCopied ? undefined : { background: '#203a54', color: '#ffffff', border: '1px solid #718392' }}
                    title="Copy MCP URL"
                  >
                    {isCopied ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Add to Poke Button */}
              <button
                onClick={() => handleAddToPoke(deployment.url)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold active:scale-95 transition-all"
                style={{ background: '#ffffff', color: '#203a54' }}
              >
                <ExternalLink className="w-5 h-5" />
                Add to Poke
              </button>
            </div>
          ) : userService && !userService.available ? (
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
                onClick={() => openExternalLink(userService.setup_url || '')}
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
              onClick={() => onDeploy(templateKey, template)}
              disabled={isDeploying}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold active:scale-95 transition-all disabled:opacity-50"
              style={{ background: '#ffffff', color: '#203a54' }}
            >
              {isDeploying ? (
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
};
