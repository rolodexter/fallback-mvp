// Global ambient declarations for serverless function type-checking
// Allows shared modules to reference browser globals safely under NodeNext

export {};

declare global {
  interface Window {
    __riskillDebug?: any;
  }
  // Some modules use import.meta.env (Vite). Provide a minimal shape.
  interface ImportMetaEnv {
    readonly VITE_DEPLOY_PLATFORM?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
