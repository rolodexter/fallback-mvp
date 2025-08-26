// Global ambient declarations for serverless function type-checking
// Allows shared modules to reference browser globals safely under NodeNext

export {};

declare global {
  interface Window {
    __riskillDebug?: any;
    chatClient?: {
      endpoint: string;
      initialized: boolean;
      lastRequest: { domain: string; template_id: string; params: Record<string, any> } | null;
      init(): Promise<any>;
      sendMessage(message: string): Promise<void>;
      sendTemplate(domain: string, template_id: string, params?: Record<string, any>): Promise<void>;
    };
    handleUserChat?: (message: string, options?: { router?: any }) => void;
  }
  // Some modules use import.meta.env (Vite). Provide a minimal shape.
  interface ImportMetaEnv {
    readonly VITE_DEPLOY_PLATFORM?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
