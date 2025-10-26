'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { CUSTOM_MCP_ICONS } from '../constants';
import { MCPService } from '../types';

interface AddCustomMCPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (serviceId: string, name: string, description: string, iconName: string) => Promise<void>;
  renderServices: MCPService[];
  excludeServiceIds: string[];
}

export const AddCustomMCPModal = ({
  isOpen,
  onClose,
  onAdd,
  renderServices,
  excludeServiceIds
}: AddCustomMCPModalProps) => {
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('box');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Filter out services that are already added
  const availableServices = renderServices.filter(
    service => !excludeServiceIds.includes(service.id)
  );

  // Auto-fill name from service name when service is selected
  useEffect(() => {
    if (selectedServiceId) {
      const service = renderServices.find(s => s.id === selectedServiceId);
      if (service && !name) {
        setName(service.name);
      }
    }
  }, [selectedServiceId, renderServices, name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedServiceId) {
      setError('Please select a service');
      return;
    }

    if (!name.trim()) {
      setError('Please enter a name');
      return;
    }

    if (!description.trim()) {
      setError('Please enter a description');
      return;
    }

    setIsSubmitting(true);

    try {
      await onAdd(selectedServiceId, name, description, selectedIcon);
      // Reset form
      setSelectedServiceId('');
      setName('');
      setDescription('');
      setSelectedIcon('box');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add custom MCP');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: '#203a54', border: '1px solid #718392' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b" style={{ background: '#203a54', borderColor: '#718392' }}>
          <h2 className="text-2xl font-bold text-white">Add Custom MCP</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-white/10"
            disabled={isSubmitting}
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg bg-red-900/30 border border-red-700">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Service Selection */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Select Render Service *
            </label>
            {availableServices.length === 0 ? (
              <div className="p-4 rounded-lg" style={{ background: '#000000', border: '1px solid #718392' }}>
                <p className="text-gray-400 text-sm">
                  No available services. All your Render services are already added.
                </p>
              </div>
            ) : (
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white"
                style={{ background: '#000000', border: '1px solid #718392' }}
                required
              >
                <option value="">Choose a service...</option>
                {availableServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} ({service.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Name Input */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              MCP Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My Custom MCP"
              className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white"
              style={{ background: '#000000', border: '1px solid #718392' }}
              required
            />
          </div>

          {/* Description Input */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this MCP does..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white resize-none"
              style={{ background: '#000000', border: '1px solid #718392' }}
              required
            />
          </div>

          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              Choose an Icon *
            </label>
            <div className="grid grid-cols-5 gap-3">
              {CUSTOM_MCP_ICONS.map((iconOption) => (
                <button
                  key={iconOption.name}
                  type="button"
                  onClick={() => setSelectedIcon(iconOption.name)}
                  className={`p-4 rounded-lg flex flex-col items-center gap-2 transition-all ${
                    selectedIcon === iconOption.name
                      ? 'ring-2 ring-white'
                      : 'hover:bg-white/10'
                  }`}
                  style={{ 
                    background: selectedIcon === iconOption.name ? '#000000' : 'transparent',
                    border: '1px solid #718392' 
                  }}
                >
                  <span className="text-3xl">{iconOption.icon}</span>
                  <span className="text-xs text-gray-300">{iconOption.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#000000', color: '#ffffff', border: '1px solid #718392' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || availableServices.length === 0}
              className="flex-1 px-6 py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#ffffff', color: '#203a54' }}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                  Adding...
                </span>
              ) : (
                'Add Custom MCP'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

