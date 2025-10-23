// Type definitions for the MCP Marketplace
export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string;
}

export interface MCPService {
  id: string;
  name: string;
  url: string;
  status: string;
}

export interface MCPTemplate {
  name: string;
  description: string;
  required_keys: string[];
  template: string;
}

export interface SmitheryMCP {
  mcp_id: string;
  name: string;
  description: string;
  smithery_url: string;
  homepage: string;
  icon_url: string;
  required_keys: string[];
}

export interface UserServiceData {
  available: boolean;
  services: MCPService[];
  template: MCPTemplate;
  setup_url?: string;
}

export interface Deployment {
  id: string;
  template_id: string;
  status: string;
  deployment_url: string;
  render_service_id: string;
  created_at: string;
  updated_at: string;
}

export interface DeploymentStatus {
  url: string;
  status: string;
  deployment_id?: string;
}

export type DeploymentStatuses = Record<string, DeploymentStatus>;
export type UserServices = Record<string, UserServiceData>;
export type EnvVars = Record<string, Record<string, string>>;
export type ShowEnvVars = Record<string, boolean>;
