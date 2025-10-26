'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Zap, Wrench, ExternalLink, Github, Plus, X } from 'lucide-react';
import Image from 'next/image';
import { MCPTemplate, UserServiceData, DeploymentStatuses, DeploymentStatus, EnvVars, ShowEnvVars, SmitheryMCP, CustomMCP, MCPService } from './types';
import { ERROR_MESSAGES, MCP_ICONS, CUSTOM_MCP_ICONS, POKE_CONNECTIONS_URL } from './constants';
import { useAuth } from './hooks/useAuth';
import { useRenderApiKey } from './hooks/useRenderApiKey';
import { apiRequest, copyToClipboard, openExternalLink } from './utils/api';
import { MCPCard } from './components/MCPCard';
import { SmitheryMCPCard } from './components/SmitheryMCPCard';
import { AddCustomMCPModal } from './components/AddCustomMCPModal';

export default function Home() {
  const { user, loading: authLoading, logout, startGitHubAuth } = useAuth();
  const { apiKey: renderApiKey, updateApiKey, clearApiKey } = useRenderApiKey();
  
  const [templates, setTemplates] = useState<MCPTemplate[]>([]);
  const [smitheryMcps, setSmitheryMcps] = useState<Record<string, SmitheryMCP>>({});
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState<DeploymentStatuses>({});
  const [deploying, setDeploying] = useState<string | null>(null);
  const [userServices, setUserServices] = useState<Record<string, UserServiceData>>({});
  const [, setDetectingServices] = useState<boolean>(false);
  const [apiKeyError, setApiKeyError] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [showEnvVars, setShowEnvVars] = useState<ShowEnvVars>({});
  const [envVars, setEnvVars] = useState<EnvVars>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [generatingSmitheryUrl, setGeneratingSmitheryUrl] = useState<string | null>(null);
  const [envVarsUpdatedSuccess, setEnvVarsUpdatedSuccess] = useState<Record<string, boolean>>({});
  
  // Smithery search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SmitheryMCP[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Wake-up service state
  const [wakingServices, setWakingServices] = useState<Set<string>>(new Set());
  const [wakingStartTimes, setWakingStartTimes] = useState<Record<string, number>>({});
  const wakeIntervals = useRef<Record<string, NodeJS.Timeout>>({});
  const wakeTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

  // Custom MCP state
  const [customMcps, setCustomMcps] = useState<CustomMCP[]>([]);
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [allRenderServices, setAllRenderServices] = useState<MCPService[]>([]);
  const [refreshingTools, setRefreshingTools] = useState<Set<string>>(new Set());


  // Update timestamp display every minute
  useEffect(() => {
    if (!lastUpdated) return;
    
    const interval = setInterval(() => {
      // Force re-render to update the "time ago" display
      setLastUpdated(new Date(lastUpdated.getTime()));
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [lastUpdated]);

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

  const fetchSmitheryMcps = async () => {
    try {
      const response = await apiRequest('/mcps/smithery');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSmitheryMcps(data.smithery_mcps);
    } catch (error) {
      console.error('Error fetching Smithery MCPs:', error);
      setSmitheryMcps({});
    }
  };

  const fetchCustomMcps = async () => {
    if (!user) return;
    
    try {
      const response = await apiRequest('/mcps/custom');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setCustomMcps(data.custom_mcps || []);
    } catch (error) {
      console.error('Error fetching custom MCPs:', error);
      setCustomMcps([]);
    }
  };

  const fetchAllRenderServices = async () => {
    if (!renderApiKey) return;
    
    try {
      const detectedServices = await detectUserServices(renderApiKey);
      if (detectedServices) {
        // Use all_services from the response instead of just detected MCP services
        const allServices = detectedServices.all_services || [];
        setAllRenderServices(allServices);
      }
    } catch (error) {
      console.error('Error fetching Render services:', error);
    }
  };

  const detectUserServices = useCallback(async (apiKey: string) => {
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
      return data; // Return full response instead of just detected_mcps
    } catch (error) {
      console.error('Error detecting services:', error);
      if (error instanceof Error && error.message === 'INVALID_API_KEY') {
        throw new Error('INVALID_API_KEY');
      }
      return null;
    } finally {
      setDetectingServices(false);
    }
  }, []); // No dependencies needed - this function is stable

  const loadDeployments = useCallback(async () => {
    try {
      // First get deployment IDs from our database
      let deploymentIds: Record<string, { deployment_id: string; template_id: string; status: string; url: string }> = {};
      try {
        const response = await apiRequest('/mcps/deployments');
        if (response.ok) {
          const data = await response.json();
          deploymentIds = data.deployments || {};
        }
      } catch (error) {
        console.error('Error loading deployment IDs:', error);
      }

      // Then use detectUserServices to get real-time status from Render API
      if (renderApiKey) {
        const detectedServices = await detectUserServices(renderApiKey);

        if (detectedServices && detectedServices.detected_mcps) {
          // Use the detected services to show correct statuses
          const deploymentMap: DeploymentStatuses = {};

          Object.entries(detectedServices.detected_mcps).forEach(([templateId, mcpData]) => {
            const typedMcpData = mcpData as UserServiceData;
            if (typedMcpData.available && typedMcpData.services.length > 0) {
              const service = typedMcpData.services[0];
              
              // Try to find matching deployment ID by service ID or URL
              let deploymentId = null;
              for (const [serviceId, deploymentInfo] of Object.entries(deploymentIds)) {
                if (serviceId === service.id || deploymentInfo.url === service.url) {
                  deploymentId = deploymentInfo.deployment_id;
                  break;
                }
              }
              
              deploymentMap[templateId] = {
                url: service.url,
                status: service.status,
                deployment_id: deploymentId || undefined,
                service_id: service.id  // Always include service_id for env var updates
              };
            }
          });

          setDeployments(deploymentMap);
          setLastUpdated(new Date());
          
          // Load masked env vars for existing deployments
          Object.entries(deploymentMap).forEach(([templateKey, deployment]) => {
            if (deployment.deployment_id) {
              loadMaskedEnvVars(deployment.deployment_id, templateKey);
            }
          });
        }
        
        // Update custom MCPs with real-time status from Render API
        if (detectedServices && detectedServices.custom_mcps) {
          setCustomMcps(detectedServices.custom_mcps);
        }
      }
    } catch (error) {
      console.error('Error loading deployments:', error);
    }
  }, [renderApiKey, detectUserServices]);

  useEffect(() => {
    // Load data sequentially to prevent connection queue bottleneck
    const loadDataSequentially = async () => {
      // Load templates first (most important)
      await fetchTemplates();
      
      // Then load Smithery MCPs
      await fetchSmitheryMcps();
      
      // Load user-specific data
      if (user) {
        await loadDeployments(); // This now loads both template and custom MCPs with status
        await fetchAllRenderServices();
      } else {
        setLastUpdated(null);
        setCustomMcps([]);
      }
    };
    
    loadDataSequentially();
  }, [user]);

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
    // If user starts typing and the current value is masked, clear it
    const currentValue = envVars[templateKey]?.[keyName] || '';
    if (value && currentValue.includes('•')) {
      // If they're typing over a masked value, start fresh
      value = value.replace(/•/g, ''); // Remove any bullet characters
    }
    
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

  const loadMaskedEnvVars = async (deploymentId: string, templateKey: string) => {
    try {
      const response = await apiRequest(`/mcps/deployments/${deploymentId}/env-vars`);
      if (response.ok) {
        const data = await response.json();
        setEnvVars(prev => ({
          ...prev,
          [templateKey]: {
            ...prev[templateKey],
            ...data.env_vars
          }
        }));
      }
    } catch (error) {
      console.error('Error loading masked env vars:', error);
    }
  };

  const updateDeploymentEnvVars = async (serviceId: string, templateKey: string) => {
    try {
      const envVarsToUpdate = envVars[templateKey] || {};
      // Filter out masked values (don't send them to backend)
      const filteredEnvVars = Object.fromEntries(
        Object.entries(envVarsToUpdate).filter(([, value]) => 
          value && !value.includes('•')
        )
      );
      
      // Always use service_id endpoint (simpler and more direct)
      const response = await apiRequest(`/mcps/services/${serviceId}/env-vars`, {
        method: 'POST',
        body: JSON.stringify({ 
          env_vars: filteredEnvVars,
          render_api_key: renderApiKey 
        })
      });
      
      if (response.ok) {
        // Show success checkmark
        setEnvVarsUpdatedSuccess(prev => ({ ...prev, [templateKey]: true }));
        
        // Mask the values that were just updated (match actual length)
        const maskedEnvVars: Record<string, string> = {};
        Object.entries(filteredEnvVars).forEach(([key, value]) => {
          if (value && value.length > 0) {
            // Mask with bullets matching actual length
            maskedEnvVars[key] = '•'.repeat(value.length);
          }
        });
        
        setEnvVars(prev => ({
          ...prev,
          [templateKey]: {
            ...prev[templateKey],
            ...maskedEnvVars
          }
        }));
        
        // Hide checkmark after 3 seconds
        setTimeout(() => {
          setEnvVarsUpdatedSuccess(prev => ({ ...prev, [templateKey]: false }));
        }, 3000);
        
        // Don't reload deployments here - it would overwrite our correct local masking
      } else {
        const errorData = await response.json();
        alert(`Error updating environment variables: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating env vars:', error);
      alert('Error updating environment variables');
    }
  };

  const getTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return 'just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    } else {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
  };

  // Cleanup wake intervals on unmount
  useEffect(() => {
    // Capture current ref values for cleanup
    const intervals = wakeIntervals.current;
    const timeouts = wakeTimeouts.current;
    
    return () => {
      // Clear all intervals and timeouts on unmount
      Object.values(intervals).forEach(clearInterval);
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, []);

  const wakeUpService = async (templateKey: string, serviceUrl: string) => {
    // Mark service as waking
    setWakingServices(prev => new Set(prev).add(templateKey));
    setWakingStartTimes(prev => ({ ...prev, [templateKey]: Date.now() }));

    // Send initial wake-up request (this will trigger Render to start the service)
    try {
      await fetch(serviceUrl, { 
        method: 'GET',
        mode: 'no-cors' // Avoid CORS issues, we just want to ping the service
      });
    } catch {
      // Ignore errors, we just want to trigger the wake-up
      console.log('Wake-up request sent to', serviceUrl);
    }

    // Poll for status every 5 seconds
    const pollStatus = async () => {
      if (!renderApiKey) return;

      try {
        const detectedServices = await detectUserServices(renderApiKey);
        
        // Check if this is a template MCP
        if (detectedServices && detectedServices.detected_mcps && detectedServices.detected_mcps[templateKey]) {
          const serviceData = detectedServices.detected_mcps[templateKey] as UserServiceData;
          if (serviceData.available && serviceData.services.length > 0) {
            const service = serviceData.services[0];
            
            // Check if service is now live
            if (service.status === 'live') {
              // Update deployment status
              setDeployments(prev => ({
                ...prev,
                [templateKey]: {
                  ...prev[templateKey],
                  status: 'live'
                }
              }));

              // Clear waking state
              cleanupWakeProcess(templateKey);
            }
          }
        }
        // Check if this is a custom MCP
        else if (detectedServices && detectedServices.custom_mcps) {
          const customMcp = detectedServices.custom_mcps.find((mcp: CustomMCP) => mcp.id === templateKey);
          if (customMcp && customMcp.status === 'live') {
            // Update custom MCP status
            setCustomMcps(prev => prev.map(mcp => 
              mcp.id === templateKey ? { ...mcp, status: 'live' } : mcp
            ));
            
            // Clear waking state
            cleanupWakeProcess(templateKey);
          }
        }
      } catch (error) {
        console.error('Error checking service status:', error);
      }
    };

    // Start polling
    const intervalId = setInterval(pollStatus, 5000);
    wakeIntervals.current[templateKey] = intervalId;

    // Set timeout (2 minutes)
    const timeoutId = setTimeout(() => {
      cleanupWakeProcess(templateKey);
      alert(`Service wake-up timed out for ${templateKey}. The service may need more time or could be experiencing issues. Try refreshing the status in a moment.`);
    }, 120000); // 2 minutes
    wakeTimeouts.current[templateKey] = timeoutId;
  };

  const cleanupWakeProcess = (templateKey: string) => {
    // Clear interval
    if (wakeIntervals.current[templateKey]) {
      clearInterval(wakeIntervals.current[templateKey]);
      delete wakeIntervals.current[templateKey];
    }

    // Clear timeout
    if (wakeTimeouts.current[templateKey]) {
      clearTimeout(wakeTimeouts.current[templateKey]);
      delete wakeTimeouts.current[templateKey];
    }

    // Remove from waking state
    setWakingServices(prev => {
      const newSet = new Set(prev);
      newSet.delete(templateKey);
      return newSet;
    });

    setWakingStartTimes(prev => {
      const newTimes = { ...prev };
      delete newTimes[templateKey];
      return newTimes;
    });
  };

  const getSmitheryUrl = async (mcpId: string) => {
    if (!user) return;
    
    setGeneratingSmitheryUrl(mcpId);
    
    try {
      const response = await apiRequest(`/mcps/smithery/${encodeURIComponent(mcpId)}/url`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || error.message || 'Failed to get URL');
      }
      
      const data = await response.json();
      console.log('Smithery URL retrieved:', data);
      return data;
      
    } catch (error) {
      console.error(`Error getting Smithery URL for ${mcpId}:`, error);
      alert('Failed to get Smithery URL. Please try again.');
      throw error;
    } finally {
      setGeneratingSmitheryUrl(null);
    }
  };

  const searchSmitheryMcps = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const response = await apiRequest(`/mcps/smithery/search?query=${encodeURIComponent(query)}&limit=10`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSearchResults(data.results);
    } catch (error) {
      console.error('Error searching Smithery MCPs:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddCustomMCP = async (serviceId: string, name: string, description: string, iconName: string) => {
    if (!user || !renderApiKey) return;
    
    try {
      const response = await apiRequest('/mcps/custom', {
        method: 'POST',
        body: JSON.stringify({
          service_id: serviceId,
          name,
          description,
          icon_name: iconName,
          render_api_key: renderApiKey
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add custom MCP');
      }
      
      // Refresh custom MCPs immediately
      await loadDeployments();
      alert('Custom MCP added successfully! Tools will be fetched in the background.');
      
      // Poll for tools update multiple times (service needs to wake up first)
      setTimeout(async () => {
        await loadDeployments();
      }, 20000); // First poll after 20 seconds
      
      setTimeout(async () => {
        await loadDeployments();
      }, 35000); // Second poll after 35 seconds (in case service was slow to wake)
    } catch (error) {
      console.error('Error adding custom MCP:', error);
      throw error;
    }
  };

  const handleDeleteCustomMCP = async (customMcpId: string, serviceId?: string) => {
    if (!user) return;
    
    try {
      // Delete from database
      const response = await apiRequest(`/mcps/custom/${customMcpId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete custom MCP');
      }
      
      // Optionally suspend service on Render
      if (serviceId && renderApiKey) {
        try {
          await apiRequest(`/mcps/services/${serviceId}/suspend`, {
            method: 'POST',
            body: JSON.stringify({ render_api_key: renderApiKey })
          });
        } catch (error) {
          console.error('Failed to suspend service:', error);
          // Continue anyway - MCP is deleted from our DB
        }
      }
      
      // Refresh everything to update status
      await loadDeployments();
    } catch (error) {
      console.error('Error deleting custom MCP:', error);
      alert('Failed to delete custom MCP');
    }
  };

  const handleRefreshTools = async (customMcpId: string) => {
    setRefreshingTools(prev => new Set(prev).add(customMcpId));
    
    try {
      const response = await apiRequest(`/mcps/custom/${customMcpId}/refresh-tools`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh tools');
      }
      
      const data = await response.json();
      
      // Update custom MCP tools in state
      setCustomMcps(prev => prev.map(mcp => 
        mcp.id === customMcpId ? { ...mcp, tools: data.tools } : mcp
      ));
      
    } catch (error) {
      console.error('Error refreshing tools:', error);
      alert('Failed to refresh tools');
    } finally {
      setRefreshingTools(prev => {
        const newSet = new Set(prev);
        newSet.delete(customMcpId);
        return newSet;
      });
    }
  };

  const handleDeleteTemplateMCP = async (templateKey: string, serviceId?: string) => {
    if (!user || !renderApiKey || !serviceId) return;
    
    try {
      // Suspend the service on Render
      await apiRequest(`/mcps/services/${serviceId}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ render_api_key: renderApiKey })
      });
      
      // Remove from local state
      setDeployments(prev => {
        const newDeployments = { ...prev };
        delete newDeployments[templateKey];
        return newDeployments;
      });
      
      alert('Service suspended on Render');
    } catch (error) {
      console.error('Error suspending service:', error);
      alert('Failed to suspend service');
    }
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
          
          if (detectedServices && detectedServices.detected_mcps) {
            setUserServices(prev => ({
              ...prev,
              [templateKey]: detectedServices.detected_mcps[templateKey]
            }));
            mcpData = detectedServices.detected_mcps[templateKey];
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
            setup_url: `https://render.com/deploy?repo=https://github.com/akarnik23/mcp-${templateKey}`
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
      
      // Don't set status to 'live' here - let the backend determine the real status
      // The status will be updated when loadDeployments() is called
      setDeployments(prev => ({
        ...prev,
        [templateKey]: {
          url: data.deployment_url || service.url,
          status: 'deploying',  // Keep as deploying until backend confirms it's live
          deployment_id: data.deployment_id
        }
      }));
      
      // Load the actual deployment status from backend
      await loadDeployments();
      
    } catch (error) {
      console.error(`Error deploying ${templateKey}:`, error);
      // Don't set status to 'live' on error - set to 'offline' or remove deployment
      setDeployments(prev => {
        const newDeployments = { ...prev };
        delete newDeployments[templateKey];
        return newDeployments;
      });
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
      <header className="sticky top-0 z-50 backdrop-blur border-b" style={{ background: 'rgba(32,58,84,0.95)', borderColor: '#718392' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="rounded-xl p-1.5 sm:p-2" style={{ background: '#203a54', border: '1px solid #718392' }}>
                <Image 
                  src="/interaction-palm.png" 
                  alt="Interaction Palm" 
                  width={24} 
                  height={24}
                  className="w-6 h-6 sm:w-8 sm:h-8"
                />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">MCP Marketplace</h1>
                <p className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#718392' }}>
                  {user ? `Welcome back, ${user.username}!` : 'Hosted integrations for Poke'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto">
              {user ? (
                <div className="flex items-center gap-2 sm:gap-4">
                  <span className="text-xs sm:text-sm font-medium text-white">@{user.username}</span>
                  <button
                    onClick={logout}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer"
                    style={{ background: '#203a54', color: '#ffffff', border: '1px solid #718392' }}
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGitHubAuth}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-base font-semibold transition-all cursor-pointer"
                  style={{ background: '#ffffff', color: '#203a54' }}
                >
                  <Github className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Sign in with GitHub</span>
                  <span className="sm:hidden">Sign in</span>
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
              className="text-red-300 hover:text-red-200 text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* API Key Management */}
      {user && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="rounded-2xl shadow-lg border p-4 sm:p-6" style={{ background: '#203a54', borderColor: '#718392' }}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="rounded-lg p-1.5 sm:p-2" style={{ background: '#000000', border: '1px solid #718392' }}>
                  <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white">Render API Key</h3>
                  <p className="text-xs sm:text-sm" style={{ color: '#718392' }}>Required for deploying MCPs to your Render account</p>
                </div>
              </div>
              <div className="flex gap-2 self-end sm:self-auto">
                {renderApiKey ? (
                  <>
                    <button
                      onClick={() => setShowApiKeyInput(true)}
                      className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer"
                      style={{ background: '#ffffff', color: '#203a54', border: '1px solid #718392' }}
                    >
                      Change Key
                    </button>
                    <button
                      onClick={handleClearApiKey}
                      className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer"
                      style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}
                    >
                      Clear Key
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowApiKeyInput(true)}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer"
                    style={{ background: '#ffffff', color: '#203a54', border: '1px solid #718392' }}
                  >
                    Add API Key
                  </button>
                )}
              </div>
            </div>
            
            {renderApiKey && (
              <div className="rounded-lg p-3 mb-4" style={{ background: '#000000', border: '1px solid #718392' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-sm font-medium text-white">Connected</span>
                  </div>
                  <code className="text-sm text-gray-300 font-mono">
                    {renderApiKey.length > 12 
                      ? `${renderApiKey.substring(0, 8)}...${renderApiKey.substring(renderApiKey.length - 4)}`
                      : `${renderApiKey.substring(0, 4)}...${renderApiKey.substring(renderApiKey.length - 2)}`
                    }
                  </code>
                </div>
              </div>
            )}
            
            {showApiKeyInput && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="Enter your Render API key"
                    className="flex-1 px-3 py-2 sm:px-4 sm:py-3 rounded-lg text-base text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white transition-all"
                    style={{ background: '#000000', border: '1px solid #718392', fontSize: '16px' }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdateApiKey}
                      disabled={!newApiKey.trim()}
                      className="flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ 
                        background: !newApiKey.trim() ? '#718392' : '#ffffff', 
                        color: !newApiKey.trim() ? '#ffffff' : '#203a54',
                        border: '1px solid #718392'
                      }}
                    >
                      Update
                    </button>
                    <button
                      onClick={() => {
                        setShowApiKeyInput(false);
                        setNewApiKey('');
                      }}
                      className="flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer"
                      style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <p className="text-xs" style={{ color: '#718392' }}>
                  Get your API key from <a href="https://dashboard.render.com/account/api-keys" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline">Render Dashboard</a>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 lg:pt-16 pb-8 sm:pb-12">
        {!user ? (
          /* Landing Page */
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4 px-2">
              Connect to 100+ MCP Servers Instantly
            </h2>
            <p className="text-base sm:text-lg lg:text-xl mb-6 sm:mb-8 px-2" style={{ color: '#718392' }}>
              Self-host your own MCPs or connect to pre-hosted Smithery servers for Poke
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-8 sm:mb-12">
              <div className="rounded-2xl p-5 sm:p-6" style={{ background: '#203a54', border: '1px solid #718392' }}>
                <Zap className="h-10 w-10 sm:h-12 sm:w-12 text-white mx-auto mb-3 sm:mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2 text-white">Instant Access</h3>
                <p className="text-sm sm:text-base text-gray-300">Browse 100+ pre-hosted Smithery MCPs or deploy your own</p>
              </div>
              <div className="rounded-2xl p-5 sm:p-6" style={{ background: '#203a54', border: '1px solid #718392' }}>
                <Wrench className="h-10 w-10 sm:h-12 sm:w-12 text-white mx-auto mb-3 sm:mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2 text-white">Easy Configuration</h3>
                <p className="text-sm sm:text-base text-gray-300">Manage API keys and environment variables securely</p>
              </div>
              <div className="rounded-2xl p-5 sm:p-6" style={{ background: '#203a54', border: '1px solid #718392' }}>
                <ExternalLink className="h-10 w-10 sm:h-12 sm:w-12 text-white mx-auto mb-3 sm:mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2 text-white">One-Click Deploy</h3>
                <p className="text-sm sm:text-base text-gray-300">Self-host MCPs on Render with automatic deployment</p>
              </div>
            </div>
            <button
              onClick={handleGitHubAuth}
              className="px-6 py-2.5 sm:px-8 sm:py-3 rounded-lg text-base sm:text-lg font-semibold transition-all cursor-pointer"
              style={{ background: '#ffffff', color: '#203a54' }}
            >
              Get Started with GitHub
            </button>
          </div>
        ) : (
          /* Dashboard */
          <div>
            {/* Self-Hosted MCP Servers Grid */}
            <section className="mb-12 sm:mb-16">
              <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">Self-Hosted MCP Servers</h2>
                <p className="text-sm sm:text-base" style={{ color: '#718392' }}>Deploy MCPs to your Render account and connect to Poke</p>
                </div>
                {user && (
                  <div className="flex flex-col items-start sm:items-end gap-2 self-end sm:self-auto">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAddCustomModal(true)}
                        disabled={!renderApiKey}
                        className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: '#ffffff', color: '#203a54' }}
                        title={!renderApiKey ? 'Add Render API key first' : 'Add custom MCP'}
                      >
                        <Plus className="w-4 h-4" />
                        Add Custom MCP
                      </button>
                      <button
                        onClick={loadDeployments}
                        className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer"
                        style={{ background: '#203a54', color: '#ffffff', border: '1px solid #718392' }}
                      >
                        🔄 Refresh Status
                      </button>
                    </div>
                    {lastUpdated && (
                      <span className="text-xs" style={{ color: '#718392' }}>
                        Last updated: {getTimeAgo(lastUpdated)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Template MCPs */}
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
                      key={`template-${index}`}
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
                      onUpdateDeploymentEnvVars={updateDeploymentEnvVars}
                      envVarsUpdateSuccess={envVarsUpdatedSuccess[templateKey] || false}
                      isWaking={wakingServices.has(templateKey)}
                      onWakeUp={wakeUpService}
                      wakingStartTime={wakingStartTimes[templateKey]}
                      onDelete={handleDeleteTemplateMCP}
                      isCustom={false}
                    />
                  );
                })}

                {/* Custom MCPs */}
                {customMcps.map((customMcp) => {
                  // Create template object for custom MCP
                  const customTemplate: MCPTemplate = {
                    name: customMcp.name,
                    description: customMcp.description,
                    required_keys: customMcp.required_keys,
                    template: 'custom'
                  };
                  
                  // Use custom MCP ID as templateKey
                  const templateKey = customMcp.id;
                  
                  // Create deployment status from custom MCP data with real-time status
                  const customDeployment: DeploymentStatus = {
                    url: customMcp.mcp_url,
                    status: customMcp.status || 'unknown', // Use real-time status from Render API
                    service_id: customMcp.render_service_id
                  };
                  
                  // Get icon emoji from CUSTOM_MCP_ICONS
                  const iconOption = CUSTOM_MCP_ICONS.find(icon => icon.name === customMcp.icon_name);
                  const customIconDataUrl = iconOption 
                    ? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><text y="36" font-size="36">${iconOption.icon}</text></svg>`)}`
                    : `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><text y="36" font-size="36">📦</text></svg>')}`;
                  
                  return (
                    <MCPCard
                      key={`custom-${customMcp.id}`}
                      template={customTemplate}
                      templateKey={customMcp.id}
                      deployment={customDeployment}
                      userService={undefined}
                      isDeploying={false}
                      onDeploy={() => {}} // Custom MCPs are already deployed
                      onToggleEnvVars={toggleEnvVars}
                      showEnvVars={showEnvVars[customMcp.id] || false}
                      onUpdateEnvVar={updateEnvVar}
                      getEnvVarValue={getEnvVarValue}
                      onUpdateDeploymentEnvVars={updateDeploymentEnvVars}
                      envVarsUpdateSuccess={envVarsUpdatedSuccess[customMcp.id] || false}
                      isWaking={wakingServices.has(customMcp.id)}
                      onWakeUp={wakeUpService}
                      wakingStartTime={wakingStartTimes[customMcp.id]}
                      onDelete={(_, serviceId) => handleDeleteCustomMCP(customMcp.id, serviceId)}
                      isCustom={true}
                      customIcon={customIconDataUrl}
                      customCapabilities={customMcp.tools}
                      onRefreshTools={handleRefreshTools}
                      isRefreshingTools={refreshingTools.has(customMcp.id)}
                    />
                  );
                })}
              </div>
            </section>

            {/* Smithery MCPs Section */}
            <section className="mb-12 sm:mb-16">
              <div className="mb-6 sm:mb-8">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">Smithery MCPs</h2>
                    <p className="text-sm sm:text-base" style={{ color: '#718392' }}>Pre-hosted MCPs by Smithery - connect directly to Poke</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs sm:text-sm" style={{ color: '#718392' }}>
                      You&apos;ll be asked to enter API keys on Smithery OAuth after adding to Poke if needed
                    </p>
                  </div>
                </div>
              </div>

              {/* Search Bar */}
              <div className="mb-6 sm:mb-8">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center">
                  <input
                    type="text"
                    placeholder="Search for more MCPs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchSmitheryMcps(searchQuery)}
                    className="flex-1 p-2.5 sm:p-3 rounded-lg text-base bg-slate-800 text-white border border-slate-600 focus:border-blue-500 focus:outline-none"
                    style={{ fontSize: '16px' }}
                  />
                  <button 
                    onClick={() => searchSmitheryMcps(searchQuery)}
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4">
                    Search Results ({searchResults.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {searchResults.map((mcp, index) => (
                      <SmitheryMCPCard
                        key={`search-${mcp.mcp_id}-${index}`}
                        mcp={mcp}
                        mcpId={mcp.mcp_id}
                        onGetUrl={getSmitheryUrl}
                        isGettingUrl={generatingSmitheryUrl === mcp.mcp_id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Curated MCPs */}
              <div className="mb-6 sm:mb-8">
                <h3 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4">
                  Featured MCPs ({Object.keys(smitheryMcps).length})
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {Object.entries(smitheryMcps).map(([mcpId, mcp]) => (
                  <SmitheryMCPCard
                    key={mcpId}
                    mcp={mcp}
                    mcpId={mcpId}
                    onGetUrl={getSmitheryUrl}
                    isGettingUrl={generatingSmitheryUrl === mcpId}
                  />
                ))}
              </div>
            </section>

            {/* Instructions */}
            <section className="rounded-2xl shadow-lg border p-5 sm:p-6 lg:p-8" style={{ background: '#203a54', borderColor: '#718392' }}>
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-3 sm:mb-4">How to Connect MCPs to Poke</h3>
              
              {/* Self-hosted MCPs Instructions */}
              <div className="mb-5 sm:mb-6">
                <h4 className="text-base sm:text-lg font-semibold text-white mb-2 sm:mb-3">Self-Hosted MCPs (Your Render Account)</h4>
                <div className="space-y-2.5 sm:space-y-3" style={{ color: '#718392' }}>
                  <div className="flex gap-2 sm:gap-3">
                    <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>1</span>
                    <p className="text-sm sm:text-base"><strong className="text-white">Enter Render Api Key, then click &quot;Deploy MCP&quot;</strong> on any self-hosted server card and setup on Render</p>
                  </div>
                  <div className="flex gap-2 sm:gap-3">
                    <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>2</span>
                    <p className="text-sm sm:text-base"><strong className="text-white">Enter your API keys</strong> if applicable to mcp server - click Configure API Keys dropdown to enter</p>
                  </div>
                  <div className="flex gap-2 sm:gap-3">
                    <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>3</span>
                    <p className="text-sm sm:text-base"><strong className="text-white">Get your MCP URL</strong> and add it to Poke at <a href="https://poke.com/settings/connections" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline inline-flex items-center gap-1">
                      poke.com/settings/connections <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                    </a></p>
                  </div>
                </div>
              </div>

              {/* Smithery MCPs Instructions */}
              <div>
                <h4 className="text-base sm:text-lg font-semibold text-white mb-2 sm:mb-3">Smithery MCPs (Pre-hosted)</h4>
                <div className="space-y-2.5 sm:space-y-3" style={{ color: '#718392' }}>
                  <div className="flex gap-2 sm:gap-3">
                    <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>1</span>
                    <p className="text-sm sm:text-base"><strong className="text-white">Click &quot;Get Smithery URL&quot;</strong> to get the generic Smithery MCP URL</p>
                  </div>
                  <div className="flex gap-2 sm:gap-3">
                    <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>2</span>
                    <p className="text-sm sm:text-base"><strong className="text-white">Copy the URL</strong> and add it to Poke at <a href="https://poke.com/settings/connections" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline inline-flex items-center gap-1">
                      poke.com/settings/connections <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                    </a></p>
                  </div>
                  <div className="flex gap-2 sm:gap-3">
                    <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>3</span>
                    <p className="text-sm sm:text-base"><strong className="text-white">Enter your API keys securely</strong> when redirected to Smithery&apos;s OAuth page</p>
                  </div>
                  <div className="flex gap-2 sm:gap-3">
                    <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm" style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}>4</span>
                    <p className="text-sm sm:text-base"><strong className="text-white">Optional:</strong> Pre-configure apikeys directly on Smithery using the external link button</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 sm:mt-6 p-3 sm:p-4 rounded-lg" style={{ background: '#000000', border: '1px solid #718392' }}>
                <p className="text-xs sm:text-sm" style={{ color: '#718392' }}>
                  <strong className="text-white">💡 Smithery MCPs are pre-hosted and ready to use immediately, while self-hosted MCPs give you full control over your own infrastructure. </strong> 
                </p>
              </div>
            </section>

            {/* Footer */}
            <footer className="mt-16 text-center" style={{ color: '#718392' }}>
              <p>MCP Marketplace Built for The Interaction Company</p>
      </footer>
          </div>
        )}
      </main>

      {/* Add Custom MCP Modal */}
      <AddCustomMCPModal
        isOpen={showAddCustomModal}
        onClose={() => setShowAddCustomModal(false)}
        onAdd={handleAddCustomMCP}
        renderServices={allRenderServices}
        excludeServiceIds={[
          ...templates.map(t => {
            const key = Object.keys(MCP_ICONS).find(k => {
              const name = t.name.toLowerCase();
              const keyName = k.toLowerCase();
              return name === `${keyName} mcp` || name === `mcp ${keyName}` || name === keyName;
            });
            return deployments[key || '']?.service_id;
          }).filter(Boolean) as string[],
          ...customMcps.map(c => c.render_service_id)
        ]}
      />
    </div>
  );
}
